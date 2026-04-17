import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

async function fetchEventTimes(
  accessToken: string,
  windowEnd?: Date
): Promise<Array<{ start: string; end: string }>> {
  try {
    const now = new Date();
    // Default to 60 days out. Callers that know the event's date range
    // (e.g. run-smart-scheduling) should pass a tighter bound — fetching
    // a year of events wastes API quota and risks hitting Google's
    // maxResults=2500 cap, which would silently truncate a heavy user's
    // calendar and produce phantom "free" slots.
    const endDate = windowEnd
      ? new Date(windowEnd)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 60);
          return d;
        })();

    const results: Array<{ start: string; end: string }> = [];
    let pageToken: string | undefined;
    let totalRaw = 0;

    do {
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        // `transparency` tells us if the user marked the event "Show as
        // Free" — those shouldn't block scheduling. `status` lets us
        // drop cancelled events, which Google still returns.
        fields:
          "items(start,end,visibility,transparency,status),nextPageToken",
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
        return results;
      }

      const data = await response.json();
      pageToken = data.nextPageToken;
      totalRaw += (data.items || []).length;

      for (const event of data.items || []) {
        // Skip private events — the caller asked not to look at these.
        if (event.visibility === "private" || event.visibility === "confidential") {
          continue;
        }
        // Skip events the user marked "Show as Free" — they explicitly
        // said this doesn't block them.
        if (event.transparency === "transparent") {
          continue;
        }
        // Skip cancelled events. Google still returns these in
        // singleEvents expansions (especially recurring cancellations).
        if (event.status === "cancelled") {
          continue;
        }

        // Use dateTime for timed events, date for all-day events
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;

        if (start && end) {
          results.push({ start, end });
        }
      }
    } while (pageToken);

    console.log(
      `Calendar fetch: ${totalRaw} raw events → ${results.length} busy blocks`
    );
    return results;
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== Refresh Calendar Busy Times Started ===");

    const { userId, windowEnd } = await req.json();

    if (!userId) {
      throw new Error("User ID is required");
    }

    // `windowEnd` is an optional ISO string. Callers with a known
    // scheduling horizon (e.g. run-smart-scheduling) pass it so we
    // don't fetch a year of events.
    const parsedWindowEnd = windowEnd ? new Date(windowEnd) : undefined;

    // Get user's calendar credentials
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("calendar_provider, calendar_connected, calendar_access_token, calendar_refresh_token, calendar_token_expires_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      throw new Error("User profile not found");
    }

    if (!profile.calendar_connected || !profile.calendar_refresh_token) {
      throw new Error("Calendar not connected");
    }

    // Check if token needs refresh
    let accessToken = profile.calendar_access_token;
    const tokenExpiry = new Date(profile.calendar_token_expires_at);
    const now = new Date();

    if (tokenExpiry <= now) {
      console.log("Token expired, refreshing...");
      accessToken = await refreshAccessToken(profile.calendar_refresh_token);

      if (!accessToken) {
        throw new Error("Failed to refresh access token");
      }

      // Update the new access token in database
      await supabase
        .from("profiles")
        .update({
          calendar_access_token: accessToken,
          calendar_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        })
        .eq("id", userId);
    }

    // Fetch event times (excludes private / free / cancelled events)
    console.log("Fetching calendar events...");
    const eventTimes = await fetchEventTimes(accessToken, parsedWindowEnd);
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

      const { error: insertError } = await supabase
        .from("calendar_busy_times")
        .insert(busyTimeRecords);

      if (insertError) {
        console.error("Error inserting busy times:", insertError);
        throw insertError;
      }
    }

    console.log("=== Refresh Calendar Busy Times Completed ===");

    return new Response(
      JSON.stringify({
        success: true,
        busyTimeCount: eventTimes.length,
      }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    console.error("Error refreshing busy times:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
});
