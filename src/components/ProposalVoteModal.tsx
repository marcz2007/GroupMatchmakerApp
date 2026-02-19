import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import * as Haptics from "expo-haptics";
import { format, formatDistanceToNow, isPast } from "date-fns";
import {
  ProposalWithVotes,
  VoteValue,
  castVote,
} from "../services/proposalService";
import { colors, spacing, typography, borderRadius } from "../theme/theme";

interface ProposalVoteModalProps {
  visible: boolean;
  onClose: () => void;
  proposal: ProposalWithVotes | null;
  onVoteSuccess: () => void;
}

const ProposalVoteModal: React.FC<ProposalVoteModalProps> = ({
  visible,
  onClose,
  proposal,
  onVoteSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedVote, setSelectedVote] = useState<VoteValue | null>(null);
  const [celebrationState, setCelebrationState] = useState<
    "none" | "voted" | "threshold"
  >("none");
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiCannon | null>(null);

  if (!proposal) return null;

  const { proposal: p, vote_counts, my_vote } = proposal;
  const isVotingOpen =
    p.status === "open" && !isPast(new Date(p.vote_window_ends_at));

  const handleClose = () => {
    setCelebrationState("none");
    celebrationOpacity.setValue(0);
    onClose();
  };

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

        if (result.threshold_met && result.event_room_id) {
          setCelebrationState("threshold");
        } else {
          setCelebrationState("voted");
        }

        Animated.timing(celebrationOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();

        onVoteSuccess();

        setTimeout(() => {
          handleClose();
        }, 2500);
      } else {
        onVoteSuccess();
        handleClose();
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit vote";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
      setSelectedVote(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "EEEE, MMM d 'at' h:mm a");
  };

  const getTimeRemaining = () => {
    const endDate = new Date(p.vote_window_ends_at);
    if (isPast(endDate)) {
      return "Voting has closed";
    }
    return `Voting ends in ${formatDistanceToNow(endDate)}`;
  };

  const getVoteButtonStyle = (vote: VoteValue) => {
    const isSelected = my_vote === vote || selectedVote === vote;
    const isLoading = loading && selectedVote === vote;

    switch (vote) {
      case "YES":
        return [
          styles.voteButton,
          styles.yesButton,
          isSelected && styles.yesButtonSelected,
          isLoading && styles.buttonLoading,
        ];
      case "MAYBE":
        return [
          styles.voteButton,
          styles.maybeButton,
          isSelected && styles.maybeButtonSelected,
          isLoading && styles.buttonLoading,
        ];
      case "NO":
        return [
          styles.voteButton,
          styles.noButton,
          isSelected && styles.noButtonSelected,
          isLoading && styles.buttonLoading,
        ];
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>

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
                  : "Your YES vote has been recorded"}
              </Text>
            </Animated.View>
          ) : (
            <>
              <Text style={styles.modalTitle}>{p.title}</Text>

              {p.description && (
                <Text style={styles.description}>{p.description}</Text>
              )}

              <View style={styles.detailsContainer}>
                {p.starts_at && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Starts:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(p.starts_at)}
                    </Text>
                  </View>
                )}

                {p.ends_at && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Ends:</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(p.ends_at)}
                    </Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Threshold:</Text>
                  <Text style={styles.detailValue}>
                    {p.threshold} YES votes needed
                  </Text>
                </View>
              </View>

              <View style={styles.voteCounts}>
                <View style={styles.voteCountItem}>
                  <Text style={[styles.voteCountNumber, styles.yesText]}>
                    {vote_counts.yes_count}
                  </Text>
                  <Text style={styles.voteCountLabel}>Yes</Text>
                </View>
                <View style={styles.voteCountItem}>
                  <Text style={[styles.voteCountNumber, styles.maybeText]}>
                    {vote_counts.maybe_count}
                  </Text>
                  <Text style={styles.voteCountLabel}>Maybe</Text>
                </View>
                <View style={styles.voteCountItem}>
                  <Text style={[styles.voteCountNumber, styles.noText]}>
                    {vote_counts.no_count}
                  </Text>
                  <Text style={styles.voteCountLabel}>No</Text>
                </View>
              </View>

              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(
                          (vote_counts.yes_count / p.threshold) * 100,
                          100
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {vote_counts.yes_count}/{p.threshold} YES votes
                </Text>
              </View>

              {isVotingOpen ? (
                <>
                  <Text style={styles.votePrompt}>Cast your vote:</Text>

                  <View style={styles.voteButtons}>
                    <TouchableOpacity
                      style={getVoteButtonStyle("YES")}
                      onPress={() => handleVote("YES")}
                      disabled={loading}
                    >
                      {loading && selectedVote === "YES" ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Text
                          style={[
                            styles.buttonText,
                            my_vote === "YES" && styles.buttonTextSelected,
                          ]}
                        >
                          Yes
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={getVoteButtonStyle("MAYBE")}
                      onPress={() => handleVote("MAYBE")}
                      disabled={loading}
                    >
                      {loading && selectedVote === "MAYBE" ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Text
                          style={[
                            styles.buttonText,
                            my_vote === "MAYBE" && styles.buttonTextSelected,
                          ]}
                        >
                          Maybe
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={getVoteButtonStyle("NO")}
                      onPress={() => handleVote("NO")}
                      disabled={loading}
                    >
                      {loading && selectedVote === "NO" ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Text
                          style={[
                            styles.buttonText,
                            my_vote === "NO" && styles.buttonTextSelected,
                          ]}
                        >
                          No
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {my_vote && (
                    <Text style={styles.currentVote}>
                      Your current vote: {my_vote}
                    </Text>
                  )}

                  <Text style={styles.timeRemaining}>
                    {getTimeRemaining()}
                  </Text>
                </>
              ) : (
                <View style={styles.closedContainer}>
                  <Text style={styles.closedText}>Voting has ended</Text>
                  {my_vote && (
                    <Text style={styles.yourVoteText}>
                      You voted: {my_vote}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}
        </View>

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
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  closeButton: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    zIndex: 1,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 28,
    color: colors.text.tertiary,
    lineHeight: 28,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.sm,
    marginRight: spacing.lg,
  },
  description: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  detailsContainer: {
    backgroundColor: colors.surfaceLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.text.tertiary,
    width: 70,
  },
  detailValue: {
    fontSize: 13,
    color: colors.text.secondary,
    flex: 1,
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
  yesText: {
    color: colors.success,
  },
  maybeText: {
    color: colors.warning,
  },
  noText: {
    color: colors.error,
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
  votePrompt: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  voteButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  voteButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 2,
  },
  yesButton: {
    borderColor: colors.success,
    backgroundColor: "transparent",
  },
  yesButtonSelected: {
    backgroundColor: colors.success,
  },
  maybeButton: {
    borderColor: colors.warning,
    backgroundColor: "transparent",
  },
  maybeButtonSelected: {
    backgroundColor: colors.warning,
  },
  noButton: {
    borderColor: colors.error,
    backgroundColor: "transparent",
  },
  noButtonSelected: {
    backgroundColor: colors.error,
  },
  buttonLoading: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  buttonTextSelected: {
    color: colors.white,
  },
  currentVote: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  timeRemaining: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  closedContainer: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  closedText: {
    fontSize: 16,
    color: colors.text.tertiary,
    fontStyle: "italic",
  },
  yourVoteText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  celebrationContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    minHeight: 200,
  },
  celebrationEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  celebrationTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  celebrationSubtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    textAlign: "center",
  },
});

export default ProposalVoteModal;
