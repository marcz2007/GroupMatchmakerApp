import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { format } from "date-fns";
import { useAuth } from "../contexts/AuthContext";
import {
  EventMessage,
  EventRoom,
  getEventRoomById,
  getEventRoomMessages,
  getEventRoomParticipants,
  getEventRoomTimeRemaining,
  sendEventMessage,
  subscribeToEventRoomMessages,
} from "../services/eventRoomService";
import { colors, spacing, borderRadius, typography } from "../theme/theme";
import { RootStackParamList } from "../navigation/AppNavigator";

type EventRoomScreenRouteProp = RouteProp<RootStackParamList, "EventRoom">;
type EventRoomScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "EventRoom"
>;

const EventRoomScreen: React.FC = () => {
  const navigation = useNavigation<EventRoomScreenNavigationProp>();
  const route = useRoute<EventRoomScreenRouteProp>();
  const { eventRoomId, title } = route.params;
  const { user } = useAuth();

  const [eventRoom, setEventRoom] = useState<EventRoom | null>(null);
  const [messages, setMessages] = useState<EventMessage[]>([]);
  const [participants, setParticipants] = useState<
    Array<{ id: string; display_name: string; avatar_url: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState({ hours: 0, minutes: 0 });

  const flatListRef = useRef<FlatList>(null);
  const loadVersionRef = useRef(0);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const copiedToastOpacity = useRef(new Animated.Value(0)).current;

  const showCopiedFeedback = () => {
    setShowCopiedToast(true);
    copiedToastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(copiedToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(copiedToastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowCopiedToast(false));
  };

  const handleShare = async () => {
    const url = `https://group-matchmaker-app.vercel.app/event/${eventRoomId}`;
    if (Platform.OS === "web" && navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        showCopiedFeedback();
      } catch (_) {}
    } else {
      try {
        await Share.share({
          message: `Join us for ${title || "this event"}! ${url}`,
        });
      } catch (_) {}
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: title || "Event Room",
      headerRight: () => (
        <TouchableOpacity
          onPress={handleShare}
          style={{ paddingRight: spacing.md }}
        >
          <Ionicons name="share-outline" size={22} color={colors.text.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, title]);

  const loadEventRoom = useCallback(async () => {
    const version = loadVersionRef.current;
    try {
      const room = await getEventRoomById(eventRoomId);
      if (loadVersionRef.current !== version) return;

      // If room is null, user is not a participant — redirect to RSVP screen
      if (!room) {
        navigation.replace("EventDetail", { eventRoomId });
        return;
      }

      setEventRoom(room);
      const remaining = getEventRoomTimeRemaining(room);
      setIsExpired(remaining.expired);
      setTimeRemaining({ hours: remaining.hours, minutes: remaining.minutes });
    } catch (error) {
      if (loadVersionRef.current !== version) return;
      console.error("Error loading event room:", error);
    }
  }, [eventRoomId, navigation]);

  const loadMessages = useCallback(async () => {
    const version = loadVersionRef.current;
    try {
      const result = await getEventRoomMessages(eventRoomId);
      if (loadVersionRef.current !== version) return;
      setMessages(result.messages);
      setIsExpired(result.is_expired);
    } catch (error) {
      if (loadVersionRef.current !== version) return;
      console.error("Error loading messages:", error);
    }
  }, [eventRoomId]);

  const loadParticipants = useCallback(async () => {
    const version = loadVersionRef.current;
    try {
      const data = await getEventRoomParticipants(eventRoomId);
      if (loadVersionRef.current !== version) return;
      setParticipants(data);
    } catch (error) {
      if (loadVersionRef.current !== version) return;
      console.error("Error loading participants:", error);
    }
  }, [eventRoomId]);

  useEffect(() => {
    const version = ++loadVersionRef.current;
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadEventRoom(), loadMessages(), loadParticipants()]);
      if (loadVersionRef.current === version) {
        setLoading(false);
      }
    };

    loadData();
  }, [loadEventRoom, loadMessages, loadParticipants]);

  // Subscribe to new messages
  useEffect(() => {
    const unsubscribe = subscribeToEventRoomMessages(
      eventRoomId,
      (newMessage) => {
        setMessages((prev) => [...prev, newMessage]);
        // Scroll to bottom on new message
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    return unsubscribe;
  }, [eventRoomId]);

  // Update time remaining every minute
  useEffect(() => {
    if (!eventRoom) return;

    const interval = setInterval(() => {
      const remaining = getEventRoomTimeRemaining(eventRoom);
      setIsExpired(remaining.expired);
      setTimeRemaining({ hours: remaining.hours, minutes: remaining.minutes });
    }, 60000);

    return () => clearInterval(interval);
  }, [eventRoom]);

  const handleSend = async () => {
    if (!messageText.trim() || sending || isExpired) return;

    setSending(true);
    try {
      await sendEventMessage(eventRoomId, messageText.trim());
      setMessageText("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: EventMessage }) => {
    const isOwnMessage = item.user.id === user?.id;

    return (
      <View
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
      >
        {!isOwnMessage && (
          <Text style={styles.messageSender}>{item.user.display_name}</Text>
        )}
        <View
          style={[
            styles.messageBubble,
            isOwnMessage ? styles.ownBubble : styles.otherBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isOwnMessage && styles.ownMessageText,
            ]}
          >
            {item.content}
          </Text>
        </View>
        <Text style={styles.messageTime}>
          {format(new Date(item.created_at), "h:mm a")}
        </Text>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {eventRoom?.starts_at && (
        <Text style={styles.eventTime}>
          {format(new Date(eventRoom.starts_at), "EEEE, MMM d 'at' h:mm a")}
        </Text>
      )}
      {eventRoom?.description && (
        <Text style={styles.eventDescription}>{eventRoom.description}</Text>
      )}
      <View style={styles.participantsRow}>
        <Text style={styles.participantsLabel}>
          {participants.length} participant{participants.length !== 1 ? "s" : ""}
        </Text>
        <View style={styles.participantsList}>
          {participants.slice(0, 5).map((p) => (
            <View key={p.id} style={styles.participantBadge}>
              <Text style={styles.participantInitial}>
                {p.display_name?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          ))}
          {participants.length > 5 && (
            <Text style={styles.moreParticipants}>
              +{participants.length - 5}
            </Text>
          )}
        </View>
      </View>
      {!isExpired && (
        <View style={styles.timeRemainingContainer}>
          <Text style={styles.timeRemainingText}>
            Chat expires in {timeRemaining.hours}h {timeRemaining.minutes}m
          </Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        enabled={Platform.OS !== "web"}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>
                Be the first to say something!
              </Text>
            </View>
          }
        />

        {isExpired ? (
          <View style={styles.expiredBanner}>
            <Text style={styles.expiredText}>
              This event room has expired. Messages are read-only.
            </Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type a message..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!messageText.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!messageText.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Copied-to-clipboard toast */}
      {showCopiedToast && (
        <Animated.View style={[styles.copiedToast, { opacity: copiedToastOpacity }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.copiedToastText}>Link copied to clipboard</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: spacing.sm,
  },
  eventTime: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  eventDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  participantsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  participantsLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  participantsList: {
    flexDirection: "row",
    alignItems: "center",
  },
  participantBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  participantInitial: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.primary,
  },
  moreParticipants: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginLeft: spacing.xs,
  },
  timeRemainingContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  timeRemainingText: {
    fontSize: 12,
    color: colors.warning,
    textAlign: "center",
  },
  messagesList: {
    flexGrow: 1,
    paddingBottom: spacing.sm,
  },
  messageContainer: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
  },
  ownMessage: {
    alignItems: "flex-end",
  },
  otherMessage: {
    alignItems: "flex-start",
  },
  messageSender: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: 2,
    marginLeft: spacing.xs,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  ownBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: colors.text.primary,
  },
  ownMessageText: {
    color: colors.white,
  },
  messageTime: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  expiredBanner: {
    backgroundColor: colors.error,
    padding: spacing.md,
    alignItems: "center",
  },
  expiredText: {
    fontSize: 14,
    color: colors.white,
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.text.primary,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  sendButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.white,
  },
  copiedToast: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copiedToastText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: "600",
  },
});

export default EventRoomScreen;
