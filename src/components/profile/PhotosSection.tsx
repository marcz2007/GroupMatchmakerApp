import React from 'react';
import { Dimensions, Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { Profile } from '../../types';
import { VisibilityToggle } from './VisibilityToggle';

interface PhotosSectionProps {
  profile: Profile;
  onVisibilityChange: (section: keyof NonNullable<Profile['visibility_settings']>) => void;
}

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.md * 3) / 2;

export const PhotosSection: React.FC<PhotosSectionProps> = ({ profile, onVisibilityChange }) => {
  if (!profile.photos || profile.photos.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <VisibilityToggle 
          isVisible={profile.visibility_settings.photos}
          onToggle={() => onVisibilityChange('photos')}
          label="Photos"
        />
      </View>

      <View style={styles.photosContainer}>
        {profile.photos.map((photo, index) => (
          <Image
            key={index}
            source={{ uri: photo.url }}
            style={styles.photo}
          />
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
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
  },
}); 