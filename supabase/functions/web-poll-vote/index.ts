import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Guest-friendly poll voting endpoint. Mirrors web-rsvp: trusts
// guest_email as the identifier for users who RSVP'd via the public
// event page, since they don't have a client-side JWT. Authenticated
// users are also supported via the Authorization header.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    const body = await req.json();
    const { event_room_id, votes, guest_email } = body as {
      event_room_id?: string;
      guest_email?: string;
      votes?: Array<{ candidate_time_id: string; vote: "YES" | "NO" }>;
    };

    if (!event_room_id) {
      return new Response(
        JSON.stringify({ error: "event_room_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(votes) || votes.length === 0) {
      return new Response(
        JSON.stringify({ error: "votes array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const v of votes) {
      if (!v.candidate_time_id || (v.vote !== "YES" && v.vote !== "NO")) {
        return new Response(
          JSON.stringify({ error: "Each vote must have candidate_time_id and YES/NO" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Kick off event lookup, candidate validation, and (if possible)
    // user resolution in parallel — none of them depend on each other.
    const candidateIds = votes.map((v) => v.candidate_time_id);

    const eventPromise = supabase
      .from("event_rooms")
      .select("id, scheduling_mode, scheduling_status")
      .eq("id", event_room_id)
      .single();

    const candidatesPromise = supabase
      .from("scheduling_candidate_times")
      .select("id")
      .eq("event_room_id", event_room_id)
      .in("id", candidateIds);

    const userPromise: Promise<string | null> = (async () => {
      if (authHeader) {
        const supabaseUser = createClient(
          supabaseUrl,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await supabaseUser.auth.getUser();
        if (user) return user.id;
      }
      if (guest_email) {
        // Only accept guest_email for profiles actually marked as
        // guests. Refusing to match real accounts by plaintext email
        // prevents an attacker from voting as another user just by
        // knowing their address.
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, is_guest")
          .eq("email", guest_email.toLowerCase().trim())
          .single();
        if (profile && profile.is_guest === true) return profile.id;
      }
      return null;
    })();

    const [eventResult, candidatesResult, userId] = await Promise.all([
      eventPromise,
      candidatesPromise,
      userPromise,
    ]);

    const { data: eventRoom, error: eventError } = eventResult;
    if (eventError || !eventRoom) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventRoom.scheduling_mode !== "poll") {
      return new Response(
        JSON.stringify({ error: "This event does not use poll voting" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (eventRoom.scheduling_status !== "collecting") {
      return new Response(
        JSON.stringify({ error: "Voting is closed for this event" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Must RSVP before voting" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Must be a participant
    const { data: participant } = await supabase
      .from("event_room_participants")
      .select("user_id")
      .eq("event_room_id", event_room_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "Not a participant in this event" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter to candidate_time_ids that actually belong to this event
    const validIdSet = new Set(
      (candidatesResult.data || []).map((c: { id: string }) => c.id)
    );
    const validVotes = votes.filter((v) => validIdSet.has(v.candidate_time_id));

    if (validVotes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid options in vote list" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upsert votes. UNIQUE(candidate_time_id, user_id) enables conflict
    const rows = validVotes.map((v) => ({
      event_room_id,
      candidate_time_id: v.candidate_time_id,
      user_id: userId!,
      vote: v.vote,
    }));

    const { error: upsertError } = await supabase
      .from("poll_votes")
      .upsert(rows, { onConflict: "candidate_time_id,user_id" });

    if (upsertError) {
      console.error("[web-poll-vote] upsert failed:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to record votes" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, recorded: validVotes.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[web-poll-vote] error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
