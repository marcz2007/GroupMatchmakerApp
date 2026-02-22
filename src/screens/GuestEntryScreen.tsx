import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { RootStackNavigationProp } from "../../App";
import { Button } from "../components/Button";
import { supabase } from "../supabase";

const GuestEntryScreen = () => {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigation = useNavigation<RootStackNavigationProp<"GuestEntry">>();

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
    } catch (error: any) {
      if (error?.code !== "SIGN_IN_CANCELLED") {
        Alert.alert("Error", error.message || "Google sign-in failed.");
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

      // Navigation auto-transitions to AppStack via AuthContext
    } catch (error: any) {
      Alert.alert("Error", error.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
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

      <Button
        variant="primary"
        onPress={handleGuestJoin}
        fullWidth
        disabled={loading || oauthLoading}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : "Continue"}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#1a1a1a",
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
});

export default GuestEntryScreen;
