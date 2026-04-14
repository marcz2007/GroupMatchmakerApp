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

    // Optionally resolve the authenticated user (if token provided)
    let authUserId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseUser.auth.getUser();
      if (user) authUserId = user.id;
    }

    // Fetch event room with group info
    const { data: eventRoom, error: eventError } = await supabase
      .from("event_rooms")
      .select("id, title, description, starts_at, ends_at, created_at, group_id, created_by, scheduling_mode, scheduling_status, scheduling_deadline")
      .eq("id", eventRoomId)
      .single();

    if (eventError || !eventRoom) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch group name (only if event has a group)
    let groupName: string | null = null;
    if (eventRoom.group_id) {
      const { data: group } = await supabase
        .from("groups")
        .select("name")
        .eq("id", eventRoom.group_id)
        .single();
      groupName = group?.name || null;
    }

    // Fetch creator name using created_by column
    let creatorName: string | null = null;
    if (eventRoom.created_by) {
      const { data: creator } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", eventRoom.created_by)
        .single();
      creatorName = creator?.display_name || null;
    }

    // Fetch participants with display names
    const { data: participants } = await supabase
      .from("event_room_participants")
      .select("user_id, joined_at")
      .eq("event_room_id", eventRoomId);

    const participantNames: string[] = [];
    if (participants && participants.length > 0) {
      const userIds = participants.map((p: any) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("display_name")
        .in("id", userIds);

      if (profiles) {
        for (const profile of profiles) {
          if (profile.display_name) {
            participantNames.push(profile.display_name);
          }
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

    // Check if the authenticated user has already RSVP'd
    let alreadyRsvpd = false;
    let userName: string | null = null;
    if (authUserId && participants) {
      alreadyRsvpd = participants.some((p: any) => p.user_id === authUserId);
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", authUserId)
        .single();
      userName = userProfile?.display_name || null;
    }

    // For poll-mode events, fetch the options with YES vote counts
    let pollOptions: Array<{
      id: string;
      starts_at: string;
      ends_at: string;
      yes_count: number;
      is_selected: boolean;
    }> | null = null;

    if (eventRoom.scheduling_mode === "poll") {
      const { data: candidates } = await supabase
        .from("scheduling_candidate_times")
        .select("id, candidate_start, candidate_end, is_selected")
        .eq("event_room_id", eventRoomId)
        .order("candidate_start", { ascending: true });

      if (candidates && candidates.length > 0) {
        const candidateIds = candidates.map((c: any) => c.id);
        const { data: votes } = await supabase
          .from("poll_votes")
          .select("candidate_time_id, vote")
          .in("candidate_time_id", candidateIds)
          .eq("vote", "YES");

        const yesCounts = new Map<string, number>();
        if (votes) {
          for (const v of votes) {
            yesCounts.set(
              v.candidate_time_id,
              (yesCounts.get(v.candidate_time_id) || 0) + 1
            );
          }
        }

        pollOptions = candidates.map((c: any) => ({
          id: c.id,
          starts_at: c.candidate_start,
          ends_at: c.candidate_end,
          yes_count: yesCounts.get(c.id) || 0,
          is_selected: c.is_selected || false,
        }));
      }
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
