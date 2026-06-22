import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Scheduled (pg_cron) cleanup of stale unverified accounts: created > 30 days
// ago, never verified, and NOT an active event participant. Never touches
// people who are actually part of an event. Invoked by cron with the service
// role key (so the default JWT check is fine — not a public function).

const STALE_DAYS = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: candidates, error } = await supabase
      .from("profiles")
      .select("id")
      .is("email_verified_at", null)
      .lt("created_at", cutoff);

    if (error) {
      console.error("cleanup query failed:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = (candidates ?? []).map((c) => c.id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ scanned: 0, deleted: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exclude anyone who is an active participant of any event.
    const { data: active } = await supabase
      .from("event_room_participants")
      .select("user_id")
      .in("user_id", ids);
    const activeSet = new Set((active ?? []).map((a) => a.user_id));
    const toDelete = ids.filter((id) => !activeSet.has(id));

    let deleted = 0;
    for (const id of toDelete) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(id);
      if (delErr) console.error(`deleteUser ${id} failed:`, delErr.message);
      else deleted++;
    }

    return new Response(
      JSON.stringify({ scanned: ids.length, kept_active: ids.length - toDelete.length, deleted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("cleanup-unverified-accounts error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
