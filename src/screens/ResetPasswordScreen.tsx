// screens/ResetPasswordScreen.tsx
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from "react-native";
import { RootStackNavigationProp } from "../../App";
import { Button } from "../components/Button";
import { supabase } from "../supabase";

const ResetPasswordScreen = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<RootStackNavigationProp<"Login">>();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("[RESET] Auth event:", event);
        if (event === "PASSWORD_RECOVERY") {
          // User arrived via password reset link - they can now set a new password
          Alert.alert(
            "Reset Your Password",
            "Enter your new password below."
          );
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleResetPassword = async () => {
    if (!newPassword) {
      Alert.alert("Error", "Please enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      console.log("[RESET] Update result:", { data, error });

      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert(
          "Password Updated!",
          "Your password has been reset. You can now login.",
          [
            {
              text: "Go to Login",
              onPress: () => navigation.navigate("Login"),
            },
          ]
        );
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set New Password</Text>

      <Text style={styles.subtitle}>
        Enter your new password below
      </Text>

      <TextInput
        style={styles.input}
        placeholder="New Password (min 6 characters)"
        placeholderTextColor="#b0b0b0"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoComplete="new-password"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm New Password"
        placeholderTextColor="#b0b0b0"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        editable={!loading}
      />

      <Button
        variant="primary"
        onPress={handleResetPassword}
        fullWidth
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : "Set New Password"}
      </Button>

      <Button
        variant="link"
        onPress={() => navigation.navigate("Login")}
        disabled={loading}
      >
        Back to Login
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
    marginBottom: 10,
    textAlign: "center",
    color: "#ffffff",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 20,
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
});

export default ResetPasswordScreen;
