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
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    const body = await req.json();
    const { event_room_id, guest_name, guest_email } = body;

    if (!event_room_id) {
      return new Response(
        JSON.stringify({ error: "event_room_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    let userId: string;

    if (authHeader) {
      // --- Authenticated RSVP (OAuth user) ---
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

      userId = user.id;

      // Ensure profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        const displayName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "New User";

        await supabase.from("profiles").insert({
          id: user.id,
          display_name: displayName,
          avatar_url: user.user_metadata?.avatar_url || null,
          email: user.email,
        });
      }
    } else {
      // --- Guest RSVP (name + email, no auth required) ---
      if (!guest_name || !guest_email) {
        return new Response(
          JSON.stringify({ error: "guest_name and guest_email are required for guest RSVP" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if a profile with this email already exists. We only
      // reuse it if it's already marked as a guest. Refusing to match
      // real accounts by plaintext email prevents an attacker from
      // RSVPing (and subsequently voting) as another user just by
      // knowing their address.
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, is_guest")
        .eq("email", guest_email.toLowerCase().trim())
        .single();

      if (existingProfile && existingProfile.is_guest === true) {
        // Reuse the existing guest — don't create a duplicate
        userId = existingProfile.id;
      } else if (existingProfile && existingProfile.is_guest !== true) {
        // Email belongs to a real account. Require them to sign in.
        return new Response(
          JSON.stringify({
            error:
              "This email already has an account. Please sign in to RSVP.",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Create an anonymous auth user, then create their profile
        const { data: anonAuth, error: anonError } = await supabase.auth.admin.createUser({
          email: guest_email.toLowerCase().trim(),
          email_confirm: true,
          user_metadata: { full_name: guest_name.trim(), is_guest: true },
        });

        if (anonError || !anonAuth.user) {
          console.error("Error creating guest user:", anonError);
          return new Response(
            JSON.stringify({ error: "Failed to create guest account" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        userId = anonAuth.user.id;

        await supabase.from("profiles").insert({
          id: userId,
          display_name: guest_name.trim(),
          email: guest_email.toLowerCase().trim(),
          is_guest: true,
        });
      }
    }

    // Add user to group_members if event has a group
    if (eventRoom.group_id) {
      await supabase
        .from("group_members")
        .upsert(
          { group_id: eventRoom.group_id, user_id: userId },
          { onConflict: "group_id,user_id" }
        );
    }

    // Add user to event_room_participants
    const { error: participantError } = await supabase
      .from("event_room_participants")
      .upsert(
        { event_room_id, user_id: userId },
        { onConflict: "event_room_id,user_id" }
      );

    if (participantError) {
      console.error("Error adding participant:", participantError);
      return new Response(
        JSON.stringify({ error: "Failed to RSVP" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up calendar_connected so the client can decide whether to
    // prompt the guest (or logged-in user) to connect their calendar.
    // This is cheap — one row lookup on a small table — and saves the
    // client an extra round trip.
    const { data: profileAfter } = await supabase
      .from("profiles")
      .select("calendar_connected")
      .eq("id", userId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        event_title: eventRoom.title,
        user_id: userId,
        calendar_connected: profileAfter?.calendar_connected ?? false,
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
