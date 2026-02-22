import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { formatDistanceToNow } from "date-fns";
import { colors, spacing, borderRadius, typography } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserEvents,
  subscribeToUserEvents,
  EventWithDetails,
} from "../services/eventService";

interface EventsListScreenProps {
  onSelectEvent?: (eventRoomId: string) => void;
  selectedEventId?: string;
}

const EventsListScreen = ({ onSelectEvent, selectedEventId }: EventsListScreenProps = {}) => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      if (!user) return;
      const data = await getUserEvents();
      setEvents(data);
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadEvents();
    const unsubscribe = subscribeToUserEvents(loadEvents);
    return unsubscribe;
  }, [loadEvents]);

  const onRefresh = () => {
    setRefreshing(true);
    loadEvents();
  };

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: false });
    } catch {
      return "";
    }
  };

  const formatEventDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  };

  const renderEventItem = ({ item }: { item: EventWithDetails }) => {
    const lastMessageTime = item.last_message?.created_at
      ? formatTime(item.last_message.created_at)
      : formatTime(item.event_room.created_at);

    const eventDate = formatEventDate(item.event_room.starts_at);

    const isSelected = selectedEventId === item.event_room.id;

    return (
      <TouchableOpacity
        style={[styles.eventRow, isSelected && styles.eventRowSelected]}
        onPress={() => {
          if (onSelectEvent) {
            onSelectEvent(item.event_room.id);
          } else {
            navigation.navigate("EventChat", { eventRoomId: item.event_room.id });
          }
        }}
        activeOpacity={0.7}
      >
        {/* Event Avatar/Icon */}
        <View style={styles.avatarContainer}>
          <LinearGradient
            colors={[colors.primary, colors.secondary]}
            style={styles.avatar}
          >
            <Text style={styles.avatarEmoji}>
              {item.event_room.title.includes("🎬")
                ? "🎬"
                : item.event_room.title.includes("🎮")
                  ? "🎮"
                  : item.event_room.title.includes("🍕")
                    ? "🍕"
                    : "📅"}
            </Text>
          </LinearGradient>
          {/* Active indicator */}
          <View style={styles.activeIndicator} />
        </View>

        {/* Event Info */}
        <View style={styles.eventInfo}>
          <View style={styles.topRow}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.event_room.title}
            </Text>
            <Text style={styles.timeText}>{lastMessageTime}</Text>
          </View>

          <View style={styles.bottomRow}>
            <Text style={styles.previewText} numberOfLines={1}>
              {item.last_message
                ? `${item.last_message.sender_name}: ${item.last_message.content}`
                : eventDate
                  ? `📅 ${eventDate}`
                  : `${item.participant_count} going`}
            </Text>
            {item.unread_count > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread_count}</Text>
              </View>
            )}
          </View>

          <Text style={styles.groupName}>{item.group_name}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🎉</Text>
      <Text style={styles.emptyTitle}>No active events</Text>
      <Text style={styles.emptySubtitle}>
        When proposals get enough interest,{"\n"}they become events and appear here.
      </Text>
    </View>
  );

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonContent}>
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonSubtitle} />
          </View>
        </View>
      ))}
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Events</Text>
        </View>

        {/* Events List */}
        {loading ? (
          renderSkeleton()
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item) => item.event_room.id}
            renderItem={renderEventItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.text.primary}
              />
            }
            ListEmptyComponent={renderEmptyState}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text.primary,
  },
  listContent: {
    flexGrow: 1,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  eventRowSelected: {
    backgroundColor: colors.surfaceGlass,
  },
  avatarContainer: {
    position: "relative",
    marginRight: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: {
    fontSize: 24,
  },
  activeIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.eventActive,
    borderWidth: 2,
    borderColor: colors.background,
  },
  eventInfo: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  eventTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  timeText: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  previewText: {
    ...typography.body,
    color: colors.text.tertiary,
    fontSize: 14,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.eventBadge,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  groupName: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 88, // avatar width + margins
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.text.tertiary,
    textAlign: "center",
    lineHeight: 22,
  },
  skeletonContainer: {
    paddingTop: spacing.md,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  skeletonAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceGlass,
    marginRight: spacing.md,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonTitle: {
    height: 18,
    width: "60%",
    backgroundColor: colors.surfaceGlass,
    borderRadius: 4,
    marginBottom: spacing.sm,
  },
  skeletonSubtitle: {
    height: 14,
    width: "80%",
    backgroundColor: colors.surfaceGlass,
    borderRadius: 4,
  },
});

export default EventsListScreen;
