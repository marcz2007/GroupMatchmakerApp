// Shared transactional-email helper. Mirrors the Resend usage in
// send-pending-notifications/index.ts so there's a single place that knows how
// to talk to Resend.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send the "verify your email" message. Best-effort: returns false (and logs)
 * rather than throwing, so a mail hiccup never blocks an RSVP.
 */
export async function sendVerificationEmail(
  toEmail: string,
  firstName: string,
  verifyLink: string,
): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress =
    Deno.env.get("RESEND_FROM_ADDRESS") || "Grapple <notify@grapple.app>";

  if (!resendKey) {
    console.warn("RESEND_API_KEY not set — skipping verification email");
    return false;
  }

  const name = escapeHtml(firstName || "there");
  const link = escapeHtml(verifyLink);
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h1 style="font-size:22px;margin:0 0 12px">You're in, ${name}!</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
      Your RSVP is confirmed. Verify your email to unlock the full Grapple
      experience — creating groups and events, messaging, and more.
    </p>
    <p style="margin:0 0 24px">
      <a href="${link}" style="display:inline-block;background:#5762b7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:600">Verify my email</a>
    </p>
    <p style="font-size:12px;color:#666;line-height:1.5;margin:0">
      If the button doesn't work, paste this link into your browser:<br>${link}
    </p>
  </div>`;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: toEmail,
        subject: "Verify your email for Grapple",
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend verification email failed:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend verification email threw:", err);
    return false;
  }
}
