import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Reads notifications with email_sent_at IS NULL and sends them via
// Resend. Safe to call on a cron (e.g. every minute) or on demand.
// Gracefully no-ops when RESEND_API_KEY is not configured.
//
// Request body (optional): { limit?: number }
// Response: { sent: number, skipped: number }

interface NotificationRow {
  id: string;
  user_id: string;
  event_room_id: string | null;
  type: string;
  title: string | null;
  message: string;
  created_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress =
      Deno.env.get("RESEND_FROM_ADDRESS") || "Grapple <notify@grapple.app>";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit) || 50, 200);

    // Fetch pending notifications
    const { data: pending, error: pendingError } = await supabase
      .from("notifications")
      .select("id, user_id, event_room_id, type, title, message, created_at")
      .is("email_sent_at", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (pendingError) {
      console.error("[send-pending-notifications] fetch failed:", pendingError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch notifications" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, skipped: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gracefully no-op if Resend isn't configured. Still mark as "sent"
    // so we don't pile up; real email delivery can be enabled later.
    if (!resendKey) {
      console.log(
        `[send-pending-notifications] RESEND_API_KEY not set; marking ${pending.length} as sent without delivery`
      );
      const ids = pending.map((n: NotificationRow) => n.id);
      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .in("id", ids);
      return new Response(
        JSON.stringify({ sent: 0, skipped: pending.length, reason: "resend_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Batch-fetch recipient profiles for emails
    const userIds = Array.from(
      new Set(pending.map((n: NotificationRow) => n.user_id))
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, display_name, is_guest")
      .in("id", userIds);

    const emailByUser = new Map<string, { email: string; name: string }>();
    for (const profile of profiles || []) {
      if (profile.email) {
        emailByUser.set(profile.id, {
          email: profile.email,
          name: profile.display_name || "there",
        });
      }
    }

    let sent = 0;
    let skipped = 0;
    const deliveredIds: string[] = [];

    for (const notification of pending as NotificationRow[]) {
      const recipient = emailByUser.get(notification.user_id);
      if (!recipient) {
        skipped++;
        continue;
      }

      const subject = notification.title || "Grapple update";
      const html = `
        <div style="font-family: -apple-system, sans-serif; padding: 24px; color: #111;">
          <h2 style="margin: 0 0 12px;">${escapeHtml(notification.title || "Grapple")}</h2>
          <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5;">
            Hi ${escapeHtml(recipient.name)},<br><br>
            ${escapeHtml(notification.message)}
          </p>
          ${
            notification.event_room_id
              ? `<p style="margin: 24px 0 0;">
                  <a href="https://group-matchmaker-app.vercel.app/event/${notification.event_room_id}"
                     style="display: inline-block; padding: 10px 18px; background: #5762b7; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                    View event
                  </a>
                </p>`
              : ""
          }
        </div>
      `;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: recipient.email,
          subject,
          html,
        }),
      });

      if (response.ok) {
        sent++;
        deliveredIds.push(notification.id);
      } else {
        const err = await response.text().catch(() => "");
        console.error(
          `[send-pending-notifications] Resend failed for ${notification.id}: ${err}`
        );
        skipped++;
      }
    }

    if (deliveredIds.length > 0) {
      await supabase
        .from("notifications")
        .update({ email_sent_at: new Date().toISOString() })
        .in("id", deliveredIds);
    }

    return new Response(
      JSON.stringify({ sent, skipped }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-pending-notifications] error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
