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
  Share,
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
  getChatExtensionStatus,
  voteToChatExtend,
  EventMessage,
  EventWithDetails,
  ChatExtensionStatus,
} from "../services/eventService";

const INVITE_LINK_REGEX = /https:\/\/group-matchmaker-app\.vercel\.app\/event\/[a-f0-9-]+/;
const EXTENSION_MESSAGE_ID = "00000000-0000-0000-0000-000000000001";

interface EventChatScreenProps {
  eventRoomIdProp?: string;
  isDesktopPane?: boolean;
}

const EventChatScreen = ({ eventRoomIdProp, isDesktopPane }: EventChatScreenProps = {}) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const eventRoomId = eventRoomIdProp || route.params?.eventRoomId;

  const [eventDetails, setEventDetails] = useState<EventWithDetails | null>(null);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [extensionStatus, setExtensionStatus] = useState<ChatExtensionStatus | null>(null);
  const [voting, setVoting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    try {
      const [details, msgs] = await Promise.all([
        getEventDetails(eventRoomId),
        getEventMessages(eventRoomId),
      ]);
      setEventDetails(details);
      setMessages(msgs);

      // Load extension status
      try {
        const status = await getChatExtensionStatus(eventRoomId);
        setExtensionStatus(status);
      } catch {
        // Extension status may fail if migration hasn't run yet
      }
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

  const handleCopyLink = async () => {
    const link = `https://group-matchmaker-app.vercel.app/event/${eventRoomId}`;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({ message: link });
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // User cancelled share
    }
  };

  const handleVote = async (vote: boolean) => {
    if (voting) return;
    setVoting(true);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await voteToChatExtend(eventRoomId, vote);

      if (result.extended) {
        // Chat was extended — reload messages and status
        await loadData();
      } else {
        // Refresh extension status
        const status = await getChatExtensionStatus(eventRoomId);
        setExtensionStatus(status);
      }
    } catch (error) {
      console.error("Error voting:", error);
    } finally {
      setVoting(false);
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

  const renderSystemMessageContent = (content: string, messageId: string) => {
    const hasInviteLink = INVITE_LINK_REGEX.test(content);
    const isExtensionMessage = messageId === EXTENSION_MESSAGE_ID;

    if (hasInviteLink) {
      // Split content around the invite link line
      const parts = content.split(INVITE_LINK_REGEX);
      const linkMatch = content.match(INVITE_LINK_REGEX);

      return (
        <View>
          <Text style={styles.systemMessageText}>{parts[0]}</Text>
          {linkMatch && (
            <TouchableOpacity onPress={handleCopyLink} activeOpacity={0.7}>
              <Text style={[styles.systemMessageText, styles.inviteLink]}>
                {linkMatch[0]}
              </Text>
            </TouchableOpacity>
          )}
          {parts[1] && (
            <Text style={styles.systemMessageText}>{parts[1]}</Text>
          )}
          {linkCopied && (
            <View style={styles.copiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={colors.success} />
              <Text style={styles.copiedText}>Link copied!</Text>
            </View>
          )}
        </View>
      );
    }

    if (isExtensionMessage && extensionStatus?.voting_active) {
      return (
        <View>
          <Text style={styles.systemMessageText}>{content}</Text>
          <View style={styles.voteButtonsContainer}>
            {extensionStatus.my_vote === null ? (
              <>
                <TouchableOpacity
                  style={[styles.voteButton, styles.voteButtonYes]}
                  onPress={() => handleVote(true)}
                  disabled={voting}
                  activeOpacity={0.7}
                >
                  {voting ? (
                    <ActivityIndicator size="small" color={colors.text.primary} />
                  ) : (
                    <>
                      <Ionicons name="hand-left-outline" size={16} color={colors.text.primary} />
                      <Text style={styles.voteButtonText}>I'm staying</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.voteButton, styles.voteButtonNo]}
                  onPress={() => handleVote(false)}
                  disabled={voting}
                  activeOpacity={0.7}
                >
                  <Ionicons name="exit-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.voteButtonTextNo}>I'm out</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.votedContainer}>
                <Ionicons
                  name={extensionStatus.my_vote ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={extensionStatus.my_vote ? colors.success : colors.text.tertiary}
                />
                <Text style={styles.votedText}>
                  {extensionStatus.my_vote ? "You're staying" : "You're leaving when it closes"}
                </Text>
                <Text style={styles.voteCount}>
                  {extensionStatus.total_votes}/{extensionStatus.total_participants} voted · {extensionStatus.yes_count} staying
                </Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    return <Text style={styles.systemMessageText}>{content}</Text>;
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
            {renderSystemMessageContent(item.content, item.id)}
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
          {!isDesktopPane && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
            </TouchableOpacity>
          )}

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
          enabled={Platform.OS !== "web"}
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
  inviteLink: {
    color: colors.primary,
    textDecorationLine: "underline",
    marginVertical: 4,
  },
  copiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    gap: 4,
  },
  copiedText: {
    ...typography.caption,
    color: colors.success,
    fontSize: 12,
  },
  voteButtonsContainer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  voteButtonYes: {
    backgroundColor: colors.primary,
  },
  voteButtonNo: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  voteButtonText: {
    ...typography.body,
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  voteButtonTextNo: {
    ...typography.body,
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  votedContainer: {
    alignItems: "center",
    gap: 4,
  },
  votedText: {
    ...typography.caption,
    color: colors.text.secondary,
    fontSize: 13,
  },
  voteCount: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
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
    paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.sm,
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
