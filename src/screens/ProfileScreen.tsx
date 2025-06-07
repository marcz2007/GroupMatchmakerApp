import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";
import { commonStyles } from "../theme/commonStyles";
import { borderRadius, colors, spacing, typography } from "../theme/theme";
import { shouldAnalyzeBio, updateAnalysisScores } from '../utils/aiAnalysis';

interface Profile {
  id: string;
  username: string;
  email: string;
  bio: string;
  interests: string[];
  avatar_url?: string;
  firstName?: string;
  lastName?: string;
  photos?: { url: string; order: number }[];
  enable_ai_analysis?: boolean;
  ai_analysis_scores?: {
    communicationStyle?: number;
    activityPreference?: number;
    socialDynamics?: number;
    lastUpdated?: string;
  };
  word_patterns?: {
    unigrams: string[];
    bigrams: string[];
    trigrams: string[];
    topWords: Array<{ word: string; score: number }>;
  };
}

type RootStackParamList = {
  PublicProfile: { userId: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [enableAIAnalysis, setEnableAIAnalysis] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Error", "Could not get user session.");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) {
        // If the error is because profile doesn't exist, create one
        if (error.code === "PGRST116") {
          // PostgreSQL error for "no rows returned"
          if (!user.email) {
            Alert.alert("Error", "User email is required to create a profile.");
            return;
          }

          // Create a default profile
          const defaultProfile = {
            id: user.id,
            username: "",
            bio: "",
            interests: [],
            created_at: new Date(),
            updated_at: new Date(),
            email: user.email,
          };

          const { error: insertError } = await supabase
            .from("profiles")
            .insert(defaultProfile);

          if (insertError) {
            Alert.alert(
              "Error",
              "Failed to create profile: " + insertError.message
            );
            return;
          }

          // Set the new profile
          setProfile(defaultProfile);
          setUsername("");
          setBio("");
          setInterests("");
          return;
        }

        // For other errors
        Alert.alert("Error", "Failed to fetch profile: " + error.message);
        console.error("Error fetching profile", error);
        return;
      }

      if (data) {
        setProfile(data);
        setUsername(data.username || "");
        setBio(data.bio || "");
        setInterests(data.interests ? data.interests.join(", ") : "");
        setAvatarUrl(data.avatar_url || null);
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        // Sort photos by order if they exist
        if (data.photos) {
          data.photos.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
        }
      }
    } catch (error) {
      console.error("Unexpected error:", error);
      Alert.alert(
        "Error",
        "An unexpected error occurred while fetching your profile."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    console.log('[handleSave] Starting save process...');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('[handleSave] User authentication error:', userError);
        Alert.alert("Error", "Could not get user session.");
        setIsSaving(false);
        return;
      }
      console.log('[handleSave] User authenticated successfully:', user.id);

      let newAvatarUrl: string | null | undefined = undefined;
      let newPhotos: { url: string; order: number }[] | undefined = undefined;

      if (selectedImage) {
        console.log('[handleSave] Processing new avatar image...');
        newAvatarUrl = await uploadImage(selectedImage);
        if (newAvatarUrl === null) {
          console.error('[handleSave] Failed to upload new avatar');
          Alert.alert(
            "Save Error",
            "Failed to upload new profile picture. Profile not saved."
          );
          setIsSaving(false);
          return;
        }
        console.log('[handleSave] New avatar uploaded successfully:', newAvatarUrl);
      }

      if (selectedPhotos.length > 0) {
        console.log('[handleSave] Processing new photos...');
        const uploadedPhotos = await uploadPhotos(selectedPhotos);
        if (uploadedPhotos.length === 0) {
          console.error('[handleSave] Failed to upload photos');
          Alert.alert(
            "Save Error",
            "Failed to upload photos. Profile not saved."
          );
          setIsSaving(false);
          return;
        }
        newPhotos = uploadedPhotos;
        console.log('[handleSave] New photos uploaded successfully:', uploadedPhotos.length);
      }

      const interestsArray = interests
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      // Check if we should analyze the bio
      const shouldAnalyze = shouldAnalyzeBio(
        bio,
        profile?.ai_analysis_scores?.lastUpdated
      );
      console.log('[handleSave] Bio analysis check:', {
        shouldAnalyze,
        enableAIAnalysis,
        bioLength: bio.length,
        lastUpdated: profile?.ai_analysis_scores?.lastUpdated,
        bio: bio // Log the actual bio content
      });

      const updates: Partial<Profile> & {
        updated_at: Date;
        id: string;
        avatar_url?: string | null;
        photos?: { url: string; order: number }[];
        enable_ai_analysis?: boolean;
      } = {
        id: user.id,
        username,
        bio,
        interests: interestsArray,
        updated_at: new Date(),
        firstName,
        lastName,
        enable_ai_analysis: enableAIAnalysis,
      };

      if (newAvatarUrl !== undefined) {
        updates.avatar_url = newAvatarUrl;
      }

      if (newPhotos !== undefined) {
        updates.photos = newPhotos;
      }

      console.log('[handleSave] Updating profile with data:', {
        id: updates.id,
        username: updates.username,
        bioLength: updates.bio?.length,
        interestsCount: updates.interests?.length,
        enableAIAnalysis: updates.enable_ai_analysis
      });

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error('[handleSave] Error updating profile:', updateError);
        Alert.alert("Error updating profile", updateError.message);
      } else {
        // If bio should be analyzed and AI analysis is enabled, trigger analysis
        if (shouldAnalyze && enableAIAnalysis) {
          console.log('[handleSave] Triggering AI analysis for bio...');
          try {
            console.log('[handleSave] Sending request to analyze-text function with payload:', {
              text: bio,
              type: 'bio'
            });
            
            const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-text', {
              body: { text: bio, type: 'bio' }
            });

            if (analysisError) {
              console.error('[handleSave] Error analyzing bio:', analysisError);
              Alert.alert(
                "Analysis Error",
                "There was an error analyzing your bio. Your profile was saved, but the analysis will be retried later."
              );
            } else if (analysisData) {
              console.log('[handleSave] Analysis successful, updating scores:', analysisData);
              await updateAnalysisScores(user.id, analysisData);
            }
          } catch (error) {
            console.error('[handleSave] Error in AI analysis:', error);
            Alert.alert(
              "Analysis Error",
              "There was an error analyzing your bio. Your profile was saved, but the analysis will be retried later."
            );
          }
        }

        Alert.alert("Success", "Profile updated successfully");
        if (newAvatarUrl !== undefined) {
          setAvatarUrl(newAvatarUrl);
        }
        if (newPhotos !== undefined) {
          setProfile((prevProfile) => ({ ...prevProfile!, photos: newPhotos }));
        }
        setProfile((prevProfile) => ({ ...prevProfile!, ...updates }));
        setSelectedImage(null);
        setSelectedPhotos([]);
        setEditing(false);
      }
    } catch (error: any) {
      console.error("[handleSave] Unexpected error:", error);
      Alert.alert("Error", "An unexpected error occurred during save.");
    } finally {
      setIsSaving(false);
      console.log('[handleSave] Save process completed');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Sorry, we need camera roll permissions to make this work!"
      );
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      console.log("Selected image asset:", result.assets[0]);
      setSelectedImage(result.assets[0]);
    }
  };

  const pickMultipleImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Sorry, we need camera roll permissions to make this work!"
      );
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setSelectedPhotos(result.assets);
    }
  };

  const uploadImage = async (
    asset: ImagePicker.ImagePickerAsset
  ): Promise<string | null> => {
    try {
      setUploading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert("Error", "User not authenticated for upload.");
        return null;
      }

      const arraybuffer = await fetch(asset.uri).then((res) =>
        res.arrayBuffer()
      );
      const fileExt = asset.uri?.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${Date.now()}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, arraybuffer, {
          contentType: asset.mimeType ?? `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) {
        console.error("Error uploading image:", uploadError);
        Alert.alert(
          "Upload Error",
          "Failed to upload image: " + uploadError.message
        );
        return null;
      }

      console.log("Upload successful:", data);

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      console.log("Public URL data:", urlData);

      if (!urlData?.publicUrl) {
        console.warn("Could not get public URL. Check bucket permissions/RLS.");
        return null;
      }

      return urlData.publicUrl;
    } catch (error: any) {
      console.error("Error in uploadImage function:", error);
      Alert.alert(
        "Upload Error",
        error?.message ?? "An unexpected error occurred during upload."
      );
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadPhotos = async (assets: ImagePicker.ImagePickerAsset[]): Promise<{ url: string; order: number }[]> => {
    try {
      setUploadingPhotos(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert("Error", "User not authenticated for upload.");
        return [];
      }

      const uploadedPhotos = [];
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const arraybuffer = await fetch(asset.uri).then((res) => res.arrayBuffer());
        const fileExt = asset.uri?.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/photos/${Date.now()}_${i}.${fileExt}`;

        const { data, error: uploadError } = await supabase.storage
          .from("photos")
          .upload(path, arraybuffer, {
            contentType: asset.mimeType ?? `image/${fileExt}`,
            upsert: true,
          });

        if (uploadError) {
          console.error("Error uploading photo:", uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("photos")
          .getPublicUrl(path);

        if (urlData?.publicUrl) {
          uploadedPhotos.push({ url: urlData.publicUrl, order: i });
        }
      }

      return uploadedPhotos;
    } catch (error: any) {
      console.error("Error in uploadPhotos function:", error);
      Alert.alert(
        "Upload Error",
        error?.message ?? "An unexpected error occurred during upload."
      );
      return [];
    } finally {
      setUploadingPhotos(false);
    }
  };

  const getTopUncommonWord = (wordPatterns?: Profile['word_patterns']): string | null => {
    if (!wordPatterns?.topWords?.length) return null;
    return wordPatterns.topWords[0]?.word || null;
  };

  const getCommunicationStyleDescription = (score?: number): string => {
    if (score === undefined) return "Not analyzed yet";
    if (score < 0.3) return "Formal and detailed";
    if (score < 0.6) return "Balanced and clear";
    return "Casual and concise";
  };

  const getActivityPreferenceDescription = (score?: number): string => {
    if (score === undefined) return "Not analyzed yet";
    if (score < 0.3) return "Prefers indoor activities";
    if (score < 0.6) return "Enjoys both indoor and outdoor";
    return "Prefers outdoor activities";
  };

  const getSocialDynamicsDescription = (score?: number): string => {
    if (score === undefined) return "Not analyzed yet";
    if (score < 0.3) return "Prefers smaller groups";
    if (score < 0.6) return "Comfortable in various group sizes";
    return "Enjoys larger social gatherings";
  };

  const handleViewPublicProfile = () => {
    if (profile?.id) {
      navigation.navigate('PublicProfile', { userId: profile.id });
    }
  };

  if (loading) {
    return (
      <View style={commonStyles.centeredContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (editing) {
    const displayUri = selectedImage?.uri || avatarUrl;

    return (
      <ScrollView style={commonStyles.container}>
        <Text style={commonStyles.title}>Edit Profile</Text>

        <View style={[commonStyles.section, { alignItems: 'center' }]}>
          <TouchableOpacity onPress={pickImages} style={styles.avatarContainer}>
            {displayUri ? (
              <Image
                source={{ uri: displayUri }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={[typography.body, { color: colors.text.secondary }]}>
                  Add Photo
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.uploadButton} onPress={pickImages}>
              <Text style={styles.uploadButtonText}>Change Photo</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          <TextInput
            style={commonStyles.searchInput}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
          />

          <TextInput
            style={commonStyles.searchInput}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First Name"
          />

          <TextInput
            style={commonStyles.searchInput}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last Name"
          />

          <TextInput
            style={commonStyles.multilineInput}
            value={bio}
            onChangeText={setBio}
            placeholder="Bio"
            multiline
            numberOfLines={4}
          />

          <TextInput
            style={commonStyles.searchInput}
            value={interests}
            onChangeText={setInterests}
            placeholder="e.g. art, movies, hiking"
          />

          <View style={commonStyles.protectedSection}>
            <Text style={commonStyles.protectedTitle}>AI Analysis</Text>
            <View style={commonStyles.protectedContent}>
              <View style={commonStyles.protectedItem}>
                <Text style={commonStyles.protectedLabel}>Enable AI Analysis</Text>
                <Switch
                  value={enableAIAnalysis}
                  onValueChange={setEnableAIAnalysis}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                When enabled, your chat messages and bio will be analyzed to help find better group matches.
                This helps us understand your communication style and preferences.
              </Text>
            </View>
          </View>

          <View style={styles.photoGallerySection}>
            <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>Profile Photos (up to 6)</Text>
            <View style={styles.photoGrid}>
              {profile?.photos?.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo.url }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => {
                      const newPhotos = [...(profile.photos || [])];
                      newPhotos.splice(index, 1);
                      setProfile(prev => prev ? { ...prev, photos: newPhotos } : null);
                    }}
                  >
                    <Text style={styles.removePhotoButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {(!profile?.photos || profile.photos.length < 6) && (
                <TouchableOpacity
                  style={styles.addPhotoButton}
                  onPress={pickMultipleImages}
                  disabled={uploadingPhotos}
                >
                  <Text style={styles.addPhotoButtonText}>+</Text>
                </TouchableOpacity>
              )}
            </View>
            {selectedPhotos.length > 0 && (
              <View style={styles.selectedPhotosPreview}>
                <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>
                  Selected Photos ({selectedPhotos.length})
                </Text>
                <ScrollView horizontal style={styles.selectedPhotosScroll}>
                  {selectedPhotos.map((photo, index) => (
                    <View key={index} style={styles.selectedPhotoContainer}>
                      <Image source={{ uri: photo.uri }} style={styles.selectedPhoto} />
                      <TouchableOpacity
                        style={styles.removeSelectedPhotoButton}
                        onPress={() => {
                          const newSelectedPhotos = [...selectedPhotos];
                          newSelectedPhotos.splice(index, 1);
                          setSelectedPhotos(newSelectedPhotos);
                        }}
                      >
                        <Text style={styles.removePhotoButtonText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={commonStyles.buttonContainer}>
            <TouchableOpacity
              style={[commonStyles.button, isSaving || uploading ? commonStyles.disabledButton : null]}
              onPress={handleSave}
              disabled={isSaving || uploading}
            >
              <Text style={commonStyles.buttonText}>
                {isSaving || uploading ? "Saving..." : "Save Changes"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[commonStyles.button, { backgroundColor: colors.border }]}
              onPress={() => {
                setEditing(false);
                setSelectedImage(null);
              }}
              disabled={isSaving || uploading}
            >
              <Text style={[commonStyles.buttonText, { color: colors.text.primary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={commonStyles.container}>
      <Text style={commonStyles.title}>Your Profile</Text>

      <View style={[commonStyles.section, { alignItems: 'center' }]}>
        <TouchableOpacity onPress={() => setEditing(true)} style={styles.avatarContainer}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={[typography.body, { color: colors.text.secondary }]}>
                Add Photo
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={commonStyles.protectedSection}>
          <Text style={commonStyles.protectedTitle}>Profile Information</Text>
          <View style={commonStyles.protectedContent}>
            <View style={commonStyles.protectedItem}>
              <Text style={commonStyles.protectedLabel}>Username</Text>
              <Text style={commonStyles.protectedValue}>{username || 'Not set'}</Text>
            </View>
            <View style={commonStyles.protectedItem}>
              <Text style={commonStyles.protectedLabel}>First Name</Text>
              <Text style={commonStyles.protectedValue}>{firstName || 'Not set'}</Text>
            </View>
            <View style={commonStyles.protectedItem}>
              <Text style={commonStyles.protectedLabel}>Last Name</Text>
              <Text style={commonStyles.protectedValue}>{lastName || 'Not set'}</Text>
            </View>
            <View style={[commonStyles.protectedItemMultiLine, { width: '100%' }]}>
              <Text style={[commonStyles.protectedLabel, { marginBottom: spacing.xs }]}>Bio</Text>
              <Text style={[typography.body]}>{bio || 'Not set'}</Text>
            </View>
            <View style={[commonStyles.protectedItemMultiLine, { width: '100%' }]}>
              <Text style={[commonStyles.protectedLabel, { marginBottom: spacing.xs }]}>Interests</Text>
              <Text style={[commonStyles.protectedValue]}>{interests || 'Not set'}</Text>
            </View>
          </View>
        </View>

        <View style={commonStyles.protectedSection}>
          <Text style={commonStyles.protectedTitle}>AI Analysis</Text>
          <View style={commonStyles.protectedContent}>
            <View style={commonStyles.protectedItem}>
              <Text style={commonStyles.protectedLabel}>Enable AI Analysis</Text>
              <Switch
                value={enableAIAnalysis}
                onValueChange={setEnableAIAnalysis}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
            <Text style={[typography.body, { color: colors.text.secondary }]}>
              When enabled, your chat messages and bio will be analyzed to help find better group matches.
              This helps us understand your communication style and preferences.
            </Text>
          </View>
        </View>

        <View style={styles.photoGallerySection}>
          <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>Photos</Text>
          {profile?.photos && profile.photos.length > 0 ? (
            <ScrollView horizontal style={styles.photoGallery}>
              {profile.photos.map((photo, index) => (
                <Image key={index} source={{ uri: photo.url }} style={styles.galleryPhoto} />
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.noPhotosText}>No photos added yet</Text>
          )}
        </View>

        <View style={styles.aiInsightsSection}>
          <Text style={commonStyles.protectedTitle}>AI Insights</Text>
          
          {profile?.enable_ai_analysis ? (
            <>
              {profile.word_patterns?.topWords && profile.word_patterns.topWords.length > 0 && (
                <View style={commonStyles.protectedItem}>
                  <Text style={commonStyles.protectedLabel}>Your signature word:</Text>
                  <Text style={commonStyles.protectedValue}>
                    "{getTopUncommonWord(profile.word_patterns)}"
                  </Text>
                </View>
              )}

              <View style={commonStyles.protectedItem}>
                <Text style={commonStyles.protectedLabel}>Communication Style:</Text>
                <Text style={commonStyles.protectedValue}>
                  {getCommunicationStyleDescription(profile?.ai_analysis_scores?.communicationStyle)}
                </Text>
              </View>

              <View style={commonStyles.protectedItem}>
                <Text style={commonStyles.protectedLabel}>Activity Preference:</Text>
                <Text style={commonStyles.protectedValue}>
                  {getActivityPreferenceDescription(profile?.ai_analysis_scores?.activityPreference)}
                </Text>
              </View>

              <View style={commonStyles.protectedItem}>
                <Text style={commonStyles.protectedLabel}>Social Dynamics:</Text>
                <Text style={commonStyles.protectedValue}>
                  {getSocialDynamicsDescription(profile?.ai_analysis_scores?.socialDynamics)}
                </Text>
              </View>

              {profile?.ai_analysis_scores?.lastUpdated && (
                <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm }]}>
                  Last updated: {new Date(profile.ai_analysis_scores.lastUpdated).toLocaleDateString()}
                </Text>
              )}
            </>
          ) : (
            <Text style={[typography.body, { color: colors.text.secondary, fontStyle: 'italic' }]}>
              Enable AI Analysis in Edit Profile to see insights about your communication style and preferences.
            </Text>
          )}
        </View>

        <View style={commonStyles.buttonContainer}>
          <TouchableOpacity
            style={commonStyles.button}
            onPress={() => setEditing(true)}
          >
            <Text style={commonStyles.buttonText}>Edit Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[commonStyles.button, { backgroundColor: colors.primary }]}
            onPress={handleViewPublicProfile}
          >
            <Text style={commonStyles.buttonText}>View Public Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[commonStyles.button, { backgroundColor: '#dc3545' }]}
            onPress={handleLogout}
          >
            <Text style={commonStyles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  avatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: spacing.sm,
  },
  avatarPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  uploadButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  uploadButtonText: {
    color: colors.white,
    fontWeight: 'bold',
  },
  photoGallerySection: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoContainer: {
    width: '30%',
    aspectRatio: 1,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#dc3545',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addPhotoButtonText: {
    fontSize: 32,
    color: colors.text.secondary,
  },
  selectedPhotosPreview: {
    marginTop: spacing.lg,
  },
  selectedPhotosScroll: {
    marginTop: spacing.sm,
  },
  selectedPhotoContainer: {
    width: 100,
    height: 100,
    marginRight: spacing.sm,
    position: 'relative',
  },
  selectedPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  removeSelectedPhotoButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#dc3545',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoGallery: {
    marginTop: spacing.sm,
  },
  galleryPhoto: {
    width: 200,
    height: 200,
    marginRight: spacing.sm,
    borderRadius: borderRadius.md,
  },
  noPhotosText: {
    color: colors.text.secondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  aiInsightsSection: {
    width: '100%',
    marginBottom: spacing.xl,
  },
});

export default ProfileScreen;
