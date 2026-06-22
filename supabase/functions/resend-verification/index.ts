import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { issueAndSendVerification } from "../_shared/verification.ts";

// Re-issues a verification link. Two callers:
//  - the app's "Resend" button (authenticated session), and
//  - an unverified user re-entering their email on the event page.
// Always returns a generic success so the endpoint can't be used to probe
// which emails exist or are verified.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ok = () =>
    new Response(
      JSON.stringify({ success: true, message: "If that account needs verifying, we've sent a link." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    const emailInput: string | undefined = body?.email;

    let profile: { id: string; email: string | null; first_name: string | null; email_verified_at: string | null } | null = null;

    if (authHeader) {
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await asUser.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("id, email, first_name, email_verified_at")
          .eq("id", user.id)
          .maybeSingle();
        profile = data;
      }
    } else if (emailInput) {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, first_name, email_verified_at")
        .eq("email", emailInput.toLowerCase().trim())
        .maybeSingle();
      profile = data;
    }

    // Only act for an existing, still-unverified account.
    if (profile && !profile.email_verified_at && profile.email) {
      await issueAndSendVerification(
        supabase,
        profile.id,
        profile.email,
        profile.first_name ?? "",
      );
    }

    return ok();
  } catch (err) {
    console.error("resend-verification error:", err);
    // Still generic — don't leak failures either.
    return ok();
  }
});
