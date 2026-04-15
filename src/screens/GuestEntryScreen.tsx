import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { RootStackNavigationProp } from "../../App";
import { Button } from "../components/Button";
import { supabase } from "@grapple/shared";

// Extract an event_room_id from a deep-link URL the OS handed us on
// launch. Matches the logic in App.tsx so we can pass an accurate
// returnPath to the OAuth callback (which uses it to record a
// scheduling_calendar_syncs row for this event).
async function getPendingEventId(): Promise<string | null> {
  try {
    let url: string | null = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      url = window.location.pathname;
    } else {
      url = await Linking.getInitialURL();
    }
    if (!url) return null;
    const path = url.includes("://") ? new URL(url).pathname : url;
    const match = path.match(/\/event\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const GuestEntryScreen = () => {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [syncCalendar, setSyncCalendar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigation = useNavigation<RootStackNavigationProp<"GuestEntry">>();

  // Kick off the Google Calendar OAuth flow for a freshly-created guest.
  // We can't use the `useCalendar` hook here because that reads
  // `useAuth().user`, which isn't populated until AuthContext picks up
  // the new session — too slow for us. Call the edge function directly
  // with the known userId instead.
  const startCalendarSync = async (
    userId: string,
    pendingEventId: string | null
  ) => {
    try {
      const returnPath = pendingEventId ? `/event/${pendingEventId}` : "";
      const { data, error } = await supabase.functions.invoke(
        "google-calendar-auth",
        {
          body: {
            userId,
            platform: Platform.OS,
            returnPath,
          },
        }
      );

      if (error || !data?.authUrl) {
        console.error("[GuestEntry] Failed to start calendar OAuth:", error);
        // Non-fatal — the user is still RSVP'd. They can connect later.
        return;
      }

      const supported = await Linking.canOpenURL(data.authUrl);
      if (supported) {
        await Linking.openURL(data.authUrl);
      } else {
        console.warn("[GuestEntry] Cannot open Google OAuth URL");
      }
    } catch (err) {
      console.error("[GuestEntry] Unexpected calendar sync error:", err);
    }
  };

  const handleGoogleSignIn = async () => {
    setOauthLoading(true);
    try {
      if (Platform.OS === "web") {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) Alert.alert("Error", error.message);
      } else {
        const { GoogleSignin } = require("@react-native-google-signin/google-signin");
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;

        if (!idToken) {
          Alert.alert("Error", "Failed to get Google ID token.");
          return;
        }

        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });

        if (error) {
          Alert.alert("Google Sign-In Error", error.message);
        }
      }
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "SIGN_IN_CANCELLED") {
        Alert.alert("Error", err?.message || "Google sign-in failed.");
      }
    } finally {
      setOauthLoading(false);
    }
  };

  const handleGuestJoin = async () => {
    const cleanName = firstName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      Alert.alert("Error", "Please enter your first name.");
      return;
    }
    if (!cleanEmail) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }

    setLoading(true);

    try {
      // Check if an account with this email already exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, is_guest")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (existingProfile) {
        Alert.alert(
          "Account Exists",
          "An account with this email already exists. Please sign in instead."
        );
        setLoading(false);
        return;
      }

      // Sign in anonymously — creates a real auth.uid() in Supabase
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) {
        Alert.alert("Error", error.message);
        return;
      }

      if (!data?.user) {
        Alert.alert("Error", "Failed to create guest session.");
        return;
      }

      // Update the profile with guest info
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: cleanName,
          email: cleanEmail,
          is_guest: true,
        })
        .eq("id", data.user.id);

      if (profileError) {
        console.error("[GuestEntry] Error updating profile:", profileError);
        // Don't block — the user is still authenticated
      }

      // If the user left the "Sync my Google Calendar" toggle on (default),
      // fire off the OAuth flow now. It opens the system browser — on
      // return the user lands back on the app via the deep link and
      // AuthContext has already transitioned the navigator, so they
      // arrive on EventDetail (if they came from a share link) or Main.
      if (syncCalendar) {
        const pendingEventId = await getPendingEventId();
        await startCalendarSync(data.user.id, pendingEventId);
      }

      // Navigation auto-transitions to AppStack via AuthContext
    } catch (error: unknown) {
      Alert.alert("Error", error instanceof Error ? error.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Join this event</Text>
      <Text style={styles.subtitle}>
        Enter your name and email to get started
      </Text>

      <TextInput
        style={styles.input}
        placeholder="First name"
        placeholderTextColor="#b0b0b0"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoCorrect={false}
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#b0b0b0"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!loading}
      />

      <Pressable
        style={styles.toggleRow}
        onPress={() => !loading && setSyncCalendar((v) => !v)}
        disabled={loading}
      >
        <View style={styles.toggleTextWrap}>
          <Text style={styles.toggleTitle}>Sync my Google Calendar</Text>
          <Text style={styles.toggleSubtitle}>
            Grapple uses your free/busy times to pick the best moment. We
            never read event titles or details.
          </Text>
        </View>
        <Switch
          value={syncCalendar}
          onValueChange={setSyncCalendar}
          disabled={loading}
          trackColor={{ false: "#4a4a4a", true: "#7c3aed" }}
          thumbColor="#ffffff"
        />
      </Pressable>

      <Button
        variant="primary"
        onPress={handleGuestJoin}
        fullWidth
        disabled={loading || oauthLoading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : syncCalendar ? (
          "Continue & connect calendar"
        ) : (
          "Continue"
        )}
      </Button>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Button
        variant="secondary"
        onPress={handleGoogleSignIn}
        fullWidth
        disabled={loading || oauthLoading}
      >
        {oauthLoading ? <ActivityIndicator color="#fff" size="small" /> : "Continue with Google"}
      </Button>

      <Button
        variant="link"
        onPress={() => navigation.navigate("Login")}
        disabled={loading || oauthLoading}
      >
        Already have an account? Sign in
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 8,
    textAlign: "center",
    color: "#ffffff",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
    color: "#b0b0b0",
  },
  input: {
    height: 45,
    borderColor: "#404040",
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: "#3a3a3a",
    color: "#ffffff",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 15,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#404040",
  },
  dividerText: {
    color: "#b0b0b0",
    paddingHorizontal: 10,
    fontSize: 13,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 15,
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  toggleSubtitle: {
    color: "#a0a0a0",
    fontSize: 12,
    lineHeight: 16,
  },
});

export default GuestEntryScreen;
