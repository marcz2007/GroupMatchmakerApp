import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { AIAnalysisSection } from '../components/profile/AIAnalysisSection';
import { InterestsSection } from '../components/profile/InterestsSection';
import { PlaylistSelector } from '../components/profile/PlaylistSelector';
import { ProfileActions } from '../components/profile/ProfileActions';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { RootStackParamList } from "../navigation/AppNavigator";
import { supabase } from "../supabase";
import { commonStyles } from "../theme/commonStyles";
import { borderRadius, colors, spacing, typography } from "../theme/theme";
import { Profile } from '../types';
import { shouldAnalyzeBio, updateAnalysisScores } from "../utils/aiAnalysis";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProfileScreenRouteProp = RouteProp<RootStackParamList, "Profile">;

// Update the Profile type to make visibility_settings optional
type ProfileWithOptionalSettings = Omit<Profile, 'visibility_settings'> & {
  visibility_settings?: Profile['visibility_settings'];
};

const VisibilityToggle = ({ 
  isVisible, 
  onToggle, 
  label 
}: { 
  isVisible: boolean; 
  onToggle: () => void; 
  label: string;
}) => (
  <TouchableOpacity 
    style={styles.visibilityToggle} 
    onPress={onToggle}
  >
    <Ionicons 
      name={isVisible ? "eye" : "eye-off"} 
      size={20} 
      color={isVisible ? colors.primary : colors.text.secondary} 
    />
    <Text style={[
      typography.caption,
      { 
        color: isVisible ? colors.primary : colors.text.secondary,
        marginLeft: spacing.xs
      }
    ]}>
      {isVisible ? "Public" : "Private"}
    </Text>
  </TouchableOpacity>
);

