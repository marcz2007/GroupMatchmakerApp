import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabase";

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
}

const ProfileScreen = () => {
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
          Alert.alert(
            "Save Error",
            "Failed to upload new profile picture. Profile not saved."
          );
          setIsSaving(false);
          return;
        }
      }

      if (selectedPhotos.length > 0) {
        const uploadedPhotos = await uploadPhotos(selectedPhotos);
        if (uploadedPhotos.length === 0) {
          Alert.alert(
            "Save Error",
            "Failed to upload photos. Profile not saved."
          );
          setIsSaving(false);
          return;
        }
        newPhotos = uploadedPhotos;
      }

      const interestsArray = interests
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const updates: Partial<Profile> & {
        updated_at: Date;
        id: string;
        avatar_url?: string | null;
        photos?: { url: string; order: number }[];
      } = {
        id: user.id,
        username,
        bio,
        interests: interestsArray,
        updated_at: new Date(),
        firstName,
        lastName,
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
        console.error("Error updating profile:", updateError);
        Alert.alert("Error updating profile", updateError.message);
      } else {
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
      console.error("Unexpected error in handleSave:", error);
      Alert.alert("Error", "An unexpected error occurred during save.");
    } finally {
      setIsSaving(false);
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

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (editing) {
    const displayUri = selectedImage?.uri || avatarUrl;

    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Edit Profile</Text>

        <View style={styles.avatarContainer}>
          {uploading ? (
            <ActivityIndicator size="large" style={styles.avatar} />
          ) : (
            <Image
              source={
                displayUri
                  ? { uri: displayUri }
                  : require("../../assets/default-avatar.png")
              }
              style={styles.avatar}
            />
          )}
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={pickImages}
            disabled={uploading}
          >
            <Text style={styles.uploadButtonText}>
              {selectedImage ? "Change Selection" : "Choose Photo"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>First Name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Enter your first name"
        />

        <Text style={styles.label}>Last Name</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Enter your last name"
        />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Enter username"
        />

        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell others about yourself"
          multiline
        />

        <Text style={styles.label}>Interests (comma-separated)</Text>
        <TextInput
          style={styles.input}
          value={interests}
          onChangeText={setInterests}
          placeholder="e.g. art, movies, hiking"
        />

        <View style={styles.photoGallerySection}>
          <Text style={styles.label}>Profile Photos (up to 6)</Text>
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
              <Text style={styles.label}>Selected Photos ({selectedPhotos.length})</Text>
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

        <View style={styles.profileSection}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.profileValue}>{profile?.email}</Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={isSaving || uploading ? "Saving..." : "Save Changes"}
            onPress={handleSave}
            disabled={isSaving || uploading}
          />
          <Button
            title="Cancel"
            onPress={() => {
              setEditing(false);
              setSelectedImage(null);
            }}
            disabled={isSaving || uploading}
            color="gray"
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Your Profile</Text>

      <View style={styles.avatarContainer}>
        <Image
          source={
            avatarUrl
              ? { uri: avatarUrl }
              : require("../../assets/default-avatar.png")
          }
          style={styles.avatar}
        />
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.profileValue}>
          {profile?.firstName || "Not set"}
        </Text>
      </View>
      <View style={styles.profileSection}>
        <Text style={styles.label}>Username</Text>
        <Text style={styles.profileValue}>
          {profile?.username || "Not set"}
        </Text>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.label}>Bio</Text>
        <Text style={styles.profileValue}>{profile?.bio || "Not set"}</Text>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.label}>Interests</Text>
        <Text style={styles.profileValue}>
          {profile?.interests && profile.interests.length > 0
            ? profile.interests.join(", ")
            : "Not set"}
        </Text>
      </View>

      <View style={styles.photoGallerySection}>
        <Text style={styles.label}>Photos</Text>
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

      <View style={styles.protectedSection}>
        <Text style={styles.protectedTitle}>Things only you can see</Text>
        <View style={styles.protectedContent}>
          <View style={styles.protectedItem}>
            <Text style={styles.protectedLabel}>Email</Text>
            <Text style={styles.protectedValue}>{profile?.email || "Not set"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Edit Profile" onPress={() => setEditing(true)} />
        <Button title="Logout" onPress={handleLogout} color="red" />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  profileSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
  },
  profileValue: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    backgroundColor: "#fff",
  },
  bioInput: {
    height: 100,
    textAlignVertical: "top",
  },
  buttonContainer: {
    marginTop: 20,
    marginBottom: 40,
    gap: 10,
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e1e1e1",
    marginBottom: 10,
  },
  uploadButton: {
    backgroundColor: "#5762b7",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 5,
  },
  uploadButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  protectedSection: {
    marginTop: 30,
    marginBottom: 20,
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  protectedTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#495057",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#dee2e6",
    paddingBottom: 10,
  },
  protectedContent: {
    gap: 15,
  },
  protectedItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  protectedLabel: {
    fontSize: 15,
    color: "#6c757d",
    fontWeight: "500",
  },
  protectedValue: {
    fontSize: 15,
    color: "#212529",
    fontWeight: "400",
  },
  photoGallerySection: {
    marginBottom: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  photoContainer: {
    width: '30%',
    aspectRatio: 1,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'red',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addPhotoButton: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: '#e1e1e1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
  },
  addPhotoButtonText: {
    fontSize: 32,
    color: '#666',
  },
  selectedPhotosPreview: {
    marginTop: 20,
  },
  selectedPhotosScroll: {
    marginTop: 10,
  },
  selectedPhotoContainer: {
    width: 100,
    height: 100,
    marginRight: 10,
    position: 'relative',
  },
  selectedPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeSelectedPhotoButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'red',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoGallery: {
    marginTop: 10,
  },
  galleryPhoto: {
    width: 200,
    height: 200,
    marginRight: 10,
    borderRadius: 8,
  },
  noPhotosText: {
    color: '#666',
    fontStyle: 'italic',
    marginTop: 10,
  },
});

export default ProfileScreen;
