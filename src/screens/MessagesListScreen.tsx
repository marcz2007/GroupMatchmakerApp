import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { getUserGroups } from "../services/groupService";
import { getProfileById } from "../services/userService";
import { supabase } from "../supabase";
import { commonStyles } from "../theme/commonStyles";
import { colors, spacing, typography } from "../theme/theme";

interface ChatPreview {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageSender: string;
  timestamp: Date;
  isGroup: boolean;
}

type MessagesScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Main"
>;

const MessagesListScreen = () => {
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<MessagesScreenNavigationProp>();

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setChats([]);
        Alert.alert("Error", "Could not get user session.");
        return;
      }

      // Fetch groups using the service
      const groups = await getUserGroups(user.id);

      // Fetch latest message for each group
      const groupPreviews: ChatPreview[] = [];

      for (const group of groups) {
        const { data: latestMessage, error: messageError } = await supabase
          .from("messages")
          .select("user_id, content, created_at")
          .eq("group_id", group.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!messageError && latestMessage) {
          const lastMessageSender = await getProfileById(latestMessage.user_id);
          if (!lastMessageSender) {
            console.error("Error fetching last message sender:", messageError);
            continue;
          }
          groupPreviews.push({
            id: group.id,
            name: group.name,
            lastMessage: latestMessage.content,
            lastMessageSender: lastMessageSender.firstName as string,
            timestamp: new Date(latestMessage.created_at),
            isGroup: true,
          });
        } else {
          // If no messages, still show the group
          groupPreviews.push({
            id: group.id,
            name: group.name,
            lastMessage: "No messages yet",
            lastMessageSender: "",
            timestamp: new Date(),
            isGroup: true,
          });
        }
      }

      // Sort by timestamp, newest first
      groupPreviews.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      setChats(groupPreviews);
    } catch (error) {
      console.error("Unexpected error fetching chats:", error);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();

    // Refresh when screen comes into focus
    const unsubscribe = navigation.addListener("focus", fetchChats);
    return unsubscribe;
  }, [fetchChats, navigation]);

  const navigateToChat = (chat: ChatPreview) => {
    if (chat.isGroup) {
      navigation.navigate("Chat", {
        groupId: chat.id,
        groupName: chat.name,
      });
    }
    // Will handle direct messages in future implementation
  };

  const renderChatItem = ({ item }: { item: ChatPreview }) => (
    <TouchableOpacity
      style={[commonStyles.button, { marginBottom: spacing.sm }]}
      onPress={() => navigateToChat(item)}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography.sectionTitle, { marginBottom: spacing.xs }]}>{item.name}</Text>
        <Text style={[typography.body, { color: colors.text.secondary }]} numberOfLines={1}>
          {item.lastMessageSender}: {item.lastMessage}
        </Text>
      </View>
      <Text style={[typography.caption, { marginLeft: spacing.sm }]}>
        {item.timestamp.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}
      </Text>
    </TouchableOpacity>
  );

  if (loading && chats.length === 0) {
    return (
      <View style={commonStyles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={commonStyles.container}>
      <Text style={commonStyles.title}>Messages</Text>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={[typography.body, { color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xl }]}>
            No messages yet
          </Text>
        }
        refreshing={loading}
        onRefresh={fetchChats}
      />
    </View>
  );
};

export default MessagesListScreen;
