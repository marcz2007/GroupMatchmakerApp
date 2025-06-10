import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { Profile } from '../../types';
import { VisibilityToggle } from './VisibilityToggle';

interface InterestsSectionProps {
  profile: Profile;
  onVisibilityChange: (section: keyof NonNullable<Profile['visibility_settings']>) => void;
}

export const InterestsSection: React.FC<InterestsSectionProps> = ({ profile, onVisibilityChange }) => {
  if (!profile.interests || profile.interests.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Interests</Text>
        <VisibilityToggle 
          isVisible={profile.visibility_settings.interests}
          onToggle={() => onVisibilityChange('interests')}
          label="Interests"
        />
      </View>

      <View style={styles.interestsContainer}>
        {profile.interests.map((interest, index) => (
          <View key={index} style={styles.interestTag}>
            <Text style={styles.interestText}>{interest}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  interestTag: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  interestText: {
    ...typography.caption,
    color: colors.text.primary,
  },
}); 