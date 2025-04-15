// screens/LoginScreen.tsx
import React, {useState} from 'react';
import {View, Text, TextInput, Button, StyleSheet, Alert} from 'react-native';
import {supabase} from '../supabase'; // Adjust path if needed
import {useNavigation} from '@react-navigation/native';
import {RootStackNavigationProp} from "../../App";
// --- Import the ParamList and NavigationProp type ---

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // --- Type the navigation hook ---
    // Use the specific screen name 'Login' if you need route params, or just RootStackParamList for general navigation
    const navigation = useNavigation<RootStackNavigationProp<'Login'>>();
    // OR more general: const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();


    const handleLogin = async () => {
        // Consider adding loading state here too
        try {
            const {data, error} = await supabase.auth.signInWithPassword({
                email: email.trim(), // Trim whitespace
                password: password,
            });

            if (error) {
                Alert.alert('Login Error', error.message);
            } else {
                // navigation.navigate('Main'); // This should now work without error!
                // Supabase listener in App.tsx will handle the screen switch automatically
                // No need to explicitly navigate here if using the App.tsx structure above
                console.log('Login successful, App.tsx will handle navigation.');
            }
        } catch (error: any) {
            // Catch unexpected errors
            Alert.alert('Login Failed', error.message || 'An unexpected error occurred.');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Login</Text>
            <TextInput
                style={styles.input}
                placeholder="Email"
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
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword} // Toggle visibility based on state
                    autoComplete="password"
                />
                <Button title={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword(!showPassword)} />
            </View>
            <Button title="Login" onPress={handleLogin}/>
            {/* Make sure Signup is also in RootStackParamList */}
            <Button title="Go to Signup" onPress={() => navigation.navigate('Signup')}/>
        </View>
    );
};

// Styles remain the same...
const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
    },
    title: {
        fontSize: 24,
        marginBottom: 20,
        textAlign: 'center',
    },
    input: {
        height: 45, // Slightly taller often looks better
        borderColor: '#ccc', // Lighter gray
        borderWidth: 1,
        marginBottom: 15, // More spacing
        paddingHorizontal: 10,
        borderRadius: 5, // Rounded corners
        backgroundColor: '#fff', // White background
    },
});


export default LoginScreen;