import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  refreshUserBusyTimes,
  CalendarProfile,
} from "../_shared/googleCalendar.ts";

// Cron-driven refresh of EVERY connected user's availability over a rolling
// horizon, so users sync once and their free/busy stays current without ever
// re-syncing. Intended to be called by pg_cron with the service role key.
//
// Optional request body: { userId?: string } to refresh a single user.
// Response: { refreshed, failed, total }.

const HORIZON_DAYS = 90;
const BATCH_SIZE = 25;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const onlyUserId: string | undefined = body.userId;

    let query = supabase
      .from("profiles")
      .select(
        "id, calendar_provider, calendar_connected, calendar_access_token, calendar_refresh_token, calendar_token_expires_at"
      )
      .eq("calendar_connected", true)
      .eq("calendar_provider", "google");

    if (onlyUserId) query = query.eq("id", onlyUserId);

    const { data: profiles, error } = await query;
    if (error) throw error;

    let refreshed = 0;
    let failed = 0;

    // Process in small batches to bound concurrency against the Google API.
    for (let i = 0; i < (profiles?.length ?? 0); i += BATCH_SIZE) {
      const batch = profiles!.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((p) =>
          refreshUserBusyTimes(supabase, p as CalendarProfile, {
            horizonDays: HORIZON_DAYS,
          }).catch((e) => {
            console.error(`Refresh failed for ${p.id}:`, e);
            return null;
          })
        )
      );
      for (const r of results) {
        if (r === null) failed++;
        else refreshed++;
      }
    }

    console.log(
      `refresh-all-calendars: ${refreshed} refreshed, ${failed} failed`
    );
    return new Response(
      JSON.stringify({
        success: true,
        refreshed,
        failed,
        total: profiles?.length ?? 0,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    console.error("refresh-all-calendars error:", e);
    return new Response(
      JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
