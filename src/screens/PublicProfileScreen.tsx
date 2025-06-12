import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { supabase } from '../supabase';
import { commonStyles } from '../theme/commonStyles';
import { borderRadius, colors, spacing, typography } from '../theme/theme';
import { Profile } from '../types';

const { width: screenWidth } = Dimensions.get('window');

type RootStackParamList = {
  PublicProfile: { userId: string };
};

type PublicProfileScreenRouteProp = RouteProp<RootStackParamList, 'PublicProfile'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const PublicProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PublicProfileScreenRouteProp>();
  const { userId } = route.params;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        throw error;
      }

      if (data) {
        // Sort photos by order if they exist
        if (data.photos) {
          data.photos.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
        }
        setProfile(data);
      }
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCommunicationStyleDescription = (score?: number): string => {
    if (score === undefined) return "Not analyzed";
    if (score < 0.3) return "Formal and detailed";
    if (score < 0.6) return "Balanced and clear";
    return "Casual and concise";
  };

  const getActivityPreferenceDescription = (score?: number): string => {
    if (score === undefined) return "Not analyzed";
    if (score < 0.3) return "Prefers indoor activities";
    if (score < 0.6) return "Enjoys both indoor and outdoor";
    return "Prefers outdoor activities";
  };

  const getSocialDynamicsDescription = (score?: number): string => {
    if (score === undefined) return "Not analyzed";
    if (score < 0.3) return "Prefers smaller groups";
    if (score < 0.6) return "Comfortable in various group sizes";
    return "Enjoys larger social gatherings";
  };

  if (loading) {
    return (
      <View style={commonStyles.centeredContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={commonStyles.centeredContainer}>
        <Text style={typography.body}>Profile not found</Text>
      </View>
    );
  }

  // Combine avatar and photos for the gallery
  const allPhotos = [
    { url: profile.avatar_url || '', order: -1 }, // Avatar as first photo
    ...(profile.photos || []),
  ].filter(photo => photo.url); // Filter out any empty URLs

  return (
    <ScrollView style={styles.container}>
      {profile.visibility_settings?.photos && allPhotos.length > 0 ? (
        <ScrollView 
          horizontal 
          pagingEnabled 
          showsHorizontalScrollIndicator={false}
          style={styles.galleryContainer}
        >
          {allPhotos.map((photo, index) => (
            <View key={index} style={styles.galleryItem}>
              <Image
                source={{ uri: photo.url }}
                style={styles.galleryImage}
                resizeMode="cover"
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.galleryItem, { backgroundColor: colors.border }]}>
          <Text style={[typography.body, { color: colors.text.secondary }]}>
            No photos available
          </Text>
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.nameContainer}>
          <Text style={styles.name}>
            {profile.first_name}
          </Text>
        </View>

        {profile.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {profile.visibility_settings?.interests && profile.interests && profile.interests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interests</Text>
            <View style={styles.interestsContainer}>
              {profile.interests.map((interest, index) => (
                <View key={index} style={styles.interestTag}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {profile.visibility_settings?.ai_analysis && profile.ai_analysis_scores && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Analysis</Text>
            <View style={styles.analysisContainer}>
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Communication Style</Text>
                <Text style={styles.analysisValue}>
                  {getCommunicationStyleDescription(profile.ai_analysis_scores.communicationStyle)}
                </Text>
              </View>
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Activity Preference</Text>
                <Text style={styles.analysisValue}>
                  {getActivityPreferenceDescription(profile.ai_analysis_scores.activityPreference)}
                </Text>
              </View>
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Social Dynamics</Text>
                <Text style={styles.analysisValue}>
                  {getSocialDynamicsDescription(profile.ai_analysis_scores.socialDynamics)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {profile.visibility_settings?.spotify && profile.spotify_connected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Music Taste</Text>
            
            {profile.visibility_settings.spotify.top_genres && profile.spotify_top_genres && profile.spotify_top_genres.length > 0 && (
              <View style={styles.spotifySection}>
                <Text style={styles.subsectionTitle}>Top Genres</Text>
                <View style={styles.genresContainer}>
                  {profile.spotify_top_genres.map((genre, index) => (
                    <View key={index} style={styles.genreTag}>
                      <Text style={styles.genreText}>{genre}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {profile.visibility_settings.spotify.top_artists && profile.spotify_top_artists && profile.spotify_top_artists.length > 0 && (
              <View style={styles.spotifySection}>
                <Text style={styles.subsectionTitle}>Top Artists</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {profile.spotify_top_artists.map((artist, index) => (
                    <View key={index} style={styles.artistCard}>
                      <Image source={{ uri: artist.image }} style={styles.artistImage} />
                      <Text style={styles.artistName}>{artist.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {profile.visibility_settings.spotify.selected_playlist && profile.spotify_selected_playlist && (
              <View style={styles.spotifySection}>
                <Text style={styles.subsectionTitle}>Featured Playlist</Text>
                <View style={styles.playlistCard}>
                  <Image
                    source={{ uri: profile.spotify_selected_playlist.image }}
                    style={styles.playlistImage}
                  />
                  <View style={styles.playlistInfo}>
                    <Text style={styles.playlistName} numberOfLines={1}>
                      {profile.spotify_selected_playlist.name}
                    </Text>
                    <Text style={styles.playlistDescription} numberOfLines={2}>
                      {profile.spotify_selected_playlist.description}
                    </Text>
                    <Text style={styles.playlistStats}>
                      {profile.spotify_selected_playlist.tracks_count} tracks • By{' '}
                      {profile.spotify_selected_playlist.owner}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  galleryContainer: {
    height: screenWidth,
  },
  galleryItem: {
    width: screenWidth,
    height: screenWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  contentContainer: {
    padding: spacing.lg,
  },
  nameContainer: {
    marginBottom: spacing.lg,
  },
  name: {
    ...typography.title,
    marginBottom: spacing.xs,
  },
  username: {
    ...typography.body,
    color: colors.text.secondary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    marginBottom: spacing.sm,
  },
  bioText: {
    ...typography.body,
    lineHeight: 24,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  interestTag: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  interestText: {
    color: colors.white,
    ...typography.body,
  },
  analysisContainer: {
    gap: spacing.md,
  },
  analysisItem: {
    backgroundColor: colors.border,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  analysisLabel: {
    ...typography.body,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  analysisValue: {
    ...typography.body,
    color: colors.text.secondary,
  },
  spotifySection: {
    marginBottom: spacing.xl,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    elevation: 4,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  subsectionTitle: {
    ...typography.body,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  genreTag: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  genreText: {
    color: colors.white,
    ...typography.body,
  },
  artistCard: {
    width: 120,
    marginRight: spacing.sm,
    alignItems: 'center',
  },
  artistImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: spacing.xs,
  },
  artistName: {
    ...typography.body,
    textAlign: 'center',
  },
  playlistCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginTop: spacing.md,
    elevation: 2,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  playlistImage: {
    width: 200,
    height: 200,
  },
  playlistInfo: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  playlistName: {
    ...typography.title,
    marginBottom: spacing.sm,
    fontSize: 24,
  },
  playlistDescription: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    lineHeight: 24,
    fontSize: 16,
  },
  playlistStats: {
    ...typography.caption,
    color: colors.text.secondary,
    fontSize: 14,
  },
});

export default PublicProfileScreen; 