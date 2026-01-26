import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import {
  getEventDetails,
  getEventMessages,
  sendEventMessage,
  subscribeToEventMessages,
  EventMessage,
  EventWithDetails,
} from "../services/eventService";

const EventChatScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { eventRoomId } = route.params;

  const [eventDetails, setEventDetails] = useState<EventWithDetails | null>(null);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    try {
      const [details, msgs] = await Promise.all([
        getEventDetails(eventRoomId),
        getEventMessages(eventRoomId),
      ]);
      setEventDetails(details);
      setMessages(msgs);
    } catch (error) {
      console.error("Error loading event data:", error);
    } finally {
      setLoading(false);
    }
  }, [eventRoomId]);

  useEffect(() => {
    loadData();

    const unsubscribe = subscribeToEventMessages(eventRoomId, (newMessage) => {
      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return unsubscribe;
  }, [eventRoomId, loadData]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const messageText = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newMessage = await sendEventMessage(eventRoomId, messageText);
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error("Error sending message:", error);
      setInputText(messageText); // Restore on failure
    } finally {
      setSending(false);
    }
  };

  const openEventDetails = () => {
    if (eventDetails) {
      navigation.navigate("EventDetail", {
        eventRoomId,
        eventDetails,
      });
    }
  };

  const formatMessageTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  };

  const renderMessage = ({ item, index }: { item: EventMessage; index: number }) => {
    const isOwnMessage = item.user.id === user?.id;
    const isSystem = item.is_system;

    if (isSystem) {
      return (
        <View style={styles.systemMessageContainer}>
          <LinearGradient
            colors={[colors.primaryMuted, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.systemMessageBubble}
          >
            <Text style={styles.systemMessageText}>{item.content}</Text>
          </LinearGradient>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageRow,
          isOwnMessage ? styles.messageRowOwn : styles.messageRowOther,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
          ]}
        >
          {!isOwnMessage && (
            <Text style={styles.senderName}>{item.user.display_name}</Text>
          )}
          <Text
            style={[
              styles.messageText,
              isOwnMessage ? styles.messageTextOwn : styles.messageTextOther,
            ]}
          >
            {item.content}
          </Text>
          <Text
            style={[
              styles.messageTime,
              isOwnMessage ? styles.messageTimeOwn : styles.messageTimeOther,
            ]}
          >
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={colors.backgroundGradient}
          locations={[0, 0.5, 1]}
          style={styles.gradient}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <TouchableOpacity
          style={styles.header}
          onPress={openEventDetails}
          activeOpacity={0.7}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {eventDetails?.event_room.title || "Event"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {eventDetails?.participant_count || 0} participants · tap for info
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
        </TouchableOpacity>

        {/* Messages */}
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesContent}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            showsVerticalScrollIndicator={false}
          />

          {/* Input Bar */}
          {!eventDetails?.is_expired && (
            <View style={styles.inputBar}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Message..."
                  placeholderTextColor={colors.text.tertiary}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={1000}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || sending) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Ionicons name="send" size={20} color={colors.text.primary} />
                )}
              </TouchableOpacity>
            </View>
          )}

          {eventDetails?.is_expired && (
            <View style={styles.expiredBar}>
              <Text style={styles.expiredText}>This event has ended</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageRow: {
    marginBottom: spacing.sm,
  },
  messageRowOwn: {
    alignItems: "flex-end",
  },
  messageRowOther: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleOwn: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceLight,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: 2,
    fontSize: 12,
  },
  messageText: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: colors.text.primary,
  },
  messageTextOther: {
    color: colors.text.primary,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  messageTimeOwn: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  messageTimeOther: {
    color: colors.text.tertiary,
  },
  systemMessageContainer: {
    alignItems: "center",
    marginVertical: spacing.md,
  },
  systemMessageBubble: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    maxWidth: "90%",
  },
  systemMessageText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.sm : 0,
    marginRight: spacing.sm,
    maxHeight: 100,
  },
  input: {
    ...typography.body,
    color: colors.text.primary,
    fontSize: 15,
    maxHeight: 80,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  expiredBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    alignItems: "center",
  },
  expiredText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
});

export default EventChatScreen;
