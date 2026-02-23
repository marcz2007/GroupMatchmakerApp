import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState, useRef } from "react";
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
  View,
  Dimensions,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AIAnalysisSection } from "../components/profile/AIAnalysisSection";
import { PlaylistSelector } from "../components/profile/PlaylistSelector";
import { SpotifyConnect } from "../components/profile/SpotifyConnect";
import { UpgradeModal } from "../components/UpgradeModal";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../supabase";
import { colors, spacing, borderRadius, typography } from "../theme";
import { commonStyles } from "../theme/commonStyles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PROFILE_IMAGE_SIZE = SCREEN_WIDTH * 0.7;

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
    ai_analysis: boolean;
    spotify: {
      top_artists: boolean;
      top_genres: boolean;
      selected_playlist: boolean;
    };
  };
  word_patterns?: {
    topWords: { word: string; score: number }[];
  };
  enable_ai_analysis: boolean;
}

const EditProfileScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user: authUser, isGuest, loading: authLoading, refreshProfile: refreshAuthProfile } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const [visibilitySettings, setVisibilitySettings] = useState({
    photos: true,
    bio: true,
    interests: true,
    basic_info: true,
    ai_analysis: true,
    spotify: {
      top_artists: true,
      top_genres: true,
      selected_playlist: true,
    },
  });
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [availablePlaylists, setAvailablePlaylists] = useState<
    SpotifyPlaylist[]
  >([]);
  const [messageCount, setMessageCount] = useState(0);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [connectingSpotify, setConnectingSpotify] = useState(false);
  const [newInterest, setNewInterest] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);

  useEffect(() => {
    console.log("[EditProfile] useEffect fired — authLoading:", authLoading, "authUser:", !!authUser, "authUser.id:", authUser?.id);
    if (authLoading) return;
    if (authUser) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, [authUser, authLoading]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      console.log("[EditProfile] fetchProfile called, authUser.id:", authUser?.id);
      if (!authUser) {
        console.warn("[Profile] No authenticated user found");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      console.log("[EditProfile] profiles query result — error:", error, "data:", !!data);
      if (error) throw error;

      if (!data) {
        console.warn("[Profile] No profile row found for user:", authUser.id);
        return;
      }

      // Warn about invalid photo URLs (e.g. stale local file paths from another device)
      const invalidPhotos = (data.photos || []).filter(
        (p: Photo) => p.url && !p.url.startsWith("http://") && !p.url.startsWith("https://")
      );
      if (invalidPhotos.length > 0) {
        console.warn("[Profile] Found", invalidPhotos.length, "photos with non-remote URLs (local file paths from another device) — these will be hidden");
      }

      setProfile(data);
      setVisibilitySettings(
        data.visibility_settings || {
          photos: true,
          bio: true,
          interests: true,
          basic_info: true,
          ai_analysis: true,
          spotify: {
            top_artists: true,
            top_genres: true,
            selected_playlist: true,
          },
        }
      );
      setHasAnalysis(!!data.word_patterns?.topWords?.length);

      try {
        const { count, error: messageError } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", authUser.id);

        if (messageError) {
          console.warn("[Profile] Failed to fetch message count:", messageError.message);
        } else if (count !== null) {
          setMessageCount(count);
        }
      } catch (messageCountError) {
        console.error("[Profile] Error fetching message count:", messageCountError);
      }
    } catch (error) {
      console.error("[Profile] Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = () => {
    const first = profile?.first_name?.[0] || "";
    const last = profile?.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  const saveField = async (field: string, value: any) => {
    try {
      setSavingField(field);
      if (!authUser) throw new Error("No user found");

      const { error } = await supabase
        .from("profiles")
        .update({ [field]: value })
        .eq("id", authUser.id);

      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, [field]: value } : null));
    } catch (error) {
      console.error(`[Profile] Error saving ${field}:`, error);
      Alert.alert("Error", `Failed to save ${field}`);
    } finally {
      setSavingField(null);
    }
  };

  const handleConnectSpotify = async () => {
    try {
      setConnectingSpotify(true);
      if (!authUser) throw new Error("No user found");

      const { data, error } = await supabase.functions.invoke("spotify-auth", {
        body: { userId: authUser.id },
      });

      if (error) throw error;
      if (!data?.authUrl) throw new Error("No auth URL received");

      await Linking.openURL(data.authUrl);
    } catch (error) {
      console.error("[Profile] Error connecting to Spotify:", error);
      Alert.alert("Error", "Failed to connect to Spotify");
    } finally {
      setConnectingSpotify(false);
    }
  };

  const handleDisconnectSpotify = async () => {
    try {
      if (!authUser) throw new Error("No user found");

      const { error } = await supabase
        .from("profiles")
        .update({
          spotify_connected: false,
          spotify_top_genres: null,
          spotify_top_artists: null,
          spotify_selected_playlist: null,
          spotify_refresh_token: null,
          spotify_access_token: null,
          spotify_token_expires_at: null,
        })
        .eq("id", authUser.id);

      if (error) throw error;
      await fetchProfile();
    } catch (error) {
      console.error("[Profile] Error disconnecting Spotify:", error);
      Alert.alert("Error", "Failed to disconnect Spotify");
    }
  };

  const handleVisibilityChange = (
    section: keyof typeof visibilitySettings,
    subsection?: keyof typeof visibilitySettings.spotify
  ) => {
    setVisibilitySettings((prev) => {
      if (subsection) {
        return {
          ...prev,
          spotify: {
            ...prev.spotify,
            [subsection]: !prev.spotify[subsection],
          },
        };
      }
      return {
        ...prev,
        [section]: !prev[section],
      };
    });
  };

  const handleAIAnalysisToggle = async (enabled: boolean) => {
    try {
      if (!authUser) throw new Error("No user found");

      const { error } = await supabase
        .from("profiles")
        .update({ enable_ai_analysis: enabled })
        .eq("id", authUser.id);

      if (error) throw error;
      setProfile((prev) =>
        prev ? { ...prev, enable_ai_analysis: enabled } : null
      );
    } catch (error) {
      console.error("[Profile] Error updating AI analysis setting:", error);
    }
  };

  const handleSelectPlaylist = async () => {
    try {
      setLoadingPlaylists(true);
      if (!authUser) return;

      const { data, error } = await supabase.functions.invoke(
        "spotify-playlists",
        {
          body: {
            action: "get_playlists",
            userId: authUser.id,
          },
        }
      );

      if (error) throw error;
      if (!data?.playlists) throw new Error("No playlists returned");

      setAvailablePlaylists(data.playlists);
      setShowPlaylistModal(true);
    } catch (error) {
      console.error("[Profile] Error fetching playlists:", error);
      Alert.alert("Error", "Failed to load playlists");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handlePlaylistSelect = async (playlist: SpotifyPlaylist) => {
    try {
      setLoadingPlaylists(true);
      if (!authUser) return;

      const { error } = await supabase.functions.invoke("spotify-playlists", {
        body: {
          action: "select_playlist",
          userId: authUser.id,
          playlistId: playlist.id,
        },
      });

      if (error) throw error;

      setProfile((prev) =>
        prev ? { ...prev, spotify_selected_playlist: playlist } : null
      );
      setShowPlaylistModal(false);
    } catch (error) {
      console.error("[Profile] Error selecting playlist:", error);
      Alert.alert("Error", "Failed to select playlist");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleAddInterest = async () => {
    if (newInterest.trim() && profile) {
      const newInterests = [...(profile.interests || []), newInterest.trim()];
      await saveField("interests", newInterests);
      setNewInterest("");
    }
  };

  const handleRemoveInterest = async (index: number) => {
    if (profile) {
      const newInterests = [...(profile.interests || [])];
      newInterests.splice(index, 1);
      await saveField("interests", newInterests);
    }
  };

  const pickImages = async () => {
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

        const updatedPhotos = [...(profile?.photos || []), ...newPhotos].slice(0, 6);
        await saveField("photos", updatedPhotos);
      }
    } catch (error) {
      console.error("[Profile] Error picking images:", error);
      Alert.alert("Error", "Failed to upload photos");
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const renderPhotoItem = ({ item, index }: { item: Photo; index: number }) => (
    <View style={styles.photoSlide}>
      <Image source={{ uri: item.url }} style={styles.profileImage} />
    </View>
  );

  const renderPhotoIndicators = () => {
    const photos = validPhotos;
    if (photos.length <= 1) return null;

    return (
      <View style={styles.photoIndicators}>
        {photos.map((_, index) => (
          <View
            key={index}
            style={[
              styles.photoIndicator,
              index === currentPhotoIndex && styles.photoIndicatorActive,
            ]}
          />
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={colors.backgroundGradient}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Only treat photos as valid if they're remote URLs (not stale local file paths from another device)
  const validPhotos = (profile?.photos || []).filter(
    (p) => p.url && (p.url.startsWith("http://") || p.url.startsWith("https://"))
  );
  const hasPhotos = validPhotos.length > 0;

  return (
    <View style={styles.mainContainer}>
      <LinearGradient
        colors={colors.backgroundGradient}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Header - Top Third */}
          <View style={styles.profileHeader}>
            <View style={styles.profileImageContainer}>
              {hasPhotos ? (
                <>
                  <FlatList
                    ref={flatListRef}
                    data={validPhotos}
                    renderItem={renderPhotoItem}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={(e) => {
                      const index = Math.round(
                        e.nativeEvent.contentOffset.x / PROFILE_IMAGE_SIZE
                      );
                      setCurrentPhotoIndex(index);
                    }}
                    style={styles.photoCarousel}
                  />
                  {renderPhotoIndicators()}
                </>
              ) : (
                <View style={styles.initialsContainer}>
                  <Text style={styles.initialsText}>{getInitials()}</Text>
                </View>
              )}

              {/* Edit Photos Button */}
              <TouchableOpacity
                style={styles.editPhotosButton}
                onPress={pickImages}
                disabled={uploadingPhotos}
              >
                {uploadingPhotos ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <>
                    <Ionicons name="camera" size={18} color={colors.text.primary} />
                    <Text style={styles.editPhotosText}>
                      {hasPhotos ? "Edit Photos" : "Add Photos"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Name */}
            <Text style={styles.profileName}>
              {profile?.first_name} {profile?.last_name}
            </Text>
            {profile?.username && (
              <Text style={styles.profileUsername}>@{profile.username}</Text>
            )}
          </View>

          {/* Guest Upgrade Banner */}
          {isGuest && (
            <TouchableOpacity
              style={styles.upgradeBanner}
              onPress={() => setShowUpgradeModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-up-circle-outline" size={22} color={colors.primary} />
              <View style={styles.upgradeBannerTextContainer}>
                <Text style={styles.upgradeBannerTitle}>Create an account</Text>
                <Text style={styles.upgradeBannerSubtitle}>
                  Unlock groups, proposals, and more
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          )}

          {/* View Public Profile Button - only for full accounts */}
          {!isGuest && (
            <TouchableOpacity
              style={styles.viewProfileButton}
              onPress={() =>
                profile?.id &&
                navigation.navigate("PublicProfile", { userId: profile.id })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={20} color={colors.primary} />
              <Text style={styles.viewProfileButtonText}>View Public Profile</Text>
            </TouchableOpacity>
          )}

          {/* Interests Section - only for full accounts */}
          {!isGuest && (
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
                placeholderTextColor={colors.text.secondary}
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
          )}

          {/* About Section - only for full accounts */}
          {!isGuest && (
          <View style={styles.section}>
            <SectionHeader
              title="About"
              isVisible={visibilitySettings.bio}
              onToggleVisibility={() => handleVisibilityChange("bio")}
            />
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={profile?.bio}
              onChangeText={(text) =>
                setProfile((prev) => (prev ? { ...prev, bio: text } : null))
              }
              onBlur={() => profile?.bio && saveField("bio", profile.bio)}
              placeholder="Tell us about yourself..."
              placeholderTextColor={colors.text.secondary}
              multiline
              numberOfLines={4}
            />
          </View>
          )}

          {/* Signature Words - only for full accounts */}
          {!isGuest && profile?.word_patterns &&
            profile.word_patterns.topWords &&
            profile.word_patterns.topWords.length > 0 && (
              <View style={styles.section}>
                <SectionHeader
                  title={`${profile.first_name}'s Signature Words`}
                  isVisible={visibilitySettings.ai_analysis}
                  onToggleVisibility={() => handleVisibilityChange("ai_analysis")}
                />
                <View style={styles.wordPatternsContainer}>
                  <Text style={styles.signatureWords}>
                    {profile.word_patterns.topWords
                      .slice(0, 3)
                      .map((word, index) => {
                        if (index === 0) return word.word;
                        if (index === 2) return ` and ${word.word}`;
                        return `, ${word.word}`;
                      })}
                  </Text>
                </View>
              </View>
            )}

          {/* Music Taste Section - only for full accounts */}
          {!isGuest && (
          <View style={styles.section}>
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
                  {profile.spotify_top_genres && (
                    <View style={styles.spotifySubsection}>
                      <View style={styles.subsectionHeader}>
                        <Text style={styles.subsectionTitle}>Top Genres</Text>
                        <VisibilityToggle
                          isVisible={visibilitySettings.spotify.top_genres}
                          onToggle={() =>
                            handleVisibilityChange("spotify", "top_genres")
                          }
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
                      <View style={styles.subsectionHeader}>
                        <Text style={styles.subsectionTitle}>Top Artists</Text>
                        <VisibilityToggle
                          isVisible={visibilitySettings.spotify.top_artists}
                          onToggle={() =>
                            handleVisibilityChange("spotify", "top_artists")
                          }
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
                    <View style={styles.subsectionHeader}>
                      <Text style={styles.subsectionTitle}>Featured Playlist</Text>
                      <VisibilityToggle
                        isVisible={visibilitySettings.spotify.selected_playlist}
                        onToggle={() =>
                          handleVisibilityChange("spotify", "selected_playlist")
                        }
                        label="Playlist"
                      />
                    </View>
                    <PlaylistSelector
                      onSelect={handleSelectPlaylist}
                      isLoading={loadingPlaylists}
                      selectedPlaylist={profile.spotify_selected_playlist}
                    />
                  </View>

                  <Text style={styles.visibilityHelpText}>
                    Toggle visibility to control what others see in your public
                    profile
                  </Text>
                </>
              )}
            </View>
          </View>
          )}

          {/* AI Analysis Section - only for full accounts */}
          {!isGuest && (
          <View style={styles.section}>
            <AIAnalysisSection
              enabled={profile?.enable_ai_analysis || false}
              onToggle={handleAIAnalysisToggle}
              hasBio={!!profile?.bio}
              bioLength={profile?.bio?.length || 0}
              hasMessages={messageCount > 0}
              messageCount={messageCount}
              hasAnalysis={hasAnalysis}
            />
          </View>
          )}

          {/* Basic Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                value={profile?.first_name}
                onChangeText={(text) =>
                  setProfile((prev) => (prev ? { ...prev, first_name: text } : null))
                }
                onBlur={() =>
                  profile?.first_name && saveField("first_name", profile.first_name)
                }
                placeholder="Enter your first name"
                placeholderTextColor={colors.text.secondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                value={profile?.last_name}
                onChangeText={(text) =>
                  setProfile((prev) => (prev ? { ...prev, last_name: text } : null))
                }
                onBlur={() =>
                  profile?.last_name && saveField("last_name", profile.last_name)
                }
                placeholder="Enter your last name"
                placeholderTextColor={colors.text.secondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={profile?.username}
                onChangeText={(text) =>
                  setProfile((prev) => (prev ? { ...prev, username: text } : null))
                }
                onBlur={() =>
                  profile?.username && saveField("username", profile.username)
                }
                placeholder="Choose a username"
                placeholderTextColor={colors.text.secondary}
              />
            </View>
          </View>

          {/* Playlist Modal */}
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

          {/* Logout Button */}
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={20} color={colors.text.primary} />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* Upgrade Modal for Guests */}
      <UpgradeModal
        visible={showUpgradeModal}
        onDismiss={() => setShowUpgradeModal(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl * 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  // Profile Header Styles
  profileHeader: {
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  profileImageContainer: {
    alignItems: "center",
    marginBottom: spacing.md,
  },
  photoCarousel: {
    width: PROFILE_IMAGE_SIZE,
    height: PROFILE_IMAGE_SIZE,
    borderRadius: PROFILE_IMAGE_SIZE / 2,
    overflow: "hidden",
  },
  photoSlide: {
    width: PROFILE_IMAGE_SIZE,
    height: PROFILE_IMAGE_SIZE,
  },
  profileImage: {
    width: PROFILE_IMAGE_SIZE,
    height: PROFILE_IMAGE_SIZE,
    borderRadius: PROFILE_IMAGE_SIZE / 2,
  },
  initialsContainer: {
    width: PROFILE_IMAGE_SIZE,
    height: PROFILE_IMAGE_SIZE,
    borderRadius: PROFILE_IMAGE_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  initialsText: {
    fontSize: 72,
    fontWeight: "bold",
    color: colors.text.primary,
  },
  photoIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  photoIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  photoIndicatorActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  editPhotosButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceGlass,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  editPhotosText: {
    color: colors.text.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  profileName: {
    ...typography.h1,
    color: colors.text.primary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  profileUsername: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
  },
  // Upgrade Banner
  upgradeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  upgradeBannerTextContainer: {
    flex: 1,
  },
  upgradeBannerTitle: {
    color: colors.text.primary,
    fontWeight: "600",
    fontSize: 16,
  },
  upgradeBannerSubtitle: {
    color: colors.text.secondary,
    fontSize: 13,
    marginTop: 2,
  },
  // View Profile Button
  viewProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  viewProfileButtonText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 16,
  },
  // Section Styles
  section: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subsectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  subsectionTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.text.primary,
  },
  // Input Styles
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
    backgroundColor: colors.surfaceLight,
    color: colors.text.primary,
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  // Interests Styles
  interestsInputContainer: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  interestsInput: {
    flex: 1,
    marginRight: spacing.sm,
  },
  addInterestButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: borderRadius.sm,
  },
  addInterestButtonText: {
    color: colors.text.primary,
    fontWeight: "600",
  },
  interestsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  interestTag: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
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
  // Spotify Styles
  spotifySubsection: {
    marginBottom: spacing.lg,
  },
  genresContainer: {
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
    gap: spacing.sm,
  },
  artistCard: {
    width: 100,
    marginRight: spacing.sm,
  },
  artistImage: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  artistName: {
    ...typography.caption,
    color: colors.text.primary,
    textAlign: "center",
  },
  visibilityHelpText: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  // Word Patterns
  wordPatternsContainer: {
    marginTop: spacing.sm,
  },
  signatureWords: {
    ...typography.body,
    color: colors.text.primary,
    fontStyle: "italic",
    textAlign: "center",
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    width: "90%",
    maxHeight: "80%",
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    maxHeight: "80%",
  },
  playlistItem: {
    flexDirection: "row",
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
    justifyContent: "center",
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
  // Visibility Toggle
  visibilityToggle: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  // Logout Button
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.error,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  logoutButtonText: {
    color: colors.text.primary,
    fontWeight: "600",
    fontSize: 16,
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
    <Text style={styles.sectionTitle}>{title}</Text>
    <VisibilityToggle
      isVisible={isVisible}
      onToggle={onToggleVisibility}
      label={title}
    />
  </View>
);

export default EditProfileScreen;
