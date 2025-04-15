// App.tsx
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { Session } from '@supabase/supabase-js';
import { View, Text, ActivityIndicator } from 'react-native'; // Added ActivityIndicator
import SignupScreen from "./src/screens/SignupScreen";
import { supabase } from "./src/supabase"; // Correct path?
import LoginScreen from "./src/screens/LoginScreen";
import MainScreen from "./src/screens/MainScreen";
// --- Import the new screens ---
import MatchingScreen from "./src/screens/MatchingScreen";
import ChatScreen from "./src/screens/ChatScreen";

// --- Update the ParamList ---
export type RootStackParamList = {
    Login: undefined;
    Signup: undefined;
    Main: undefined; // Main might contain GroupsScreen, or GroupsScreen could be separate
    Matching: { currentGroupId: string; currentGroupName: string }; // Params for Matching
    Chat: { groupId: string; groupName: string }; // Params for Chat
    // Add Groups route if it's navigated to directly
    // Groups: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export type RootStackNavigationProp<T extends keyof RootStackParamList> = StackNavigationProp<RootStackParamList, T>;

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        }).catch(error => {
            console.error("Error getting session:", error);
            setLoading(false);
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
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
        <NavigationContainer>
            {/* Keep headerShown set globally or per screen */}
            <Stack.Navigator screenOptions={{ headerShown: true }}>
                {!session ? (
                    // Auth screens (no header typically)
                    <>
                        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                        <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }}/>
                    </>
                ) : (
                    // Authenticated screens (header shown by default unless overridden)
                    <>
                        <Stack.Screen name="Main" component={MainScreen} options={{ title: 'Your Groups' }} />
                        {/* Add the new screens to the authenticated stack */}
                        <Stack.Screen name="Matching" component={MatchingScreen} options={({ route }) => ({ title: `Match: ${route.params.currentGroupName}` })}/>
                        <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.groupName })}/>
                        {/* If GroupsScreen is separate, add it here too */}
                        {/* <Stack.Screen name="Groups" component={GroupsScreen} /> */}
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}