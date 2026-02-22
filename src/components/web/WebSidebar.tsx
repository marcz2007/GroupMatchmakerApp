import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { colors } from "../../theme";
import { useEvents } from "../../contexts/EventsContext";

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  Events: { focused: "calendar", unfocused: "calendar-outline" },
  Groups: { focused: "grid", unfocused: "grid-outline" },
  Propose: { focused: "rocket", unfocused: "rocket-outline" },
  Profile: { focused: "person", unfocused: "person-outline" },
};

const WebSidebar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const { hasEvents } = useEvents();

  // Separate Profile (pinned to bottom) from the rest
  const mainRoutes = state.routes.filter((r) => r.name !== "Profile");
  const profileRoute = state.routes.find((r) => r.name === "Profile");

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const realIndex = state.routes.indexOf(route);
    const isFocused = state.index === realIndex;
    const icons = TAB_ICONS[route.name] || { focused: "ellipse", unfocused: "ellipse-outline" };
    const iconName = isFocused ? icons.focused : icons.unfocused;
    const label = route.name;

    const onPress = () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        style={[styles.tab, isFocused && styles.tabActive]}
        activeOpacity={0.7}
      >
        <View>
          <Ionicons
            name={iconName as any}
            size={24}
            color={isFocused ? colors.text.primary : colors.text.tertiary}
          />
          {route.name === "Events" && hasEvents && (
            <View style={styles.activeDot} />
          )}
        </View>
        <Text
          style={[
            styles.tabLabel,
            isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topTabs}>
        {mainRoutes.map((route) => renderTab(route, state.routes.indexOf(route)))}
      </View>
      {profileRoute && (
        <View style={styles.bottomTab}>
          {renderTab(profileRoute, state.routes.indexOf(profileRoute))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 80,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.divider,
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 16,
  },
  topTabs: {
    gap: 4,
  },
  bottomTab: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 8,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginHorizontal: 6,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: colors.primaryMuted,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: colors.text.primary,
  },
  tabLabelInactive: {
    color: colors.text.tertiary,
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

export default WebSidebar;
