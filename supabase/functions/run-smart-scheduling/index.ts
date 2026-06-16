import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Accept optional eventRoomId to process a single event,
    // otherwise process all overdue smart events.
    let eventRoomIds: string[] = [];

    try {
      const body = await req.json();
      if (body?.eventRoomId) {
        eventRoomIds = [body.eventRoomId];
      }
    } catch {
      // No body — process all overdue events
    }

    if (eventRoomIds.length === 0) {
      // Reconciler: every collecting smart event that should finalize now —
      // deadline passed, min_synced reached, OR all participants synced. This
      // catches events whose trigger pg_net call failed, not just overdue ones.
      const { data: readyEvents, error } = await supabase.rpc(
        "find_ready_smart_events"
      );

      if (error) {
        throw new Error(`Failed to fetch ready events: ${error.message}`);
      }

      eventRoomIds = (readyEvents || []).map((e: any) => e.event_room_id);
    }

    if (eventRoomIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No events to schedule", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${eventRoomIds.length} smart events`);
    const results: any[] = [];

    for (const eventRoomId of eventRoomIds) {
      try {
        // 1. Refresh calendar busy times for all synced Google Calendar users.
        //    Scope the fetch to this event's date window (plus a day buffer)
        //    so we don't re-fetch a year of events every run.
        const { data: eventRow } = await supabase
          .from("event_rooms")
          .select("scheduling_date_range_end")
          .eq("id", eventRoomId)
          .single();

        let windowEnd: string | undefined;
        if (eventRow?.scheduling_date_range_end) {
          const end = new Date(eventRow.scheduling_date_range_end);
          end.setDate(end.getDate() + 1); // buffer past the last candidate
          windowEnd = end.toISOString();
        }

        const { data: syncs } = await supabase
          .from("scheduling_calendar_syncs")
          .select("user_id, calendar_provider")
          .eq("event_room_id", eventRoomId);

        const googleUserIds = (syncs || [])
          .filter((s: any) => s.calendar_provider === "google")
          .map((s: any) => s.user_id);
        // iOS local calendars are uploaded at sync time, no refresh needed.

        if (googleUserIds.length > 0) {
          // Freshness gate: the persistent store is kept warm by the daily
          // refresh-all-calendars cron and by on-connect syncs. Only hit
          // Google for users whose store is stale or doesn't cover this
          // event's window — most runs now skip the round-trips entirely.
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, calendar_last_refreshed_at, calendar_synced_through")
            .in("id", googleUserIds);
          const metaById = new Map(
            (profs || []).map((p: any) => [p.id, p])
          );

          const FRESH_MS = 2 * 60 * 60 * 1000; // trust store refreshed <2h ago
          const nowMs = Date.now();
          const windowEndMs = windowEnd ? new Date(windowEnd).getTime() : nowMs;

          for (const userId of googleUserIds) {
            const meta = metaById.get(userId);
            const refreshedAt = meta?.calendar_last_refreshed_at
              ? new Date(meta.calendar_last_refreshed_at).getTime()
              : 0;
            const syncedThrough = meta?.calendar_synced_through
              ? new Date(meta.calendar_synced_through).getTime()
              : 0;
            const isFresh =
              nowMs - refreshedAt < FRESH_MS && syncedThrough >= windowEndMs;
            if (isFresh) continue; // warm store covers it — skip Google

            try {
              await supabase.functions.invoke("refresh-calendar-busy-times", {
                body: { userId, windowEnd },
              });
            } catch (refreshErr) {
              console.error(`Failed to refresh calendar for user ${userId}:`, refreshErr);
              // Continue — use whatever data we have
            }
          }
        }

        // 2. Run the scheduling algorithm via RPC
        const { data, error } = await supabase.rpc("run_smart_scheduling", {
          p_event_room_id: eventRoomId,
        });

        if (error) {
          console.error(`Scheduling failed for ${eventRoomId}:`, error);
          results.push({ eventRoomId, success: false, error: error.message });
        } else {
          console.log(`Scheduled ${eventRoomId}:`, data);
          results.push({ eventRoomId, ...data });
        }
      } catch (err) {
        console.error(`Error processing ${eventRoomId}:`, err);
        results.push({ eventRoomId, success: false, error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in run-smart-scheduling:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
