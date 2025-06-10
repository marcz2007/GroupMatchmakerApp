import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface AIAnalysisSectionProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
}

export const AIAnalysisSection: React.FC<AIAnalysisSectionProps> = ({
  enabled,
  onToggle,
}) => {
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
      <Text style={styles.description}>
        When enabled, your chat messages and bio will be analyzed to help find better group matches. This helps us understand your communication style and preferences.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  description: {
    ...typography.body,
    color: colors.text.secondary,
  },
}); 