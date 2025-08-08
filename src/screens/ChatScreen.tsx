// src/screens/ChatScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { RealtimeChannel } from "@supabase/supabase-js";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GiftedChat, IMessage, InputToolbar } from "react-native-gifted-chat";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import { RootStackNavigationProp } from "../../App";
import { RootStackParamList } from "../navigation/AppNavigator";
import { supabase } from "../supabase";
import { analyzeUserChatMessages } from "../utils/aiAnalysis";

// Define the type for the route parameters expected by this screen
type ChatScreenRouteProp = RouteProp<RootStackParamList, "Chat">;
type ChatScreenNavigationProp = RootStackNavigationProp<"Chat">;

// Define a shape for profile data (assuming you have a 'profiles' table)
interface Profile {
  username: string;
  // avatar_url?: string; // Optional avatar
}

const ChatScreen = () => {
  const route = useRoute<ChatScreenRouteProp>();
  const navigation = useNavigation<ChatScreenNavigationProp>();
  const { groupId, groupName: initialGroupName } = route.params;

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGroupMember, setIsGroupMember] = useState(false);
  const [fetchedGroupName, setFetchedGroupName] = useState<string | undefined>(
    initialGroupName
  );
  const [processingJoin, setProcessingJoin] = useState(false);

  // Set keyboard handler with workletized functions
  useKeyboardHandler({
    onStart: () => {
      "worklet"; // Add this directive
      // Optional: handle keyboard movement start
      // console.log('Keyboard movement started');
    },
    onMove: (e) => {
      "worklet"; // Add this directive
      // Optional: handle keyboard movement
      // console.log('Keyboard moving:', e.height);
    },
    onEnd: () => {
      "worklet"; // Add this directive
      // Optional: handle keyboard movement end
      // console.log('Keyboard movement ended');
    },
  });

  const fetchMessages = useCallback(
    async (userId: string) => {
      if (!userId || !isGroupMember || processingJoin) return;
      setIsLoading(true);
      try {
        const { data, error } = await supabase.rpc(
          "get_messages_with_usernames",
          {
            p_group_id: groupId,
            p_limit: 50,
          }
        );

        if (error) throw error;

        if (data) {
          const loadedMessages = data.map(
            (msg: any): IMessage => ({
              _id: msg.id,
              text: msg.content,
              createdAt: new Date(msg.created_at),
              user: {
                _id: msg.user_id,
                name: msg.username || `User ${msg.user_id.substring(0, 4)}`,
              },
            })
          );
          setMessages(loadedMessages);
        }
      } catch (error: any) {
        console.error("Error fetching messages:", error);
        Alert.alert("Error", "Could not fetch messages.");
      } finally {
        setIsLoading(false);
      }
    },
    [groupId, isGroupMember, processingJoin]
  );

  useEffect(() => {
    const checkMembershipAndPromptToJoin = async (
      userId: string,
      currentGroupId: string,
      nameDisplay: string
    ) => {
      setProcessingJoin(true);
      try {
        const { data: memberData, error: memberError } = await supabase
          .from("group_members")
          .select("id")
          .eq("group_id", currentGroupId)
          .eq("user_id", userId)
          .maybeSingle();

        if (memberError) throw memberError;

        if (memberData) {
          setIsGroupMember(true);
        } else {
          setIsGroupMember(false);
          Alert.alert(
            `Join Group?`,
            `Do you want to join the group "${nameDisplay}"?`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => navigation.goBack(),
              },
              {
                text: "Join Group",
                onPress: async () => {
                  try {
                    const { error: joinError } = await supabase
                      .from("group_members")
                      .insert({ group_id: currentGroupId, user_id: userId });
                    if (joinError) throw joinError;
                    Alert.alert(
                      "Joined!",
                      `You have successfully joined "${nameDisplay}".`
                    );
                    setIsGroupMember(true);
                  } catch (e: any) {
                    Alert.alert("Error", `Failed to join group: ${e.message}`);
                  }
                },
              },
            ],
            { cancelable: false }
          );
        }
      } catch (error: any) {
        console.error("Error checking membership or joining group:", error);
        Alert.alert("Error", "Could not process group membership.");
        navigation.goBack();
      } finally {
        setProcessingJoin(false);
      }
    };

    const setupScreen = async () => {
      setIsLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          Alert.alert("Error", "Could not identify user session.");
          navigation.canGoBack()
            ? navigation.goBack()
            : navigation.navigate("Login");
          setIsLoading(false);
          return;
        }
        setCurrentUserId(user.id);

        let currentGroupName = initialGroupName;
        if (!currentGroupName && groupId) {
          const { data: groupData, error: groupError } = await supabase
            .from("groups")
            .select("name")
            .eq("id", groupId)
            .single();

          if (groupError || !groupData) {
            Alert.alert("Error", "Could not find group details.");
            navigation.goBack();
            setIsLoading(false);
            return;
          }
          currentGroupName = groupData.name;
          setFetchedGroupName(groupData.name);
        }

        if (!currentGroupName) {
          Alert.alert("Error", "Group name is missing.");
          navigation.goBack();
          setIsLoading(false);
          return;
        }

        navigation.setOptions({
          title: currentGroupName || "Chat",
          headerTitle: () => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("GroupDetails", {
                  groupId: groupId,
                  groupName: currentGroupName,
                })
              }
            >
              <Text style={styles.headerTitle}>
                {currentGroupName || "Chat"}
              </Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("GroupActions", {
                  groupId: groupId,
                  groupName: currentGroupName,
                })
              }
              style={styles.actionButton}
            >
              <Ionicons name="flash" size={24} color="#FFD700" />
            </TouchableOpacity>
          ),
        });

        await checkMembershipAndPromptToJoin(
          user.id,
          groupId,
          currentGroupName
        );
      } catch (error) {
        console.error("Error in setupScreen:", error);
        Alert.alert(
          "Setup Error",
          "An error occurred while setting up the chat."
        );
      } finally {
        setIsLoading(false);
      }
    };

    setupScreen();

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          // Re-evaluate or refresh if needed when app comes to foreground
        }
      }
    );

    return () => {
      appStateSubscription.remove();
    };
  }, [navigation, groupId, initialGroupName]);

  // Effect to fetch messages when user is a member and not processing join or initial load
  useEffect(() => {
    if (currentUserId && isGroupMember && !processingJoin) {
      fetchMessages(currentUserId);
    }
  }, [currentUserId, isGroupMember, processingJoin, fetchMessages]);

  const handleShareInvite = async () => {
    const nameForShare = fetchedGroupName || initialGroupName;
    const inviteLink = `groupmatchmakerapp://group/invite/${groupId}`;
    try {
      await Share.share({
        message: `Join my group "${nameForShare}" on GroupMatchmaker App! Link: ${inviteLink}`,
        url: inviteLink,
        title: `Invite to ${nameForShare}`,
      });
    } catch (error: any) {
      Alert.alert("Error", "Could not share invite link.");
    }
  };

  // Realtime subscription effect
  useEffect(() => {
    // Subscribe only if a group member, not processing a join, and user ID is available.
    if (!currentUserId || !isGroupMember || processingJoin) {
      return; // Do nothing, or clean up if a channel exists
    }

    // Test Realtime connection
    console.log("[Realtime] Testing connection...");
    const testChannel = supabase.channel("test-connection");
    testChannel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log("[Realtime] Connection test successful");
        supabase.removeChannel(testChannel);
      } else if (err) {
        console.error("[Realtime] Connection test failed:", err);
        supabase.removeChannel(testChannel);
      }
    });

    let channel: RealtimeChannel | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    let isSubscribing = false;

    const setupSubscription = () => {
      if (isSubscribing) {
        console.log(
          `[Realtime] Already subscribing for group ${groupId}, skipping`
        );
        return;
      }

      isSubscribing = true;
      console.log(
        `[Realtime] Setting up subscription for group ${groupId}, attempt ${
          retryCount + 1
        }`
      );

      channel = supabase
        .channel(`public:messages:group_id=eq.${groupId}`)
        .on<any>(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `group_id=eq.${groupId}`,
          },
          async (payload) => {
            const newMessagePayload = payload.new;
            if (newMessagePayload.user_id === currentUserId) return;
            const { data: profileData } = await supabase
              .from("profiles")
              .select("username")
              .eq("id", newMessagePayload.user_id)
              .single();
            const formattedMessage: IMessage = {
              _id: newMessagePayload.id,
              text: newMessagePayload.content,
              createdAt: new Date(newMessagePayload.created_at),
              user: {
                _id: newMessagePayload.user_id,
                name:
                  profileData?.username ||
                  `User ${newMessagePayload.user_id.substring(0, 4)}`,
              },
            };
            setMessages((prevMsgs) =>
              GiftedChat.append(prevMsgs, [formattedMessage])
            );
          }
        )
        .subscribe((status, err) => {
          isSubscribing = false;
          if (status === "SUBSCRIBED") {
            console.log(
              `[Realtime] Successfully subscribed for group ${groupId}`
            );
            retryCount = 0; // Reset retry count on success
          } else if (err) {
            console.error(`[Realtime] Error for group ${groupId}:`, err);

            // Retry subscription if we haven't exceeded max retries
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(
                `[Realtime] Retrying subscription for group ${groupId} (${retryCount}/${maxRetries})`
              );

              // Clean up current channel
              if (channel) {
                supabase.removeChannel(channel);
                channel = null;
              }

              // Retry after a delay
              setTimeout(() => {
                setupSubscription();
              }, 2000 * retryCount); // Exponential backoff
            } else {
              console.log(
                `[Realtime] Max retries exceeded for group ${groupId}, giving up`
              );
              // Users can still send messages even if realtime fails
            }
          }
        });
    };

    setupSubscription();

    return () => {
      isSubscribing = false;
      if (channel) {
        supabase.removeChannel(channel).then(() => {
          console.log(`Realtime unsubscribed for group ${groupId}`);
        });
        channel = null;
      }
    };
  }, [groupId, currentUserId, isGroupMember]);

  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!currentUserId || !isGroupMember) {
        Alert.alert(
          "Error",
          "Cannot send message, user not identified or not a group member."
        );
        return;
      }

      const messageToSend = {
        group_id: groupId,
        user_id: currentUserId,
        content: newMessages[0].text,
        created_at: new Date().toISOString(),
      };

      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, newMessages)
      );

      try {
        // Send message
        const { error } = await supabase.from("messages").insert(messageToSend);
        if (error) throw error;

        // Check both user and group AI analysis settings
        const [{ data: userProfile }, { data: groupSettings }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("enable_ai_analysis")
              .eq("id", currentUserId)
              .single(),
            supabase
              .from("groups")
              .select("enable_ai_analysis")
              .eq("id", groupId)
              .single(),
          ]);

        // Only analyze if both user and group have AI analysis enabled
        if (
          userProfile?.enable_ai_analysis &&
          groupSettings?.enable_ai_analysis
        ) {
          console.log("Analyzing message for AI insights...");
          await analyzeUserChatMessages(currentUserId, [messageToSend]);
        }

        console.log("Message sent successfully");
      } catch (error) {
        console.error("Send message error:", error);
        Alert.alert("Error", "Could not send message.");
      }
    },
    [groupId, currentUserId, isGroupMember]
  );

  if (isLoading || processingJoin) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>
          {processingJoin
            ? "Processing group join..."
            : isLoading
            ? "Loading chat setup..."
            : "Please wait..."}
        </Text>
      </View>
    );
  }

  if (!currentUserId) {
    return (
      <View style={styles.centered}>
        <Text>Could not load user session. Please try logging in again.</Text>
      </View>
    );
  }

  if (!isGroupMember) {
    return (
      <View style={styles.centered}>
        <Text>
          You are not a member of this group, or processing membership.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 200 : 100}
      >
        <GiftedChat
          messages={messages}
          onSend={(msgs) => onSend(msgs)}
          user={{ _id: currentUserId }}
          messagesContainerStyle={{ paddingBottom: 10 }}
          placeholder="Type your message here..."
          alwaysShowSend
          renderUsernameOnMessage={true}
          keyboardShouldPersistTaps="handled"
          renderAvatarOnTop={true}
          renderInputToolbar={(props) => (
            <InputToolbar
              {...props}
              containerStyle={{
                backgroundColor: "#2a2a2a",
                borderTopColor: "#404040",
                borderTopWidth: StyleSheet.hairlineWidth,
              }}
              primaryStyle={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
                paddingHorizontal: 8,
              }}
            />
          )}
          textInputProps={{
            multiline: true,
            maxLength: 1000,
            backgroundColor: "#2a2a2a",
            style: {
              color: "#ffffff",
              backgroundColor: "#2a2a2a",
              fontSize: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
              flex: 1,
            },
            placeholderTextColor: "#888888",
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// Add centered style for loading/error states
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a", // Anthracite grey background
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a", // Anthracite grey background
  },
  headerRightContainer: {
    // To accommodate multiple buttons if needed in future
    flexDirection: "row",
    marginRight: 10,
  },
  headerButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginLeft: 8, // Space between buttons if multiple
    // Add more styling as needed, e.g., backgroundColor, borderRadius
  },
  headerButtonText: {
    fontSize: 16,
    color: "#5762b7", // Primary color
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff", // White text
  },
  actionButton: {
    padding: 8,
  },
  inputToolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#404040",
  },
  composerContainer: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    marginRight: 8,
  },
});

export default ChatScreen;
