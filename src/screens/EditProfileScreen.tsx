import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PlaylistSelector } from "../components/profile/PlaylistSelector";
import { SpotifyConnect } from "../components/profile/SpotifyConnect";
import { supabase } from "../supabase";
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
  first_name: string;
  last_name: string;
  username: string;
  bio: string;
  interests: string[];
  photos: Photo[];
  spotify_connected: boolean;
  spotify_selected_playlist?: SpotifyPlaylist;
  spotify_top_genres?: string[];
  spotify_top_artists?: { name: string; image: string; spotify_url: string }[];
  visibility_settings?: {
    photos: boolean;
    bio: boolean;
    interests: boolean;
    basic_info: boolean;
    spotify: {
      top_artists: boolean;
      top_genres: boolean;
      selected_playlist: boolean;
    };
  };
}

const EditProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibilitySettings, setVisibilitySettings] = useState({
    photos: true,
    bio: true,
    interests: true,
    basic_info: true,
    spotify: {
      top_artists: true,
      top_genres: true,
      selected_playlist: true,
    },
  });
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [connectingSpotify, setConnectingSpotify] = useState(false);
  const [newInterest, setNewInterest] = useState('');
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [availablePlaylists, setAvailablePlaylists] = useState<SpotifyPlaylist[]>([]);

  useEffect(() => {
    fetchProfile();
  }, []);

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
        setProfile(data);
        setVisibilitySettings(data.visibility_settings || {
          photos: true,
          bio: true,
          interests: true,
          basic_info: true,
          spotify: {
            top_artists: true,
            top_genres: true,
            selected_playlist: true,
          },
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectSpotify = async () => {
    try {
      setConnectingSpotify(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data, error } = await supabase.functions.invoke('spotify-auth', {
        body: { userId: user.id },
      });

      if (error) throw error;
      if (!data?.authUrl) throw new Error('No auth URL received');

      await Linking.openURL(data.authUrl);
    } catch (error) {
      console.error('Error connecting to Spotify:', error);
    } finally {
      setConnectingSpotify(false);
    }
  };

  const handleDisconnectSpotify = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { error } = await supabase
        .from('profiles')
        .update({
          spotify_connected: false,
          spotify_top_genres: null,
          spotify_top_artists: null,
          spotify_selected_playlist: null,
          spotify_refresh_token: null,
          spotify_access_token: null,
          spotify_token_expires_at: null,
        })
        .eq('id', user.id);

      if (error) throw error;
      await fetchProfile();
    } catch (error) {
      console.error('Error disconnecting Spotify:', error);
    }
  };

  const handleVisibilityChange = (
    section: keyof typeof visibilitySettings,
    subsection?: keyof typeof visibilitySettings.spotify
  ) => {
    setVisibilitySettings((prev) => {
      if (section === 'spotify' && subsection) {
        return {
          ...prev,
          spotify: {
            ...prev.spotify,
            [subsection]: !prev.spotify[subsection],
          },
        };
      } else if (section === 'spotify') {
        const currentState = prev.spotify.top_artists || prev.spotify.top_genres || prev.spotify.selected_playlist;
        return {
          ...prev,
          spotify: {
            top_artists: !currentState,
            top_genres: !currentState,
            selected_playlist: !currentState,
          },
        };
      } else {
        return {
          ...prev,
          [section]: !prev[section],
        };
      }
    });
  };

  const handleSelectPlaylist = async () => {
    try {
      setLoadingPlaylists(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('spotify-playlists', {
        body: {
          action: 'get_playlists',
          userId: user.id,
        }
      });

      if (error) throw error;
      if (!data?.playlists) throw new Error('No playlists returned');

      setAvailablePlaylists(data.playlists);
      setShowPlaylistModal(true);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handlePlaylistSelect = async (playlist: SpotifyPlaylist) => {
    try {
      setLoadingPlaylists(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.functions.invoke('spotify-playlists', {
        body: {
          action: 'select_playlist',
          userId: user.id,
          playlistId: playlist.id,
        }
      });

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, spotify_selected_playlist: playlist } : null);
      setShowPlaylistModal(false);
    } catch (error) {
      console.error('Error selecting playlist:', error);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleAddInterest = () => {
    if (newInterest.trim() && profile) {
      setProfile({
        ...profile,
        interests: [...(profile.interests || []), newInterest.trim()]
      });
      setNewInterest('');
    }
  };

  const handleRemoveInterest = (index: number) => {
    if (profile) {
      const newInterests = [...(profile.interests || [])];
      newInterests.splice(index, 1);
      setProfile({
        ...profile,
        interests: newInterests
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user found');
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profile?.first_name,
          last_name: profile?.last_name,
          username: profile?.username,
          bio: profile?.bio,
          interests: profile?.interests,
          visibility_settings: visibilitySettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
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

  if (loading) {
    return (
      <View style={commonStyles.centeredContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={commonStyles.container}>
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

      <View style={styles.section}>
        <SectionHeader
          title="Basic Information"
          isVisible={visibilitySettings.basic_info}
          onToggleVisibility={() => handleVisibilityChange("basic_info")}
        />
        <View style={styles.inputGroup}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            value={profile?.first_name}
            onChangeText={(text) => setProfile(prev => prev ? { ...prev, first_name: text } : null)}
            placeholder="Enter your first name"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            value={profile?.last_name}
            onChangeText={(text) => setProfile(prev => prev ? { ...prev, last_name: text } : null)}
            placeholder="Enter your last name"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={profile?.username}
            onChangeText={(text) => setProfile(prev => prev ? { ...prev, username: text } : null)}
            placeholder="Choose a username"
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="About"
          isVisible={visibilitySettings.bio}
          onToggleVisibility={() => handleVisibilityChange("bio")}
        />
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={profile?.bio}
          onChangeText={(text) => setProfile(prev => prev ? { ...prev, bio: text } : null)}
          placeholder="Tell us about yourself..."
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Interests"
          isVisible={visibilitySettings.interests}
          onToggleVisibility={() => handleVisibilityChange("interests")}
        />
        <View style={styles.interestsInputContainer}>
          <TextInput
            style={[styles.input, styles.interestsInput]}
            value={newInterest}
            onChangeText={setNewInterest}
            placeholder="Add an interest..."
            onSubmitEditing={handleAddInterest}
          />
          <TouchableOpacity
            style={styles.addInterestButton}
            onPress={handleAddInterest}
          >
            <Text style={styles.addInterestButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.interestsContainer}>
          {profile?.interests?.map((interest, index) => (
            <View key={index} style={styles.interestTag}>
              <Text style={styles.interestText}>{interest}</Text>
              <TouchableOpacity
                onPress={() => handleRemoveInterest(index)}
                style={styles.removeInterestButton}
              >
                <Text style={styles.removeInterestButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
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
        <View style={commonStyles.container}>
          {!profile?.spotify_connected ? (
            <SpotifyConnect
              onConnect={handleConnectSpotify}
              onDisconnect={handleDisconnectSpotify}
              isConnected={profile?.spotify_connected || false}
              isConnecting={connectingSpotify}
            />
          ) : (
            <>
              {(() => {
                console.log('Spotify connected:', {
                  topGenres: profile.spotify_top_genres,
                  topArtists: profile.spotify_top_artists,
                  visibilitySettings: visibilitySettings.spotify
                });
                return null;
              })()}
              {profile.spotify_top_genres && (
                <View style={styles.spotifySubsection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Top Genres</Text>
                    <VisibilityToggle 
                      isVisible={visibilitySettings.spotify.top_genres}
                      onToggle={() => handleVisibilityChange("spotify", "top_genres")}
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

              {profile.spotify_top_artists && (
                <View style={styles.spotifySubsection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Top Artists</Text>
                    <VisibilityToggle 
                      isVisible={visibilitySettings.spotify.top_artists}
                      onToggle={() => handleVisibilityChange("spotify", "top_artists")}
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

              <View style={styles.spotifySubsection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Featured Playlist</Text>
                  <VisibilityToggle 
                    isVisible={visibilitySettings.spotify.selected_playlist}
                    onToggle={() => handleVisibilityChange("spotify", "selected_playlist")}
                    label="Playlist"
                  />
                </View>
                <PlaylistSelector
                  onSelect={handleSelectPlaylist}
                  isLoading={loadingPlaylists}
                  selectedPlaylist={profile.spotify_selected_playlist}
                />
              </View>

              <Text style={[typography.caption, { color: colors.text.secondary, marginTop: spacing.sm }]}>
                Toggle visibility to control what others see in your public profile
              </Text>
            </>
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

      <Modal
        visible={showPlaylistModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select a Playlist</Text>
              <TouchableOpacity
                onPress={() => setShowPlaylistModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.playlistList}>
              {availablePlaylists.map((playlist) => (
                <TouchableOpacity
                  key={playlist.id}
                  style={styles.playlistItem}
                  onPress={() => handlePlaylistSelect(playlist)}
                >
                  <Image
                    source={{ uri: playlist.image }}
                    style={styles.playlistItemImage}
                  />
                  <View style={styles.playlistItemInfo}>
                    <Text style={styles.playlistItemName}>{playlist.name}</Text>
                    <Text style={styles.playlistItemStats}>
                      {playlist.tracks_count} tracks • By {playlist.owner}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  section: {
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.body,
    marginBottom: spacing.xs,
    color: colors.text.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    ...typography.body,
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  interestsInputContainer: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  interestsInput: {
    flex: 1,
    marginRight: spacing.sm,
  },
  addInterestButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  addInterestButtonText: {
    color: colors.white,
    ...typography.body,
  },
  interestsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  interestTag: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  interestText: {
    ...typography.body,
    color: colors.text.primary,
  },
  removeInterestButton: {
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  removeInterestButtonText: {
    color: colors.text.secondary,
    fontSize: 16,
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
  spotifySubsection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    width: "100%",
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
  },
  genresContainer: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  genreTag: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    width: '90%',
    maxHeight: '80%',
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.title,
    color: colors.text.primary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.text.secondary,
  },
  playlistList: {
    maxHeight: '80%',
  },
  playlistItem: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playlistItemImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.sm,
  },
  playlistItemInfo: {
    flex: 1,
    marginLeft: spacing.sm,
    justifyContent: 'center',
  },
  playlistItemName: {
    ...typography.title,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  playlistItemStats: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  visibilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
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
