import { RouteProp, useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button as CustomButton } from "../components/Button";
import { GroupAvailabilityCalendar } from "../components/calendar/GroupAvailabilityCalendar";
import { ProposalCard } from "../components/ProposalCard";
import ProposalVoteModal from "../components/ProposalVoteModal";
import { GroupAIAnalysisSection } from "../components/profile/GroupAIAnalysisSection";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  ProposalWithVotes,
  VoteValue,
  castVote,
  getGroupProposals,
  subscribeToGroupProposals,
} from "../services/proposalService";
import {
  EventRoomWithDetails,
  getGroupEventRooms,
} from "../services/eventRoomService";
import { supabase } from "../supabase";
import { colors } from "../theme/theme";

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
  first_name?: string | null;
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
  const [groupMessageCount, setGroupMessageCount] = useState(0);
  const [hasGroupMessages, setHasGroupMessages] = useState(false);

  // Proposals and Event Rooms state
  const [proposals, setProposals] = useState<ProposalWithVotes[]>([]);
  const [eventRooms, setEventRooms] = useState<EventRoomWithDetails[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [selectedProposal, setSelectedProposal] =
    useState<ProposalWithVotes | null>(null);
  const [showVoteModal, setShowVoteModal] = useState(false);

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

      // Fetch group members using RPC function
      const { data: memberData, error: memberError } = await supabase.rpc(
        "get_group_members",
        { p_group_id: groupId }
      );

      if (memberError) {
        console.error("Error fetching members:", memberError);
        throw memberError;
      }

      console.log("Member data from get_group_members:", memberData);

      if (memberData && Array.isArray(memberData) && memberData.length > 0) {
        const mappedMembers = memberData.map((profile: any) => ({
          id: profile.id,
          username: profile.username || "Unknown User",
          first_name: profile.first_name,
          avatar_url: profile.avatar_url,
        })) as GroupMember[];

        console.log("Fetched members:", mappedMembers);
        setMembers(mappedMembers);
      } else {
        setMembers([]);
      }

      // Add this after fetching group details
      const { data: groupSettings } = await supabase
        .from("groups")
        .select("enable_ai_analysis")
        .eq("id", groupId)
        .single();

      setEnableAIAnalysis(groupSettings?.enable_ai_analysis || false);

      // Fetch group message count for AI analysis
      try {
        const { count, error: messageError } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId);

        if (!messageError && count !== null) {
          setGroupMessageCount(count);
          setHasGroupMessages(count > 0);
        }
      } catch (messageCountError) {
        console.error("Error fetching group message count:", messageCountError);
      }
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

  // Refresh data when screen comes into focus (e.g., after adding a member)
  useFocusEffect(
    useCallback(() => {
      if (groupId) {
        fetchGroupData();
      }
    }, [groupId, fetchGroupData])
  );

  // Fetch proposals for the group
  const fetchProposals = useCallback(async () => {
    setLoadingProposals(true);
    try {
      const data = await getGroupProposals(groupId);
      setProposals(data);
    } catch (error) {
      console.error("Error fetching proposals:", error);
    } finally {
      setLoadingProposals(false);
    }
  }, [groupId]);

  // Fetch event rooms for the group
  const fetchEventRooms = useCallback(async () => {
    try {
      const data = await getGroupEventRooms(groupId);
      setEventRooms(data.filter((room) => !room.is_expired));
    } catch (error) {
      console.error("Error fetching event rooms:", error);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      fetchProposals();
      fetchEventRooms();
    }
  }, [groupId, fetchProposals, fetchEventRooms]);

  // Subscribe to proposal updates
  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = subscribeToGroupProposals(groupId, () => {
      fetchProposals();
      fetchEventRooms();
    });
    return unsubscribe;
  }, [groupId, fetchProposals, fetchEventRooms]);

  const handleVoteOnProposal = async (
    proposal: ProposalWithVotes,
    vote: VoteValue
  ) => {
    try {
      const result = await castVote(proposal.proposal.id, vote);
      if (result.threshold_met && result.event_room_id) {
        Alert.alert(
          "Event Created!",
          "The proposal reached its threshold. An event room has been created!",
          [{ text: "OK" }]
        );
      }
      fetchProposals();
      fetchEventRooms();
    } catch (error) {
      console.error("Error voting:", error);
      Alert.alert("Error", "Failed to submit vote");
    }
  };

  const handleOpenProposal = (proposal: ProposalWithVotes) => {
    setSelectedProposal(proposal);
    setShowVoteModal(true);
  };

  const handleNavigateToEventRoom = (eventRoom: EventRoomWithDetails) => {
    navigation.navigate("EventRoom", {
      eventRoomId: eventRoom.event_room.id,
      title: eventRoom.event_room.title,
    });
  };

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

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error(
        "[handleConfirmImageUpload] Authentication error:",
        authError
      );
      Alert.alert("Error", "Please log in to upload images.");
      setIsUploadingPicture(false);
      return;
    }
    console.log("[handleConfirmImageUpload] User authenticated:", user.id);

    // Debug Supabase configuration
    console.log(
      "[handleConfirmImageUpload] Supabase URL:",
      process.env.SUPABASE_URL || "Not set"
    );
    console.log(
      "[handleConfirmImageUpload] Supabase Anon Key:",
      process.env.SUPABASE_ANON_KEY ? "Set" : "Not set"
    );

    // Check if supabase client is properly configured
    console.log("[handleConfirmImageUpload] Supabase client:", {
      hasStorage: !!supabase.storage,
      hasAuth: !!supabase.auth,
      hasFrom: !!supabase.storage?.from,
    });

    try {
      const { uri: imageUri, asset } = selectedImageData;

      const fileName = `${groupId}_primary_${Date.now()}.${imageUri
        .split(".")
        .pop()}`;
      const filePath = `${fileName}`;

      // Also try a simpler path for testing
      const simpleFilePath = `test_${Date.now()}.jpg`;

      // Convert URI to Blob using fetch instead of XMLHttpRequest
      console.log(
        "[handleConfirmImageUpload] Attempting Blob conversion via fetch..."
      );

      let blob: Blob;
      try {
        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(imageUri, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        blob = await response.blob();
        console.log(
          `[handleConfirmImageUpload] Blob conversion successful. Size: ${blob.size}, Type: ${blob.type}`
        );

        // Check file size (limit to 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (blob.size > maxSize) {
          throw new Error(
            `Image file too large (${Math.round(
              blob.size / 1024 / 1024
            )}MB). Please select a smaller image (max 10MB).`
          );
        }

        // Ensure blob has proper type
        if (!blob.type || blob.type === "") {
          console.log(
            "[handleConfirmImageUpload] Blob has no type, setting to image/jpeg"
          );
          // Create a new blob with proper type
          blob = new Blob([blob], { type: "image/jpeg" });
        }
      } catch (fetchError) {
        console.error("[handleConfirmImageUpload] Fetch error:", fetchError);

        // Try alternative method using XMLHttpRequest
        try {
          console.log(
            "[handleConfirmImageUpload] Trying XMLHttpRequest fallback..."
          );
          blob = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", imageUri);
            xhr.responseType = "blob";
            xhr.onload = () => {
              if (xhr.status === 200) {
                resolve(xhr.response);
              } else {
                reject(new Error(`HTTP error! status: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error("Network request failed"));
            xhr.send();
          });
          console.log(
            `[handleConfirmImageUpload] XMLHttpRequest fallback successful. Size: ${blob.size}, Type: ${blob.type}`
          );

          // Check file size (limit to 10MB)
          const maxSize = 10 * 1024 * 1024; // 10MB
          if (blob.size > maxSize) {
            throw new Error(
              `Image file too large (${Math.round(
                blob.size / 1024 / 1024
              )}MB). Please select a smaller image (max 10MB).`
            );
          }

          // Ensure blob has proper type
          if (!blob.type || blob.type === "") {
            console.log(
              "[handleConfirmImageUpload] XMLHttpRequest blob has no type, setting to image/jpeg"
            );
            // Create a new blob with proper type
            blob = new Blob([blob], { type: "image/jpeg" });
          }
        } catch (fallbackError) {
          console.error(
            "[handleConfirmImageUpload] Fallback also failed:",
            fallbackError
          );
          const errorMessage =
            fetchError instanceof Error
              ? fetchError.message
              : "Unknown fetch error";
          throw new Error(`Failed to read image file: ${errorMessage}`);
        }
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

      // Check if bucket exists and is accessible
      try {
        const { data: bucketData, error: bucketError } = await supabase.storage
          .from("group-images")
          .list("", { limit: 1 });

        if (bucketError) {
          console.error(
            "[handleConfirmImageUpload] Bucket access error:",
            bucketError
          );
          throw new Error(
            `Storage bucket not accessible: ${bucketError.message}`
          );
        }
        console.log("[handleConfirmImageUpload] Bucket access confirmed");
        console.log("[handleConfirmImageUpload] Bucket data:", bucketData);
      } catch (bucketCheckError) {
        console.error(
          "[handleConfirmImageUpload] Bucket check failed:",
          bucketCheckError
        );
        throw new Error(
          "Storage bucket not available. Please check your Supabase configuration."
        );
      }

      // Test a simple storage operation
      try {
        console.log("[handleConfirmImageUpload] Testing storage connection...");
        const testResult = await supabase.storage
          .from("group-images")
          .list("", { limit: 0 });
        console.log(
          "[handleConfirmImageUpload] Storage connection test successful"
        );
      } catch (testError) {
        console.error(
          "[handleConfirmImageUpload] Storage connection test failed:",
          testError
        );
        throw new Error(
          "Storage connection failed. Please check your Supabase storage configuration."
        );
      }

      // Validate blob before upload
      console.log("[handleConfirmImageUpload] Blob validation:", {
        size: blob.size,
        type: blob.type,
        hasData: blob.size > 0,
      });

      if (!blob || blob.size === 0) {
        throw new Error(
          "Invalid blob data. Please try selecting the image again."
        );
      }

      // Try alternative upload method using FormData
      console.log(
        "[handleConfirmImageUpload] Trying FormData upload method..."
      );

      let uploadData = null;
      let uploadError = null;

      try {
        // Convert blob to File object
        const file = new File([blob], filePath, { type: "image/jpeg" });

        // Create FormData
        const formData = new FormData();
        formData.append("file", file);

        // Get the upload URL
        const uploadUrl = `${process.env.SUPABASE_URL}/storage/v1/object/group-images/${filePath}`;

        console.log("[handleConfirmImageUpload] Upload URL:", uploadUrl);

        // Make direct HTTP request
        console.log(
          "[handleConfirmImageUpload] Making direct HTTP request to:",
          uploadUrl
        );
        console.log("[handleConfirmImageUpload] Request headers:", {
          Authorization: `Bearer ${
            process.env.SUPABASE_ANON_KEY ? "SET" : "NOT SET"
          }`,
          "Content-Type": "multipart/form-data",
        });
        console.log("[handleConfirmImageUpload] FormData created successfully");

        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
            "Content-Type": "multipart/form-data",
          },
          body: formData,
          // Add timeout to identify network issues
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        console.log("[handleConfirmImageUpload] Direct upload response:", {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            "[handleConfirmImageUpload] Direct upload error:",
            errorText
          );
          throw new Error(
            `Upload failed: ${response.status} ${response.statusText}`
          );
        }

        const uploadResult = await response.json();
        console.log(
          "[handleConfirmImageUpload] Direct upload success:",
          uploadResult
        );

        uploadData = uploadResult;
        uploadError = null;
      } catch (directUploadError) {
        console.error(
          "[handleConfirmImageUpload] Direct upload failed:",
          directUploadError
        );

        // Check if it's a timeout error
        if (directUploadError instanceof Error) {
          if (directUploadError.name === "AbortError") {
            console.error(
              "[handleConfirmImageUpload] Upload timed out after 30 seconds"
            );
          } else if (
            directUploadError.message.includes("Network request failed")
          ) {
            console.error(
              "[handleConfirmImageUpload] Network request failed - possible connectivity issue"
            );
          }
        }

        // Fallback to original Supabase method
        console.log(
          "[handleConfirmImageUpload] Falling back to Supabase client method..."
        );

        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(
              `[handleConfirmImageUpload] Upload attempt ${attempt}/${maxRetries}`
            );

            // Try different upload approaches
            let result;

            if (attempt === 1) {
              // First attempt: Standard upload with proper content type
              result = await supabase.storage
                .from("group-images")
                .upload(filePath, blob, {
                  cacheControl: "3600",
                  upsert: true,
                  contentType: "image/jpeg", // Force JPEG content type
                });
            } else if (attempt === 2) {
              // Second attempt: Try without upsert and with explicit content type
              result = await supabase.storage
                .from("group-images")
                .upload(filePath, blob, {
                  cacheControl: "3600",
                  upsert: false,
                  contentType: "image/jpeg", // Force JPEG content type
                });
            } else {
              // Third attempt: Try with simple path and minimal options
              result = await supabase.storage
                .from("group-images")
                .upload(simpleFilePath, blob, {
                  contentType: "image/jpeg", // Force JPEG content type
                });
            }

            // Log the result for debugging
            console.log(
              `[handleConfirmImageUpload] Upload result for attempt ${attempt}:`,
              {
                success: !result.error,
                error: result.error,
                data: result.data,
              }
            );

            uploadData = result.data;
            uploadError = result.error;

            if (!uploadError) {
              console.log(
                `[handleConfirmImageUpload] Upload successful on attempt ${attempt}`
              );
              break;
            }

            console.log(
              `[handleConfirmImageUpload] Upload error on attempt ${attempt}:`,
              uploadError
            );

            if (attempt < maxRetries) {
              console.log(
                `[handleConfirmImageUpload] Upload failed, retrying in 2 seconds...`
              );
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          } catch (retryError) {
            console.error(
              `[handleConfirmImageUpload] Upload attempt ${attempt} failed:`,
              retryError
            );
            if (attempt === maxRetries) {
              throw retryError;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        if (uploadError) {
          console.error(
            "[handleConfirmImageUpload] Supabase upload error after retries:",
            uploadError
          );
          throw uploadError; // Re-throw Supabase specific error
        }
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
      } else if (
        err.message.includes("Storage bucket not accessible") ||
        err.message.includes("Storage bucket not available")
      ) {
        errorMessage =
          "Storage configuration issue. Please check your Supabase setup.";
      } else if (
        err.message.includes("storage") ||
        err.message.includes("Storage")
      ) {
        errorMessage = "Failed to upload image to storage. Please try again.";
      } else if (err.message.includes("Network request failed")) {
        errorMessage =
          "Network connection failed. Please check your internet connection and try again.";
      } else if (err.message.includes("Image file too large")) {
        errorMessage = err.message;
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

  const renderMemberItem = ({ item }: { item: GroupMember }) => {
    console.log("Rendering member item:", item);

    const firstName = item.first_name || "";
    const username = item.username;

    return (
      <View style={styles.memberItem}>
        {item.avatar_url ? (
          <Image
            source={{ uri: item.avatar_url }}
            style={styles.memberAvatar}
          />
        ) : (
          <View style={styles.memberAvatarPlaceholder} />
        )}
        <View style={styles.memberNameContainer}>
          {firstName ? (
            <View style={styles.memberNameRow}>
              <Text
                style={styles.memberFirstName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {firstName}
              </Text>
              <Text
                style={styles.memberUsername}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                @{username}
              </Text>
            </View>
          ) : (
            <Text
              style={styles.memberUsername}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              @{username}
            </Text>
          )}
        </View>
      </View>
    );
  };

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
          <View style={styles.memberActions}>
            <TouchableOpacity
              style={styles.addMemberButton}
              onPress={() =>
                navigation.navigate("AddUserToGroup", {
                  groupId,
                  groupName: groupDetails?.name || initialGroupName,
                })
              }
            >
              <Ionicons name="person-add" size={18} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareInvite}
              style={styles.shareButton}
            >
              <Text style={styles.shareButtonText}>Share Invite</Text>
            </TouchableOpacity>
          </View>
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

      {/* Group Availability Calendar */}
      <View style={styles.section}>
        <GroupAvailabilityCalendar groupId={groupId} />
      </View>

      {/* <View style={styles.section}>
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

        {!enableAIAnalysis ? (
          <Text style={styles.settingDescription}>
            Enable AI analysis to get insights about group communication
            patterns and help find better matches for group members.
          </Text>
        ) : (
          <View>
            <Text style={styles.settingDescription}>
              ✅ AI analysis is enabled for this group! Messages will be
              analyzed to understand communication styles and preferences.
            </Text>
            <View style={styles.requirementsContainer}>
              <Text style={styles.requirementsTitle}>How it works:</Text>
              <Text style={styles.requirementText}>
                • Messages sent in this group will be analyzed for communication
                patterns
              </Text>
              <Text style={styles.requirementText}>
                • Analysis helps match group members with compatible people
              </Text>
              <Text style={styles.requirementText}>
                • Only works when both users and groups have AI analysis enabled
              </Text>
              <Text style={styles.requirementText}>
                • Requires at least 5 messages per user to generate insights
              </Text>
            </View>
            <Text style={styles.note}>
              💡 Encourage group members to enable AI analysis in their profiles
              and send messages to get the most out of this feature.
            </Text>
          </View>
        )}
      </View> */}

      {/* Event Rooms Section */}
      {eventRooms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Event Rooms</Text>
          {eventRooms.map((room) => (
            <TouchableOpacity
              key={room.event_room.id}
              style={styles.eventRoomCard}
              onPress={() => handleNavigateToEventRoom(room)}
            >
              <View style={styles.eventRoomHeader}>
                <Text style={styles.eventRoomTitle}>
                  {room.event_room.title}
                </Text>
                <View style={styles.eventRoomBadge}>
                  <Text style={styles.eventRoomBadgeText}>
                    {room.participant_count} joined
                  </Text>
                </View>
              </View>
              {room.event_room.starts_at && (
                <Text style={styles.eventRoomDate}>
                  {new Date(room.event_room.starts_at).toLocaleDateString(
                    "en-US",
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }
                  )}
                </Text>
              )}
              <Text style={styles.eventRoomTapText}>Tap to open chat</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Proposals Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Proposals</Text>
          <TouchableOpacity
            style={styles.createProposalButton}
            onPress={() =>
              navigation.navigate("CreateProposal", {
                groupId,
                groupName: groupDetails?.name || initialGroupName,
              })
            }
          >
            <Text style={styles.createProposalButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
        {loadingProposals ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : proposals.length > 0 ? (
          proposals.map((proposal) => (
            <ProposalCard
              key={proposal.proposal.id}
              proposal={proposal}
              onPress={() => handleOpenProposal(proposal)}
              onVote={(vote) => handleVoteOnProposal(proposal, vote)}
            />
          ))
        ) : (
          <Text style={styles.emptyProposalsText}>
            No proposals yet. Create one to suggest an activity!
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <GroupAIAnalysisSection
          enabled={enableAIAnalysis}
          onToggle={async (value) => {
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
          memberCount={members.length}
          hasMessages={hasGroupMessages}
          messageCount={groupMessageCount}
        />
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

      {/* Proposal Vote Modal */}
      <ProposalVoteModal
        visible={showVoteModal}
        onClose={() => {
          setShowVoteModal(false);
          setSelectedProposal(null);
        }}
        proposal={selectedProposal}
        onVoteSuccess={() => {
          fetchProposals();
          fetchEventRooms();
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a", // Anthracite grey background
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#1a1a1a",
  },
  errorText: {
    color: "#ef4444", // Red for errors
    fontSize: 16,
    textAlign: "center",
  },
  pictureSection: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#2a2a2a", // Dark surface
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333333", // Dark divider
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
    backgroundColor: "#3a3a3a", // Dark surface light
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  placeholderText: {
    color: "#b0b0b0", // Medium grey
  },
  bioSection: {
    padding: 20,
    backgroundColor: "#2a2a2a", // Dark surface
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333333", // Dark divider
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#ffffff", // White text
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
    color: "#e0e0e0", // Light grey text
    marginBottom: 15,
  },
  input: {
    borderColor: "#404040", // Dark border
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#3a3a3a", // Dark surface light
    color: "#ffffff", // White text
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
    backgroundColor: "#2a2a2a", // Dark surface
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333333", // Dark divider
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    backgroundColor: "#3a3a3a", // Dark surface light
  },
  memberAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    backgroundColor: "#404040", // Dark grey
  },
  memberName: {
    fontSize: 16,
    color: "#ffffff", // White text
  },
  memberNameContainer: {
    flex: 1,
    justifyContent: "center",
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  memberFirstName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff", // White text
    marginRight: 8,
  },
  memberUsername: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#b0b0b0", // Medium grey
  },
  actionButton: {
    backgroundColor: "#5762b7", // Primary color
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  actionButtonText: {
    color: "#ffffff", // White text
    fontWeight: "bold",
    fontSize: 14,
  },
  disabledButton: {
    backgroundColor: "#555555", // Disabled grey
  },
  section: {
    padding: 20,
    backgroundColor: "#2a2a2a", // Dark surface
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333333", // Dark divider
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
    color: "#ffffff", // White text
  },
  settingDescription: {
    fontSize: 14,
    color: "#b0b0b0", // Medium grey
  },
  memberActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addMemberButton: {
    backgroundColor: "#5762b7",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButton: {
    backgroundColor: "#5762b7", // Primary color
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  shareButtonText: {
    color: "#ffffff", // White text
    fontWeight: "bold",
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)", // Darker overlay
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#2a2a2a", // Dark surface
    padding: 20,
    borderRadius: 20,
    width: "80%",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#ffffff", // White text
  },
  previewImage: {
    width: "100%",
    height: "50%",
    borderRadius: 10,
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 16,
    color: "#e0e0e0", // Light grey
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 20,
  },
  cancelModalButton: {
    backgroundColor: "#555555", // Dark grey
    flex: 1,
    marginRight: 10,
  },
  confirmModalButton: {
    backgroundColor: "#5762b7", // Primary color
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
    color: "#ffffff", // White text
    fontWeight: "bold",
    fontSize: 14,
  },
  requirementsContainer: {
    marginTop: 10,
    marginBottom: 10,
  },
  requirementsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#ffffff", // White text
  },
  requirementText: {
    fontSize: 14,
    color: "#e0e0e0", // Light grey
    marginBottom: 4,
  },
  note: {
    fontSize: 12,
    color: "#b0b0b0", // Medium grey
    fontStyle: "italic",
    marginTop: 10,
  },
  // Event Rooms styles
  eventRoomCard: {
    backgroundColor: "#3a3a3a",
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#10b981", // Success green
  },
  eventRoomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eventRoomTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    flex: 1,
  },
  eventRoomBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventRoomBadgeText: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "600",
  },
  eventRoomDate: {
    fontSize: 13,
    color: "#b0b0b0",
    marginBottom: 4,
  },
  eventRoomTapText: {
    fontSize: 12,
    color: "#5762b7",
    fontStyle: "italic",
  },
  // Proposals styles
  emptyProposalsText: {
    fontSize: 14,
    color: "#b0b0b0",
    textAlign: "center",
    paddingVertical: 20,
    fontStyle: "italic",
  },
  createProposalButton: {
    backgroundColor: "#5762b7",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createProposalButtonText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 14,
  },
});

export default GroupDetailsScreen;
