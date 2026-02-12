import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from "react-native";
import { Button } from "../components/Button";
import { supabase } from "../supabase";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing } from "../theme";

const CalendarLinkScreen = () => {
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<"google" | "apple" | null>(null);

  const handleGoogleCalendarConnect = async () => {
    if (!user?.id) {
      Alert.alert("Error", "You must be logged in to connect your calendar.");
      return;
    }

    setLoading(true);
    setProvider("google");

    try {
      const { data, error } = await supabase.functions.invoke(
        "google-calendar-auth",
        {
          body: { userId: user.id },
        }
      );

      if (error) {
        console.error("Error getting auth URL:", error);
        Alert.alert("Error", "Failed to start calendar connection. Please try again.");
        return;
      }

      if (data?.authUrl) {
        // Open the OAuth URL in the browser
        const supported = await Linking.canOpenURL(data.authUrl);
        if (supported) {
          await Linking.openURL(data.authUrl);
          // After returning from browser, refresh profile to check connection
          setTimeout(() => {
            refreshProfile?.();
          }, 3000);
        } else {
          Alert.alert("Error", "Cannot open the authorization page.");
        }
      }
    } catch (error) {
      console.error("Error connecting calendar:", error);
      Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
      setProvider(null);
    }
  };

  const handleAppleCalendarInfo = () => {
    Alert.alert(
      "Apple Calendar",
      "Apple Calendar integration requires a subscription to a calendar sharing service like iCloud Calendar or a CalDAV server.\n\nFor now, we recommend using Google Calendar for the best experience.",
      [{ text: "OK" }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.calendarEmoji}>📅</Text>
        </View>

        <Text style={styles.title}>Connect Your Calendar</Text>

        <Text style={styles.description}>
          To help your groups find times when everyone is free, we need access
          to your calendar.
        </Text>

        <View style={styles.privacyBox}>
          <Text style={styles.privacyTitle}>🔒 Your Privacy is Protected</Text>
          <Text style={styles.privacyText}>
            We only see when you're busy or free. We never see your event
            titles, descriptions, or who you're meeting with.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleGoogleCalendarConnect}
            loading={loading && provider === "google"}
            disabled={loading}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Connect Google Calendar</Text>
            </View>
          </Button>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onPress={handleAppleCalendarInfo}
            disabled={loading}
            style={styles.appleButton}
          >
            Connect Apple Calendar
          </Button>
        </View>

        <Text style={styles.note}>
          You can disconnect your calendar at any time from your profile
          settings.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  calendarEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  description: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 24,
    paddingHorizontal: spacing.md,
  },
  privacyBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xl,
    width: "100%",
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.success,
    marginBottom: spacing.xs,
  },
  privacyText: {
    fontSize: 14,
    color: colors.text.tertiary,
    lineHeight: 20,
  },
  buttonContainer: {
    width: "100%",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  appleButton: {
    marginTop: spacing.sm,
  },
  note: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
    fontStyle: "italic",
  },
});

export default CalendarLinkScreen;
