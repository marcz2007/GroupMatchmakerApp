import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getPollStatus,
  castPollVote,
  PollStatus,
  PollOption,
} from "@grapple/shared";
import { colors, spacing, borderRadius, typography } from "../theme";

/** Polling interval in ms while voting is open */
const POLL_REFRESH_MS = 30_000;

interface PollVotingBannerProps {
  eventRoomId: string;
  onStatusChange?: () => void;
}

function formatOptionDateTime(option: PollOption): string {
  try {
    const start = new Date(option.starts_at);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} · ${timeStr}`;
  } catch {
    return option.starts_at;
  }
}

const PollVotingBanner: React.FC<PollVotingBannerProps> = ({
  eventRoomId,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<PollStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await getPollStatus(eventRoomId);
      setStatus(data);
      setLoadError(false);
    } catch (error) {
      console.error("[PollBanner] Error loading poll status:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [eventRoomId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Refresh every 30s while voting is still open
  useEffect(() => {
    if (status?.scheduling_status !== "collecting") return;
    const interval = setInterval(loadStatus, POLL_REFRESH_MS);
    return () => clearInterval(interval);
  }, [status?.scheduling_status, loadStatus]);

  const handleVote = async (
    candidateTimeId: string,
    vote: "YES" | "NO"
  ) => {
    if (votingId) return;
    setVotingId(candidateTimeId);
    try {
      await castPollVote(eventRoomId, candidateTimeId, vote);
      await loadStatus();
      onStatusChange?.();
    } catch (error) {
      console.error("[PollBanner] Vote failed:", error);
      Alert.alert(
        "Could not record vote",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setVotingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError || !status) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.text.tertiary} />
          <Text style={styles.headerText}>Could not load poll</Text>
        </View>
        <TouchableOpacity style={styles.retryButton} onPress={loadStatus}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const finalized = status.scheduling_status === "scheduled";
  const winningOption = finalized
    ? status.options.find((o) => o.is_selected)
    : null;

  if (finalized && winningOption) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.headerText}>Poll closed · Winner picked</Text>
        </View>
        <View style={styles.winningCard}>
          <Text style={styles.winningLabel}>Selected time</Text>
          <Text style={styles.winningValue}>
            {formatOptionDateTime(winningOption)}
          </Text>
          <Text style={styles.winningCount}>
            {winningOption.yes_count} yes vote
            {winningOption.yes_count === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="checkbox-outline" size={18} color={colors.primary} />
        <Text style={styles.headerText}>Vote on options</Text>
      </View>
      {status.poll_min_votes ? (
        <Text style={styles.subHeader}>
          Finalizes early at {status.poll_min_votes} yes votes on any option
        </Text>
      ) : null}

      <View style={styles.optionsList}>
        {status.options.map((option) => {
          const isPending = votingId === option.id;
          const yesSelected = option.my_vote === "YES";
          const noSelected = option.my_vote === "NO";
          return (
            <View key={option.id} style={styles.optionCard}>
              <View style={styles.optionHeader}>
                <Text style={styles.optionDateTime}>
                  {formatOptionDateTime(option)}
                </Text>
                <Text style={styles.optionCounts}>
                  {option.yes_count} yes · {option.no_count} no
                </Text>
              </View>
              <View style={styles.voteRow}>
                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    styles.voteYes,
                    yesSelected && styles.voteSelectedYes,
                  ]}
                  onPress={() => handleVote(option.id, "YES")}
                  disabled={isPending}
                >
                  {isPending && yesSelected ? (
                    <ActivityIndicator color={colors.text.primary} size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={colors.text.primary}
                      />
                      <Text style={styles.voteText}>Yes</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    styles.voteNo,
                    noSelected && styles.voteSelectedNo,
                  ]}
                  onPress={() => handleVote(option.id, "NO")}
                  disabled={isPending}
                >
                  {isPending && noSelected ? (
                    <ActivityIndicator color={colors.text.primary} size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="close"
                        size={16}
                        color={colors.text.primary}
                      />
                      <Text style={styles.voteText}>No</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerText: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  subHeader: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  retryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    alignSelf: "flex-start",
  },
  retryText: {
    color: colors.text.primary,
    fontWeight: "600",
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionHeader: {
    gap: 2,
  },
  optionDateTime: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: "600",
  },
  optionCounts: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 13,
  },
  voteRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  voteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    minHeight: 40,
  },
  voteYes: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  voteSelectedYes: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  voteNo: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  voteSelectedNo: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  voteText: {
    color: colors.text.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  winningCard: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  winningLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  winningValue: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: "600",
  },
  winningCount: {
    ...typography.caption,
    color: colors.success,
    fontSize: 13,
  },
});

export default PollVotingBanner;
