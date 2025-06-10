import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface ProfileActionsProps {
  onViewPublic: () => void;
  onEditProfile: () => void;
}

export const ProfileActions: React.FC<ProfileActionsProps> = ({
  onViewPublic,
  onEditProfile,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.viewPublicButton]}
        onPress={onViewPublic}
      >
        <Text style={styles.buttonText}>View Public Profile</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.editProfileButton]}
        onPress={onEditProfile}
      >
        <Text style={styles.buttonText}>Edit Profile</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewPublicButton: {
    backgroundColor: colors.primary,
  },
  editProfileButton: {
    backgroundColor: colors.secondary,
  },
  buttonText: {
    ...typography.subtitle,
    color: '#FFFFFF',
  },
}); 