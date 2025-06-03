// App.tsx
import { LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Session } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppNavigator, { RootStackParamList } from './src/navigation/AppNavigator';
import { supabase } from "./src/supabase";

// Export the navigation prop type for reuse in components
export type RootStackNavigationProp<T extends keyof RootStackParamList> = StackNavigationProp<RootStackParamList, T>;

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['groupmatchmakerapp://'],
  config: {
    screens: {
      // When a link like groupmatchmakerapp://group/invite/123 is opened,
      // navigate to the Chat screen with groupId: '123'.
      // We will handle the actual "joining" logic within the ChatScreen or a subsequent screen.
      Chat: {
        path: 'group/invite/:groupId',
        parse: {
          groupId: (groupId: string) => groupId,
        },
        // If you need to serialize params back into a path (less common for invites):
        // serialize: {
        //   groupId: (groupId: string) => groupId,
        // },
      },
      // You can add other screens here for deep linking if needed
      // Example: navigating to a specific user profile or another part of your app
      // Profile: 'user/:userId',
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
    const onReceiveURL = ({ url }: { url: string }) => listener(url);
    const subscription = Linking.addEventListener('url', onReceiveURL);
    return () => {
      subscription.remove();
    };
  },
};

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            setSession(currentSession);
            setLoading(false);
        }).catch(error => {
            console.error("Error getting session:", error);
            setLoading(false);
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
        });

        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, []);

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <KeyboardProvider>
            <NavigationContainer linking={linking} fallback={<ActivityIndicator color="blue" size="large" />}>
                <View style={styles.container}>
                    <AppNavigator isAuthenticated={!!session} />
                </View>
            </NavigationContainer>
        </KeyboardProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc', // Modern light gray/white
    },
});