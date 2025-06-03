import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

// Import screens
import GroupsScreen from "../screens/GroupsScreen";
import MatchmakingHomeScreen from "../screens/MatchmakingHomeScreen";
import MessagesListScreen from "../screens/MessagesListScreen";
import ProfileScreen from "../screens/ProfileScreen";

// Create the tab navigator
const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          // Use Ionicons for regular tabs
          if (route.name === "Groups") {
            return (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={size}
                color={color}
              />
            );
          } else if (route.name === "Messages") {
            return (
              <Ionicons
                name={focused ? "chatbubbles" : "chatbubbles-outline"}
                size={size}
                color={color}
              />
            );
          } else if (route.name === "Profile") {
            return (
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={size}
                color={color}
              />
            );
          }

          // Use a hook-like icon for Grapple tab
          // Options: link, construct, hammer, magnet, anchor, flash-outline
          return (
            <Ionicons
              name={focused ? "magnet" : "magnet-outline"}
              size={size * 1.2}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: styles.tabBar,
        headerShown: false, // Hide the header since screens have their own titles
      })}
    >
      <Tab.Screen
        name="Matchmaking"
        component={MatchmakingHomeScreen}
        options={{
          title: "Grapple",
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          title: "My Groups",
        }}
      />
      <Tab.Screen name="Messages" component={MessagesListScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#111827", // Modern dark gray/black
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    height: 60,
    paddingTop: 5,
    paddingBottom: 5,
  },
});

export default BottomTabNavigator;
