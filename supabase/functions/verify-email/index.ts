import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Google-calendar-callback-style page: Google/our email redirects the user's
// browser straight here with ?token, no JWT — so this function is deployed with
// verify_jwt = false and validates the request via the one-time token itself.

function page(success: boolean, message: string, backUrl: string): Response {
  const color = success ? "#10b981" : "#ef4444";
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <title>Email verification</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;margin:0;padding:20px;text-align:center;background:#1a1a2e;color:#fff; }
    .container { max-width:600px;padding:40px;background:#16213e;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.3); }
    h1 { margin-bottom:20px;color:${color}; }
    p { margin-bottom:30px;line-height:1.5; }
    .button { display:inline-block;padding:12px 24px;background:${color};color:#fff;text-decoration:none;border-radius:12px;font-weight:bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${success ? "Email verified!" : "Verification problem"}</h1>
    <p>${message}</p>
    <a href="${backUrl}" class="button">Continue to Grapple</a>
  </div>
  <script>setTimeout(() => { window.location.href = "${backUrl}"; }, 2500);</script>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const webBase = Deno.env.get("WEB_APP_URL") ?? "https://grappleapp.co.uk";

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return page(false, "This verification link is missing its token.", webBase);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row } = await supabase
      .from("email_verification_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (!row) {
      return page(false, "This verification link is invalid.", webBase);
    }
    if (row.used_at) {
      // Already used — treat as success (idempotent; link clicked twice).
      return page(true, "Your email is already verified. You're all set!", webBase);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return page(false, "This verification link has expired. Request a new one from the app.", webBase);
    }

    // Mark verified + consume the token.
    await supabase
      .from("profiles")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", row.user_id);
    await supabase
      .from("email_verification_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    return page(true, "Your email is verified. Full Grapple is now unlocked.", webBase);
  } catch (err) {
    console.error("verify-email error:", err);
    return page(false, "Something went wrong verifying your email.", webBase);
  }
});
