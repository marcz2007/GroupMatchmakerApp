// screens/SignupScreen.tsx
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  // Platform, // Uncomment when enabling Apple auth
} from "react-native";
import { RootStackNavigationProp } from "../../App";
import { Button } from "../components/Button";
import { supabase } from "../supabase";

// Set to true to see debug alerts
const DEBUG_AUTH = false;

const SignupScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigation = useNavigation<RootStackNavigationProp<"Signup">>();

  const debugAlert = (title: string, data: any) => {
    if (DEBUG_AUTH) {
      Alert.alert(title, JSON.stringify(data, null, 2));
    }
    console.log(`[AUTH DEBUG] ${title}:`, data);
  };

  const handleGoogleSignUp = async () => {
    setOauthLoading(true);
    try {
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
        Alert.alert("Google Sign-Up Error", error.message);
      }
    } catch (error: any) {
      if (error?.code !== "SIGN_IN_CANCELLED") {
        Alert.alert("Error", error.message || "Google sign-up failed.");
      }
    } finally {
      setOauthLoading(false);
    }
  };

  // TODO: Uncomment when Apple Developer account is available
  // const handleAppleSignUp = async () => {
  //   setOauthLoading(true);
  //   try {
  //     const AppleAuthentication = require("expo-apple-authentication");
  //     const credential = await AppleAuthentication.signInAsync({
  //       requestedScopes: [
  //         AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
  //         AppleAuthentication.AppleAuthenticationScope.EMAIL,
  //       ],
  //     });
  //     if (!credential.identityToken) {
  //       Alert.alert("Error", "Failed to get Apple identity token.");
  //       return;
  //     }
  //     const { error } = await supabase.auth.signInWithIdToken({
  //       provider: "apple",
  //       token: credential.identityToken,
  //     });
  //     if (error) {
  //       Alert.alert("Apple Sign-Up Error", error.message);
  //     }
  //   } catch (error: any) {
  //     if (error?.code !== "ERR_CANCELED") {
  //       Alert.alert("Error", error.message || "Apple sign-up failed.");
  //     }
  //   } finally {
  //     setOauthLoading(false);
  //   }
  // };

  const handleSignup = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }
    if (!cleanPassword) {
      Alert.alert("Error", "Please enter a password.");
      return;
    }
    if (cleanPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (cleanPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setLoading(true);

    debugAlert("Signup attempt", {
      email: cleanEmail,
      passwordLength: cleanPassword.length,
    });

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
      });

      // Debug: show full response
      debugAlert("Signup response", {
        hasSession: !!data?.session,
        hasUser: !!data?.user,
        userId: data?.user?.id?.slice(0, 8),
        identitiesCount: data?.user?.identities?.length,
        confirmedAt: data?.user?.confirmed_at,
        errorMessage: error?.message,
        errorStatus: error?.status,
      });

      if (error) {
        Alert.alert("Signup Error", error.message);
        return;
      }

      // KEY CHECK: If identities is empty, the email already exists
      // Supabase returns this instead of an error to prevent email enumeration
      if (data?.user?.identities?.length === 0) {
        Alert.alert(
          "Email Already Registered",
          `An account with ${cleanEmail} already exists.\n\nPlease login or reset your password.`,
          [
            {
              text: "Go to Login",
              onPress: () => navigation.navigate("Login"),
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
        return;
      }

      // Check if we got a session (auto-confirmed) or need email confirmation
      if (data?.session) {
        Alert.alert("Welcome!", "Account created and logged in!");
      } else if (data?.user) {
        Alert.alert(
          "Check Your Email",
          `We sent a confirmation link to ${cleanEmail}.\n\nClick the link to activate your account, then come back and login.\n\nCheck spam/junk if you don't see it.`,
          [
            {
              text: "Go to Login",
              onPress: () => navigation.navigate("Login"),
            },
          ]
        );
      }
    } catch (error: any) {
      debugAlert("Unexpected error", { message: error.message });
      Alert.alert("Signup Error", error.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = loading || oauthLoading;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      {/* OAuth Buttons */}
      <Button
        variant="secondary"
        onPress={handleGoogleSignUp}
        fullWidth
        disabled={isDisabled}
      >
        {oauthLoading ? <ActivityIndicator color="#fff" size="small" /> : "Continue with Google"}
      </Button>

      {/* TODO: Uncomment when Apple Developer account is available */}
      {/* {Platform.OS === "ios" && (
        <Button
          variant="secondary"
          onPress={handleAppleSignUp}
          fullWidth
          disabled={isDisabled}
        >
          Continue with Apple
        </Button>
      )} */}

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or sign up with email</Text>
        <View style={styles.dividerLine} />
      </View>

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
        editable={!isDisabled}
      />

      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        placeholderTextColor="#b0b0b0"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        editable={!isDisabled}
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        placeholderTextColor="#b0b0b0"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        editable={!isDisabled}
      />

      <Button
        variant="primary"
        onPress={handleSignup}
        fullWidth
        disabled={isDisabled}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : "Sign Up"}
      </Button>

      <Button
        variant="link"
        onPress={() => navigation.navigate("Login")}
        disabled={isDisabled}
      >
        Already have an account? Login
      </Button>

      <Text style={styles.hint}>
        Tip: Use a Gmail alias like yourname+test1@gmail.com for testing
      </Text>

      {DEBUG_AUTH && (
        <Text style={styles.debugHint}>
          Debug mode ON - you'll see alert popups with API responses
        </Text>
      )}
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
    marginBottom: 20,
    textAlign: "center",
    color: "#ffffff",
    fontWeight: "bold",
  },
  input: {
    height: 45,
    borderColor: "#404040",
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 10,
    backgroundColor: "#3a3a3a",
    color: "#ffffff",
    borderRadius: 5,
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
  hint: {
    marginTop: 20,
    fontSize: 12,
    color: "#808080",
    textAlign: "center",
    fontStyle: "italic",
  },
  debugHint: {
    marginTop: 10,
    fontSize: 10,
    color: "#ff9900",
    textAlign: "center",
  },
});

export default SignupScreen;
