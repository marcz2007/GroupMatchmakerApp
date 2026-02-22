import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Button } from "./Button";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { colors, spacing, borderRadius, typography } from "../theme";

interface UpgradeModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ visible, onDismiss }) => {
  const { refreshProfile } = useAuth();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);

  const handleSignupWithEmail = () => {
    onDismiss();
    navigation.navigate("Signup");
  };

  const handleGoogleUpgrade = async () => {
    setLoading(true);
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

        // Link Google identity to the anonymous user
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: idToken,
        });

        if (error) {
          if (error.message.includes("already")) {
            Alert.alert(
              "Email Already Registered",
              "This Google account is already linked to an existing account. Please sign in instead."
            );
          } else {
            Alert.alert("Error", error.message);
          }
          return;
        }

        // Mark as non-guest
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({ is_guest: false })
            .eq("id", user.id);
        }

        await refreshProfile();
        onDismiss();
      }
    } catch (error: any) {
      if (error?.code !== "SIGN_IN_CANCELLED") {
        Alert.alert("Error", error.message || "Google sign-in failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  // TODO: Uncomment when Apple Developer account is available
  // const handleAppleUpgrade = async () => {
  //   setLoading(true);
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
  //       if (error.message.includes("already")) {
  //         Alert.alert(
  //           "Email Already Registered",
  //           "This Apple account is already linked to an existing account. Please sign in instead."
  //         );
  //       } else {
  //         Alert.alert("Error", error.message);
  //       }
  //       return;
  //     }
  //     // Mark as non-guest
  //     const { data: { user } } = await supabase.auth.getUser();
  //     if (user) {
  //       await supabase
  //         .from("profiles")
  //         .update({ is_guest: false })
  //         .eq("id", user.id);
  //     }
  //     await refreshProfile();
  //     onDismiss();
  //   } catch (error: any) {
  //     if (error?.code !== "ERR_CANCELED") {
  //       Alert.alert("Error", error.message || "Apple sign-in failed.");
  //     }
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Create an Account</Text>
          <Text style={styles.description}>
            Unlock groups, proposals, and more by creating a full account.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
          ) : (
            <>
              <Button
                variant="primary"
                onPress={handleSignupWithEmail}
                fullWidth
              >
                Sign up with Email
              </Button>

              <Button
                variant="secondary"
                onPress={handleGoogleUpgrade}
                fullWidth
              >
                Continue with Google
              </Button>

              {/* TODO: Uncomment when Apple Developer account is available */}
              {/* {Platform.OS === "ios" && (
                <Button
                  variant="secondary"
                  onPress={handleAppleUpgrade}
                  fullWidth
                >
                  Continue with Apple
                </Button>
              )} */}

              <Button
                variant="ghost"
                onPress={onDismiss}
              >
                Not now
              </Button>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    width: "90%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  loader: {
    marginVertical: spacing.xl,
  },
});
