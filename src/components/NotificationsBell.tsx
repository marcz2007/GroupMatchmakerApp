import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import {
  getUnreadNotificationCount,
  subscribeToNotifications,
} from "@grapple/shared";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing } from "../theme";
import { RootStackParamList } from "../navigation/AppNavigator";

const POLL_INTERVAL_MS = 60_000;

const NotificationsBell: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const loadCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const count = await getUnreadNotificationCount();
      setUnread(count);
    } catch (error) {
      console.error("[NotificationsBell] load failed:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  // Periodic refresh as a fallback
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(loadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user?.id, loadCount]);

  // Realtime: increment on new notification
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToNotifications(user.id, () => {
      setUnread((prev) => prev + 1);
    });
    return unsubscribe;
  }, [user?.id]);

  if (!user?.id) return null;

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => {
        // Open inbox; the inbox screen will mark notifications as read
        setUnread(0);
        navigation.navigate("NotificationsInbox");
      }}
      activeOpacity={0.7}
    >
      <Ionicons
        name="notifications-outline"
        size={22}
        color={colors.text.primary}
      />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    backgroundColor: colors.error,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
});

export default NotificationsBell;
