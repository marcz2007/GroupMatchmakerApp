import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { RootStackNavigationProp } from "../../App";
import { Button } from '../components/Button';
import { supabase } from '../supabase';

const SignupScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigation = useNavigation<RootStackNavigationProp<'Signup'>>();

    const handleSignup = async () => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (error) {
                Alert.alert('Signup Error', error.message);
            } else {
                Alert.alert('Signup Successful', 'Check your email to confirm your account.');
                navigation.navigate('Login'); // Navigate back to login
            }
        } catch (error: any) {
            Alert.alert('Signup Error', error.message);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Signup</Text>
            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
            />
            <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />
            <Button
                variant="primary"
                onPress={handleSignup}
                fullWidth
            >
                Signup
            </Button>
            <Button
                variant="link"
                onPress={() => navigation.navigate('Login')}
            >
                Go to Login
            </Button>
        </View>
    );
};

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
        height: 40,
        borderColor: 'gray',
        borderWidth: 1,
        marginBottom: 10,
        paddingHorizontal: 10,
    },
});

export default SignupScreen;