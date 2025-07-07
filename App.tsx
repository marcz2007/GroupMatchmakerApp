// App.tsx
import { LinkingOptions, NavigationContainer } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";

// Export the navigation prop type for reuse in components
export type RootStackNavigationProp<T extends keyof RootStackParamList> =
  StackNavigationProp<RootStackParamList, T>;

type RootStackParamList = {
  Chat: { groupId: string };
  Profile: { code?: string; state?: string; error?: string };
};

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    "groupmatchmakerapp://",
    "https://nqtycfrgzjiehatokmfn.supabase.co",
  ],
  config: {
    screens: {
      // When a link like groupmatchmakerapp://group/invite/123 is opened,
      // navigate to the Chat screen with groupId: '123'.
      Chat: {
        path: "group/invite/:groupId",
        parse: {
          groupId: (groupId: string) => groupId,
        },
      },
      // Add Spotify callback handler
      Profile: {
        path: "functions/v1/spotify-callback",
        parse: {
          code: (code: string) => code,
          state: (state: string) => state,
          error: (error: string) => error,
        },
      },
    },
  },
  // Optional: A function to get the initial URL if it's not handled automatically
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url != null) {
      return url;
    }
    return undefined;
  },
  // Optional: Subscribe to incoming links
  subscribe(listener) {
    const onReceiveURL = ({ url }: { url: string }) => {
      console.log("Received URL:", url);
      listener(url);
    };
    const subscription = Linking.addEventListener("url", onReceiveURL);
    return () => {
      subscription.remove();
    };
  },
};

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardProvider>
      <NavigationContainer
        linking={linking}
        fallback={<ActivityIndicator color="blue" size="large" />}
      >
        <View style={styles.container}>
          <AppNavigator isAuthenticated={!!user} />
        </View>
      </NavigationContainer>
    </KeyboardProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc", // Modern light gray/white
  },
});
