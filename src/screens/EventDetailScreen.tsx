import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Share,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../theme";
import { getPublicEventDetails, joinEventRoom, PublicEventDetails } from "../services/eventRoomService";
import { RootStackParamList } from "../navigation/AppNavigator";

const EventDetailScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<any>();
  const { eventRoomId, eventDetails: passedDetails } = route.params as {
    eventRoomId: string;
    eventDetails?: any;
  };

  const [details, setDetails] = useState<PublicEventDetails | null>(
    passedDetails ? passedDetails : null
  );
  const [loading, setLoading] = useState(!passedDetails);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    loadDetails();
  }, [eventRoomId]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      const data = await getPublicEventDetails(eventRoomId);
      setDetails(data);
    } catch (error) {
      console.error("Error loading event details:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return null;
    }
  };

  const handleShare = async () => {
    if (!details) return;
    const url = `https://group-matchmaker-app.vercel.app/event/${eventRoomId}`;
    const eventDate = formatDate(details.event_room.starts_at);
    const dateText = eventDate ? ` on ${eventDate}` : "";
    try {
      await Share.share({
        message: `Join us for ${details.event_room.title}${dateText}! ${url}`,
      });
    } catch (error: any) {
      if (error.message !== "User did not share") {
        Alert.alert("Error", "Could not share event");
      }
    }
  };

  const handleJoin = async () => {
    if (joining) return;
    setJoining(true);
    try {
      await joinEventRoom(eventRoomId);
      navigation.replace("EventRoom", {
        eventRoomId,
        title: details?.event_room.title,
      });
    } catch (error: any) {
      console.error("Error joining event:", error);
      Alert.alert("Error", error?.message || "Could not join event");
    } finally {
      setJoining(false);
    }
  };

  const handleGoToChat = () => {
    navigation.replace("EventRoom", {
      eventRoomId,
      title: details?.event_room.title,
    });
  };

  if (loading || !details) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={colors.backgroundGradient}
          locations={[0, 0.5, 1]}
          style={styles.gradient}
        />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const event = details.event_room;
  const eventDate = formatDate(event.starts_at);
  const eventTime = formatTime(event.starts_at);
  const location = event.description?.replace("\u{1F4CD} ", "") || null;
  const participants = details.participants || [];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Event Details</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Ionicons
              name="share-outline"
              size={24}
              color={colors.text.primary}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Event Title */}
          <View style={styles.titleSection}>
            <LinearGradient
              colors={[colors.primary, colors.secondary]}
              style={styles.titleIcon}
            >
              <Text style={styles.titleEmoji}>{"\u{1F389}"}</Text>
            </LinearGradient>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.groupName}>
              {details.creator_name ? `Hosted by ${details.creator_name}` : details.group_name}
            </Text>
          </View>

          {/* Event Details */}
          <View style={styles.detailsSection}>
            {eventDate && (
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons
                    name="calendar-outline"
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{eventDate}</Text>
                </View>
              </View>
            )}

            {eventTime && (
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="time-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Time</Text>
                  <Text style={styles.detailValue}>{eventTime}</Text>
                </View>
              </View>
            )}

            {location && (
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons
                    name="location-outline"
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Location</Text>
                  <Text style={styles.detailValue}>{location}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Participants */}
          <View style={styles.participantsSection}>
            <Text style={styles.sectionTitle}>
              Going ({details.participant_count})
            </Text>

            <View style={styles.participantsList}>
              {participants.map((participant) => (
                <TouchableOpacity
                  key={participant.id}
                  style={styles.participantRow}
                  onPress={() =>
                    navigation.navigate("PublicProfile", { userId: participant.id })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.participantAvatar}>
                    <Text style={styles.participantInitial}>
                      {participant.display_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.participantName}>
                    {participant.display_name}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.text.tertiary}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Status Badge */}
          {details.is_expired ? (
            <View style={styles.statusBadge}>
              <Ionicons name="time" size={16} color={colors.text.tertiary} />
              <Text style={styles.statusText}>This event has ended</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.statusActive]}>
              <View style={styles.activeDot} />
              <Text style={[styles.statusText, styles.statusTextActive]}>
                Active event
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom Action Button */}
        {!details.is_expired && (
          <View style={styles.bottomAction}>
            {details.is_participant ? (
              <TouchableOpacity
                style={styles.goToChatButton}
                onPress={handleGoToChat}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubbles-outline" size={20} color={colors.text.primary} style={{ marginRight: spacing.sm }} />
                <Text style={styles.goToChatButtonText}>Go to Chat</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.joinButton, joining && styles.joinButtonDisabled]}
                onPress={handleJoin}
                disabled={joining}
                activeOpacity={0.8}
              >
                {joining ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Text style={styles.joinButtonText}>I'm In!</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
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
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  shareButton: {
    padding: spacing.xs,
    width: 44,
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  titleIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  titleEmoji: {
    fontSize: 36,
  },
  eventTitle: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  groupName: {
    ...typography.body,
    color: colors.text.tertiary,
  },
  detailsSection: {
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
    marginBottom: 2,
  },
  detailValue: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: "500",
  },
  participantsSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  participantsList: {
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  participantInitial: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  participantName: {
    ...typography.body,
    color: colors.text.primary,
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  statusActive: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  statusText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  statusTextActive: {
    color: colors.text.primary,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.eventActive,
  },
  bottomAction: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  joinButton: {
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  goToChatButton: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  goToChatButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
});

export default EventDetailScreen;
