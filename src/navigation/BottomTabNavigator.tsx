import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Import screens
import GroupsScreen from '../screens/GroupsScreen';
import MessagesListScreen from '../screens/MessagesListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MatchmakingHomeScreen from '../screens/MatchmakingHomeScreen';

// Create the tab navigator
const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Groups') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name === 'Matchmaking') {
            iconName = focused ? 'flame' : 'flame-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          // Return the icon component
          return <Ionicons name={iconName as string} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#5762b7',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: styles.tabBar,
        headerShown: false, // Hide the header since screens have their own titles
      })}
    >
      <Tab.Screen 
        name="Matchmaking" 
        component={MatchmakingHomeScreen}
        options={{
          title: 'Grapple'
        }}
      />
      <Tab.Screen 
        name="Groups" 
        component={GroupsScreen}
        options={{
          title: 'My Groups'
        }}
      />
      <Tab.Screen 
        name="Messages" 
        component={MessagesListScreen}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 5,
    paddingBottom: 5,
    height: 60,
  },
});

export default BottomTabNavigator; 