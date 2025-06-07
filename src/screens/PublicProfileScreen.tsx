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
      {allPhotos.length > 0 ? (
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
            {profile.firstName} {profile.lastName}
          </Text>
          <Text style={styles.username}>@{profile.username}</Text>
        </View>

        {profile.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{profile.bio}</Text>
          </View>
        )}

        {profile.interests && profile.interests.length > 0 && (
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

        {profile.ai_analysis_scores && (
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
});

export default PublicProfileScreen; 