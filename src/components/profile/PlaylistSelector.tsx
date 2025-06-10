import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface PlaylistSelectorProps {
  onSelect: () => void;
  isLoading: boolean;
  selectedPlaylist?: {
    name: string;
    description: string;
    image: string;
    spotify_url: string;
    owner: string;
    tracks_count: number;
  };
}

export const PlaylistSelector: React.FC<PlaylistSelectorProps> = ({
  onSelect,
  isLoading,
  selectedPlaylist,
}) => {
  return (
    <View style={styles.container}>
      {selectedPlaylist ? (
        <TouchableOpacity
          style={styles.playlistCard}
          onPress={() => Linking.openURL(selectedPlaylist.spotify_url)}
        >
          <Image
            source={{ uri: selectedPlaylist.image }}
            style={styles.playlistImage}
          />
          <View style={styles.playlistInfo}>
            <Text style={styles.playlistName}>
              {selectedPlaylist.name}
            </Text>
            <Text style={styles.playlistDescription} numberOfLines={2}>
              {selectedPlaylist.description}
            </Text>
            <Text style={styles.playlistStats}>
              {selectedPlaylist.tracks_count} tracks • By{" "}
              {selectedPlaylist.owner}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <Text style={styles.noPlaylistText}>No playlist selected</Text>
      )}
      <TouchableOpacity
        style={styles.selectButton}
        onPress={onSelect}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? "Loading..." : "Select Playlist"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  playlistCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: spacing.sm,
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
  noPlaylistText: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  selectButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.subtitle,
    color: '#FFFFFF',
  },
}); 