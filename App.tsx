// App.tsx
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack'; // Import StackNavigationProp
import { Session } from '@supabase/supabase-js'; // Import Session type
import { View, Text } from 'react-native';
import SignupScreen from "./src/screens/SignupScreen";
import {supabase} from "./src/supabase";
import LoginScreen from "./src/screens/LoginScreen";
import MainScreen from "./src/screens/MainScreen";
import GroupsScreen from "./src/screens/GroupsScreen"; // Keep for potential loading state

// --- Define the ParamList ---
// List all screens in your app that this stack navigator will handle
export type RootStackParamList = {
    Login: undefined; // undefined means no parameters expected for Login route
    Signup: undefined;
    Main: undefined;
    Groups: undefined;
    Matching: { currentGroupId: string; currentGroupName: string };
    Chat: { groupId: string; groupName: string };
    // Add other screens here later, e.g.:
    // Groups: undefined;
    // Chat: { groupId: string; groupName: string };
};

// --- Create the Stack Navigator WITH the ParamList ---
const Stack = createStackNavigator<RootStackParamList>();

// Optional: Define a type for the navigation prop for easier use in screens
export type RootStackNavigationProp<T extends keyof RootStackParamList> = StackNavigationProp<RootStackParamList, T>;


export default function App() {
    // Use Session | null for Supabase v2
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true); // Add loading state

    useEffect(() => {
        setLoading(true);
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        }).catch(error => {
            console.error("Error getting session:", error);
            setLoading(false); // Ensure loading stops even on error
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            // No need to setLoading(false) here again unless the initial getSession failed
        });

        // Cleanup listener on component unmount
        return () => {
            authListener?.subscription.unsubscribe();
        };
    }, []);

    if (loading) {
        // Optional: Show a loading indicator while checking auth state
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>Loading...</Text>
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator>
                {!session ? (
                    // User is not signed in
                    <>
                        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
                        <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: false }}/>
                    </>
                ) : (
                    // User is signed in
                    <>
                        <Stack.Screen name="Main" component={MainScreen} options={{ headerShown: false }}/>
                        <Stack.Screen name="Groups" component={GroupsScreen} options={{ headerShown: false }}/>
                        {/* Add other authenticated screens here */}
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}