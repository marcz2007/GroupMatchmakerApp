// screens/LoginScreen.tsx
import { useNavigation } from "@react-navigation/native";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { RootStackNavigationProp } from "../../App";
import { Button } from "../components/Button";
import { supabase } from "../supabase"; // Adjust path if needed
// --- Import the ParamList and NavigationProp type ---

const LoginScreen = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // --- Type the navigation hook ---
  // Use the specific screen name 'Login' if you need route params, or just RootStackParamList for general navigation
  const navigation = useNavigation<RootStackNavigationProp<"Login">>();
  // OR more general: const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const handleLogin = async () => {
    // Consider adding loading state here too
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(), // Trim whitespace
        password: password,
      });

      if (error) {
        Alert.alert("Login Error", error.message);
      } else {
        // navigation.navigate('Main'); // This should now work without error!
        // Supabase listener in App.tsx will handle the screen switch automatically
        // No need to explicitly navigate here if using the App.tsx structure above
        console.log("Login successful, App.tsx will handle navigation.");
      }
    } catch (error: any) {
      // Catch unexpected errors
      Alert.alert(
        "Login Failed",
        error.message || "An unexpected error occurred."
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#b0b0b0"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none" // Good practice for emails
        autoComplete="email"
      />
      <View>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#b0b0b0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword} // Toggle visibility based on state
          autoComplete="password"
        />
        <Button
          variant="ghost"
          onPress={() => setShowPassword(!showPassword)}
          size="sm"
        >
          {showPassword ? "Hide password" : "Show password"}
        </Button>
      </View>
      <Button variant="primary" onPress={handleLogin} fullWidth>
        Login
      </Button>
      <Button variant="link" onPress={() => navigation.navigate("Signup")}>
        Go to Signup
      </Button>
    </View>
  );
};

// Styles updated for dark theme
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#1a1a1a", // Anthracite grey background
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: "center",
    color: "#ffffff", // White text
    fontWeight: "bold",
  },
  input: {
    height: 45, // Slightly taller often looks better
    borderColor: "#404040", // Dark grey border
    borderWidth: 1,
    marginBottom: 15, // More spacing
    paddingHorizontal: 10,
    borderRadius: 5, // Rounded corners
    backgroundColor: "#3a3a3a", // Dark surface background
    color: "#ffffff", // White text
  },
});

export default LoginScreen;
