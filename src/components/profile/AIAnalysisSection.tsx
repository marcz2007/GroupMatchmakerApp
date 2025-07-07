import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

interface AIAnalysisSectionProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  hasBio?: boolean;
  bioLength?: number;
  hasMessages?: boolean;
  messageCount?: number;
  hasAnalysis?: boolean;
}

export const AIAnalysisSection: React.FC<AIAnalysisSectionProps> = ({
  enabled,
  onToggle,
  hasBio = false,
  bioLength = 0,
  hasMessages = false,
  messageCount = 0,
  hasAnalysis = false,
}) => {
  const MIN_BIO_LENGTH = 100;
  const MIN_MESSAGES = 5;

  const getStatusMessage = () => {
    if (!enabled) {
      return "Enable AI analysis to get personalized insights about your communication style and preferences.";
    }

    if (hasAnalysis) {
      return "✅ AI analysis is active! Your communication patterns have been analyzed and are being used for better group matching.";
    }

    if (!hasBio || bioLength < MIN_BIO_LENGTH) {
      return `📝 Add a longer bio (at least ${MIN_BIO_LENGTH} characters) to get started with AI analysis.`;
    }

    if (!hasMessages || messageCount < MIN_MESSAGES) {
      return `💬 Send more messages in groups (at least ${MIN_MESSAGES} messages) to enable AI analysis of your communication style.`;
    }

    return "⏳ AI analysis is processing your data. This may take a few minutes...";
  };

  const getRequirementsList = () => {
    if (!enabled) return null;

    return (
      <View style={styles.requirementsContainer}>
        <Text style={styles.requirementsTitle}>
          Requirements for AI Analysis:
        </Text>
        <View style={styles.requirementItem}>
          <Text
            style={[
              styles.requirementText,
              hasBio && bioLength >= MIN_BIO_LENGTH && styles.requirementMet,
            ]}
          >
            {hasBio && bioLength >= MIN_BIO_LENGTH ? "✅" : "⭕"} Bio with at
            least {MIN_BIO_LENGTH} characters
          </Text>
          <Text style={styles.requirementDetail}>
            {hasBio
              ? `${bioLength}/${MIN_BIO_LENGTH} characters`
              : "Add a detailed bio"}
          </Text>
        </View>
        <View style={styles.requirementItem}>
          <Text
            style={[
              styles.requirementText,
              hasMessages &&
                messageCount >= MIN_MESSAGES &&
                styles.requirementMet,
            ]}
          >
            {hasMessages && messageCount >= MIN_MESSAGES ? "✅" : "⭕"} At least{" "}
            {MIN_MESSAGES} group messages
          </Text>
          <Text style={styles.requirementDetail}>
            {hasMessages
              ? `${messageCount}/${MIN_MESSAGES} messages`
              : "Send messages in groups"}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Analysis</Text>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: colors.secondary, true: colors.primary }}
          thumbColor={colors.background}
        />
      </View>

      <Text style={styles.description}>{getStatusMessage()}</Text>

      {getRequirementsList()}

      {enabled && (
        <Text style={styles.note}>
          💡 AI analysis helps match you with compatible group members based on
          your communication style, activity preferences, and social dynamics.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  requirementsContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  requirementsTitle: {
    ...typography.body,
    fontWeight: "bold",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  requirementItem: {
    marginBottom: spacing.xs,
  },
  requirementText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  requirementMet: {
    color: colors.primary,
    fontWeight: "bold",
  },
  requirementDetail: {
    ...typography.caption,
    color: colors.text.secondary,
    marginLeft: spacing.sm,
  },
  note: {
    ...typography.caption,
    color: colors.text.secondary,
    fontStyle: "italic",
    marginTop: spacing.sm,
  },
});
