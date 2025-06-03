// screens/MainScreen.tsx
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RootStackNavigationProp } from "../../App";
import { Button } from '../components/Button';
import { supabase } from '../supabase';
import GroupsScreen from './GroupsScreen'; // Import GroupsScreen

const MainScreen = () => {
    const navigation = useNavigation<RootStackNavigationProp<'Main'>>();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigation.navigate('Login')
    };

    return (
        <View style={styles.container}>
            <GroupsScreen />
            <Button
              variant="danger"
              onPress={handleLogout}
            >
              Logout
            </Button>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});

export default MainScreen;