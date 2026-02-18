import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the user's auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a client with the user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { event_room_id } = await req.json();
    if (!event_room_id) {
      return new Response(
        JSON.stringify({ error: "event_room_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for write operations (bypass RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify event room exists
    const { data: eventRoom, error: eventError } = await supabase
      .from("event_rooms")
      .select("id, group_id, title")
      .eq("id", event_room_id)
      .single();

    if (eventError || !eventRoom) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure user profile exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!existingProfile) {
      // Create profile from auth metadata
      const displayName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "New User";

      const { error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          display_name: displayName,
          avatar_url: user.user_metadata?.avatar_url || null,
          email: user.email,
        });

      if (profileError) {
        console.error("Error creating profile:", profileError);
      }
    }

    // Add user to group_members if not already a member
    const { error: groupMemberError } = await supabase
      .from("group_members")
      .upsert(
        { group_id: eventRoom.group_id, user_id: user.id },
        { onConflict: "group_id,user_id" }
      );

    if (groupMemberError) {
      console.error("Error adding to group:", groupMemberError);
    }

    // Add user to event_room_participants
    const { error: participantError } = await supabase
      .from("event_room_participants")
      .upsert(
        { event_room_id, user_id: user.id },
        { onConflict: "event_room_id,user_id" }
      );

    if (participantError) {
      console.error("Error adding participant:", participantError);
      return new Response(
        JSON.stringify({ error: "Failed to RSVP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_title: eventRoom.title,
        message: "You're in!",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
