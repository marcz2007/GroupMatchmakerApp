// screens/MainScreen.tsx
import React from 'react';
import { View, Button, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import GroupsScreen from './GroupsScreen'; // Import GroupsScreen
import { supabase } from '../supabase';
import {RootStackNavigationProp} from "../../App";

const MainScreen = () => {
    const navigation = useNavigation<RootStackNavigationProp<'Main'>>();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigation.navigate('Login')
    };

    return (
        <View style={styles.container}>
            <GroupsScreen />
            <Button title="Logout" onPress={handleLogout} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default MainScreen;