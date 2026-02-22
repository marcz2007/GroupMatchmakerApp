// App.tsx
import { LinkingOptions, NavigationContainer } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from "react-native";

// KeyboardProvider is native-only — on web, render children directly
const KeyboardWrapper = Platform.OS === 'web'
  ? ({ children }: { children: React.ReactNode }) => <>{children}</>
  : require('react-native-keyboard-controller').KeyboardProvider;
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { EventsProvider } from "./src/contexts/EventsContext";
import { PendingProposalsProvider } from "./src/contexts/PendingProposalsContext";
import PendingProposalModal from "./src/components/PendingProposalModal";
import AppNavigator, {
  RootStackParamList,
} from "./src/navigation/AppNavigator";
import { colors } from "./src/theme";

// Configure Google Sign-In — safe to fail in Expo Go (native module not available)
try {
  const { GoogleSignin } = require("@react-native-google-signin/google-signin");
  GoogleSignin.configure({
    webClientId: "537397372254-aqjgrtgj2mbo1mdcit9g47kopsipkml7.apps.googleusercontent.com",
    iosClientId: "537397372254-2gruob2oguontpaojcm52uel30bnecb5.apps.googleusercontent.com",
  });
} catch (e) {
  console.log("[Auth] Google Sign-In not available (Expo Go). Will work in dev client build.");
}

// Export the navigation prop type for reuse in components
export type RootStackNavigationProp<T extends keyof RootStackParamList> =
  StackNavigationProp<RootStackParamList, T>;

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    "groupmatchmakerapp://",
    "https://nqtycfrgzjiehatokmfn.supabase.co",
    "https://group-matchmaker-app.vercel.app",
  ],
  config: {
    screens: {
      // Password reset deep link
      ResetPassword: {
        path: "reset-password",
      },
      // Group invite deep link - navigates to group details
      GroupDetails: {
        path: "group/invite/:groupId",
        parse: {
          groupId: (groupId: string) => groupId,
        },
      },
      // Event invite deep link — from shared web links
      EventRoom: {
        path: "event/:eventRoomId",
        parse: {
          eventRoomId: (eventRoomId: string) => eventRoomId,
        },
      },
      // Spotify callback handler
      PublicProfile: {
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <EventsProvider>
      <PendingProposalsProvider>
        <KeyboardWrapper>
          <NavigationContainer
            linking={linking}
            fallback={<ActivityIndicator color={colors.primary} size="large" />}
            theme={{
              dark: true,
              colors: {
                primary: colors.primary,
                background: colors.background,
                card: colors.surface,
                text: colors.text.primary,
                border: colors.divider,
                notification: colors.eventBadge,
              },
              fonts: {
                regular: {
                  fontFamily: "System",
                  fontWeight: "400" as const,
                },
                medium: {
                  fontFamily: "System",
                  fontWeight: "500" as const,
                },
                bold: {
                  fontFamily: "System",
                  fontWeight: "700" as const,
                },
                heavy: {
                  fontFamily: "System",
                  fontWeight: "900" as const,
                },
              },
            }}
          >
            <View style={styles.webRoot}>
              <View style={styles.appFrame}>
                <AppNavigator isAuthenticated={!!user} />
              </View>
            </View>
          </NavigationContainer>
        </KeyboardWrapper>
        <PendingProposalModal />
      </PendingProposalsProvider>
    </EventsProvider>
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
  webRoot: {
    flex: 1,
    backgroundColor: '#111111',
    alignItems: 'center',
  },
  appFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
    ...(Platform.OS === 'web' ? {
      maxWidth: 480,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.divider,
    } : {}),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
