import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PlaylistSelector } from "../components/profile/PlaylistSelector";
import { commonStyles } from "../theme/commonStyles";
import { borderRadius, colors, spacing, typography } from "../theme/theme";

type RootStackParamList = {
  PublicProfile: { userId: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Photo {
  url: string;
  id: string;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  image: string;
  description: string;
  spotify_url: string;
  owner: string;
  tracks_count: number;
}

interface Profile {
  id: string;
  photos: Photo[];
  spotify_connected: boolean;
  spotify_selected_playlist?: SpotifyPlaylist;
}

const EditProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [visibilitySettings, setVisibilitySettings] = useState({
    photos: true,
    spotify: {
      top_artists: true,
      top_genres: true,
      selected_playlist: true,
    },
  });
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const handleVisibilityChange = (section: keyof typeof visibilitySettings) => {
    setVisibilitySettings((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleSelectPlaylist = async (playlist: SpotifyPlaylist | undefined) => {
    if (profile && playlist) {
      setProfile({
        ...profile,
        spotify_selected_playlist: playlist,
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Implement API call to save profile changes
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulated API call
      navigation.goBack();
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const pickMultipleImages = async () => {
    try {
      setUploadingPhotos(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newPhotos = result.assets.map((asset) => ({
          url: asset.uri,
          id: Math.random().toString(),
        }));

        setProfile((prev) =>
          prev
            ? {
                ...prev,
                photos: [...(prev.photos || []), ...newPhotos].slice(0, 6),
              }
            : null
        );
      }
    } catch (error) {
      console.error("Error picking images:", error);
    } finally {
      setUploadingPhotos(false);
    }
  };

  return (
    <View style={commonStyles.container}>
      <View style={styles.editHeader}>
        <Text style={commonStyles.title}>Edit Profile</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[
              commonStyles.button,
              { backgroundColor: colors.primary, marginRight: spacing.sm },
            ]}
            onPress={() =>
              profile?.id && navigation.navigate("PublicProfile", { userId: profile.id })
            }
          >
            <Text style={commonStyles.buttonText}>View Public Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[commonStyles.button, { backgroundColor: colors.border }]}
            onPress={() => navigation.goBack()}
          >
            <Text
              style={[commonStyles.buttonText, { color: colors.text.primary }]}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
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

      <View style={styles.spotifySection}>
        <SectionHeader
          title="Music Taste"
          isVisible={
            visibilitySettings.spotify.top_artists ||
            visibilitySettings.spotify.top_genres ||
            visibilitySettings.spotify.selected_playlist
          }
          onToggleVisibility={() => handleVisibilityChange("spotify")}
        />
        <View style={styles.playlistSelector}>
          {profile?.spotify_connected && (
            <PlaylistSelector
              onSelect={() => handleSelectPlaylist(profile.spotify_selected_playlist)}
              isLoading={loadingPlaylists}
              selectedPlaylist={profile.spotify_selected_playlist}
            />
          )}
        </View>
      </View>

      <View style={commonStyles.buttonContainer}>
        <TouchableOpacity
          style={[
            commonStyles.button,
            isSaving || uploadingPhotos ? commonStyles.disabledButton : null,
          ]}
          onPress={handleSave}
          disabled={isSaving || uploadingPhotos}
        >
          <Text style={commonStyles.buttonText}>
            {isSaving || uploadingPhotos ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
  spotifySection: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistSelector: {
    width: '100%',
  },
});

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
export default EditProfileScreen;
