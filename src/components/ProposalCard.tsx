import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ProposalWithVotes, VoteValue } from "../services/proposalService";
import { colors, spacing, borderRadius, typography } from "../theme/theme";

interface ProposalCardProps {
  proposal: ProposalWithVotes;
  onPress: () => void;
  onVote: (vote: VoteValue) => void;
}

export const ProposalCard: React.FC<ProposalCardProps> = ({
  proposal,
  onPress,
  onVote,
}) => {
  const { proposal: p, vote_counts, my_vote, created_by_profile } = proposal;
  const isVotingOpen =
    p.status === "open" && !isPast(new Date(p.vote_window_ends_at));
  const thresholdMet = vote_counts.yes_count >= p.threshold;

  const getVoteButtonStyle = (vote: VoteValue) => {
    const isSelected = my_vote === vote;
    switch (vote) {
      case "YES":
        return [
          styles.voteButton,
          styles.yesButton,
          isSelected && styles.yesButtonSelected,
        ];
      case "MAYBE":
        return [
          styles.voteButton,
          styles.maybeButton,
          isSelected && styles.maybeButtonSelected,
        ];
      case "NO":
        return [
          styles.voteButton,
          styles.noButton,
          isSelected && styles.noButtonSelected,
        ];
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

  const getTimeRemaining = () => {
    const endDate = new Date(p.vote_window_ends_at);
    if (isPast(endDate)) {
      return "Voting closed";
    }
    return `${formatDistanceToNow(endDate)} left`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, thresholdMet && styles.containerTriggered]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {p.title}
        </Text>
        {thresholdMet && (
          <View style={styles.triggeredBadge}>
            <Text style={styles.triggeredText}>Event Created</Text>
          </View>
        )}
      </View>

      {p.description && (
        <Text style={styles.description} numberOfLines={2}>
          {p.description}
        </Text>
      )}

      {(p.starts_at || p.ends_at) && (
        <View style={styles.dateRow}>
          {p.starts_at && (
            <Text style={styles.dateText}>{formatDate(p.starts_at)}</Text>
          )}
          {p.starts_at && p.ends_at && (
            <Text style={styles.dateText}> - </Text>
          )}
          {p.ends_at && (
            <Text style={styles.dateText}>{formatDate(p.ends_at)}</Text>
          )}
        </View>
      )}

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
        <View style={styles.thresholdContainer}>
          <Text style={styles.thresholdText}>
            {vote_counts.yes_count}/{p.threshold} needed
          </Text>
        </View>
      </View>

      {isVotingOpen && (
        <>
          <View style={styles.voteButtons}>
            <TouchableOpacity
              style={getVoteButtonStyle("YES")}
              onPress={() => onVote("YES")}
            >
              <Text
                style={[
                  styles.voteButtonText,
                  my_vote === "YES" && styles.voteButtonTextSelected,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={getVoteButtonStyle("MAYBE")}
              onPress={() => onVote("MAYBE")}
            >
              <Text
                style={[
                  styles.voteButtonText,
                  my_vote === "MAYBE" && styles.voteButtonTextSelected,
                ]}
              >
                Maybe
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={getVoteButtonStyle("NO")}
              onPress={() => onVote("NO")}
            >
              <Text
                style={[
                  styles.voteButtonText,
                  my_vote === "NO" && styles.voteButtonTextSelected,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.timeRemaining}>{getTimeRemaining()}</Text>
        </>
      )}

      {!isVotingOpen && p.status !== "triggered" && (
        <Text style={styles.closedText}>Voting has ended</Text>
      )}

      <View style={styles.footer}>
        {created_by_profile && (
          <Text style={styles.createdBy}>
            by {created_by_profile.display_name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerTriggered: {
    borderColor: colors.success,
    borderWidth: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    flex: 1,
  },
  triggeredBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.xs,
  },
  triggeredText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  dateRow: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  dateText: {
    fontSize: 13,
    color: colors.text.tertiary,
  },
  voteCounts: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  voteCountItem: {
    alignItems: "center",
    marginRight: spacing.lg,
  },
  voteCountNumber: {
    fontSize: 20,
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
  thresholdContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  thresholdText: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  voteButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  voteButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
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
  voteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  voteButtonTextSelected: {
    color: colors.white,
  },
  timeRemaining: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  closedText: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
    fontStyle: "italic",
  },
  footer: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  createdBy: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
});

export default ProposalCard;