const SectionHeader = ({ 
  title, 
  isVisible, 
  onToggleVisibility 
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

const ProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProfileScreenRouteProp>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
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
  const [visibilitySettings, setVisibilitySettings] = useState<NonNullable<Profile['visibility_settings']>>({
    spotify: {
      top_artists: true,
      top_genres: true,
      selected_playlist: true
    },
    photos: true,
    interests: true,
    ai_analysis: false
  });

  // Initialize form fields when profile changes
  useEffect(() => {
    if (profile) {
      console.log("Profile data available, initializing form fields:", JSON.stringify(profile, null, 2));
      setUsername(profile.username || '');
      setFirstName(profile.firstName || '');
      setLastName(profile.lastName || '');
      setBio(profile.bio || '');
      setInterests(Array.isArray(profile.interests) ? profile.interests.join(', ') : '');
      setAvatarUrl(profile.avatar_url || null);
      setEnableAIAnalysis(profile.enable_ai_analysis || false);
      setVisibilitySettings(profile.visibility_settings || {
        spotify: {
          top_artists: true,
          top_genres: true,
          selected_playlist: true
        },
        photos: true,
        interests: true,
        ai_analysis: false
      });
    }
  }, [profile]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        console.log("Raw profile data from database:", JSON.stringify(data, null, 2));
        const profileWithSettings = {
          ...data,
          visibility_settings: data.visibility_settings || {
            spotify: {
              top_artists: true,
              top_genres: true,
              selected_playlist: true
            },
            photos: true,
            interests: true,
            ai_analysis: false
          }
        } as Profile;
        console.log("Setting profile data:", JSON.stringify(profileWithSettings, null, 2));
        setProfile(profileWithSettings);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  // Handle Spotify callback parameters
  useEffect(() => {
    const { code, state, error } = route.params || {};
    if (code && state) {
      console.log("Received Spotify callback:", { code, state });
      // The callback will be handled by the Edge Function
      // We just need to refresh the profile to show the updated Spotify connection
      fetchProfile();
    } else if (error) {
      console.error("Spotify connection error:", error);
      Alert.alert("Error", `Failed to connect to Spotify: ${error}`);
    }
  }, [route.params]);

  const handleSave = async () => {
    setIsSaving(true);
    console.log("[handleSave] Starting save process...");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("[handleSave] User authentication error:", userError);
        Alert.alert("Error", "Could not get user session.");
        setIsSaving(false);
        return;
      }
      console.log("[handleSave] User authenticated successfully:", user.id);

      let newAvatarUrl: string | null | undefined = undefined;
      let newPhotos: { url: string; order: number }[] | undefined = undefined;

      if (selectedImage) {
        console.log("[handleSave] Processing new avatar image...");
        newAvatarUrl = await uploadImage(selectedImage);
        if (newAvatarUrl === null) {
          console.error("[handleSave] Failed to upload new avatar");
          Alert.alert(
            "Save Error",
            "Failed to upload new profile picture. Profile not saved."
          );
          setIsSaving(false);
          return;
        }
        console.log(
          "[handleSave] New avatar uploaded successfully:",
          newAvatarUrl
        );
      }

      if (selectedPhotos.length > 0) {
        console.log("[handleSave] Processing new photos...");
        const uploadedPhotos = await uploadPhotos(selectedPhotos);
        if (uploadedPhotos.length === 0) {
          console.error("[handleSave] Failed to upload photos");
          Alert.alert(
            "Save Error",
            "Failed to upload photos. Profile not saved."
          );
          setIsSaving(false);
          return;
        }
        newPhotos = uploadedPhotos;
        console.log(
          "[handleSave] New photos uploaded successfully:",
          uploadedPhotos.length
        );
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
      console.log("[handleSave] Bio analysis check:", {
        shouldAnalyze,
        enableAIAnalysis,
        bioLength: bio.length,
        lastUpdated: profile?.ai_analysis_scores?.lastUpdated,
        bio: bio, // Log the actual bio content
      });

      const updates: Partial<Profile> & {
        updated_at: Date;
        id: string;
        avatar_url?: string | null;
        photos?: { url: string; order: number }[];
        enable_ai_analysis?: boolean;
        visibility_settings?: Profile['visibility_settings'];
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

      console.log("[handleSave] Updating profile with data:", {
        id: updates.id,
        username: updates.username,
        bioLength: updates.bio?.length,
        interestsCount: updates.interests?.length,
        enableAIAnalysis: updates.enable_ai_analysis,
      });

      const { error: updateError } = await supabase
        .from("profiles")
        .upsert(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("[handleSave] Error updating profile:", updateError);
        Alert.alert("Error updating profile", updateError.message);
      } else {
        // If bio should be analyzed and AI analysis is enabled, trigger analysis
        if (shouldAnalyze && enableAIAnalysis) {
          console.log("[handleSave] Triggering AI analysis for bio...");
          try {
            console.log(
              "[handleSave] Sending request to analyze-text function with payload:",
              {
                text: bio,
                type: "bio",
              }
            );

            const { data: analysisData, error: analysisError } =
              await supabase.functions.invoke("analyze-text", {
                body: { text: bio, type: "bio" },
              });

            if (analysisError) {
              console.error("[handleSave] Error analyzing bio:", analysisError);
              Alert.alert(
                "Analysis Error",
                "There was an error analyzing your bio. Your profile was saved, but the analysis will be retried later."
              );
            } else if (analysisData) {
              console.log(
                "[handleSave] Analysis successful, updating scores:",
                analysisData
              );
              await updateAnalysisScores(user.id, analysisData);
            }
          } catch (error) {
            console.error("[handleSave] Error in AI analysis:", error);
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
      console.log("[handleSave] Save process completed");
    }
  };
  // console.log("profile", profile);

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

  const getTopUncommonWord = (
    wordPatterns?: Profile["word_patterns"]
  ): string | null => {
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
    if (!profile) return;
    navigation.navigate('PublicProfile', { userId: profile.id });
  };

  const handleSpotifyConnect = async () => {
    try {
      setConnectingSpotify(true);
      console.log("Starting Spotify connection process...");

      // Get the current session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error("Session error:", sessionError);
        Alert.alert(
          "Error",
          "Could not get user session. Please try logging in again."
        );
        return;
      }

      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke("spotify-auth", {
        method: "POST",
        body: { userId: session.user.id },
      });
      console.log("data", data);

      if (error) {
        console.error("Edge Function error:", error);
        throw new Error(error.message);
      }

      if (!data?.authUrl) {
        throw new Error("No authorization URL received from server");
      }

      // Open the URL in the device's browser
      const supported = await Linking.canOpenURL(data.authUrl);
      console.log("supported", supported);

      if (supported) {
        console.log("opening url", data.authUrl);
        await Linking.openURL(data.authUrl);
      } else {
        throw new Error("Cannot open URL: " + data.authUrl);
      }
    } catch (error: any) {
      console.error("Error connecting to Spotify:", error);
      Alert.alert(
        "Error",
        `Failed to connect to Spotify: ${error?.message || "Unknown error"}`
      );
    } finally {
      setConnectingSpotify(false);
    }
  };

  const handleSpotifyDisconnect = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Error", "Could not get user session.");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          spotify_connected: false,
          spotify_top_genres: null,
          spotify_refresh_token: null,
          spotify_access_token: null,
          spotify_token_expires_at: null,
        })
        .eq("id", user.id);

      if (error) throw error;

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              spotify_connected: false,
              spotify_top_genres: undefined,
              spotify_refresh_token: undefined,
              spotify_access_token: undefined,
              spotify_token_expires_at: undefined,
            }
          : null
      );

      Alert.alert("Success", "Disconnected from Spotify");
    } catch (error) {
      console.error("Error disconnecting from Spotify:", error);
      Alert.alert(
        "Error",
        "Failed to disconnect from Spotify. Please try again."
      );
    }
  };

  const handleSelectPlaylist = async () => {
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

      const { data, error } = await supabase.functions.invoke("spotify-playlists", {
        method: "POST",
        body: { userId: user.id, action: "get_playlists" },
      });

      if (error) throw error;

      setPlaylists(data.playlists);
      setShowPlaylistModal(true);
    } catch (error) {
      console.error("Error fetching playlists:", error);
      Alert.alert("Error", "Failed to fetch playlists. Please try again.");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handlePlaylistSelect = async (playlistId: string) => {
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

  const handleVisibilityChange = async (
    section: keyof NonNullable<Profile['visibility_settings']>,
    subsection?: keyof NonNullable<Profile['visibility_settings']>['spotify']
  ) => {
    if (!profile) return;

    try {
      const newSettings = { ...profile.visibility_settings };
      if (!newSettings.spotify) {
        newSettings.spotify = {
          top_artists: true,
          top_genres: true,
          selected_playlist: true
        };
      }

      if (subsection) {
        // For individual Spotify toggles
        newSettings.spotify[subsection] = !newSettings.spotify[subsection];
      } else if (section === 'spotify') {
        // For the main Spotify section toggle
        const currentState = newSettings.spotify.top_artists || 
                           newSettings.spotify.top_genres || 
                           newSettings.spotify.selected_playlist;
        // Toggle all Spotify settings to the opposite of current state
        newSettings.spotify = {
          top_artists: !currentState,
          top_genres: !currentState,
          selected_playlist: !currentState
        };
      } else {
        // For other section toggles
        (newSettings[section] as boolean) = !newSettings[section];
      }

      const { error } = await supabase
        .from('profiles')
        .update({ visibility_settings: newSettings })
        .eq('id', profile.id);

      if (error) throw error;
      setProfile(prev => {
        if (!prev) return null;
        return {
          ...prev,
          visibility_settings: newSettings as NonNullable<Profile['visibility_settings']>
        };
      });
    } catch (error) {
      console.error('Error updating visibility:', error);
      Alert.alert('Error', 'Failed to update visibility settings');
    }
  };

  const handleEditProfile = () => {
    console.log("handleEditProfile called, current profile state:", JSON.stringify(profile, null, 2));
    if (profile) {
      // Log the exact values we're about to set
      const formValues = {
        username: profile.username || '',
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        bio: profile.bio || '',
        interests: Array.isArray(profile.interests) && profile.interests.length > 0 
          ? profile.interests.join(', ') 
          : '',
        avatar_url: profile.avatar_url || null,
        enable_ai_analysis: profile.enable_ai_analysis || false
      };
      console.log("Setting form fields with values:", JSON.stringify(formValues, null, 2));

      // Set all form fields
      setUsername(formValues.username);
      setFirstName(formValues.firstName);
      setLastName(formValues.lastName);
      setBio(formValues.bio);
      setInterests(formValues.interests);
      setAvatarUrl(formValues.avatar_url);
      setEnableAIAnalysis(formValues.enable_ai_analysis);
      setVisibilitySettings(profile.visibility_settings || {
        spotify: {
          top_artists: true,
          top_genres: true,
          selected_playlist: true
        },
        photos: true,
        interests: true,
        ai_analysis: false
      });
    } else {
      console.log("No profile data available when trying to edit");
    }
    setEditing(true);
  };

  // Add useEffect to monitor state changes
  useEffect(() => {
    if (editing) {
      console.log("Edit mode state values:", {
        username,
        firstName,
        lastName,
        bio,
        interests,
        avatarUrl,
        enableAIAnalysis
      });
    }
  }, [editing, username, firstName, lastName, bio, interests, avatarUrl, enableAIAnalysis]);

  // Add useEffect to monitor profile changes
  useEffect(() => {
    console.log("Profile state updated:", JSON.stringify(profile, null, 2));
  }, [profile]);

  const handleAIAnalysisToggle = async (value: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({ enable_ai_analysis: value })
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, enable_ai_analysis: value } : null);
      setEnableAIAnalysis(value);
    } catch (error) {
      console.error('Error updating AI analysis setting:', error);
      Alert.alert('Error', 'Failed to update AI analysis setting');
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

  if (editing) {
    const displayUri = selectedImage?.uri || avatarUrl;

    return (
      <ScrollView style={commonStyles.container}>
        <View style={styles.editHeader}>
          <Text style={commonStyles.title}>Edit Profile</Text>
          <TouchableOpacity
            style={[commonStyles.button, { backgroundColor: colors.border }]}
            onPress={() => {
              setEditing(false);
              setSelectedImage(null);
            }}
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

          <TextInput
            style={commonStyles.searchInput}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            defaultValue={profile?.username || ''}
          />

          <TextInput
            style={commonStyles.searchInput}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First Name"
            defaultValue={profile?.firstName || ''}
          />

          <TextInput
            style={commonStyles.searchInput}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last Name"
            defaultValue={profile?.lastName || ''}
          />

          <TextInput
            style={commonStyles.multilineInput}
            value={bio}
            onChangeText={setBio}
            placeholder="Bio"
            multiline
            numberOfLines={4}
            defaultValue={profile?.bio || ''}
          />

          <TextInput
            style={commonStyles.searchInput}
            value={interests}
            onChangeText={setInterests}
            placeholder="e.g. art, movies, hiking"
            defaultValue={profile?.interests?.join(', ') || ''}
          />

          <View style={commonStyles.protectedSection}>
            <Text style={commonStyles.protectedTitle}>AI Analysis</Text>
            <View style={commonStyles.protectedContent}>
              <AIAnalysisSection
                enabled={profile?.enable_ai_analysis || false}
                onToggle={handleAIAnalysisToggle}
              />
            </View>
          </View>

          <View style={styles.photoGallerySection}>
            <Text style={[typography.sectionTitle, { marginBottom: spacing.sm }]}>
              Profile Photos (up to 6)
            </Text>
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
  }

  return (
    <ScrollView style={styles.container}>
      {profile && (
        <>
          <ProfileHeader
            profile={profile}
            onEditProfile={handleEditProfile}
          />
          <ProfileActions
            onViewPublic={handleViewPublicProfile}
            onEditProfile={handleEditProfile}
          />
          <View style={commonStyles.protectedSection}>
            <Text style={commonStyles.protectedTitle}>AI Analysis</Text>
            <View style={commonStyles.protectedContent}>
              <AIAnalysisSection
                enabled={profile?.enable_ai_analysis || false}
                onToggle={handleAIAnalysisToggle}
              />
            </View>
          </View>
          <View style={commonStyles.protectedSection}>
            <SectionHeader 
              title="Music Taste" 
              isVisible={visibilitySettings.spotify.top_artists || 
                         visibilitySettings.spotify.top_genres || 
                         visibilitySettings.spotify.selected_playlist}
              onToggleVisibility={() => handleVisibilityChange('spotify')}
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
          </View>
          <View style={commonStyles.protectedSection}>
            <SectionHeader 
              title="Interests" 
              isVisible={visibilitySettings.interests}
              onToggleVisibility={() => handleVisibilityChange('interests')}
            />
            <View style={commonStyles.protectedContent}>
              {profile?.interests && profile.interests.length > 0 && (
                <InterestsSection
                  profile={profile}
                  onVisibilityChange={handleVisibilityChange}
                />
              )}
            </View>
          </View>
          <View style={commonStyles.buttonContainer}>
            <TouchableOpacity
              style={[commonStyles.button, { backgroundColor: "#dc3545" }]}
              onPress={handleLogout}
            >
              <Text style={commonStyles.buttonText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {/* Add Modal for Playlist Selection */}
      <Modal
        visible={showPlaylistModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={[typography.sectionTitle, { marginBottom: spacing.md }]}>
              Select a Playlist
            </Text>
            <ScrollView style={styles.playlistList}>
              {playlists.map((playlist) => (
                <TouchableOpacity
                  key={playlist.id}
                  style={styles.playlistItem}
                  onPress={() => handlePlaylistSelect(playlist.id)}
                >
                  <Image source={{ uri: playlist.image }} style={styles.playlistItemImage} />
                  <View style={styles.playlistItemInfo}>
                    <Text style={styles.playlistItemName}>{playlist.name}</Text>
                    <Text style={styles.playlistItemStats}>
                      {playlist.tracks_count} tracks • By {playlist.owner}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[commonStyles.button, { marginTop: spacing.md }]}
              onPress={() => setShowPlaylistModal(false)}
            >
              <Text style={commonStyles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    position: "relative",
  },
  selectedPhoto: {
    width: "100%",
    height: "100%",
    borderRadius: borderRadius.md,
  },
  removeSelectedPhotoButton: {
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
    fontStyle: "italic",
    marginTop: spacing.sm,
  },
  aiInsightsSection: {
    width: "100%",
    marginBottom: spacing.xl,
  },
  genresContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
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
    alignItems: "center",
  },
  artistImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: spacing.xs,
  },
  artistName: {
    ...typography.body,
    textAlign: "center",
  },
  playlistCard: {
    flexDirection: "row",
    backgroundColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    marginTop: spacing.xs,
  },
  playlistImage: {
    width: 120,
    height: 120,
  },
  playlistInfo: {
    flex: 1,
    padding: spacing.sm,
    justifyContent: "center",
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
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    width: "90%",
    maxHeight: "80%",
  },
  playlistList: {
    maxHeight: "70%",
  },
  playlistItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playlistItemImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  playlistItemInfo: {
    flex: 1,
  },
  playlistItemName: {
    ...typography.body,
    fontWeight: "bold",
    marginBottom: spacing.xs,
  },
  playlistItemStats: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionSubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  visibilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

export default ProfileScreen;
