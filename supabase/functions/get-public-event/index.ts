import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const eventRoomId = url.searchParams.get("event_room_id");

    if (!eventRoomId) {
      return new Response(
        JSON.stringify({ error: "event_room_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role to bypass RLS
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Run event lookup, auth user resolution, and participant lookup in
    // parallel — none of them depend on each other. Poll candidates only
    // depend on event_room_id, so they can go too.
    const authHeader = req.headers.get("Authorization");

    const eventPromise = supabase
      .from("event_rooms")
      .select("id, title, description, starts_at, ends_at, created_at, group_id, created_by, scheduling_mode, scheduling_status, scheduling_deadline")
      .eq("id", eventRoomId)
      .single();

    const authUserPromise: Promise<string | null> = (async () => {
      if (!authHeader) return null;
      const supabaseUser = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseUser.auth.getUser();
      return user?.id ?? null;
    })();

    const participantsPromise = supabase
      .from("event_room_participants")
      .select("user_id, joined_at")
      .eq("event_room_id", eventRoomId);

    const candidatesPromise = supabase
      .from("scheduling_candidate_times")
      .select("id, candidate_start, candidate_end, is_selected")
      .eq("event_room_id", eventRoomId)
      .order("candidate_start", { ascending: true });

    const [
      eventResult,
      authUserId,
      participantsResult,
      candidatesResult,
    ] = await Promise.all([
      eventPromise,
      authUserPromise,
      participantsPromise,
      candidatesPromise,
    ]);

    const { data: eventRoom, error: eventError } = eventResult;
    if (eventError || !eventRoom) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const participants = participantsResult.data;

    // Fan out: group, creator, participant profiles, user profile, poll
    // votes — all independent, all run in parallel.
    const groupPromise = eventRoom.group_id
      ? supabase
          .from("groups")
          .select("name")
          .eq("id", eventRoom.group_id)
          .single()
      : null;

    const creatorPromise = eventRoom.created_by
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", eventRoom.created_by)
          .single()
      : null;

    const participantProfilesPromise =
      participants && participants.length > 0
        ? supabase
            .from("profiles")
            .select("display_name")
            .in(
              "id",
              participants.map((p: { user_id: string }) => p.user_id)
            )
        : null;

    const userProfilePromise = authUserId
      ? supabase
          .from("profiles")
          .select("display_name")
          .eq("id", authUserId)
          .single()
      : null;

    const isPollMode = eventRoom.scheduling_mode === "poll";
    const candidates = candidatesResult.data;
    const votesPromise =
      isPollMode && candidates && candidates.length > 0
        ? supabase
            .from("poll_votes")
            .select("candidate_time_id, vote")
            .in(
              "candidate_time_id",
              candidates.map((c: { id: string }) => c.id)
            )
            .eq("vote", "YES")
        : null;

    const [
      groupResult,
      creatorResult,
      participantProfilesResult,
      userProfileResult,
      votesResult,
    ] = await Promise.all([
      groupPromise,
      creatorPromise,
      participantProfilesPromise,
      userProfilePromise,
      votesPromise,
    ]);

    const groupName = groupResult?.data?.name ?? null;
    const creatorName = creatorResult?.data?.display_name ?? null;

    const participantNames: string[] = [];
    if (participantProfilesResult?.data) {
      for (const profile of participantProfilesResult.data) {
        if (profile.display_name) {
          participantNames.push(profile.display_name);
        }
      }
    }

    // Check if event is expired
    const now = new Date();
    let isExpired = false;
    const H48 = 48 * 60 * 60 * 1000;
    const H72 = 72 * 60 * 60 * 1000;
    if (eventRoom.ends_at) {
      isExpired = new Date(eventRoom.ends_at).getTime() + H48 <= now.getTime();
    } else if (eventRoom.starts_at) {
      isExpired = new Date(eventRoom.starts_at).getTime() + H48 <= now.getTime();
    } else {
      isExpired = new Date(eventRoom.created_at).getTime() + H72 <= now.getTime();
    }

    const alreadyRsvpd =
      !!authUserId &&
      !!participants &&
      participants.some((p: { user_id: string }) => p.user_id === authUserId);
    const userName = userProfileResult?.data?.display_name ?? null;

    // For poll-mode events, assemble options with YES vote counts
    let pollOptions: Array<{
      id: string;
      starts_at: string;
      ends_at: string;
      yes_count: number;
      is_selected: boolean;
    }> | null = null;

    if (isPollMode && candidates && candidates.length > 0) {
      const yesCounts = new Map<string, number>();
      if (votesResult?.data) {
        for (const v of votesResult.data) {
          yesCounts.set(
            v.candidate_time_id,
            (yesCounts.get(v.candidate_time_id) || 0) + 1
          );
        }
      }

      pollOptions = candidates.map(
        (c: {
          id: string;
          candidate_start: string;
          candidate_end: string;
          is_selected: boolean | null;
        }) => ({
          id: c.id,
          starts_at: c.candidate_start,
          ends_at: c.candidate_end,
          yes_count: yesCounts.get(c.id) || 0,
          is_selected: c.is_selected || false,
        })
      );
    }

    // Return sanitized public data — no user IDs, no emails
    const response: Record<string, any> = {
      title: eventRoom.title,
      description: eventRoom.description,
      starts_at: eventRoom.starts_at,
      ends_at: eventRoom.ends_at,
      group_name: groupName,
      creator_name: creatorName,
      participant_count: participants?.length || 0,
      participant_names: participantNames,
      is_expired: isExpired,
      already_rsvpd: alreadyRsvpd,
      user_name: userName,
      scheduling_mode: eventRoom.scheduling_mode || "fixed",
      scheduling_status: eventRoom.scheduling_status || "none",
      scheduling_deadline: eventRoom.scheduling_deadline || null,
      poll_options: pollOptions,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
