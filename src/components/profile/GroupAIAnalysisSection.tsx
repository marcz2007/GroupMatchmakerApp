import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

interface GroupAIAnalysisSectionProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  memberCount?: number;
  hasMessages?: boolean;
  messageCount?: number;
}

export const GroupAIAnalysisSection: React.FC<GroupAIAnalysisSectionProps> = ({
  enabled,
  onToggle,
  memberCount = 0,
  hasMessages = false,
  messageCount = 0,
}) => {
  const MIN_MESSAGES = 5;

  const getStatusMessage = () => {
    if (!enabled) {
      return "Enable AI analysis to get insights about group communication patterns and help find better matches for group members.";
    }

    if (memberCount === 0) {
      return "✅ AI analysis is enabled! Add members to this group to start analyzing communication patterns.";
    }

    if (!hasMessages || messageCount < MIN_MESSAGES) {
      return `💬 Encourage group members to send more messages (at least ${MIN_MESSAGES} messages total) to enable AI analysis of communication styles.`;
    }

    return "✅ AI analysis is active! Group communication patterns are being analyzed for better matching.";
  };

  const getRequirementsList = () => {
    if (!enabled) return null;

    return (
      <View style={styles.requirementsContainer}>
        <Text style={styles.requirementsTitle}>How it works:</Text>
        <Text style={styles.requirementText}>
          • Messages sent in this group will be analyzed for communication
          patterns
        </Text>
        <Text style={styles.requirementText}>
          • Analysis helps match group members with compatible people
        </Text>
        <Text style={styles.requirementText}>
          • Only works when both users and groups have AI analysis enabled
        </Text>
        <Text style={styles.requirementText}>
          • Requires at least {MIN_MESSAGES} messages total to generate insights
        </Text>
        {hasMessages && (
          <Text style={styles.requirementText}>
            • Current message count: {messageCount}/{MIN_MESSAGES}
          </Text>
        )}
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
          💡 Encourage group members to enable AI analysis in their profiles and
          send messages to get the most out of this feature.
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
  requirementText: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  note: {
    ...typography.caption,
    color: colors.text.secondary,
    fontStyle: "italic",
    marginTop: spacing.sm,
  },
});
