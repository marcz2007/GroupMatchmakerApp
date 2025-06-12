import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
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
  imageUrl?: string;
}

type MessagesScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Main"
>;

const InitialsAvatar = ({ name, size }: { name: string; size: number }) => {
  const getInitials = (name: string) => {
    const words = name.split(" ");
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <View
      style={[
        styles.initialsAvatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.initialsText, { fontSize: size * 0.4 }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
};

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
        // Fetch the group's primary image
        const { data: primaryImage } = await supabase
          .from("group_images")
          .select("image_url")
          .eq("group_id", group.id)
          .eq("is_primary", true)
          .single();

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
            lastMessageSender: lastMessageSender.first_name as string,
            timestamp: new Date(latestMessage.created_at),
            isGroup: true,
            imageUrl: primaryImage?.image_url,
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
            imageUrl: primaryImage?.image_url,
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

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return date.toLocaleDateString(undefined, { weekday: "short" });
    } else {
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    }
  };

  const renderChatItem = ({ item }: { item: ChatPreview }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => navigateToChat(item)}
    >
      <View style={styles.avatarContainer}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.avatar} />
        ) : (
          <InitialsAvatar name={item.name} size={50} />
        )}
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.groupName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.timestamp}>{formatTime(item.timestamp)}</Text>
        </View>
        <View style={styles.messagePreview}>
          {item.lastMessageSender && (
            <Text style={styles.senderName} numberOfLines={1}>
              {item.lastMessageSender}:
            </Text>
          )}
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        </View>
      </View>
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
          <Text
            style={[
              typography.body,
              {
                color: colors.text.secondary,
                textAlign: "center",
                marginTop: spacing.xl,
              },
            ]}
          >
            No messages yet
          </Text>
        }
        refreshing={loading}
        onRefresh={fetchChats}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  chatItem: {
    flexDirection: "row",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.border,
  },
  chatInfo: {
    flex: 1,
    justifyContent: "center",
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  groupName: {
    ...typography.sectionTitle,
    flex: 1,
    marginRight: spacing.sm,
  },
  timestamp: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  messagePreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  senderName: {
    ...typography.body,
    color: colors.text.secondary,
    marginRight: spacing.xs,
  },
  lastMessage: {
    ...typography.body,
    color: colors.text.secondary,
    flex: 1,
  },
  initialsAvatar: {
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  initialsText: {
    color: colors.white,
    fontWeight: "bold",
  },
});

export default MessagesListScreen;
