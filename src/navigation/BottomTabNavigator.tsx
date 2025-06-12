import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import GrappleIcon from "../components/icons/GrappleIcon";

// Import screens
import EditProfileScreen from "../screens/EditProfileScreen";
import GroupsScreen from "../screens/GroupsScreen";
import MatchmakingHomeScreen from "../screens/MatchmakingHomeScreen";
import MessagesListScreen from "../screens/MessagesListScreen";

// Create the tab navigator
const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Matchmaking") {
            return (
              <GrappleIcon
                width={size}
                height={size}
                color={color}
                focused={focused}
              />
            );
          } else if (route.name === "Groups") {
            iconName = focused ? "grid" : "grid-outline";
          } else if (route.name === "Messages") {
            iconName = focused ? "chatbubbles" : "chatbubbles-outline";
          } else if (route.name === "Profile") {
            iconName = focused ? "person" : "person-outline";
          }

          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: styles.tabBar,
        headerShown: false, // Hide the header since screens have their own titles
      })}
    >
      <Tab.Screen name="Messages" component={MessagesListScreen} />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          title: "My Groups",
        }}
      />
      <Tab.Screen
        name="Matchmaking"
        component={MatchmakingHomeScreen}
        options={{
          title: "Grapple",
        }}
      />
      <Tab.Screen name="Profile" component={EditProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#1a1a1a",
    borderTopWidth: 0,
    elevation: 0,
    height: 60,
    paddingBottom: 8,
  },
});

export default BottomTabNavigator;
