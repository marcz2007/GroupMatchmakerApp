import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { issueAndSendVerification } from "../_shared/verification.ts";

// Event RSVP from the public web invite page.
//  - Authenticated callers (existing app users) RSVP with their session.
//  - Guests submit { first_name, email, password } and we create a REAL but
//    UNVERIFIED Grapple account (they can sign in immediately and return later),
//    RSVP them, and email a verification link in the background. Verifying later
//    unlocks the full app — unverified accounts are event-attendee only.

const RL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RL_MAX = 5; // max RSVP account-creation attempts per ip:email per window
const MIN_PASSWORD = 8;

function json(bodyObj: unknown, status: number) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
    // Accept new (first_name/email/password) and legacy (guest_name/guest_email) keys.
    const event_room_id: string | undefined = body.event_room_id;
    const firstName: string = (body.first_name ?? body.guest_name ?? "").trim();
    const rawEmail: string = (body.email ?? body.guest_email ?? "").trim();
    const password: string | undefined = body.password;

    if (!event_room_id) {
      return json({ error: "event_room_id is required" }, 400);
    }

    const { data: eventRoom, error: eventError } = await supabase
      .from("event_rooms")
      .select("id, group_id, title")
      .eq("id", event_room_id)
      .single();

    if (eventError || !eventRoom) {
      return json({ error: "Event not found" }, 404);
    }

    let userId: string;
    let needsVerification = false;
    let issueVerification = false; // send/resend a verification email at the end

    if (authHeader) {
      // --- Authenticated RSVP (existing app user) ---
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
      if (authError || !user) {
        return json({ error: "Invalid or expired token" }, 401);
      }
      userId = user.id;

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, email_verified_at")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: user.id,
          first_name: user.user_metadata?.first_name || user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          email: user.email,
        });
        needsVerification = true;
      } else {
        needsVerification = !existingProfile.email_verified_at;
      }
    } else {
      // --- Guest RSVP → real unverified account ---
      if (!firstName || !rawEmail) {
        return json({ error: "first_name and email are required" }, 400);
      }
      const normalizedEmail = rawEmail.toLowerCase();

      // Rate limit account-creation attempts by ip:email.
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
      const rlKey = `${ip}:${normalizedEmail}`;
      const since = new Date(Date.now() - RL_WINDOW_MS).toISOString();
      const { count: recentAttempts } = await supabase
        .from("rsvp_rate_limits")
        .select("id", { count: "exact", head: true })
        .eq("key", rlKey)
        .gte("created_at", since);
      if ((recentAttempts ?? 0) >= RL_MAX) {
        return json({ error: "Too many attempts. Please try again in a few minutes." }, 429);
      }
      await supabase.from("rsvp_rate_limits").insert({ key: rlKey });

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, email_verified_at")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingProfile && existingProfile.email_verified_at) {
        // Verified real account — they must sign in (don't let anyone RSVP as them).
        return json(
          { error: "This email already has an account. Please sign in to RSVP.", code: "ACCOUNT_EXISTS" },
          409,
        );
      } else if (existingProfile) {
        // Existing but UNVERIFIED (incl. legacy guests). Don't hard-block and
        // don't touch their password — RSVP them and resend a verification link
        // so the real owner can claim/verify the account.
        userId = existingProfile.id;
        needsVerification = true;
        issueVerification = true;
      } else {
        // Brand-new account — password required.
        if (!password || password.length < MIN_PASSWORD) {
          return json({ error: `Password must be at least ${MIN_PASSWORD} characters.` }, 400);
        }
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true, // lets them sign in now; product verification is separate
          user_metadata: { first_name: firstName, is_guest: false },
        });

        if (createErr || !created?.user) {
          // Race: two RSVPs with the same new email. Recover by re-reading.
          const msg = createErr?.message?.toLowerCase() || "";
          if (msg.includes("already") || msg.includes("registered")) {
            const { data: reread } = await supabase
              .from("profiles")
              .select("id, email_verified_at")
              .eq("email", normalizedEmail)
              .maybeSingle();
            if (reread && reread.email_verified_at) {
              return json(
                { error: "This email already has an account. Please sign in to RSVP.", code: "ACCOUNT_EXISTS" },
                409,
              );
            }
            if (reread) {
              userId = reread.id;
              needsVerification = true;
              issueVerification = true;
            } else {
              console.error("createUser raced with no profile:", createErr);
              return json({ error: "Failed to create account" }, 500);
            }
          } else {
            console.error("Error creating account:", createErr);
            return json({ error: "Failed to create account" }, 500);
          }
        } else {
          userId = created.user.id;
          await supabase.from("profiles").upsert(
            {
              id: userId,
              first_name: firstName,
              email: normalizedEmail,
              is_guest: false,
            },
            { onConflict: "id" },
          );
          needsVerification = true;
          issueVerification = true;
        }
      }
    }

    // Add to the event's group (service-role insert bypasses the verified gate).
    if (eventRoom.group_id) {
      await supabase
        .from("group_members")
        .upsert({ group_id: eventRoom.group_id, user_id: userId! }, { onConflict: "group_id,user_id" });
    }

    // RSVP (idempotent).
    const { error: participantError } = await supabase
      .from("event_room_participants")
      .upsert({ event_room_id, user_id: userId! }, { onConflict: "event_room_id,user_id" });
    if (participantError) {
      console.error("Error adding participant:", participantError);
      return json({ error: "Failed to RSVP" }, 500);
    }

    // Fire the verification email (best-effort; helper never throws).
    if (issueVerification) {
      await issueAndSendVerification(supabase, userId!, rawEmail.toLowerCase(), firstName);
    }

    const { data: profileAfter } = await supabase
      .from("profiles")
      .select("calendar_connected")
      .eq("id", userId!)
      .single();

    return json(
      {
        success: true,
        event_title: eventRoom.title,
        user_id: userId!,
        needs_verification: needsVerification,
        calendar_connected: profileAfter?.calendar_connected ?? false,
        message: "You're in!",
      },
      200,
    );
  } catch (error) {
    console.error("Error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
