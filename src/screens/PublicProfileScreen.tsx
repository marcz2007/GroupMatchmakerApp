import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { supabase } from '../supabase';
import { commonStyles } from '../theme/commonStyles';
import { borderRadius, colors, spacing, typography } from '../theme/theme';

const { width: screenWidth } = Dimensions.get('window');

type RootStackParamList = {
  PublicProfile: { userId: string };
};

type PublicProfileScreenRouteProp = RouteProp<RootStackParamList, 'PublicProfile'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface PublicProfile {
  id: string;
  username: string;
  firstName?: string;
  lastName?: string;
  bio: string;
  interests: string[];
  avatar_url?: string;
  photos?: { url: string; order: number }[];
  ai_analysis_scores?: {
    communicationStyle?: number;
    activityPreference?: number;
    socialDynamics?: number;
  };
  spotify_connected?: boolean;
  spotify_top_genres?: string[];
  spotify_top_artists?: Array<{
    name: string;
    image: string;
    spotify_url: string;
  }>;
  spotify_selected_playlist?: {
    id: string;
    name: string;
    description: string;
    image: string;
    spotify_url: string;
    owner: string;
    tracks_count: number;
  };
  visibility_settings?: {
    spotify: {
      top_artists: boolean;
      top_genres: boolean;
      selected_playlist: boolean;
    };
    photos: boolean;
    interests: boolean;
    ai_analysis: boolean;
  };
}

const PublicProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PublicProfileScreenRouteProp>();
  const { userId } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
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
            {profile.firstName}
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
            <Text style={styles.sectionTitle}>Personality Insights</Text>
            <View style={styles.insightsContainer}>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Communication Style</Text>
                <Text style={styles.insightValue}>
                  {getCommunicationStyleDescription(profile.ai_analysis_scores.communicationStyle)}
                </Text>
              </View>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Activity Preference</Text>
                <Text style={styles.insightValue}>
                  {getActivityPreferenceDescription(profile.ai_analysis_scores.activityPreference)}
                </Text>
              </View>
              <View style={styles.insightItem}>
                <Text style={styles.insightLabel}>Social Dynamics</Text>
                <Text style={styles.insightValue}>
                  {getSocialDynamicsDescription(profile.ai_analysis_scores.socialDynamics)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {profile.spotify_connected && profile.visibility_settings?.spotify && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Music Taste</Text>
            
            {profile.visibility_settings.spotify.top_genres && profile.spotify_top_genres && profile.spotify_top_genres.length > 0 && (
              <View style={styles.spotifySection}>
                <Text style={styles.spotifySectionTitle}>Top Genres</Text>
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
                <Text style={styles.spotifySectionTitle}>Top Artists</Text>
                <ScrollView horizontal style={styles.artistsContainer}>
                  {profile.spotify_top_artists.map((artist, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.artistCard}
                      onPress={() => Linking.openURL(artist.spotify_url)}
                    >
                      <Image source={{ uri: artist.image }} style={styles.artistImage} />
                      <Text style={styles.artistName} numberOfLines={1}>
                        {artist.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {profile.visibility_settings.spotify.selected_playlist && profile.spotify_selected_playlist && (
              <View style={styles.spotifySection}>
                <Text style={styles.spotifySectionTitle}>Featured Playlist</Text>
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
    color: colors.text.primary,
  },
  username: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  bioText: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 24,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  interestTag: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  interestText: {
    ...typography.body,
    color: colors.white,
  },
  insightsContainer: {
    gap: spacing.md,
  },
  insightItem: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightLabel: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  insightValue: {
    ...typography.body,
    color: colors.text.primary,
  },
  spotifySection: {
    marginBottom: spacing.lg,
  },
  spotifySectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
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
    fontSize: typography.body.fontSize,
  },
  artistsContainer: {
    marginTop: spacing.xs,
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
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginTop: spacing.xs,
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
    ...typography.sectionTitle,
    marginBottom: spacing.xs,
  },
  playlistDescription: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  playlistStats: {
    ...typography.caption,
    color: colors.text.secondary,
  },
});

export default PublicProfileScreen; 