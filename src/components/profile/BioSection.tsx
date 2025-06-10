import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { Profile } from '../../types';

interface BioSectionProps {
  profile: Profile;
}

export const BioSection: React.FC<BioSectionProps> = ({ profile }) => {
  if (!profile.bio) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>About</Text>
      <Text style={styles.bioText}>{profile.bio}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  bioText: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 24,
  },
}); 