import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { confirmAlert } from "../utils/alertHelper";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { useCalendar } from "../hooks/useCalendar";
import CalendarPickerModal, { CalendarProvider } from "./CalendarPickerModal";
import {
  getSmartSchedulingStatus,
  SmartSchedulingStatus,
  CandidateTime,
  refreshCalendarAndSync,
  requestReschedule,
  getDayName,
} from "@grapple/shared";
import { colors, spacing, borderRadius } from "../theme";

/** Polling interval in milliseconds while collecting calendar availability */
const SCHEDULING_POLL_INTERVAL_MS = 30000;
/** Maximum number of scheduling slots to preview in the banner */
const SLOTS_PREVIEW_LIMIT = 3;

interface SmartSchedulingBannerProps {
  eventRoomId: string;
  compact?: boolean;
  onTimeChanged?: () => void;
}

const SmartSchedulingBanner: React.FC<SmartSchedulingBannerProps> = ({
  eventRoomId,
  compact = false,
  onTimeChanged,
}) => {
  const { user, calendarConnected } = useAuth();
  const { connectGoogleCalendar } = useCalendar();
  const [status, setStatus] = useState<SmartSchedulingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [syncingProvider, setSyncingProvider] = useState<CalendarProvider | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getSmartSchedulingStatus(eventRoomId);
      setStatus(data);
      setLoadError(false);
    } catch (error) {
      console.error("[SmartBanner] Error loading scheduling status:", error);
      setLoadError(true);
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
    const interval = setInterval(loadStatus, SCHEDULING_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status?.scheduling_status, loadStatus]);

  // Auto-sync when calendar is connected but not yet synced for this event.
  // Covers both: (a) calendarConnected changing from false→true in this session,
  // and (b) fresh page load after OAuth redirect where calendarConnected is
  // already true but user_has_synced is still false.
  const autoSyncAttempted = useRef(false);
  useEffect(() => {
    if (
      calendarConnected &&
      status?.scheduling_status === "collecting" &&
      !status?.user_has_synced &&
      user?.id &&
      !autoSyncAttempted.current
    ) {
      autoSyncAttempted.current = true;
      (async () => {
        setSyncing(true);
        try {
          await refreshCalendarAndSync(eventRoomId, user.id, "google");
          Alert.alert("Synced!", "Your Google Calendar has been synced for this event.");
        } catch (error) {
          console.error("[SmartBanner] Auto-sync after connect failed:", error);
        } finally {
          // Always reload status, even if sync failed
          await loadStatus();
          setSyncing(false);
        }
      })();
    }
  }, [calendarConnected, status, user?.id, eventRoomId, loadStatus]);

  // On web: reload status when user returns to this tab (e.g. after OAuth in another tab)
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadStatus]);

  const handleSyncButtonPress = () => {
    if (!user?.id) {
      Alert.alert("Error", "You must be logged in to sync.");
      return;
    }
    setShowCalendarPicker(true);
  };

  const handleCalendarSelected = async (provider: CalendarProvider) => {
    if (!user?.id) return;

    setSyncingProvider(provider);
    try {
      if (provider === "google") {
        if (calendarConnected) {
          // Already connected — refresh and sync
          await refreshCalendarAndSync(eventRoomId, user.id, "google");
          await loadStatus();
          setShowCalendarPicker(false);
          Alert.alert("Synced!", "Your calendar has been synced for this event.");
        } else {
          // Not connected — start Google OAuth flow directly
          setShowCalendarPicker(false);
          setSyncingProvider(null);
          await connectGoogleCalendar(`/event/${eventRoomId}`);
          return;
        }
      } else {
        // Apple / Outlook — coming soon, handled by modal disabled state
        setSyncingProvider(null);
        return;
      }
    } catch (error: unknown) {
      console.error("[SmartBanner] Sync error:", error);
      Alert.alert(
        "Sync Failed",
        error instanceof Error ? error.message : "Could not sync your calendar. Please try again."
      );
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleReschedule = async (candidate: CandidateTime) => {
    if (rescheduling) return;

    const start = new Date(candidate.candidate_start);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    confirmAlert(
      "Reschedule Event",
      `Change to ${dateStr} at ${timeStr}?`,
      async () => {
        setRescheduling(candidate.id);
        try {
          await requestReschedule(eventRoomId, candidate.id);
          await loadStatus();
          setShowAlternatives(false);
          onTimeChanged?.();
        } catch (error: unknown) {
          console.error("Error rescheduling:", error);
          Alert.alert(
            "Reschedule Failed",
            error instanceof Error ? error.message : "Could not reschedule. Please try again."
          );
        } finally {
          setRescheduling(null);
        }
      },
      "Reschedule"
    );
  };

  const formatCandidateTime = (candidate: CandidateTime) => {
    const start = new Date(candidate.candidate_start);
    const end = new Date(candidate.candidate_end);
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
    return { dateStr, timeStr, endTimeStr };
  };

  if (loading) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  // If the RPC failed (e.g. user is not a participant yet), hide the banner
  if (loadError || !status || status.scheduling_mode !== "smart") return null;

  const { scheduling_status, synced_count, total_participants, user_has_synced } = status;

  // Scheduled — show the selected time + alternatives
  if (scheduling_status === "scheduled" && status.selected_time) {
    const { dateStr, timeStr, endTimeStr } = formatCandidateTime(status.selected_time);
    const alternatives = status.alternative_times || [];

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

        {!compact && alternatives.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.alternativesToggle}
              onPress={() => setShowAlternatives(!showAlternatives)}
              activeOpacity={0.7}
            >
              <Text style={styles.alternativesToggleText}>
                {showAlternatives ? "Hide alternatives" : `${alternatives.length} alternative time${alternatives.length !== 1 ? "s" : ""}`}
              </Text>
              <Ionicons
                name={showAlternatives ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>

            {showAlternatives && (
              <View style={styles.alternativesList}>
                {alternatives.map((alt) => {
                  const { dateStr: altDate, timeStr: altTime, endTimeStr: altEnd } =
                    formatCandidateTime(alt);
                  const isRescheduling = rescheduling === alt.id;
                  return (
                    <TouchableOpacity
                      key={alt.id}
                      style={styles.alternativeRow}
                      onPress={() => handleReschedule(alt)}
                      disabled={!!rescheduling}
                      activeOpacity={0.7}
                    >
                      <View style={styles.alternativeInfo}>
                        <Text style={styles.alternativeTime}>
                          {altDate} {altTime} - {altEnd}
                        </Text>
                        <Text style={styles.alternativeAvailability}>
                          {alt.available_count} of {total_participants} available
                        </Text>
                      </View>
                      {isRescheduling ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
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
    .slice(0, SLOTS_PREVIEW_LIMIT)
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
          {status.slots.length > SLOTS_PREVIEW_LIMIT ? ` +${status.slots.length - SLOTS_PREVIEW_LIMIT} more` : ""}
        </Text>
      )}

      {/* Deadline */}
      {deadlineStr && (
        <Text style={styles.deadline}>
          Auto-picks best time: {deadlineStr}
        </Text>
      )}

      {/* Sync status + button */}
      {syncing ? (
        <View style={styles.syncedRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.syncedText}>Syncing your calendar...</Text>
        </View>
      ) : !user_has_synced ? (
        <View style={styles.notSyncedSection}>
          <View style={styles.notSyncedRow}>
            <Ionicons name="close-circle" size={16} color={colors.warning} />
            <Text style={styles.notSyncedText}>
              You haven't synced yet. The best time will be picked from those who have.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleSyncButtonPress}
            activeOpacity={0.8}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={colors.text.primary}
              style={{ marginRight: spacing.sm }}
            />
            <Text style={styles.syncButtonText}>Sync My Calendar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.syncedRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.syncedText}>Your calendar is synced</Text>
          <TouchableOpacity
            onPress={handleSyncButtonPress}
            activeOpacity={0.7}
          >
            <Text style={styles.resyncText}>Re-sync</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Calendar picker modal */}
      <CalendarPickerModal
        visible={showCalendarPicker}
        onClose={() => setShowCalendarPicker(false)}
        onSelect={handleCalendarSelected}
        loading={syncingProvider}
      />
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
  notSyncedSection: {
    gap: spacing.sm,
  },
  notSyncedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  notSyncedText: {
    fontSize: 13,
    color: colors.warning,
    flex: 1,
    lineHeight: 18,
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
  alternativesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  alternativesToggleText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: "500",
  },
  alternativesList: {
    gap: spacing.xs,
  },
  alternativeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  alternativeInfo: {
    flex: 1,
  },
  alternativeTime: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
  alternativeAvailability: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
});

export default SmartSchedulingBanner;
