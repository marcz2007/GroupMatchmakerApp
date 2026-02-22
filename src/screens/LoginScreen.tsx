// screens/LoginScreen.tsx
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

// Set to true to see debug alerts
const DEBUG_AUTH = false;

const LoginScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const navigation = useNavigation<RootStackNavigationProp<"Login">>();

  const debugAlert = (title: string, data: any) => {
    if (DEBUG_AUTH) {
      Alert.alert(title, JSON.stringify(data, null, 2));
    }
    console.log(`[AUTH DEBUG] ${title}:`, data);
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    if (!cleanEmail) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }
    if (!cleanPassword) {
      Alert.alert("Error", "Please enter your password.");
      return;
    }

    setLoading(true);

    debugAlert("Login attempt", {
      email: cleanEmail,
      passwordLength: cleanPassword.length,
    });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      debugAlert("Login response", {
        hasSession: !!data?.session,
        hasUser: !!data?.user,
        userId: data?.user?.id?.slice(0, 8),
        errorMessage: error?.message,
        errorStatus: error?.status,
        errorCode: (error as any)?.code,
      });

      if (error) {
        const errorCode = (error as any).code || "";
        const isInvalidCredentials =
          errorCode === "invalid_credentials" ||
          error.message.toLowerCase().includes("invalid") ||
          error.status === 400;

        if (isInvalidCredentials) {
          Alert.alert(
            "Incorrect Email or Password",
            "The password is wrong, or this email isn't registered.\n\nTry resetting your password.",
            [
              { text: "Try Again", style: "cancel" },
              {
                text: "Reset Password",
                onPress: () => handleForgotPassword(),
                style: "destructive",
              },
            ]
          );
        } else {
          Alert.alert("Login Error", error.message);
        }
      } else if (data?.session) {
        Alert.alert("Success", "Logged in!");
      }
    } catch (error: any) {
      debugAlert("Unexpected error", { message: error.message });
      Alert.alert("Login Failed", error.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setOauthLoading(true);
    try {
      if (Platform.OS === "web") {
        // Web: Use Supabase OAuth redirect (redirects to Google, then back)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) Alert.alert("Error", error.message);
      } else {
        // Native: Use native Google Sign-In module
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

  // TODO: Uncomment when Apple Developer account is available
  // const handleAppleSignIn = async () => {
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
  //       Alert.alert("Apple Sign-In Error", error.message);
  //     }
  //   } catch (error: any) {
  //     if (error?.code !== "ERR_CANCELED") {
  //       Alert.alert("Error", error.message || "Apple sign-in failed.");
  //     }
  //   } finally {
  //     setOauthLoading(false);
  //   }
  // };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert(
        "Enter Email First",
        "Type your email address in the field above, then tap 'Forgot Password'."
      );
      return;
    }

    setResetLoading(true);

    debugAlert("Password reset request", { email: cleanEmail });

    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: "https://group-matchmaker-app.vercel.app",
      });

      debugAlert("Reset response", {
        data,
        errorMessage: error?.message,
        errorStatus: error?.status,
      });

      if (error) {
        Alert.alert("Reset Error", error.message);
      } else {
        Alert.alert(
          "Password Reset Email Sent",
          `Check your inbox for ${cleanEmail}.\n\nAlso check spam/junk folder.\n\nThe email comes from Supabase.`,
          [{ text: "OK" }]
        );
      }
    } catch (error: any) {
      debugAlert("Reset error", { message: error.message });
      Alert.alert("Error", error.message || "Failed to send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  const isDisabled = loading || oauthLoading;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>

      {/* OAuth Buttons */}
      <Button
        variant="primary"
        onPress={handleGoogleSignIn}
        fullWidth
        disabled={isDisabled}
      >
        {oauthLoading ? <ActivityIndicator color="#fff" size="small" /> : "Continue with Google"}
      </Button>

      {/* TODO: Uncomment when Apple Developer account is available */}
      {/* {Platform.OS === "ios" && (
        <Button
          variant="secondary"
          onPress={handleAppleSignIn}
          fullWidth
          disabled={isDisabled}
        >
          Continue with Apple
        </Button>
      )} */}

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or sign in with email</Text>
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

      <View>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#b0b0b0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="password"
          editable={!isDisabled}
        />
        <Button
          variant="ghost"
          onPress={() => setShowPassword(!showPassword)}
          size="sm"
          disabled={isDisabled}
        >
          {showPassword ? "Hide" : "Show"}
        </Button>
      </View>

      <Button
        variant="secondary"
        onPress={handleLogin}
        fullWidth
        disabled={isDisabled}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : "Login"}
      </Button>

      <Button
        variant="secondary"
        onPress={handleForgotPassword}
        disabled={isDisabled || resetLoading}
        fullWidth
      >
        {resetLoading ? "Sending Reset Email..." : "Forgot Password? Reset it"}
      </Button>

      <Button
        variant="link"
        onPress={() => navigation.navigate("Signup")}
        disabled={isDisabled}
      >
        Don't have an account? Sign up
      </Button>

      <Button
        variant="link"
        onPress={() => navigation.navigate("GuestEntry")}
        disabled={isDisabled}
      >
        Join as Guest
      </Button>

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
  debugHint: {
    marginTop: 20,
    fontSize: 10,
    color: "#ff9900",
    textAlign: "center",
  },
});

export default LoginScreen;
