import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { Profile } from '../../types';
import { VisibilityToggle } from './VisibilityToggle';

interface SpotifySectionProps {
  profile: Profile;
  onVisibilityChange: (section: keyof NonNullable<Profile['visibility_settings']>, subsection?: keyof NonNullable<Profile['visibility_settings']>['spotify']) => void;
}

export const SpotifySection: React.FC<SpotifySectionProps> = ({ profile, onVisibilityChange }) => {
  if (!profile.spotify_connected) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <VisibilityToggle 
          isVisible={profile.visibility_settings?.spotify?.top_artists || 
                    profile.visibility_settings?.spotify?.top_genres || 
                    profile.visibility_settings?.spotify?.selected_playlist}
          onToggle={() => onVisibilityChange('spotify')}
          label="Music Taste"
        />
      </View>
      
      {profile.visibility_settings?.spotify?.top_genres && profile.spotify_top_genres && (
        <View style={styles.spotifySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Genres</Text>
            <VisibilityToggle 
              isVisible={profile.visibility_settings.spotify.top_genres}
              onToggle={() => onVisibilityChange('spotify', 'top_genres')}
              label="Genres"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresContainer}
          >
            {profile.spotify_top_genres.map((genre, index) => (
              <View key={index} style={styles.genreTag}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {profile.visibility_settings?.spotify?.top_artists && profile.spotify_top_artists && (
        <View style={styles.spotifySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Artists</Text>
            <VisibilityToggle 
              isVisible={profile.visibility_settings.spotify.top_artists}
              onToggle={() => onVisibilityChange('spotify', 'top_artists')}
              label="Artists"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.artistsContainer}
          >
            {profile.spotify_top_artists.map((artist, index) => (
              <TouchableOpacity
                key={index}
                style={styles.artistCard}
                onPress={() => Linking.openURL(artist.spotify_url)}
              >
                <Image
                  source={{ uri: artist.image }}
                  style={styles.artistImage}
                />
                <Text style={styles.artistName} numberOfLines={1}>
                  {artist.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {profile.visibility_settings?.spotify?.selected_playlist && profile.spotify_selected_playlist && (
        <View style={styles.spotifySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Playlist</Text>
            <VisibilityToggle 
              isVisible={profile.visibility_settings.spotify.selected_playlist}
              onToggle={() => onVisibilityChange('spotify', 'selected_playlist')}
              label="Playlist"
            />
          </View>
          <TouchableOpacity
            style={styles.playlistCard}
            onPress={() => Linking.openURL(profile.spotify_selected_playlist.spotify_url)}
          >
            <Image
              source={{ uri: profile.spotify_selected_playlist.image }}
              style={styles.playlistImage}
            />
            <View style={styles.playlistInfo}>
              <Text style={styles.playlistName}>
                {profile.spotify_selected_playlist.name}
              </Text>
              <Text style={styles.playlistDescription} numberOfLines={2}>
                {profile.spotify_selected_playlist.description}
              </Text>
              <Text style={styles.playlistStats}>
                {profile.spotify_selected_playlist.tracks_count} tracks • By{" "}
                {profile.spotify_selected_playlist.owner}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
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
  spotifySection: {
    marginTop: spacing.md,
  },
  genresContainer: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  genreTag: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginRight: spacing.xs,
  },
  genreText: {
    ...typography.caption,
    color: colors.text.primary,
  },
  artistsContainer: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  artistCard: {
    width: 120,
    marginRight: spacing.sm,
  },
  artistImage: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  artistName: {
    ...typography.caption,
    color: colors.text.primary,
    textAlign: 'center',
  },
  playlistCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginHorizontal: spacing.sm,
  },
  playlistImage: {
    width: 120,
    height: 120,
  },
  playlistInfo: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: 'center',
  },
  playlistName: {
    ...typography.subtitle,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  playlistDescription: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  playlistStats: {
    ...typography.caption,
    color: colors.text.secondary,
  },
}); 