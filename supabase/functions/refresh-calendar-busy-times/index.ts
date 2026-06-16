import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  refreshUserBusyTimes,
  CalendarProfile,
} from "../_shared/googleCalendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Refresh one user's availability store from Google Calendar (FreeBusy). Token
// refresh, the FreeBusy fetch, and the store write all live in
// _shared/googleCalendar.ts so this function, the OAuth callback, and the
// refresh-all-calendars cron stay in sync.
//
// Body: { userId: string, windowEnd?: string }
//   windowEnd — optional ISO bound (e.g. an event's scheduling horizon);
//   defaults to 60 days out.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, windowEnd } = await req.json();
    if (!userId) {
      throw new Error("User ID is required");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, calendar_provider, calendar_connected, calendar_access_token, calendar_refresh_token, calendar_token_expires_at"
      )
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      throw new Error("User profile not found");
    }
    if (!profile.calendar_connected || !profile.calendar_refresh_token) {
      throw new Error("Calendar not connected");
    }

    const count = await refreshUserBusyTimes(
      supabase,
      profile as CalendarProfile,
      { horizonEnd: windowEnd ? new Date(windowEnd) : undefined }
    );

    if (count === null) {
      throw new Error("Failed to refresh calendar busy times");
    }

    return new Response(
      JSON.stringify({ success: true, busyTimeCount: count }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error("Error refreshing busy times:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
