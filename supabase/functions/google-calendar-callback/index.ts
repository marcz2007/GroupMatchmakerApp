import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const GOOGLE_CALENDAR_REDIRECT_URI = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL");

console.log("Environment check:", {
  hasClientId: !!GOOGLE_CLIENT_ID,
  hasClientSecret: !!GOOGLE_CLIENT_SECRET,
  hasRedirectUri: !!GOOGLE_CALENDAR_REDIRECT_URI,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
  hasAppUrl: !!APP_URL,
});

if (
  !GOOGLE_CLIENT_ID ||
  !GOOGLE_CLIENT_SECRET ||
  !GOOGLE_CALENDAR_REDIRECT_URI ||
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY ||
  !APP_URL
) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Fetch event times from Google Calendar (excluding private events) and store them
async function fetchAndStoreBusyTimes(accessToken: string, userId: string): Promise<void> {
  try {
    const now = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    const eventTimes: Array<{ start: string; end: string }> = [];
    let pageToken: string | undefined;

    // Paginate through all events for the next 12 months
    do {
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        fields: "items(start,end,visibility),nextPageToken",
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch events:", await response.text());
        break;
      }

      const data = await response.json();
      pageToken = data.nextPageToken;

      for (const event of data.items || []) {
        // Skip private events
        if (event.visibility === "private" || event.visibility === "confidential") {
          continue;
        }

        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;

        if (start && end) {
          eventTimes.push({ start, end });
        }
      }
    } while (pageToken);

    console.log(`Found ${eventTimes.length} event time blocks`);

    // Clear existing busy times for this user
    await supabase
      .from("calendar_busy_times")
      .delete()
      .eq("user_id", userId);

    // Insert new busy times
    if (eventTimes.length > 0) {
      const busyTimeRecords = eventTimes.map((event) => ({
        user_id: userId,
        start_time: event.start,
        end_time: event.end,
        fetched_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("calendar_busy_times")
        .insert(busyTimeRecords);

      if (error) {
        console.error("Error inserting busy times:", error);
      }
    }
  } catch (error) {
    console.error("Error fetching events:", error);
  }
}

const WEB_APP_URL = "https://group-matchmaker-app-web.vercel.app";

function parseState(state: string): { isWeb: boolean; returnPath: string } {
  // State format: "uuid:platform" or "uuid:platform:base64returnPath"
  const parts = state.split(":");
  // parts[0] = uuid, parts[1] = platform, parts[2] = base64 encoded return path
  const isWeb = parts[1] === "web";
  let returnPath = "";
  if (parts[2]) {
    try {
      // Add back padding
      const padded = parts[2] + "=".repeat((4 - (parts[2].length % 4)) % 4);
      returnPath = atob(padded);
    } catch {
      returnPath = "";
    }
  }
  return { isWeb, returnPath };
}

// Extract an event_room_id (UUID) from a returnPath like "/event/<uuid>".
// Returns null for any other return path. We use this so that when a guest
// (or any user) connects a calendar mid-RSVP, we can immediately mark them
// as synced for that specific event — which makes their availability count
// towards `min_synced_users` and lets the smart-scheduling trigger finalize
// without waiting for the deadline cron.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function extractEventRoomId(returnPath: string): string | null {
  if (!returnPath) return null;
  const match = returnPath.match(/\/event\/([^/?#]+)/);
  if (!match) return null;
  const candidate = match[1];
  return UUID_RE.test(candidate) ? candidate : null;
}

// If the caller came from an /event/<id> page, mark them as synced for
// that event so smart scheduling can finalize early. Idempotent — the
// UNIQUE(event_room_id, user_id) constraint turns re-invocations into
// updated synced_at timestamps.
async function markEventSyncIfApplicable(
  userId: string,
  returnPath: string
): Promise<void> {
  const eventRoomId = extractEventRoomId(returnPath);
  if (!eventRoomId) return;

  try {
    // Only record a sync if this user is actually a participant in that
    // event. This prevents someone from poisoning another event's sync
    // count by crafting a returnPath that points at an unrelated event.
    const { data: participant, error: participantError } = await supabase
      .from("event_room_participants")
      .select("user_id")
      .eq("event_room_id", eventRoomId)
      .eq("user_id", userId)
      .maybeSingle();

    if (participantError || !participant) {
      console.log(
        "Skipping scheduling_calendar_syncs insert — user is not a participant",
        { userId, eventRoomId, error: participantError?.message }
      );
      return;
    }

    const { error: syncError } = await supabase
      .from("scheduling_calendar_syncs")
      .upsert(
        {
          event_room_id: eventRoomId,
          user_id: userId,
          calendar_provider: "google",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "event_room_id,user_id" }
      );

    if (syncError) {
      console.error("Error upserting scheduling_calendar_syncs:", syncError);
    } else {
      console.log("Recorded scheduling_calendar_syncs", { userId, eventRoomId });
    }
  } catch (err) {
    console.error("Unexpected error in markEventSyncIfApplicable:", err);
  }
}

function createResponse(message: string, redirectUrl: string, success: boolean, isWeb: boolean, returnPath?: string) {
  // For web: redirect straight to the web app — user returns to the event they came from
  if (isWeb) {
    const path = returnPath || "";
    const url = new URL(path, WEB_APP_URL);
    url.searchParams.set("calendar_connected", success ? "true" : "false");
    if (!success) url.searchParams.set("calendar_error", message);
    return new Response(null, {
      status: 302,
      headers: { Location: url.toString(), ...corsHeaders },
    });
  }

  // For native: show a simple success page that auto-redirects via deep link
  const bgColor = success ? "#10B981" : "#EF4444";
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <title>Calendar Connection</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; padding: 20px; text-align: center;
      background-color: #1a1a2e; color: #ffffff;
    }
    .container { max-width: 600px; padding: 40px; background-color: #16213e; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    h1 { margin-bottom: 20px; color: ${bgColor}; }
    p { margin-bottom: 30px; line-height: 1.5; }
    .button { display: inline-block; padding: 12px 24px; background-color: ${bgColor}; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${success ? "Connected!" : "Error"}</h1>
    <p>${message}</p>
    <a href="${redirectUrl}" class="button">Return to App</a>
  </div>
  <script>setTimeout(() => { window.location.href = "${redirectUrl}"; }, 2000);</script>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...corsHeaders,
      },
    }
  );
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== Google Calendar Callback Function Started ===");
    console.log("Request URL:", req.url);

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    console.log("Request parameters:", { code: !!code, state, error });

    // Parse platform + return path from state
    const { isWeb, returnPath } = state ? parseState(state) : { isWeb: false, returnPath: "" };

    if (error) {
      console.error("Google authorization error:", error);
      return createResponse(
        `Error: ${error}. Please try connecting your calendar again.`,
        APP_URL,
        false,
        isWeb,
        returnPath
      );
    }

    if (!code || !state) {
      console.error("Missing required parameters:", { code: !!code, state });
      return createResponse(
        "Missing required parameters. Please try connecting your calendar again.",
        APP_URL,
        false,
        isWeb,
        returnPath
      );
    }

    console.log("Verifying state in database...");
    const { data: stateData, error: stateError } = await supabase
      .from("calendar_auth_states")
      .select("user_id, provider")
      .eq("state", state)
      .single();

    if (stateError || !stateData) {
      console.error("Database error while verifying state:", stateError);
      return createResponse(
        "Invalid or expired session. Please try connecting your calendar again.",
        APP_URL,
        false,
        isWeb,
        returnPath
      );
    }

    console.log("State verified successfully:", stateData);
    const userId = stateData.user_id;

    // Clean up the used state
    await supabase
      .from("calendar_auth_states")
      .delete()
      .eq("state", state);

    console.log("Exchanging authorization code for tokens...");
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: GOOGLE_CALENDAR_REDIRECT_URI,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Token exchange error:", errorData);
      return createResponse(
        "Failed to connect to Google Calendar. Please try again.",
        APP_URL,
        false,
        isWeb,
        returnPath
      );
    }

    const tokenData = await tokenResponse.json();
    console.log("Token exchange successful");

    // Update the user's profile with calendar connection
    console.log("Updating user profile with calendar connection...");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        calendar_provider: "google",
        calendar_connected: true,
        calendar_access_token: tokenData.access_token,
        calendar_refresh_token: tokenData.refresh_token,
        calendar_token_expires_at: new Date(
          Date.now() + tokenData.expires_in * 1000
        ).toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Error updating profile:", updateError);
      return createResponse(
        "Failed to save calendar connection. Please try again.",
        APP_URL,
        false,
        isWeb,
        returnPath
      );
    }

    // Fetch and store initial busy times
    console.log("Fetching initial busy times...");
    await fetchAndStoreBusyTimes(tokenData.access_token, userId);

    // If the OAuth flow was kicked off from a public event RSVP, record
    // a scheduling_calendar_syncs row so the event's min_synced_users
    // finalization trigger counts this participant.
    await markEventSyncIfApplicable(userId, returnPath);

    console.log("Profile updated successfully");
    console.log("=== Google Calendar Callback Function Completed Successfully ===");

    return createResponse(
      "Successfully connected your Google Calendar! You can now close this window.",
      APP_URL,
      true,
      isWeb,
      returnPath
    );
  } catch (error) {
    console.error("Unexpected error in callback:", error);
    return createResponse(
      "An unexpected error occurred. Please try connecting your calendar again.",
      APP_URL,
      false,
      false
    );
  }
});
