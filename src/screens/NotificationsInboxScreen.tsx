import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNow } from "date-fns";
import {
  getNotifications,
  markNotificationsRead,
  subscribeToNotifications,
  Notification,
} from "@grapple/shared";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing, borderRadius, typography } from "../theme";
import { RootStackParamList } from "../navigation/AppNavigator";

const NotificationsInboxScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setItems(data);
    } catch (error) {
      console.error("[NotificationsInbox] load failed:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime: prepend new notifications as they arrive
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToNotifications(user.id, (n) => {
      setItems((prev) => [n, ...prev]);
    });
    return unsubscribe;
  }, [user?.id]);

  // Mark everything read when opening the screen
  useEffect(() => {
    (async () => {
      try {
        await markNotificationsRead();
      } catch (error) {
        console.error("[NotificationsInbox] mark-read failed:", error);
      }
    })();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleOpen = (item: Notification) => {
    if (item.event_room_id) {
      navigation.navigate("EventRoom", {
        eventRoomId: item.event_room_id,
      });
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const isUnread = !item.read;
    let timeStr = "";
    try {
      timeStr = formatDistanceToNow(new Date(item.created_at), {
        addSuffix: true,
      });
    } catch {
      timeStr = "";
    }

    return (
      <TouchableOpacity
        style={[styles.itemRow, isUnread && styles.itemRowUnread]}
        onPress={() => handleOpen(item)}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrap}>
          <Ionicons
            name="notifications-outline"
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.itemContent}>
          {item.title && <Text style={styles.itemTitle}>{item.title}</Text>}
          <Text style={styles.itemMessage} numberOfLines={3}>
            {item.message}
          </Text>
          {timeStr && <Text style={styles.itemTime}>{timeStr}</Text>}
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptySubtitle}>
        You&apos;ll see updates about your events here.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons
              name="chevron-back"
              size={28}
              color={colors.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.text.primary}
              />
            }
            ListEmptyComponent={renderEmpty}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    flexGrow: 1,
    paddingVertical: spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  itemRowUnread: {
    backgroundColor: colors.primaryMuted,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: "600",
  },
  itemMessage: {
    ...typography.caption,
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 18,
  },
  itemTime: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 16,
  },
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.lg,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.text.tertiary,
    textAlign: "center",
  },
});

export default NotificationsInboxScreen;
