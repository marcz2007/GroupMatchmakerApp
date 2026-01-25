import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

// Import screens
import CreateGroupScreen from "../screens/CreateGroupScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import GroupsScreen from "../screens/GroupsScreen";

// Create the tab navigator
const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Groups") {
            iconName = focused ? "grid" : "grid-outline";
          } else if (route.name === "Propose") {
            iconName = focused ? "add-circle" : "add-circle-outline";
          } else if (route.name === "Profile") {
            iconName = focused ? "person" : "person-outline";
          }

          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#ffffff",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarStyle: styles.tabBar,
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        options={{
          title: "Groups",
        }}
      />
      <Tab.Screen
        name="Propose"
        component={CreateGroupScreen}
        options={{
          title: "Propose",
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
