import React, { useState, useRef, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  Modal,
  Alert,
  Animated,
  ActivityIndicator,
  Share,
  Switch,
  TextInput,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import * as Haptics from "expo-haptics";
const DateTimePicker =
  Platform.OS !== "web"
    ? require("@react-native-community/datetimepicker").default
    : null;
import Starfield from "../components/propose/Starfield";
import { colors, spacing, borderRadius } from "../theme";
import { createPollEvent, PollOptionInput } from "@grapple/shared";
import { RootStackParamList } from "../navigation/AppNavigator";

type RouteParams = RouteProp<RootStackParamList, "PollSetup">;

const DURATION_OPTIONS = [30, 60, 90, 120, 180];

interface PollOptionDraft {
  id: string;
  dateTime: Date;
  durationMinutes: number;
}

const formatDuration = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatDateTime = (d: Date): string =>
  d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const makeOption = (dayOffset: number): PollOptionDraft => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(18, 0, 0, 0);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dateTime: d,
    durationMinutes: 120,
  };
};

const PollSetupScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteParams>();
  const { title, location } = route.params;

  const [options, setOptions] = useState<PollOptionDraft[]>(() => [
    makeOption(1),
    makeOption(2),
    makeOption(3),
  ]);

  const [deadline, setDeadline] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const [minVotesEnabled, setMinVotesEnabled] = useState(false);
  const [minVotes, setMinVotes] = useState("3");

  // Picker state — either editing an option's datetime or the deadline
  const [activePicker, setActivePicker] = useState<
    { type: "option"; id: string } | { type: "deadline" } | null
  >(null);
  const [tempPickerDate, setTempPickerDate] = useState<Date>(new Date());

  const [isCreating, setIsCreating] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const copiedToastOpacity = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const updateOption = (id: string, patch: Partial<PollOptionDraft>) => {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o))
    );
  };

  const addOption = () => {
    setOptions((prev) => [...prev, makeOption(prev.length + 1)]);
  };

  const removeOption = (id: string) => {
    setOptions((prev) =>
      prev.length > 1 ? prev.filter((o) => o.id !== id) : prev
    );
  };

  const openOptionPicker = (id: string) => {
    const option = options.find((o) => o.id === id);
    if (!option) return;
    setTempPickerDate(option.dateTime);
    setActivePicker({ type: "option", id });
  };

  const openDeadlinePicker = () => {
    setTempPickerDate(deadline);
    setActivePicker({ type: "deadline" });
  };

  const applyPickerValue = (value: Date) => {
    if (!activePicker) return;
    if (activePicker.type === "option") {
      updateOption(activePicker.id, { dateTime: value });
    } else {
      setDeadline(value);
    }
  };

  const handlePickerChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setActivePicker(null);
      if (_event.type === "set" && selectedDate) {
        applyPickerValue(selectedDate);
      }
    } else if (selectedDate) {
      setTempPickerDate(selectedDate);
    }
  };

  const handlePickerDone = () => {
    applyPickerValue(tempPickerDate);
    setActivePicker(null);
  };

  const validOptions = useMemo(
    () =>
      options
        .filter((o) => o.dateTime.getTime() > Date.now())
        .map<PollOptionInput>((o) => {
          const end = new Date(
            o.dateTime.getTime() + o.durationMinutes * 60000
          );
          return {
            starts_at: o.dateTime.toISOString(),
            ends_at: end.toISOString(),
          };
        }),
    [options]
  );

  const canCreate = validOptions.length > 0;

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;

    const now = new Date();
    if (deadline <= now) {
      Alert.alert(
        "Pick a deadline in the future",
        "The voting deadline needs to be after right now."
      );
      return;
    }
    // Deadline must be before the earliest option, otherwise voting
    // would still be open after the event was supposed to start.
    const earliestOption = validOptions.reduce<Date | null>((min, o) => {
      const d = new Date(o.starts_at);
      return !min || d < min ? d : min;
    }, null);
    if (earliestOption && deadline >= earliestOption) {
      Alert.alert(
        "Deadline is too late",
        "The voting deadline needs to be before the earliest poll option."
      );
      return;
    }

    setIsCreating(true);

    try {
      const parsedMinVotes = minVotesEnabled
        ? Math.max(1, parseInt(minVotes, 10) || 1)
        : undefined;

      const result = await createPollEvent({
        title: title.trim(),
        description: location ? `📍 ${location}` : undefined,
        schedulingDeadline: deadline.toISOString(),
        minVotes: parsedMinVotes,
        options: validOptions,
      });

      setCreatedEventId(result.event_room_id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch (error: unknown) {
      console.error("Error creating poll event:", error);
      Alert.alert(
        "Couldn't create poll",
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const showCopiedFeedback = () => {
    setShowCopiedToast(true);
    copiedToastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(copiedToastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1800),
      Animated.timing(copiedToastOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => setShowCopiedToast(false));
  };

  const handleShareInviteLink = async () => {
    if (!createdEventId) return;
    const url = `https://group-matchmaker-app-web.vercel.app/event/${createdEventId}`;
    if (Platform.OS === "web" && navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        showCopiedFeedback();
      } catch (_) {}
    } else {
      try {
        await Share.share({
          message: `Vote on when to do ${title.trim()}: ${url}`,
        });
      } catch (_) {}
    }
  };

  if (createdEventId) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={["#1a1a2e", "#0a0a0f", "#0a0a0f"]}
          locations={[0, 0.5, 1]}
          style={styles.gradient}
        />
        <Starfield />
        <SafeAreaView style={styles.safeArea}>
          <Animated.View
            style={[styles.successContent, { opacity: successOpacity }]}
          >
            <Text style={styles.successIcon}>🗳️</Text>
            <Text style={styles.successTitle}>Poll created!</Text>
            <Text style={styles.successSubtitle}>
              Share the invite link so people can vote on the options.
              We&apos;ll pick the winner automatically.
            </Text>

            <View style={styles.successButtons}>
              <TouchableOpacity
                style={styles.shareButton}
                onPress={handleShareInviteLink}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="link-outline"
                  size={18}
                  color={colors.primary}
                  style={{ marginRight: spacing.sm }}
                />
                <Text style={styles.shareButtonText}>Share Invite Link</Text>
                <Ionicons
                  name="share-outline"
                  size={18}
                  color={colors.primary}
                  style={{ marginLeft: spacing.sm }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.goToEventButton}
                onPress={() =>
                  navigation.navigate("EventRoom", {
                    eventRoomId: createdEventId,
                    title: title.trim(),
                  })
                }
                activeOpacity={0.8}
              >
                <Text style={styles.goToEventButtonText}>
                  Go to Event Room
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.doneButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.8}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </SafeAreaView>

        {showCopiedToast && (
          <Animated.View
            style={[styles.copiedToast, { opacity: copiedToastOpacity }]}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={colors.success}
            />
            <Text style={styles.copiedToastText}>
              Link copied to clipboard
            </Text>
          </Animated.View>
        )}
      </View>
    );
  }

  const pickerMinDate = new Date();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1a1a2e", "#0a0a0f", "#0a0a0f"]}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />
      <Starfield />

      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backArrow}
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.text.primary}
              />
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Poll options</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.titlePill}>
            <Text style={styles.titlePillText}>{title.trim()}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date options</Text>
            <Text style={styles.sectionHint}>
              Add the specific times participants will vote on.
            </Text>

            {options.map((option, index) => (
              <View key={option.id} style={styles.optionCard}>
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIndex}>Option {index + 1}</Text>
                  {options.length > 1 && (
                    <TouchableOpacity
                      onPress={() => removeOption(option.id)}
                      style={styles.removeButton}
                    >
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={colors.text.tertiary}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.dateChip}
                  onPress={() => openOptionPicker(option.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.dateChipText}>
                    {formatDateTime(option.dateTime)}
                  </Text>
                </TouchableOpacity>

                <View style={styles.durationRow}>
                  {DURATION_OPTIONS.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.durationChip,
                        option.durationMinutes === d &&
                          styles.durationChipSelected,
                      ]}
                      onPress={() =>
                        updateOption(option.id, { durationMinutes: d })
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.durationChipText,
                          option.durationMinutes === d &&
                            styles.durationChipTextSelected,
                        ]}
                      >
                        {formatDuration(d)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addOptionButton}
              onPress={addOption}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
              <Text style={styles.addOptionText}>Add another option</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voting deadline</Text>
            <Text style={styles.sectionHint}>
              When should voting close?
            </Text>
            <TouchableOpacity
              style={styles.dateChip}
              onPress={openDeadlinePicker}
              activeOpacity={0.7}
            >
              <Ionicons
                name="timer-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.dateChipText}>{formatDateTime(deadline)}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Finalize early</Text>
                <Text style={styles.sectionHint}>
                  Pick a winner once an option reaches a yes-vote threshold
                </Text>
              </View>
              <Switch
                value={minVotesEnabled}
                onValueChange={setMinVotesEnabled}
                trackColor={{
                  false: "rgba(255,255,255,0.1)",
                  true: "rgba(87,98,183,0.4)",
                }}
                thumbColor={minVotesEnabled ? colors.primary : "#888"}
              />
            </View>
            {minVotesEnabled && (
              <View style={styles.minVotesRow}>
                <Text style={styles.minVotesLabel}>Minimum yes votes</Text>
                <TextInput
                  style={styles.minVotesInput}
                  value={minVotes}
                  onChangeText={(t) => setMinVotes(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            )}
          </View>

          {validOptions.length > 0 ? (
            <View style={styles.summaryBox}>
              <Ionicons
                name="checkbox-outline"
                size={18}
                color={colors.primary}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={styles.summaryText}>
                {validOptions.length} option
                {validOptions.length === 1 ? "" : "s"} ready to share
              </Text>
            </View>
          ) : options.length > 0 ? (
            // Poll options silently filtered when the date/time is in the
            // past. Without this banner the "Create poll" button just sits
            // disabled and the user has no idea why.
            <View style={styles.summaryBox}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.warning}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={styles.summaryText}>
                Move your options to a future date/time — the poll needs at
                least one option that hasn't already passed.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.createButton,
              (!canCreate || isCreating) && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!canCreate || isCreating}
            activeOpacity={0.8}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <Text style={styles.createButtonText}>Create Poll</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {Platform.OS === "ios" && activePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setActivePicker(null)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>
                  {activePicker.type === "deadline"
                    ? "Voting Deadline"
                    : "Option Date & Time"}
                </Text>
                <TouchableOpacity onPress={handlePickerDone}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempPickerDate}
                mode="datetime"
                display="spinner"
                onChange={handlePickerChange}
                minimumDate={pickerMinDate}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === "android" && activePicker && (
        <DateTimePicker
          value={tempPickerDate}
          mode="datetime"
          display="default"
          onChange={handlePickerChange}
          minimumDate={pickerMinDate}
        />
      )}

      {Platform.OS === "web" && activePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setActivePicker(null)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>
                  {activePicker.type === "deadline"
                    ? "Voting Deadline"
                    : "Option Date & Time"}
                </Text>
                <View style={{ width: 50 }} />
              </View>
              <View style={{ padding: 20 }}>
                <input
                  type="datetime-local"
                  defaultValue={tempPickerDate.toISOString().slice(0, 16)}
                  onChange={(e: any) => {
                    if (e.target.value) {
                      applyPickerValue(new Date(e.target.value));
                      setActivePicker(null);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 12,
                    fontSize: 18,
                    backgroundColor: "#2a2a3e",
                    color: "#ffffff",
                    border: "1px solid #404060",
                    borderRadius: 8,
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0f",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  backArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
  },
  titlePill: {
    alignSelf: "center",
    backgroundColor: "rgba(87, 98, 183, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(87, 98, 183, 0.4)",
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
  },
  titlePillText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginBottom: spacing.md,
  },
  optionCard: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    gap: spacing.sm,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionIndex: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.tertiary,
  },
  removeButton: {
    padding: 4,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignSelf: "flex-start",
  },
  dateChipText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  durationChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  durationChipSelected: {
    backgroundColor: "rgba(87, 98, 183, 0.3)",
    borderColor: colors.primary,
  },
  durationChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.tertiary,
  },
  durationChipTextSelected: {
    color: colors.text.primary,
  },
  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(87, 98, 183, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(87, 98, 183, 0.3)",
    borderStyle: "dashed",
    borderRadius: borderRadius.md,
  },
  addOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  minVotesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  minVotesLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  minVotesInput: {
    width: 80,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: borderRadius.md,
    color: colors.text.primary,
    fontSize: 16,
    textAlign: "center",
  },
  summaryBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(87, 98, 183, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(87, 98, 183, 0.25)",
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryText: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  createButton: {
    backgroundColor: colors.success,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  createButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  createButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  successContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  successIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  successButtons: {
    width: "100%",
    gap: spacing.md,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "transparent",
  },
  shareButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  goToEventButton: {
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  goToEventButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  doneButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  doneButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  pickerModal: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.md + 6,
    borderTopRightRadius: borderRadius.md + 6,
    paddingBottom: spacing.xl,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  pickerCancel: {
    fontSize: 16,
    color: colors.text.tertiary,
  },
  pickerDone: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  copiedToast: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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

export default PollSetupScreen;
