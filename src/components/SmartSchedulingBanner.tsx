import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useCalendar } from "../hooks/useCalendar";
import {
  getSmartSchedulingStatus,
  SmartSchedulingStatus,
  refreshCalendarAndSync,
  getDayName,
} from "../services/schedulingService";
import { colors, spacing, borderRadius, typography } from "../theme";

interface SmartSchedulingBannerProps {
  eventRoomId: string;
  /** Compact mode for use in event room header */
  compact?: boolean;
}

const SmartSchedulingBanner: React.FC<SmartSchedulingBannerProps> = ({
  eventRoomId,
  compact = false,
}) => {
  const { user, calendarConnected } = useAuth();
  const { connectGoogleCalendar, loading: calendarLoading } = useCalendar();
  const [status, setStatus] = useState<SmartSchedulingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getSmartSchedulingStatus(eventRoomId);
      setStatus(data);
    } catch (error) {
      console.error("Error loading scheduling status:", error);
    } finally {
      setLoading(false);
    }
  }, [eventRoomId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Refresh every 30s while collecting
  useEffect(() => {
    if (status?.scheduling_status !== "collecting") return;
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, [status?.scheduling_status, loadStatus]);

  const handleSyncCalendar = async () => {
    if (!user?.id || syncing) return;

    if (!calendarConnected) {
      Alert.alert(
        "Connect Calendar",
        "Connect your Google Calendar first to sync your availability.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Connect", onPress: connectGoogleCalendar },
        ]
      );
      return;
    }

    setSyncing(true);
    try {
      await refreshCalendarAndSync(eventRoomId, user.id, "google");
      await loadStatus();
      Alert.alert("Synced!", "Your calendar has been synced for this event.");
    } catch (error: any) {
      console.error("Error syncing calendar:", error);
      Alert.alert(
        "Sync Failed",
        error?.message || "Could not sync your calendar. Please try again."
      );
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!status || status.scheduling_mode !== "smart") return null;

  const { scheduling_status, synced_count, total_participants, user_has_synced } = status;

  // Scheduled — show the selected time
  if (scheduling_status === "scheduled" && status.selected_time) {
    const start = new Date(status.selected_time.candidate_start);
    const end = new Date(status.selected_time.candidate_end);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    const endTimeStr = end.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    return (
      <View style={[styles.container, styles.scheduledContainer, compact && styles.containerCompact]}>
        <View style={styles.iconRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.scheduledTitle}>Time selected!</Text>
        </View>
        <Text style={styles.scheduledTime}>
          {dateStr} {timeStr} - {endTimeStr}
        </Text>
        {status.selected_time.available_count > 0 && (
          <Text style={styles.scheduledDetail}>
            {status.selected_time.available_count} of {total_participants} available
          </Text>
        )}
      </View>
    );
  }

  // Failed
  if (scheduling_status === "failed") {
    return (
      <View style={[styles.container, styles.failedContainer, compact && styles.containerCompact]}>
        <View style={styles.iconRow}>
          <Ionicons name="alert-circle" size={20} color={colors.error} />
          <Text style={styles.failedTitle}>Could not find a time</Text>
        </View>
        <Text style={styles.failedDetail}>
          No time slots had enough availability. Try creating a new event with different options.
        </Text>
      </View>
    );
  }

  // Collecting — show progress and sync button
  const deadlineDate = status.scheduling_deadline
    ? new Date(status.scheduling_deadline)
    : null;
  const deadlineStr = deadlineDate
    ? deadlineDate.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const slotsPreview = status.slots
    .slice(0, 3)
    .map(
      (s) =>
        `${getDayName(s.day_of_week).slice(0, 3)} ${s.start_time.slice(0, 5)}`
    )
    .join(", ");

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Title row */}
      <View style={styles.iconRow}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <Text style={styles.title}>Finding the best time</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width:
                  total_participants > 0
                    ? `${Math.round((synced_count / total_participants) * 100)}%`
                    : "0%",
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {synced_count}/{total_participants} synced
        </Text>
      </View>

      {/* Synced users */}
      {!compact && status.synced_users.length > 0 && (
        <View style={styles.syncedUsersRow}>
          {status.synced_users.map((u) => (
            <View key={u.user_id} style={styles.syncedBadge}>
              <Ionicons name="checkmark" size={12} color={colors.success} />
              <Text style={styles.syncedName}>{u.display_name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Slots preview */}
      {!compact && slotsPreview && (
        <Text style={styles.slotsPreview}>
          Looking at: {slotsPreview}
          {status.slots.length > 3 ? ` +${status.slots.length - 3} more` : ""}
        </Text>
      )}

      {/* Deadline */}
      {deadlineStr && (
        <Text style={styles.deadline}>
          Auto-picks best time: {deadlineStr}
        </Text>
      )}

      {/* Sync button */}
      {!user_has_synced ? (
        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSyncCalendar}
          disabled={syncing || calendarLoading}
          activeOpacity={0.8}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={colors.text.primary}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={styles.syncButtonText}>
                {calendarConnected ? "Sync My Calendar" : "Connect & Sync Calendar"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.syncedRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.syncedText}>Your calendar is synced</Text>
          <TouchableOpacity
            onPress={handleSyncCalendar}
            disabled={syncing}
            activeOpacity={0.7}
          >
            <Text style={styles.resyncText}>{syncing ? "Syncing..." : "Re-sync"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  containerCompact: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  scheduledContainer: {
    borderColor: "rgba(16, 185, 129, 0.3)",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  failedContainer: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
  },
  scheduledTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.success,
  },
  scheduledTime: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text.primary,
    marginLeft: 28,
  },
  scheduledDetail: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginLeft: 28,
  },
  failedTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.error,
  },
  failedDetail: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginLeft: 28,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  progressText: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontWeight: "500",
    minWidth: 65,
  },
  syncedUsersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  syncedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  syncedName: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  slotsPreview: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  deadline: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: "500",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 40,
  },
  syncButtonText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  syncedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  syncedText: {
    fontSize: 13,
    color: colors.success,
    flex: 1,
  },
  resyncText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "500",
  },
});

export default SmartSchedulingBanner;
