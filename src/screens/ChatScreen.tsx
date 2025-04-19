// src/screens/ChatScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import { Alert, View, Text, ActivityIndicator } from "react-native";
import { GiftedChat, IMessage, User } from "react-native-gifted-chat";
import { supabase } from "../supabase";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { RootStackNavigationProp } from "../../App";
import { RootStackParamList } from "../navigation/AppNavigator";
import { RealtimeChannel } from "@supabase/supabase-js";
import { StyleSheet } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";

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
  const { groupId, groupName } = route.params;

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Loading state

  // Set keyboard handler
  useKeyboardHandler({
    onStart: () => {
      // Optional: handle keyboard movement start
    },
    onMove: () => {
      // Optional: handle keyboard movement
    },
    onEnd: () => {
      // Optional: handle keyboard movement end
    },
  });

  // Set screen title and fetch current user ID on mount
  useEffect(() => {
    navigation.setOptions({ title: groupName || "Chat" });

    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      // Initial message fetch depends on having the user ID, so chain it or call here
      if (user?.id) {
        fetchMessages(user.id);
      } else {
        setIsLoading(false); // No user, stop loading
        Alert.alert("Error", "Could not identify user session.");
      }
    };
    fetchUser();
  }, [navigation, groupName]);

  // Fetch initial messages
  const fetchMessages = useCallback(
    async (userId: string) => {
      if (!userId) return; // Don't fetch if no user ID
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("messages")
          .select(
            `
                    id,
                    content,
                    created_at,
                    user_id,
                    profiles ( username )
                `
          ) // Adjust 'profiles ( username )' if your profile table/column is different
          .eq("group_id", groupId)
          .order("created_at", { ascending: false }) // GiftedChat expects descending
          .limit(50); // Load initial batch

        if (error) throw error;

        if (data) {
          const loadedMessages = data.map(
            (msg: any): IMessage => ({
              _id: msg.id,
              text: msg.content,
              createdAt: new Date(msg.created_at),
              user: {
                _id: msg.user_id,
                // Use profile username or a default/fallback
                name:
                  msg.profiles?.username ||
                  `User ${msg.user_id.substring(0, 4)}`,
                // avatar: msg.profiles?.avatar_url || undefined, // Add avatar later
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
    [groupId]
  );

  // Set up Realtime subscription
  useEffect(() => {
    if (!currentUserId) return; // Only subscribe if user is known

    let channel: RealtimeChannel | null = null;

    const setupSubscription = () => {
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
            console.log("New message received via Realtime!", payload.new);
            const newMessage = payload.new;

            // Avoid adding message if the sender is the current user (already handled by onSend)
            // This prevents duplicate messages on sender's screen
            if (newMessage.user_id === currentUserId) {
              return;
            }

            // Fetch profile username for the new message sender
            // Optimization: Could cache usernames or fetch in batches
            const { data: profileData } = await supabase
              .from("profiles") // Assuming 'profiles' table linked to auth.users by 'id'
              .select("username") // Adjust column name if needed
              .eq("id", newMessage.user_id)
              .single();

            const formattedMessage: IMessage = {
              _id: newMessage.id,
              text: newMessage.content,
              createdAt: new Date(newMessage.created_at),
              user: {
                _id: newMessage.user_id,
                name:
                  profileData?.username ||
                  `User ${newMessage.user_id.substring(0, 4)}`,
                // avatar: '...'
              },
            };
            // Prepend new messages (GiftedChat standard)
            setMessages((previousMessages) =>
              GiftedChat.append(previousMessages, [formattedMessage])
            );
          }
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            console.log(`Realtime subscribed for group ${groupId}`);
          } else if (err) {
            console.error(`Realtime error for group ${groupId}:`, err);
            Alert.alert("Realtime Error", "Chat connection issue.");
          }
        });
    };

    setupSubscription();

    // Clean up subscription on unmount or if groupId/currentUserId changes
    return () => {
      if (channel) {
        supabase.removeChannel(channel).then(() => {
          console.log(`Realtime unsubscribed for group ${groupId}`);
        });
      }
    };
  }, [groupId, currentUserId]); // Depend on groupId and currentUserId

  // Send message handler
  const onSend = useCallback(
    async (newMessages: IMessage[] = []) => {
      if (!currentUserId) {
        Alert.alert("Error", "Cannot send message, user not identified.");
        return;
      }

      const messageToSend = {
        group_id: groupId,
        user_id: currentUserId, // Use the fetched current user ID
        content: newMessages[0].text, // Get text from the first message in the array
      };

      // Optimistically update the UI *before* sending to Supabase
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, newMessages)
      );

      const { error } = await supabase.from("messages").insert(messageToSend);

      if (error) {
        Alert.alert("Error", "Could not send message.");
        console.error("Send message error:", error);
        // Optional: Revert optimistic update if needed (more complex)
        // Find the message by its temporary ID and remove it
      } else {
        console.log("Message sent successfully");
      }
    },
    [groupId, currentUserId]
  ); // Depend on groupId and currentUserId

  // Render loading state
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Render message if no user identified
  if (!currentUserId) {
    return (
      <View style={styles.centered}>
        <Text>Could not load user session.</Text>
      </View>
    );
  }

  // Render the chat interface
  return (
    <GiftedChat
      messages={messages}
      onSend={(messages) => onSend(messages)}
      user={{
        _id: currentUserId, // Current user's ID
        // name: 'My Username' // Optional: Set current user's name if available
        // avatar: '...'      // Optional: Set current user's avatar if available
      }}
      messagesContainerStyle={{ paddingBottom: 10 }}
      placeholder="Type your message here..."
      alwaysShowSend
    />
  );
};

// Add centered style for loading/error states
const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ChatScreen;
