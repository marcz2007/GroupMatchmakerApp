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

async function fetchEventTimes(accessToken: string): Promise<Array<{ start: string; end: string }>> {
  try {
    const now = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    const results: Array<{ start: string; end: string }> = [];
    let pageToken: string | undefined;

    // Paginate through all events
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
        return results;
      }

      const data = await response.json();
      pageToken = data.nextPageToken;

      for (const event of data.items || []) {
        // Skip private events
        if (event.visibility === "private" || event.visibility === "confidential") {
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

    const { userId } = await req.json();

    if (!userId) {
      throw new Error("User ID is required");
    }

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

    // Fetch event times (excludes private events)
    console.log("Fetching calendar events...");
    const eventTimes = await fetchEventTimes(accessToken);
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
