import { createBottomTabNavigator, BottomTabBar } from "@react-navigation/bottom-tabs";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Import screens
import EditProfileScreen from "../screens/EditProfileScreen";
import GroupsScreen from "../screens/GroupsScreen";
import ProposeScreen from "../screens/ProposeScreen";
import EventsListScreen from "../screens/EventsListScreen";

// Desktop web screens
import EventsDesktopView from "../screens/web/EventsDesktopView";
import GroupsDesktopView from "../screens/web/GroupsDesktopView";
import WebSidebar from "../components/web/WebSidebar";

// Import context and hooks
import { useEvents } from "../contexts/EventsContext";
import { usePermissions } from "../hooks/usePermissions";
import { useAuth } from "../contexts/AuthContext";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { colors } from "../theme";

// Create the tab navigator
const Tab = createBottomTabNavigator();

const BottomTabNavigator = () => {
  const { hasEvents } = useEvents();
  const { canAccessGroups } = usePermissions();
  const { isGuest } = useAuth();
  const { isDesktopWeb } = useResponsiveLayout();

  return (
    <Tab.Navigator
      tabBar={(props) =>
        isDesktopWeb ? <WebSidebar {...props} /> : <BottomTabBar {...props} />
      }
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          if (route.name === "Events") {
            iconName = focused ? "calendar" : "calendar-outline";
          } else if (route.name === "Groups") {
            iconName = focused ? "grid" : "grid-outline";
          } else if (route.name === "Propose") {
            iconName = focused ? "rocket" : "rocket-outline";
          } else if (route.name === "Profile") {
            iconName = focused ? "person" : "person-outline";
          } else {
            iconName = "ellipse";
          }

          // Add active indicator dot for Events tab
          if (route.name === "Events" && hasEvents) {
            return (
              <View>
                <Ionicons name={iconName} size={size} color={color} />
                <View style={styles.activeDot} />
              </View>
            );
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.text.primary,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarPosition: isDesktopWeb ? 'left' : 'bottom',
        tabBarStyle: isDesktopWeb ? styles.sideBar : styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerShown: false,
      })}
    >
      {/* Events tab - always shown for guests, conditional on hasEvents for full accounts */}
      {(isGuest || hasEvents) && (
        <Tab.Screen
          name="Events"
          component={isDesktopWeb ? EventsDesktopView : EventsListScreen}
          options={{
            title: "Events",
          }}
        />
      )}
      {/* Groups and Propose tabs - only for non-guest users */}
      {canAccessGroups && (
        <Tab.Screen
          name="Groups"
          component={isDesktopWeb ? GroupsDesktopView : GroupsScreen}
          options={{
            title: "Groups",
          }}
        />
      )}
      {canAccessGroups && (
        <Tab.Screen
          name="Propose"
          component={ProposeScreen}
          options={{
            title: "Propose",
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={EditProfileScreen}
        options={{
          title: "Profile",
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    elevation: 0,
    height: 65,
    paddingBottom: 10,
    paddingTop: 5,
  },
  sideBar: {
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.divider,
    elevation: 0,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  activeDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.eventActive,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});

export default BottomTabNavigator;
