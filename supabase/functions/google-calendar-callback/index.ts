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

// Fetch busy times from Google Calendar and store them
async function fetchAndStoreBusyTimes(accessToken: string, userId: string): Promise<void> {
  try {
    // Get busy times for the next 30 days
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin: now.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: "primary" }],
        }),
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch busy times:", await response.text());
      return;
    }

    const data = await response.json();
    const busyTimes = data.calendars?.primary?.busy || [];

    console.log(`Found ${busyTimes.length} busy time blocks`);

    // Clear existing busy times for this user
    await supabase
      .from("calendar_busy_times")
      .delete()
      .eq("user_id", userId);

    // Insert new busy times
    if (busyTimes.length > 0) {
      const busyTimeRecords = busyTimes.map((busy: { start: string; end: string }) => ({
        user_id: userId,
        start_time: busy.start,
        end_time: busy.end,
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
    console.error("Error fetching busy times:", error);
  }
}

function createHtmlResponse(message: string, redirectUrl: string, success: boolean = true) {
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
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
            background-color: #1a1a2e;
            color: #ffffff;
          }
          .container {
            max-width: 600px;
            padding: 40px;
            background-color: #16213e;
            border-radius: 16px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          }
          h1 {
            margin-bottom: 20px;
            color: ${bgColor};
          }
          p {
            margin-bottom: 30px;
            line-height: 1.5;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: ${bgColor};
            color: white;
            text-decoration: none;
            border-radius: 12px;
            font-weight: bold;
            transition: opacity 0.3s ease;
          }
          .button:hover {
            opacity: 0.9;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Calendar Connection</h1>
          <p>${message}</p>
          <a href="${redirectUrl}" class="button">Return to App</a>
        </div>
        <script>
          // Automatically redirect after 3 seconds
          setTimeout(() => {
            window.location.href = "${redirectUrl}";
          }, 3000);
        </script>
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

    if (error) {
      console.error("Google authorization error:", error);
      return createHtmlResponse(
        `Error: ${error}. Please try connecting your calendar again.`,
        APP_URL,
        false
      );
    }

    if (!code || !state) {
      console.error("Missing required parameters:", { code: !!code, state });
      return createHtmlResponse(
        "Missing required parameters. Please try connecting your calendar again.",
        APP_URL,
        false
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
      return createHtmlResponse(
        "Invalid or expired session. Please try connecting your calendar again.",
        APP_URL,
        false
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
      return createHtmlResponse(
        "Failed to connect to Google Calendar. Please try again.",
        APP_URL,
        false
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
      return createHtmlResponse(
        "Failed to save calendar connection. Please try again.",
        APP_URL,
        false
      );
    }

    // Fetch and store initial busy times
    console.log("Fetching initial busy times...");
    await fetchAndStoreBusyTimes(tokenData.access_token, userId);

    console.log("Profile updated successfully");
    console.log("=== Google Calendar Callback Function Completed Successfully ===");

    return createHtmlResponse(
      "Successfully connected your Google Calendar! You can now close this window.",
      APP_URL,
      true
    );
  } catch (error) {
    console.error("Unexpected error in callback:", error);
    return createHtmlResponse(
      "An unexpected error occurred. Please try connecting your calendar again.",
      APP_URL,
      false
    );
  }
});
