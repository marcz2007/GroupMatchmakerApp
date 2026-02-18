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

    // Fetch event room with group info
    const { data: eventRoom, error: eventError } = await supabase
      .from("event_rooms")
      .select("id, title, description, starts_at, ends_at, created_at, group_id")
      .eq("id", eventRoomId)
      .single();

    if (eventError || !eventRoom) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch group name
    const { data: group } = await supabase
      .from("groups")
      .select("name")
      .eq("id", eventRoom.group_id)
      .single();

    // Fetch proposal creator
    const { data: proposal } = await supabase
      .from("proposals")
      .select("created_by")
      .eq("group_id", eventRoom.group_id)
      .eq("title", eventRoom.title)
      .single();

    let creatorName: string | null = null;
    if (proposal?.created_by) {
      const { data: creator } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", proposal.created_by)
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
    if (eventRoom.ends_at) {
      isExpired = new Date(eventRoom.ends_at).getTime() + 12 * 60 * 60 * 1000 <= now.getTime();
    } else {
      isExpired = new Date(eventRoom.created_at).getTime() + 72 * 60 * 60 * 1000 <= now.getTime();
    }

    // Return sanitized public data — no user IDs, no emails
    const response = {
      title: eventRoom.title,
      description: eventRoom.description,
      starts_at: eventRoom.starts_at,
      ends_at: eventRoom.ends_at,
      group_name: group?.name || null,
      creator_name: creatorName,
      participant_count: participants?.length || 0,
      participant_names: participantNames,
      is_expired: isExpired,
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
