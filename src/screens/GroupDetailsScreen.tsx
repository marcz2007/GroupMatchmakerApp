import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import * as ImagePicker from "expo-image-picker"; // Import expo-image-picker
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Button as CustomButton } from "../components/Button";
import { RootStackParamList } from "../navigation/AppNavigator";
import { supabase } from "../supabase";

// Define types for route and navigation
type GroupDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "GroupDetails"
>;
type GroupDetailsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "GroupDetails"
>;

// Interface for fetched group details (picture_url removed from here)
interface GroupDetailsData {
  id: string;
  name: string;
  description?: string | null;
  owner_id?: string;
}

// Interface for group images from group_images table
interface GroupImageRecord {
  id: string; // id from group_images table
  image_url: string;
  is_primary: boolean;
  image_storage_path: string; // To potentially delete old image from storage
}

// Interface for group members
interface GroupMember {
  id: string; // user_id from profiles
  username: string;
  avatar_url?: string | null;
}

const GroupDetailsScreen = () => {
  const route = useRoute<GroupDetailsScreenRouteProp>();
  const navigation = useNavigation<GroupDetailsScreenNavigationProp>();
  const { groupId, groupName: initialGroupName } = route.params;

  const [groupDetails, setGroupDetails] = useState<GroupDetailsData | null>(
    null
  );
  const [primaryImage, setPrimaryImage] = useState<GroupImageRecord | null>(
    null
  );
  // Later: const [otherImages, setOtherImages] = useState<GroupImageRecord[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [selectedImageData, setSelectedImageData] = useState<{
    uri: string;
    asset: any;
  } | null>(null);

  // State for bio editing
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editableBio, setEditableBio] = useState("");
  const [isSavingBio, setIsSavingBio] = useState(false);

  const [enableAIAnalysis, setEnableAIAnalysis] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: initialGroupName || groupDetails?.name || "Group Details",
    });
  }, [navigation, initialGroupName, groupDetails?.name]);

  useEffect(() => {
    console.log(
      "[Modal State] showImagePreview:",
      showImagePreview,
      "selectedImageData:",
      !!selectedImageData
    );
  }, [showImagePreview, selectedImageData]);

  const handleShareInvite = async () => {
    const nameForShare = groupDetails?.name || initialGroupName;
    const inviteLink = `groupmatchmakerapp://group/invite/${groupId}`;
    try {
      // For now, just show an alert with the invite link
      Alert.alert(
        "Share Invite",
        `Share this link to invite others to "${nameForShare}": ${inviteLink}`
      );
    } catch (error: any) {
      Alert.alert("Error", "Could not share invite link.");
    }
  };

  const fetchGroupData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch group-specific details (name, description)
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("id, name, description, owner_id") // Removed picture_url from here
        .eq("id", groupId)
        .single();

      if (groupError) throw groupError;
      if (!groupData) throw new Error("Group not found.");
      setGroupDetails(groupData);
      setEditableBio(groupData.description || "");
      if (!initialGroupName && groupData.name) {
        navigation.setOptions({ title: groupData.name });
      }

      // Fetch primary group image
      const { data: primaryImageData, error: primaryImageError } =
        await supabase
          .from("group_images")
          .select("id, image_url, is_primary, image_storage_path")
          .eq("group_id", groupId)
          .eq("is_primary", true)
          .maybeSingle(); // Use maybeSingle as there might be no primary image

      if (primaryImageError) throw primaryImageError;
      setPrimaryImage(primaryImageData as GroupImageRecord | null);
      // Later: Fetch otherImages here as well

      // Fetch group members
      const { data: memberData, error: memberError } = await supabase
        .from("group_members")
        .select(`user_id, profiles ( id, username, avatar_url )`)
        .eq("group_id", groupId);

      if (memberError) throw memberError;
      const mappedMembers =
        memberData
          ?.map((m) => {
            const profileData = m.profiles as any;
            if (
              profileData &&
              typeof profileData === "object" &&
              profileData.id
            ) {
              return {
                id: profileData.id,
                username: profileData.username,
                avatar_url: profileData.avatar_url,
              } as GroupMember;
            }
            return null;
          })
          .filter((profile): profile is GroupMember => profile !== null) || [];
      setMembers(mappedMembers);

      // Add this after fetching group details
      const { data: groupSettings } = await supabase
        .from("groups")
        .select("enable_ai_analysis")
        .eq("id", groupId)
        .single();

      setEnableAIAnalysis(groupSettings?.enable_ai_analysis || false);
    } catch (err: any) {
      console.error("Failed to fetch group details:", err);
      setError(err.message || "Could not load group information.");
    } finally {
      setIsLoading(false);
    }
  }, [groupId, navigation, initialGroupName]);

  useEffect(() => {
    if (groupId) {
      fetchGroupData();
    }
  }, [groupId, fetchGroupData]);

  const handleChoosePrimaryPicture = async () => {
    console.log("[handleChoosePrimaryPicture] Initiated.");
    try {
      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "Please grant permission to access the photo library."
        );
        return;
      }
      console.log("[handleChoosePrimaryPicture] Permissions granted.");

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });

      if (
        pickerResult.canceled ||
        !pickerResult.assets ||
        pickerResult.assets.length === 0
      ) {
        console.log(
          "[handleChoosePrimaryPicture] Image picker cancelled or no assets."
        );
        return;
      }

      const asset = pickerResult.assets[0];
      const imageUri = asset.uri;
      console.log(
        `[handleChoosePrimaryPicture] Image selected. URI: ${imageUri}, Asset:`,
        JSON.stringify(asset)
      );

      // Store the selected image data and show preview
      setSelectedImageData({ uri: imageUri, asset });
      setShowImagePreview(true);
      console.log(
        "[handleChoosePrimaryPicture] Image data set, modal should be visible:",
        { uri: imageUri, showModal: true }
      );
    } catch (err: any) {
      console.error("[handleChoosePrimaryPicture] Error selecting image:", err);
      Alert.alert("Error", "Could not select image. Please try again.");
    }
  };

  const handleEditBio = () => {
    if (groupDetails) {
      setEditableBio(groupDetails.description || "");
    }
    setIsEditingBio(true);
  };

  const handleCancelEditBio = () => {
    setIsEditingBio(false);
    if (groupDetails) {
      setEditableBio(groupDetails.description || "");
    }
  };

  const handleSaveBio = async () => {
    if (!groupDetails) return;
    setIsSavingBio(true);
    try {
      const { data, error: updateError } = await supabase
        .from("groups")
        .update({ description: editableBio.trim() })
        .eq("id", groupId)
        .select()
        .single();

      if (updateError) throw updateError;

      if (data) {
        setGroupDetails((prevDetails) =>
          prevDetails ? { ...prevDetails, description: data.description } : null
        );
        Alert.alert("Success", "Group description updated.");
      }
      setIsEditingBio(false);
    } catch (err: any) {
      console.error("Failed to save bio:", err);
      Alert.alert("Error", "Could not save description.");
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleConfirmImageUpload = async () => {
    if (!selectedImageData) return;

    console.log("[handleConfirmImageUpload] Starting upload process.");
    setIsUploadingPicture(true);
    setShowImagePreview(false);

    try {
      const { uri: imageUri, asset } = selectedImageData;

      const fileName = `${groupId}_primary_${Date.now()}.${imageUri
        .split(".")
        .pop()}`;
      const filePath = `${fileName}`;

      // Convert URI to Blob using fetch instead of XMLHttpRequest
      console.log(
        "[handleConfirmImageUpload] Attempting Blob conversion via fetch..."
      );

      let blob: Blob;
      try {
        const response = await fetch(imageUri);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        blob = await response.blob();
        console.log(
          `[handleConfirmImageUpload] Blob conversion successful. Size: ${blob.size}, Type: ${blob.type}`
        );
      } catch (fetchError) {
        console.error("[handleConfirmImageUpload] Fetch error:", fetchError);
        const errorMessage =
          fetchError instanceof Error
            ? fetchError.message
            : "Unknown fetch error";
        throw new Error(`Failed to read image file: ${errorMessage}`);
      }

      // If there was an old primary image, delete it from storage first
      if (primaryImage && primaryImage.image_storage_path) {
        console.log(
          `[handleConfirmImageUpload] Attempting to delete old image: ${primaryImage.image_storage_path}`
        );
        const { error: deleteError } = await supabase.storage
          .from("group-images") // Use hyphen for bucket name
          .remove([primaryImage.image_storage_path]);
        if (deleteError) {
          console.warn(
            "[handleConfirmImageUpload] Failed to delete old image from storage:",
            deleteError
          );
        } else {
          console.log(
            "[handleConfirmImageUpload] Old image deleted successfully from storage."
          );
        }
      }

      // Upload new image to Supabase Storage
      console.log(
        `[handleConfirmImageUpload] Attempting to upload to Supabase Storage. Bucket: group-images, Path: ${filePath}, ContentType: ${
          asset.mimeType || blob.type || "image/jpeg"
        }`
      );
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("group-images") // Use hyphen for bucket name
        .upload(filePath, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType: asset.mimeType || blob.type || "image/jpeg",
        });

      if (uploadError) {
        console.error(
          "[handleConfirmImageUpload] Supabase upload error:",
          uploadError
        );
        throw uploadError; // Re-throw Supabase specific error
      }
      if (!uploadData)
        throw new Error("Supabase upload failed, no data returned.");
      console.log(
        "[handleConfirmImageUpload] Supabase upload successful:",
        uploadData
      );

      // Get public URL
      console.log("[handleConfirmImageUpload] Getting public URL...");
      const { data: urlData } = supabase.storage
        .from("group-images") // Use hyphen for bucket name
        .getPublicUrl(filePath);

      if (!urlData.publicUrl) throw new Error("Failed to get public URL.");
      const newImageUrl = urlData.publicUrl;
      console.log(
        `[handleConfirmImageUpload] Public URL obtained: ${newImageUrl}`
      );

      // Update database (group_images table)
      console.log("[handleConfirmImageUpload] Updating database records...");
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const uploaderUserId = currentUser?.id;

      const { error: demoteError } = await supabase
        .from("group_images") // Underscore for table
        .update({ is_primary: false })
        .eq("group_id", groupId)
        .eq("is_primary", true);

      if (demoteError) {
        console.error(
          "[handleConfirmImageUpload] Error demoting old primary image in DB:",
          demoteError
        );
      }

      let newPrimaryImageRecord: GroupImageRecord | null = null;
      if (primaryImage) {
        console.log(
          `[handleConfirmImageUpload] Updating existing DB record ID: ${primaryImage.id}`
        );
        const { data: updatedRecord, error: updateDbError } = await supabase
          .from("group_images") // Underscore for table
          .update({
            image_url: newImageUrl,
            image_storage_path: filePath,
            is_primary: true,
            uploaded_at: new Date().toISOString(),
            uploader_user_id: uploaderUserId,
          })
          .eq("id", primaryImage.id)
          .select("id, image_url, is_primary, image_storage_path")
          .single();
        if (updateDbError) {
          console.error(
            "[handleConfirmImageUpload] Error updating DB record:",
            updateDbError
          );
          throw updateDbError;
        }
        newPrimaryImageRecord = updatedRecord;
        console.log("[handleConfirmImageUpload] DB record updated.");
      } else {
        console.log("[handleConfirmImageUpload] Inserting new DB record...");
        const { data: insertedRecord, error: insertDbError } = await supabase
          .from("group_images") // Underscore for table
          .insert({
            group_id: groupId,
            image_url: newImageUrl,
            image_storage_path: filePath,
            is_primary: true,
            uploader_user_id: uploaderUserId,
          })
          .select("id, image_url, is_primary, image_storage_path")
          .single();
        if (insertDbError) {
          console.error(
            "[handleConfirmImageUpload] Error inserting DB record:",
            insertDbError
          );
          throw insertDbError;
        }
        newPrimaryImageRecord = insertedRecord;
        console.log("[handleConfirmImageUpload] New DB record inserted.");
      }

      setPrimaryImage(newPrimaryImageRecord);
      setSelectedImageData(null);
      Alert.alert("Success", "Group picture updated!");
      console.log("[handleConfirmImageUpload] Process completed successfully.");
    } catch (err: any) {
      console.error("[handleConfirmImageUpload] Caught Error:", err);

      // Provide more specific error messages
      let errorMessage = "Could not change group picture.";

      if (err.message.includes("Failed to read image file")) {
        errorMessage =
          "Could not read the selected image. Please try selecting a different image.";
      } else if (err.message.includes("HTTP error")) {
        errorMessage =
          "Network error while processing image. Please check your connection and try again.";
      } else if (err.message.includes("storage")) {
        errorMessage = "Failed to upload image to storage. Please try again.";
      } else if (err.message) {
        errorMessage = err.message;
      }

      Alert.alert("Error", errorMessage);
    } finally {
      console.log("[handleConfirmImageUpload] Finished.");
      setIsUploadingPicture(false);
    }
  };

  const handleCancelImageUpload = () => {
    setShowImagePreview(false);
    setSelectedImageData(null);
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !groupDetails) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {error || "Group data could not be loaded."}
        </Text>
      </View>
    );
  }

  const renderMemberItem = ({ item }: { item: GroupMember }) => (
    <View style={styles.memberItem}>
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.memberAvatar} />
      ) : (
        <View style={styles.memberAvatarPlaceholder} />
      )}
      <Text style={styles.memberName}>{item.username}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.pictureSection}>
        {isUploadingPicture ? (
          <View style={styles.groupImagePlaceholder}>
            <ActivityIndicator size="large" />
          </View>
        ) : primaryImage?.image_url ? (
          <Image
            source={{ uri: primaryImage.image_url }}
            style={styles.groupImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.groupImagePlaceholder}>
            <Text style={styles.placeholderText}>No Group Picture</Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.actionButton,
            isUploadingPicture && styles.disabledButton,
          ]}
          onPress={handleChoosePrimaryPicture}
          disabled={isUploadingPicture}
        >
          <Text style={styles.actionButtonText}>
            {isUploadingPicture ? "Uploading..." : "Change Picture"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bioSection}>
        <Text style={styles.sectionTitle}>Description</Text>
        {isEditingBio ? (
          <>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={editableBio}
              onChangeText={setEditableBio}
              placeholder="Enter group description..."
              multiline
              numberOfLines={4}
              editable={!isSavingBio}
            />
            <View style={styles.bioActionsContainer}>
              <CustomButton
                variant="ghost"
                onPress={handleCancelEditBio}
                disabled={isSavingBio}
              >
                Cancel
              </CustomButton>
              <CustomButton
                variant="primary"
                onPress={handleSaveBio}
                disabled={isSavingBio}
                loading={isSavingBio}
              >
                {isSavingBio ? "Saving..." : "Save"}
              </CustomButton>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.bioText}>
              {groupDetails?.description || "No description provided."}
            </Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleEditBio}
            >
              <Text style={styles.actionButtonText}>Edit Description</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.membersSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Members ({members.length})</Text>
          <TouchableOpacity
            onPress={handleShareInvite}
            style={styles.shareButton}
          >
            <Text style={styles.shareButtonText}>Share Invite</Text>
          </TouchableOpacity>
        </View>
        {members.length > 0 ? (
          <FlatList
            data={members}
            renderItem={renderMemberItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        ) : (
          <Text>No members found.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Analysis</Text>
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>Enable AI Analysis</Text>
          <Switch
            value={enableAIAnalysis}
            onValueChange={async (value) => {
              try {
                const { error } = await supabase
                  .from("groups")
                  .update({ enable_ai_analysis: value })
                  .eq("id", groupId);

                if (error) throw error;
                setEnableAIAnalysis(value);
              } catch (error) {
                console.error("Error updating AI analysis setting:", error);
                Alert.alert("Error", "Failed to update AI analysis setting");
              }
            }}
            trackColor={{ false: "#767577", true: "#5762b7" }}
            thumbColor={enableAIAnalysis ? "#f4f3f4" : "#f4f3f4"}
          />
        </View>
        <Text style={styles.settingDescription}>
          When enabled, messages in this group will be analyzed to help find
          better matches. This helps us understand communication styles and
          preferences of group members.
        </Text>
      </View>

      {/* Image Preview Modal */}
      <Modal
        visible={showImagePreview}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancelImageUpload}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Preview Group Picture</Text>

            {selectedImageData && (
              <Image
                source={{ uri: selectedImageData.uri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            )}

            <Text style={styles.modalDescription}>
              This will be your group's profile picture. Do you want to upload
              it?
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={handleCancelImageUpload}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={handleConfirmImageUpload}
                disabled={isUploadingPicture}
              >
                <Text style={styles.modalButtonText}>
                  {isUploadingPicture ? "Uploading..." : "Upload"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f4f8",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    color: "red",
    fontSize: 16,
    textAlign: "center",
  },
  pictureSection: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  groupImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: 15,
  },
  groupImagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  placeholderText: {
    color: "#777",
  },
  bioSection: {
    padding: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  bioText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#555",
    marginBottom: 15,
  },
  input: {
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  bioInput: {
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  bioActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  membersSection: {
    padding: 20,
    backgroundColor: "#fff",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    backgroundColor: "#e9e9e9",
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    backgroundColor: "#ccc",
  },
  memberName: {
    fontSize: 16,
    color: "#333",
  },
  actionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  disabledButton: {
    backgroundColor: "#cccccc",
  },
  section: {
    padding: 20,
    backgroundColor: "#fff",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  toggleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 10,
    color: "#333",
  },
  settingDescription: {
    fontSize: 14,
    color: "#555",
  },
  shareButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  shareButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 20,
    width: "80%",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  previewImage: {
    width: "100%",
    height: "50%",
    borderRadius: 10,
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 16,
    color: "#555",
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 20,
  },
  cancelModalButton: {
    backgroundColor: "#ccc",
    flex: 1,
    marginRight: 10,
  },
  confirmModalButton: {
    backgroundColor: "#007AFF",
    flex: 1,
    marginLeft: 10,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
});

export default GroupDetailsScreen;
