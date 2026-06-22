// Issue an email-verification token and send the link. Shared by web-rsvp
// (initial RSVP) and resend-verification (the "resend" button / unverified
// re-RSVP path).
import { sendVerificationEmail } from "./email.ts";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Creates a fresh token row and emails the verification link. Best-effort:
 * never throws — logs and returns false on failure so callers can proceed.
 * `supabase` must be a service-role client.
 */
export async function issueAndSendVerification(
  supabase: any,
  userId: string,
  email: string,
  firstName: string,
): Promise<boolean> {
  try {
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error } = await supabase
      .from("email_verification_tokens")
      .insert({ user_id: userId, token, expires_at: expiresAt });
    if (error) {
      console.error("Failed to insert verification token:", error);
      return false;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const verifyLink = `${supabaseUrl}/functions/v1/verify-email?token=${token}`;
    return await sendVerificationEmail(email, firstName, verifyLink);
  } catch (err) {
    console.error("issueAndSendVerification threw:", err);
    return false;
  }
}
