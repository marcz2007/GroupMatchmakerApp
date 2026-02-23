// App.tsx
import { LinkingOptions, NavigationContainer, useNavigationContainerRef, CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React, { useEffect, useRef } from "react";
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
      // Event invite deep link — lands on RSVP screen
      EventDetail: {
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

/** Extract an eventRoomId from a URL path like /event/<uuid> */
function extractEventId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // Handle both full URLs and bare paths
    const path = url.includes("://") ? new URL(url).pathname : url;
    const match = path.match(/\/event\/([^/?#]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function AppContent() {
  const { user, loading } = useAuth();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  // Synchronously detect event invite URL on web so the very first render
  // can show GuestEntry instead of Login (refs set in useEffect would be too late).
  const pendingEventRef = useRef<string | null>(
    Platform.OS === "web" && typeof window !== "undefined"
      ? extractEventId(window.location.pathname)
      : null
  );

  // For native: check Linking.getInitialURL asynchronously
  useEffect(() => {
    if (Platform.OS === "web") return; // already handled synchronously above
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      const eventId = extractEventId(initialUrl);
      if (eventId) {
        pendingEventRef.current = eventId;
      }
    })();
  }, []);

  // After auth, navigate to the pending event
  useEffect(() => {
    if (!user || !pendingEventRef.current) return;
    const eventRoomId = pendingEventRef.current;
    pendingEventRef.current = null; // consume it once

    // Wait until the navigator is ready, then set the stack to [Main, EventRoom]
    // so the guest can press back to reach the full app with bottom tabs.
    const tryNavigate = () => {
      if (navigationRef.isReady()) {
        navigationRef.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: "Main" },
              { name: "EventDetail", params: { eventRoomId } },
            ],
          })
        );
      } else {
        setTimeout(tryNavigate, 100);
      }
    };
    setTimeout(tryNavigate, 50);
  }, [user, navigationRef]);

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
            ref={navigationRef}
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
            <View style={styles.container}>
                <AppNavigator isAuthenticated={!!user} hasPendingEvent={!!pendingEventRef.current} />
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
});
