import { Ionicons } from "@expo/vector-icons";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { AIAnalysisSection } from "../components/profile/AIAnalysisSection";
import { PlaylistSelector } from "../components/profile/PlaylistSelector";
import { RootStackParamList } from "../navigation/AppNavigator";
import { supabase } from "../supabase";
import { commonStyles } from "../theme/commonStyles";
import { borderRadius, colors, spacing, typography } from "../theme/theme";
import { Profile } from "../types";
import { shouldAnalyzeBio, updateAnalysisScores } from "../utils/aiAnalysis";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EditProfileScreenRouteProp = RouteProp<RootStackParamList, "EditProfile">;

// Update the Profile type to make visibility_settings optional
type ProfileWithOptionalSettings = Omit<Profile, "visibility_settings"> & {
  visibility_settings?: Profile["visibility_settings"];
};

const VisibilityToggle = ({
  isVisible,
  onToggle,
  label,
}: {
  isVisible: boolean;
  onToggle: () => void;
  label: string;
}) => (
  <TouchableOpacity style={styles.visibilityToggle} onPress={onToggle}>
    <Ionicons
      name={isVisible ? "eye" : "eye-off"}
      size={20}
      color={isVisible ? colors.primary : colors.text.secondary}
    />
    <Text
      style={[
        typography.caption,
        {
          color: isVisible ? colors.primary : colors.text.secondary,
          marginLeft: spacing.xs,
        },
      ]}
    >
      {isVisible ? "Public" : "Private"}
    </Text>
  </TouchableOpacity>
);

const SectionHeader = ({
  title,
  isVisible,
  onToggleVisibility,
}: {
  title: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
}) => (
  <View style={styles.sectionHeader}>
    <Text style={typography.sectionTitle}>{title}</Text>
    <VisibilityToggle
      isVisible={isVisible}
      onToggle={onToggleVisibility}
      label={title}
    />
  </View>
);

const EditProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditProfileScreenRouteProp>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [enableAIAnalysis, setEnableAIAnalysis] = useState(false);
  const [connectingSpotify, setConnectingSpotify] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [visibilitySettings, setVisibilitySettings] = useState<NonNullable<Profile["visibility_settings"]>>({
    spotify: {
      top_artists: true,
      top_genres: true,
      selected_playlist: true,
    },
    photos: true,
    interests: true,
    ai_analysis: false,
  });

  // Initialize form fields when profile changes
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || "");
      setFirstName(profile.firstName || "");
      setLastName(profile.lastName || "");
      setBio(profile.bio || "");
      setInterests(Array.isArray(profile.interests) ? profile.interests.join(", ") : "");
      setAvatarUrl(profile.avatar_url || null);
      setEnableAIAnalysis(profile.enable_ai_analysis || false);
      setVisibilitySettings(
        profile.visibility_settings || {
          spotify: {
            top_artists: true,
            top_genres: true,
            selected_playlist: true,
          },
          photos: true,
          interests: true,
          ai_analysis: false,
        }
      );
    }
  }, [profile]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      if (data) {
        const profileWithSettings = {
          ...data,
          visibility_settings: data.visibility_settings || {
            spotify: {
              top_artists: true,
              top_genres: true,
              selected_playlist: true,
            },
            photos: true,
            interests: true,
            ai_analysis: false,
          },
        } as Profile;
        setProfile(profileWithSettings);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert("Error", "Could not get user session.");
        setIsSaving(false);
        return;
      }

      let newAvatarUrl: string | null | undefined = undefined;
      let newPhotos: { url: string; order: number }[] | undefined = undefined;

      if (selectedImage) {
        newAvatarUrl = await uploadImage(selectedImage);
        if (newAvatarUrl === null) {
          Alert.alert("Save Error", "Failed to upload new profile picture. Profile not saved.");
          setIsSaving(false);
          return;
        }
      }

      if (selectedPhotos.length > 0) {
        const uploadedPhotos = await uploadPhotos(selectedPhotos);
        if (uploadedPhotos.length === 0) {
          Alert.alert("Save Error", "Failed to upload photos. Profile not saved.");
          setIsSaving(false);
          return;
        }
        newPhotos = uploadedPhotos;
      }

      const interestsArray = interests
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const shouldAnalyze = shouldAnalyzeBio(bio, profile?.ai_analysis_scores?.lastUpdated);

      const updates: Partial<Profile> & {
        updated_at: Date;
        id: string;
        avatar_url?: string | null;
        photos?: { url: string; order: number }[];
        enable_ai_analysis?: boolean;
        visibility_settings?: Profile["visibility_settings"];
      } = {
        id: user.id,
        username,
        bio,
        interests: interestsArray,
        updated_at: new Date(),
        firstName,
        lastName,
        enable_ai_analysis: enableAIAnalysis,
        visibility_settings: visibilitySettings,
      };

      if (newAvatarUrl !== undefined) {
        updates.avatar_url = newAvatarUrl;
      }

      if (newPhotos !== undefined) {
        updates.photos = newPhotos;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (updateError) {
        Alert.alert("Error updating profile", updateError.message);
      } else {
        if (shouldAnalyze && enableAIAnalysis) {
          try {
            const { data: analysisData, error: analysisError } = await supabase.functions.invoke("analyze-text", {
              body: { text: bio, type: "bio" },
            });

            if (analysisError) {
              Alert.alert(
                "Analysis Error",
                "There was an error analyzing your bio. Your profile was saved, but the analysis will be retried later."
              );
            } else if (analysisData) {
              await updateAnalysisScores(user.id, analysisData);
            }
          } catch (error) {
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
        navigation.goBack();
      }
    } catch (error: any) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "An unexpected error occurred during save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVisibilityChange = async (
    section: keyof NonNullable<Profile["visibility_settings"]>,
    subsection?: keyof NonNullable<Profile["visibility_settings"]>["spotify"]
  ) => {
    if (!profile) return;

    try {
      const newSettings = { ...profile.visibility_settings };
      if (!newSettings.spotify) {
        newSettings.spotify = {
          top_artists: true,
          top_genres: true,
          selected_playlist: true,
        };
      }

      if (subsection) {
        newSettings.spotify[subsection] = !newSettings.spotify[subsection];
      } else if (section === "spotify") {
        const currentState =
          newSettings.spotify.top_artists ||
          newSettings.spotify.top_genres ||
          newSettings.spotify.selected_playlist;
        newSettings.spotify = {
          top_artists: !currentState,
          top_genres: !currentState,
          selected_playlist: !currentState,
        };
      } else {
        (newSettings[section] as boolean) = !newSettings[section];
      }

      setVisibilitySettings(newSettings);
    } catch (error) {
      console.error("Error updating visibility:", error);
      Alert.alert("Error", "Failed to update visibility settings");
    }
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

  const uploadPhotos = async (
    assets: ImagePicker.ImagePickerAsset[]
  ): Promise<{ url: string; order: number }[]> => {
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
        const arraybuffer = await fetch(asset.uri).then((res) =>
          res.arrayBuffer()
        );
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

  const handleSelectPlaylist = async (playlistId: string) => {
    try {
      setLoadingPlaylists(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Error", "Could not get user session.");
        return;
      }

      const { error } = await supabase.functions.invoke("spotify-playlists", {
        method: "POST",
        body: { userId: user.id, action: "select_playlist", playlistId },
      });

      if (error) throw error;

      setShowPlaylistModal(false);
      fetchProfile(); // Refresh profile to show updated playlist
    } catch (error) {
      console.error("Error selecting playlist:", error);
      Alert.alert("Error", "Failed to select playlist. Please try again.");
    } finally {
      setLoadingPlaylists(false);
    }
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
        <Text>No profile data available</Text>
      </View>
    );
  }

  const displayUri = selectedImage?.uri || avatarUrl;

  return (
    <ScrollView style={commonStyles.container}>
      <View style={styles.editHeader}>
        <Text style={commonStyles.title}>Edit Profile</Text>
        <TouchableOpacity
          style={[commonStyles.button, { backgroundColor: colors.border }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={[commonStyles.buttonText, { color: colors.text.primary }]}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[commonStyles.section, { alignItems: "center" }]}>
        <TouchableOpacity onPress={pickImages} style={styles.avatarContainer}>
          {displayUri ? (
            <Image source={{ uri: displayUri }} style={styles.avatar} />
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

        <SectionHeader
          title="Basic Information"
          isVisible={true}
          onToggleVisibility={() => {}}
        />
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

        <SectionHeader
          title="Bio"
          isVisible={visibilitySettings.bio}
          onToggleVisibility={() => handleVisibilityChange("bio")}
        />
        <TextInput
          style={commonStyles.multilineInput}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell us about yourself..."
          multiline
          numberOfLines={4}
        />

        <SectionHeader
          title="Interests"
          isVisible={visibilitySettings.interests}
          onToggleVisibility={() => handleVisibilityChange("interests")}
        />
        <TextInput
          style={commonStyles.searchInput}
          value={interests}
          onChangeText={setInterests}
          placeholder="e.g. art, movies, hiking"
        />

        <SectionHeader
          title="AI Analysis"
          isVisible={visibilitySettings.ai_analysis}
          onToggleVisibility={() => handleVisibilityChange("ai_analysis")}
        />
        <View style={commonStyles.protectedContent}>
          <AIAnalysisSection
            enabled={enableAIAnalysis}
            onToggle={setEnableAIAnalysis}
          />
        </View>

        <SectionHeader
          title="Music Taste"
          isVisible={
            visibilitySettings.spotify.top_artists ||
            visibilitySettings.spotify.top_genres ||
            visibilitySettings.spotify.selected_playlist
          }
          onToggleVisibility={() => handleVisibilityChange("spotify")}
        />
        <View style={commonStyles.protectedContent}>
          {profile?.spotify_connected && (
            <PlaylistSelector
              onSelect={handleSelectPlaylist}
              isLoading={loadingPlaylists}
              selectedPlaylist={profile.spotify_selected_playlist}
            />
          )}
        </View>

        <View style={styles.photoGallerySection}>
          <SectionHeader
            title="Profile Photos"
            isVisible={visibilitySettings.photos}
            onToggleVisibility={() => handleVisibilityChange("photos")}
          />
          <View style={styles.photoGrid}>
            {profile?.photos?.map((photo, index) => (
              <View key={index} style={styles.photoContainer}>
                <Image source={{ uri: photo.url }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.removePhotoButton}
                  onPress={() => {
                    const newPhotos = [...(profile.photos || [])];
                    newPhotos.splice(index, 1);
                    setProfile((prev) =>
                      prev ? { ...prev, photos: newPhotos } : null
                    );
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
        </View>

        <View style={commonStyles.buttonContainer}>
          <TouchableOpacity
            style={[
              commonStyles.button,
              isSaving || uploading ? commonStyles.disabledButton : null,
            ]}
            onPress={handleSave}
            disabled={isSaving || uploading}
          >
            <Text style={commonStyles.buttonText}>
              {isSaving || uploading ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  avatarContainer: {
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
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
    fontWeight: "bold",
  },
  photoGallerySection: {
    width: "100%",
    marginBottom: spacing.xl,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  photoContainer: {
    width: "30%",
    aspectRatio: 1,
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
    borderRadius: borderRadius.md,
  },
  removePhotoButton: {
    position: "absolute",
    top: -10,
    right: -10,
    backgroundColor: "#dc3545",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  removePhotoButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "bold",
  },
  addPhotoButton: {
    width: "30%",
    aspectRatio: 1,
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  addPhotoButtonText: {
    fontSize: 32,
    color: colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    width: "100%",
  },
  visibilityToggle: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
  },
  editHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

export default EditProfileScreen;
