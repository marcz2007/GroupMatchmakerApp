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
import { createSmartEvent, SchedulingSlot } from "@grapple/shared";
import { RootStackParamList } from "../navigation/AppNavigator";

type RouteParams = RouteProp<RootStackParamList, "SmartScheduleSetup">;

const DAYS = [
  { key: 0, short: "Sun", full: "Sunday" },
  { key: 1, short: "Mon", full: "Monday" },
  { key: 2, short: "Tue", full: "Tuesday" },
  { key: 3, short: "Wed", full: "Wednesday" },
  { key: 4, short: "Thu", full: "Thursday" },
  { key: 5, short: "Fri", full: "Friday" },
  { key: 6, short: "Sat", full: "Saturday" },
];

const DURATION_OPTIONS = [30, 60, 90, 120, 180];

const formatDuration = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatTime12 = (hours: number, minutes: number): string => {
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  const displayMin = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${displayHour}${displayMin} ${period}`;
};

const SmartScheduleSetupScreen = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteParams>();
  const { title, location } = route.params;

  // Date range
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const nextWeek = new Date(tomorrow);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [dateRangeStart, setDateRangeStart] = useState<Date>(tomorrow);
  const [dateRangeEnd, setDateRangeEnd] = useState<Date>(nextWeek);

  // Day selection
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // Time for slots
  const [slotTime, setSlotTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    return d;
  });

  // Duration
  const [duration, setDuration] = useState(60);

  // Deadline (default: 24h before date range start)
  const [deadline, setDeadline] = useState<Date>(() => {
    const d = new Date(tomorrow);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    // If that's in the past, set to 24h from now
    if (d <= new Date()) {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      return future;
    }
    return d;
  });

  // Picker state
  const [activePicker, setActivePicker] = useState<
    "startDate" | "endDate" | "time" | "deadline" | null
  >(null);
  const [tempPickerDate, setTempPickerDate] = useState<Date>(new Date());

  // Submit state
  const [isCreating, setIsCreating] = useState(false);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const copiedToastOpacity = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const canCreate = selectedDays.length > 0 && dateRangeStart < dateRangeEnd;

  const slotSummary = useMemo(() => {
    if (selectedDays.length === 0) return "No days selected";
    const dayNames = selectedDays.map((d) => DAYS[d].short).join(", ");
    const timeStr = formatTime12(slotTime.getHours(), slotTime.getMinutes());
    return `${dayNames} at ${timeStr} (${formatDuration(duration)})`;
  }, [selectedDays, slotTime, duration]);

  const openPicker = (type: "startDate" | "endDate" | "time" | "deadline") => {
    let initial: Date;
    switch (type) {
      case "startDate":
        initial = dateRangeStart;
        break;
      case "endDate":
        initial = dateRangeEnd;
        break;
      case "time":
        initial = slotTime;
        break;
      case "deadline":
        initial = deadline;
        break;
    }
    setTempPickerDate(initial);
    setActivePicker(type);
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

  const applyPickerValue = (value: Date) => {
    switch (activePicker) {
      case "startDate":
        setDateRangeStart(value);
        // If end is before start, push it out
        if (value >= dateRangeEnd) {
          const newEnd = new Date(value);
          newEnd.setDate(newEnd.getDate() + 7);
          setDateRangeEnd(newEnd);
        }
        break;
      case "endDate":
        setDateRangeEnd(value);
        break;
      case "time":
        setSlotTime(value);
        break;
      case "deadline":
        setDeadline(value);
        break;
    }
  };

  const handlePickerDone = () => {
    applyPickerValue(tempPickerDate);
    setActivePicker(null);
  };

  const formatDateShort = (d: Date) =>
    d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  const handleCreate = async () => {
    if (!canCreate || isCreating) return;

    setIsCreating(true);

    try {
      const slots: SchedulingSlot[] = selectedDays.map((day) => ({
        day_of_week: day,
        start_time: `${String(slotTime.getHours()).padStart(2, "0")}:${String(
          slotTime.getMinutes()
        ).padStart(2, "0")}`,
        duration_minutes: duration,
      }));

      const result = await createSmartEvent({
        title: title.trim(),
        description: location ? `📍 ${location}` : undefined,
        dateRangeStart: dateRangeStart.toISOString().split("T")[0],
        dateRangeEnd: dateRangeEnd.toISOString().split("T")[0],
        schedulingDeadline: deadline.toISOString(),
        slots,
      });

      setCreatedEventId(result.event_room_id);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    } catch (error: unknown) {
      console.error("Error creating smart event:", error);
      Alert.alert(
        "Couldn't create event",
        error instanceof Error ? error.message : "Something went wrong. Please try again."
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
          message: `Join me for ${title.trim()}! Sync your calendar so we can find the best time. ${url}`,
        });
      } catch (_) {}
    }
  };

  // Success state
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
            <Text style={styles.successIcon}>🗓️</Text>
            <Text style={styles.successTitle}>Smart event created!</Text>
            <Text style={styles.successSubtitle}>
              Share the invite link so people can sync their calendars. The app
              will find the best time automatically.
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
                <Text style={styles.goToEventButtonText}>Go to Event Room</Text>
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

  const pickerMode =
    activePicker === "time"
      ? "time"
      : activePicker === "deadline"
      ? "datetime"
      : "date";

  const pickerMinDate =
    activePicker === "endDate"
      ? dateRangeStart
      : activePicker === "deadline"
      ? new Date()
      : tomorrow;

  const pickerTitle =
    activePicker === "startDate"
      ? "Start Date"
      : activePicker === "endDate"
      ? "End Date"
      : activePicker === "time"
      ? "Slot Time"
      : "Scheduling Deadline";

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
          {/* Header */}
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
            <Text style={styles.screenTitle}>Find best time</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Event title pill */}
          <View style={styles.titlePill}>
            <Text style={styles.titlePillText}>{title.trim()}</Text>
          </View>

          {/* Date Range Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date range</Text>
            <Text style={styles.sectionHint}>
              The window to search for the best time
            </Text>
            <View style={styles.dateRangeRow}>
              <TouchableOpacity
                style={styles.dateChip}
                onPress={() => openPicker("startDate")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.dateChipText}>
                  {formatDateShort(dateRangeStart)}
                </Text>
              </TouchableOpacity>
              <Text style={styles.dateRangeSeparator}>to</Text>
              <TouchableOpacity
                style={styles.dateChip}
                onPress={() => openPicker("endDate")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.dateChipText}>
                  {formatDateShort(dateRangeEnd)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Day Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferred days</Text>
            <Text style={styles.sectionHint}>
              Which days of the week work?
            </Text>
            <View style={styles.daysRow}>
              {DAYS.map((day) => {
                const isSelected = selectedDays.includes(day.key);
                return (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.dayButton,
                      isSelected && styles.dayButtonSelected,
                    ]}
                    onPress={() => toggleDay(day.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        isSelected && styles.dayButtonTextSelected,
                      ]}
                    >
                      {day.short}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Time & Duration */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time & duration</Text>
            <Text style={styles.sectionHint}>
              What time and how long?
            </Text>
            <View style={styles.timeDurationRow}>
              <TouchableOpacity
                style={styles.timeChip}
                onPress={() => openPicker("time")}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.dateChipText}>
                  {formatTime12(slotTime.getHours(), slotTime.getMinutes())}
                </Text>
              </TouchableOpacity>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.durationScroll}
              >
                {DURATION_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.durationChip,
                      duration === d && styles.durationChipSelected,
                    ]}
                    onPress={() => setDuration(d)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.durationChipText,
                        duration === d && styles.durationChipTextSelected,
                      ]}
                    >
                      {formatDuration(d)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Deadline */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sync deadline</Text>
            <Text style={styles.sectionHint}>
              When should the app pick the best time?
            </Text>
            <TouchableOpacity
              style={styles.dateChip}
              onPress={() => openPicker("deadline")}
              activeOpacity={0.7}
            >
              <Ionicons
                name="timer-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.dateChipText}>
                {deadline.toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Summary */}
          {selectedDays.length > 0 && (
            <View style={styles.summaryBox}>
              <Ionicons
                name="sparkles"
                size={18}
                color={colors.primary}
                style={{ marginRight: spacing.sm }}
              />
              <Text style={styles.summaryText}>{slotSummary}</Text>
            </View>
          )}

          {/* Create Button */}
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
              <Text style={styles.createButtonText}>Create Smart Event</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* iOS Picker Modal */}
      {Platform.OS === "ios" && activePicker && (
        <Modal transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setActivePicker(null)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>{pickerTitle}</Text>
                <TouchableOpacity onPress={handlePickerDone}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempPickerDate}
                mode={pickerMode}
                display="spinner"
                onChange={handlePickerChange}
                minimumDate={pickerMinDate}
                textColor={colors.text.primary}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Picker */}
      {Platform.OS === "android" && activePicker && (
        <DateTimePicker
          value={tempPickerDate}
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
          minimumDate={pickerMinDate}
        />
      )}

      {/* Web Picker */}
      {Platform.OS === "web" && activePicker && (
        <Modal transparent animationType="fade">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setActivePicker(null)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>{pickerTitle}</Text>
                <View style={{ width: 50 }} />
              </View>
              <View style={{ padding: 20 }}>
                <input
                  type={
                    activePicker === "time"
                      ? "time"
                      : activePicker === "deadline"
                      ? "datetime-local"
                      : "date"
                  }
                  defaultValue={
                    activePicker === "time"
                      ? `${String(slotTime.getHours()).padStart(2, "0")}:${String(slotTime.getMinutes()).padStart(2, "0")}`
                      : activePicker === "deadline"
                      ? deadline.toISOString().slice(0, 16)
                      : activePicker === "startDate"
                      ? dateRangeStart.toISOString().split("T")[0]
                      : dateRangeEnd.toISOString().split("T")[0]
                  }
                  onChange={(e: any) => {
                    if (e.target.value) {
                      if (activePicker === "time") {
                        const [h, m] = e.target.value.split(":").map(Number);
                        const d = new Date(slotTime);
                        d.setHours(h, m, 0, 0);
                        applyPickerValue(d);
                      } else {
                        applyPickerValue(new Date(e.target.value));
                      }
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
  dateRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
  },
  dateChipText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text.primary,
  },
  dateRangeSeparator: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  daysRow: {
    flexDirection: "row",
    gap: 6,
  },
  dayButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  dayButtonSelected: {
    backgroundColor: "rgba(87, 98, 183, 0.3)",
    borderColor: colors.primary,
  },
  dayButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.tertiary,
  },
  dayButtonTextSelected: {
    color: colors.text.primary,
  },
  timeDurationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  durationScroll: {
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
  // Success state
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
  // Picker
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
  // Toast
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

export default SmartScheduleSetupScreen;
