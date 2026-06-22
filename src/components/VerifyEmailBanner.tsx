import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@grapple/shared";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing, borderRadius, typography } from "../theme";

/**
 * Shown to signed-in users whose email isn't verified yet. Unverified accounts
 * are event-attendee only; verifying unlocks groups, event creation, and
 * messaging. The "Resend" button re-issues the verification link.
 */
const VerifyEmailBanner = () => {
  const { user, profile, isEmailVerified } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Only once we have a loaded profile that is explicitly unverified.
  if (!user || !profile || isEmailVerified) return null;

  const resend = async () => {
    setSending(true);
    try {
      await supabase.functions.invoke("resend-verification", { body: {} });
      setSent(true);
    } catch {
      // Endpoint is intentionally generic — nothing actionable to show.
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.banner}>
      <Ionicons name="mail-unread-outline" size={20} color={colors.warning} />
      <Text style={styles.text}>
        Verify your email to unlock groups, events &amp; messaging.
      </Text>
      <TouchableOpacity onPress={resend} disabled={sending || sent} hitSlop={8}>
        <Text style={styles.action}>
          {sent ? "Sent ✓" : sending ? "Sending…" : "Resend"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  text: {
    ...typography.caption,
    color: colors.text.secondary,
    flex: 1,
  },
  action: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "700",
  },
});

export default VerifyEmailBanner;
