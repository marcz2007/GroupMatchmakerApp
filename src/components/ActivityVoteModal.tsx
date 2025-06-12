import React from "react";
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";
import { colors, spacing, typography } from "../theme/theme";

interface ActivityVoteModalProps {
  visible: boolean;
  onClose: () => void;
  suggestion: {
    id: string;
    suggestion: string;
    suggested_date?: string;
    location?: string;
  };
}

const ActivityVoteModal = ({
  visible,
  onClose,
  suggestion,
}: ActivityVoteModalProps) => {
  const handleVote = async (vote: "yes" | "no" | "maybe") => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("activity_suggestion_votes")
        .insert({
          suggestion_id: suggestion.id,
          user_id: user.id,
          vote,
        });

      if (error) throw error;

      onClose();
    } catch (error: any) {
      console.error("Error submitting vote:", error);
      Alert.alert("Error", "Failed to submit vote");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Vote on Activity</Text>

          <View style={styles.suggestionContainer}>
            <Text style={styles.suggestionText}>{suggestion.suggestion}</Text>

            {suggestion.suggested_date && (
              <Text style={styles.detailText}>
                📅 {new Date(suggestion.suggested_date).toLocaleDateString()}
              </Text>
            )}

            {suggestion.location && (
              <Text style={styles.detailText}>📍 {suggestion.location}</Text>
            )}
          </View>

          <Text style={styles.votePrompt}>
            Would you like to participate in this activity?
          </Text>

          <View style={styles.voteButtons}>
            <TouchableOpacity
              style={[styles.voteButton, styles.yesButton]}
              onPress={() => handleVote("yes")}
            >
              <Text style={styles.buttonText}>Yes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.voteButton, styles.maybeButton]}
              onPress={() => handleVote("maybe")}
            >
              <Text style={styles.buttonText}>Maybe</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.voteButton, styles.noButton]}
              onPress={() => handleVote("no")}
            >
              <Text style={styles.buttonText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: spacing.lg,
    width: "90%",
    maxWidth: 500,
  },
  modalTitle: {
    ...typography.title,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  suggestionContainer: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  suggestionText: {
    ...typography.body,
    fontSize: 18,
    marginBottom: spacing.sm,
  },
  detailText: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  votePrompt: {
    ...typography.body,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  voteButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  voteButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  yesButton: {
    backgroundColor: "#4CAF50",
  },
  maybeButton: {
    backgroundColor: "#FFC107",
  },
  noButton: {
    backgroundColor: "#F44336",
  },
  buttonText: {
    ...typography.body,
    color: colors.white,
    fontWeight: "bold",
  },
});

export default ActivityVoteModal;
