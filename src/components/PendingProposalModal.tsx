import React, { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import ConfettiCannon from "react-native-confetti-cannon";
import * as Haptics from "expo-haptics";
import { format, formatDistanceToNow } from "date-fns";
import { usePendingProposals } from "../contexts/PendingProposalsContext";
import { castVote, VoteValue } from "../services/proposalService";
import { colors, spacing, borderRadius } from "../theme/theme";

const PendingProposalModal: React.FC = () => {
  const { currentProposal, dismissCurrent, refreshPending } =
    usePendingProposals();
  const [loading, setLoading] = useState(false);
  const [selectedVote, setSelectedVote] = useState<VoteValue | null>(null);
  const [celebrationState, setCelebrationState] = useState<
    "none" | "voted" | "threshold"
  >("none");

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiCannon | null>(null);

  const visible = currentProposal !== null;

  useEffect(() => {
    if (visible) {
      setCelebrationState("none");
      setSelectedVote(null);
      setLoading(false);
      celebrationOpacity.setValue(0);
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleAnim, opacityAnim, celebrationOpacity]);

  if (!currentProposal) return null;

  const { proposal: p, vote_counts, created_by_profile } = currentProposal;
  const groupName = currentProposal.group_name;

  const handleVote = async (vote: VoteValue) => {
    setSelectedVote(vote);
    setLoading(true);
    try {
      const result = await castVote(p.id, vote);

      if (vote === "YES") {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
        confettiRef.current?.start();

        if (result.threshold_met) {
          setCelebrationState("threshold");
        } else {
          setCelebrationState("voted");
        }

        Animated.timing(celebrationOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();

        setTimeout(() => {
          refreshPending();
          dismissCurrent();
        }, 2500);
      } else {
        refreshPending();
        dismissCurrent();
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit vote";
      console.error("Vote error:", errorMessage);
      setLoading(false);
      setSelectedVote(null);
    }
  };

  const handleDismiss = () => {
    dismissCurrent();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "EEE, MMM d 'at' h:mm a");
  };

  const getTimeRemaining = () => {
    const endDate = new Date(p.vote_window_ends_at);
    return formatDistanceToNow(endDate, { addSuffix: true });
  };

  const progressPercent = Math.min(
    (vote_counts.yes_count / p.threshold) * 100,
    100
  );

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={["#1a1a2e", "#0a0a0f", "#0a0a0f"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            styles.content,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {celebrationState !== "none" ? (
            <Animated.View
              style={[styles.celebrationContainer, { opacity: celebrationOpacity }]}
            >
              <Text style={styles.celebrationEmoji}>
                {celebrationState === "threshold" ? "🎉" : "🙌"}
              </Text>
              <Text style={styles.celebrationTitle}>
                {celebrationState === "threshold"
                  ? "It's happening!"
                  : "You're in!"}
              </Text>
              <Text style={styles.celebrationSubtitle}>
                {celebrationState === "threshold"
                  ? "The threshold has been met — event created!"
                  : `Your vote for "${p.title}" has been recorded`}
              </Text>
            </Animated.View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Dismiss button */}
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={handleDismiss}
              >
                <Text style={styles.dismissButtonText}>×</Text>
              </TouchableOpacity>

              {/* Header */}
              <Text style={styles.headerEmoji}>🚀</Text>
              <Text style={styles.headerTitle}>You've been invited!</Text>

              {/* Group name pill */}
              <View style={styles.groupPill}>
                <Text style={styles.groupPillText}>{groupName}</Text>
              </View>

              {/* Proposal title */}
              <Text style={styles.proposalTitle}>{p.title}</Text>

              {/* Description */}
              {p.description && (
                <Text style={styles.description}>{p.description}</Text>
              )}

              {/* Detail rows */}
              <View style={styles.detailsContainer}>
                {p.starts_at && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailIcon}>📅</Text>
                    <Text style={styles.detailText}>
                      {formatDate(p.starts_at)}
                    </Text>
                  </View>
                )}
                {p.ends_at && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailIcon}>🏁</Text>
                    <Text style={styles.detailText}>
                      {formatDate(p.ends_at)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Proposed by */}
              {created_by_profile && (
                <Text style={styles.proposedBy}>
                  Proposed by {created_by_profile.display_name}
                </Text>
              )}

              {/* Vote counts */}
              <View style={styles.voteCounts}>
                <View style={styles.voteCountItem}>
                  <Text style={[styles.voteCountNumber, { color: colors.success }]}>
                    {vote_counts.yes_count}
                  </Text>
                  <Text style={styles.voteCountLabel}>Yes</Text>
                </View>
                <View style={styles.voteCountItem}>
                  <Text style={[styles.voteCountNumber, { color: colors.warning }]}>
                    {vote_counts.maybe_count}
                  </Text>
                  <Text style={styles.voteCountLabel}>Maybe</Text>
                </View>
                <View style={styles.voteCountItem}>
                  <Text style={[styles.voteCountNumber, { color: colors.error }]}>
                    {vote_counts.no_count}
                  </Text>
                  <Text style={styles.voteCountLabel}>No</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progressPercent}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {vote_counts.yes_count}/{p.threshold} YES votes needed
                </Text>
              </View>

              {/* Time remaining badge */}
              <View style={styles.timeBadge}>
                <Text style={styles.timeBadgeText}>
                  ⏳ Voting ends {getTimeRemaining()}
                </Text>
              </View>

              {/* Vote buttons */}
              <View style={styles.voteButtons}>
                <TouchableOpacity
                  style={[styles.yesButton, loading && styles.buttonDisabled]}
                  onPress={() => handleVote("YES")}
                  disabled={loading}
                >
                  {loading && selectedVote === "YES" ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.yesButtonText}>I'm In!</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.secondaryButtons}>
                  <TouchableOpacity
                    style={[
                      styles.maybeButton,
                      loading && styles.buttonDisabled,
                    ]}
                    onPress={() => handleVote("MAYBE")}
                    disabled={loading}
                  >
                    {loading && selectedVote === "MAYBE" ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.maybeButtonText}>Maybe</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.noButton, loading && styles.buttonDisabled]}
                    onPress={() => handleVote("NO")}
                    disabled={loading}
                  >
                    {loading && selectedVote === "NO" ? (
                      <ActivityIndicator color={colors.text.tertiary} size="small" />
                    ) : (
                      <Text style={styles.noButtonText}>Not this time</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </Animated.View>

        {/* Confetti layer */}
        <ConfettiCannon
          ref={confettiRef}
          count={80}
          origin={{ x: -10, y: 0 }}
          autoStart={false}
          fadeOut={true}
          fallSpeed={2500}
          colors={[colors.primary, colors.success, "#fff", "#ffd700"]}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.xl + spacing.md,
  },
  dismissButton: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  dismissButtonText: {
    fontSize: 28,
    color: colors.text.tertiary,
    lineHeight: 28,
  },
  headerEmoji: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  groupPill: {
    alignSelf: "center",
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  groupPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  proposalTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  detailsContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  detailIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  detailText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  proposedBy: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  voteCounts: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  voteCountItem: {
    alignItems: "center",
    marginHorizontal: spacing.lg,
  },
  voteCountNumber: {
    fontSize: 28,
    fontWeight: "700",
  },
  voteCountLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  timeBadge: {
    alignSelf: "center",
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.lg,
  },
  timeBadgeText: {
    fontSize: 13,
    color: colors.text.tertiary,
  },
  voteButtons: {
    gap: spacing.sm,
  },
  yesButton: {
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: "center",
  },
  yesButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.white,
  },
  secondaryButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  maybeButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.warning,
  },
  maybeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.warning,
  },
  noButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  noButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.tertiary,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  celebrationContainer: {
    padding: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 300,
  },
  celebrationEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  celebrationTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  celebrationSubtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: "center",
  },
});

export default PendingProposalModal;
