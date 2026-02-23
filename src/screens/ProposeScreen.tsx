import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  Animated,
  SafeAreaView,
  Text,
  Keyboard,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Switch,
  ScrollView,
  TextInput,
  Modal,
  Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
const DateTimePicker = Platform.OS !== "web"
  ? require("@react-native-community/datetimepicker").default
  : null;
import * as Haptics from "expo-haptics";
const ConfettiCannon = Platform.OS !== "web"
  ? require("react-native-confetti-cannon").default
  : (() => null) as any;
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { IdeaInput } from "../components/propose/IdeaInput";
import { IdeaPill } from "../components/propose/IdeaPill";
import { StepIndicator } from "../components/propose/StepIndicator";
import { DetailChips } from "../components/propose/DetailChips";
import Starfield from "../components/propose/Starfield";
import { colors, spacing, borderRadius } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { getUserGroups } from "../services/groupService";
import { createProposal } from "../services/proposalService";
import { createDirectEvent } from "../services/eventRoomService";
import { RootStackParamList } from "../navigation/AppNavigator";

type Step = "idea" | "details" | "groups" | "launching" | "success";

interface Group {
  id: string;
  name: string;
  member_count?: number;
}

const TOTAL_STEPS = 4;
const DEFAULT_VOTE_WINDOW_HOURS = 48;

const detectCurrency = (): string => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const map: Record<string, string> = {
      "en-US": "USD", "en-GB": "GBP", "en-AU": "AUD", "en-CA": "CAD",
      "de-DE": "EUR", "fr-FR": "EUR", "es-ES": "EUR", "it-IT": "EUR",
      "ja-JP": "JPY", "zh-CN": "CNY",
    };
    if (map[locale]) return map[locale];
    const lang = locale.split("-")[0];
    const match = Object.entries(map).find(([k]) => k.startsWith(lang + "-"));
    return match ? match[1] : "GBP";
  } catch {
    return "GBP";
  }
};

const getLocaleCurrencySymbol = (): string => {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: detectCurrency(),
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || "£";
  } catch {
    return "£";
  }
};

const getStepNumber = (step: Step): number => {
  switch (step) {
    case "idea":
      return 1;
    case "details":
      return 2;
    case "groups":
      return 3;
    case "launching":
    case "success":
      return 4;
    default:
      return 1;
  }
};

const ProposeScreen = () => {
  const { user, loading: authLoading } = useAuth();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [currentStep, setCurrentStep] = useState<Step>("idea");
  const [ideaTitle, setIdeaTitle] = useState("");

  // Details state
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [location, setLocation] = useState("");

  // Groups state
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Advanced settings state
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showMyName, setShowMyName] = useState(false);
  const [customThreshold, setCustomThreshold] = useState("");
  const [votingDeadline, setVotingDeadline] = useState<Date | null>(null);
  const [costAmount, setCostAmount] = useState("");

  // Deadline picker state
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [tempDeadline, setTempDeadline] = useState<Date>(new Date());

  const currencySymbol = useMemo(() => getLocaleCurrencySymbol(), []);

  // Launch state
  const [isLaunching, setIsLaunching] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef<any>(null);

  // Direct event state
  const [directEventRoomId, setDirectEventRoomId] = useState<string | null>(null);
  const [creatingDirectEvent, setCreatingDirectEvent] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const copiedToastOpacity = useRef(new Animated.Value(0)).current;

  // Animation values
  const inputOpacity = useRef(new Animated.Value(1)).current;
  const inputScale = useRef(new Animated.Value(1)).current;
  const stepContentOpacity = useRef(new Animated.Value(0)).current;
  const launchCardScale = useRef(new Animated.Value(1)).current;
  const launchCardTranslateY = useRef(new Animated.Value(0)).current;
  const launchCardOpacity = useRef(new Animated.Value(1)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  // Load groups when reaching step 3
  useEffect(() => {
    if (currentStep === "groups" && !authLoading) {
      if (user) {
        loadGroups();
      } else {
        setLoadingGroups(false);
      }
    }
  }, [currentStep, user, authLoading]);

  const loadGroups = async () => {
    if (!user) {
      console.log("[ProposeScreen] loadGroups — no user, skipping");
      return;
    }
    console.log("[ProposeScreen] loadGroups — user.id:", user.id);
    setLoadingGroups(true);
    try {
      const userGroups = await getUserGroups(user.id);
      console.log("[ProposeScreen] loadGroups — got groups:", userGroups?.length);
      setGroups(userGroups || []);
    } catch (error) {
      console.error("[ProposeScreen] Error loading groups:", error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const animateToNextStep = (nextStep: Step) => {
    Animated.timing(stepContentOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(nextStep);
      Animated.timing(stepContentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleIdeaSubmit = useCallback(() => {
    if (ideaTitle.trim().length === 0) return;

    Keyboard.dismiss();

    // Animate input out
    Animated.parallel([
      Animated.timing(inputOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(inputScale, {
        toValue: 0.8,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentStep("details");
      Animated.timing(stepContentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    });
  }, [ideaTitle, inputOpacity, inputScale, stepContentOpacity]);

  const handleBackToIdea = () => {
    Animated.timing(stepContentOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep("idea");
      inputOpacity.setValue(1);
      inputScale.setValue(1);
    });
  };

  const handleDetailsNext = () => {
    animateToNextStep("groups");
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const combineDateTime = (): Date | null => {
    if (!date && !time) return null;

    const combined = new Date();

    if (date) {
      combined.setFullYear(date.getFullYear());
      combined.setMonth(date.getMonth());
      combined.setDate(date.getDate());
    }

    if (time) {
      combined.setHours(time.getHours());
      combined.setMinutes(time.getMinutes());
      combined.setSeconds(0);
      combined.setMilliseconds(0);
    }

    return combined;
  };

  const handleLaunch = async () => {
    if (selectedGroups.length === 0 || isLaunching) return;

    setIsLaunching(true);

    // Haptic feedback immediately
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Animate the card flying up
    Animated.parallel([
      Animated.timing(launchCardScale, {
        toValue: 0.8,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(launchCardTranslateY, {
        toValue: -400,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(launchCardOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      // Combine date and time for starts_at
      const startsAt = combineDateTime();

      // Calculate vote window end time
      const voteWindowEndsAt = votingDeadline
        ? votingDeadline
        : new Date(Date.now() + DEFAULT_VOTE_WINDOW_HOURS * 60 * 60 * 1000);

      // Validate: event date must be after voting deadline
      if (startsAt && voteWindowEndsAt >= startsAt) {
        Alert.alert(
          "Invalid date",
          "The event date must be after the voting deadline."
        );
        setIsLaunching(false);
        launchCardScale.setValue(1);
        launchCardTranslateY.setValue(0);
        launchCardOpacity.setValue(1);
        return;
      }

      // Build description with location if provided
      const description = location ? `📍 ${location}` : undefined;

      // Threshold: if user set a custom value, use it; otherwise let RPC calculate (33% of group)
      const computedThreshold = customThreshold.trim()
        ? Math.max(1, parseInt(customThreshold, 10) || 2)
        : undefined;

      // Cost: if user entered an amount, format with currency symbol
      const estimatedCost = costAmount.trim()
        ? `${currencySymbol}${costAmount.trim()}`
        : null;

      // Create the shared event room FIRST so all proposals link to it
      const directResult = await createDirectEvent({
        title: ideaTitle.trim(),
        description,
        starts_at: startsAt?.toISOString(),
      });
      setDirectEventRoomId(directResult.id);

      // Create proposal in each selected group, linking to the shared event room
      const createPromises = selectedGroups.map((groupId) =>
        createProposal({
          group_id: groupId,
          title: ideaTitle.trim(),
          description,
          starts_at: startsAt?.toISOString(),
          vote_window_ends_at: voteWindowEndsAt.toISOString(),
          threshold: computedThreshold,
          is_anonymous: !showMyName,
          estimated_cost: estimatedCost,
          event_room_id: directResult.id,
        })
      );

      await Promise.all(createPromises);

      // Success! Show confetti
      setCurrentStep("success");
      setShowConfetti(true);

      // Fire confetti
      setTimeout(() => {
        confettiRef.current?.start();
      }, 100);

      // Fade in success message
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      // Another haptic for success
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("Error launching idea:", {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
      Alert.alert(
        "Couldn't launch idea",
        error?.message || "Something went wrong. Please try again."
      );

      // Reset animation
      launchCardScale.setValue(1);
      launchCardTranslateY.setValue(0);
      launchCardOpacity.setValue(1);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleCreateAndShare = async () => {
    if (creatingDirectEvent) return;

    setCreatingDirectEvent(true);

    try {
      const startsAt = combineDateTime();
      const description = location ? `📍 ${location}` : undefined;

      const result = await createDirectEvent({
        title: ideaTitle.trim(),
        description,
        starts_at: startsAt?.toISOString(),
      });

      setDirectEventRoomId(result.id);

      // Success! Show confetti
      setCurrentStep("success");
      setShowConfetti(true);

      setTimeout(() => {
        confettiRef.current?.start();
      }, 100);

      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error("Error creating direct event:", error);
      Alert.alert(
        "Couldn't create event",
        error?.message || "Something went wrong. Please try again."
      );
    } finally {
      setCreatingDirectEvent(false);
    }
  };

  const showCopiedFeedback = () => {
    setShowCopiedToast(true);
    copiedToastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(copiedToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(copiedToastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setShowCopiedToast(false));
  };

  const handleShareInviteLink = async () => {
    if (!directEventRoomId) return;
    const url = `https://group-matchmaker-app.vercel.app/event/${directEventRoomId}`;
    if (Platform.OS === "web" && navigator?.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        showCopiedFeedback();
      } catch (_) {}
    } else {
      try {
        await Share.share({
          message: `Join me for ${ideaTitle.trim()}! ${url}`,
        });
      } catch (_) {}
    }
  };

  const resetForm = () => {
    // Reset all state
    setIdeaTitle("");
    setDate(null);
    setTime(null);
    setLocation("");
    setSelectedGroups([]);
    setShowConfetti(false);
    setAdvancedOpen(false);
    setShowMyName(false);
    setCustomThreshold("");
    setVotingDeadline(null);
    setCostAmount("");
    setDirectEventRoomId(null);
    setCreatingDirectEvent(false);

    // Reset animations
    inputOpacity.setValue(1);
    inputScale.setValue(1);
    stepContentOpacity.setValue(0);
    launchCardScale.setValue(1);
    launchCardTranslateY.setValue(0);
    launchCardOpacity.setValue(1);
    successOpacity.setValue(0);

    // Go back to step 1
    setCurrentStep("idea");
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    const isSelected = selectedGroups.includes(item.id);
    return (
      <TouchableOpacity
        style={[styles.groupRow, isSelected && styles.groupRowSelected]}
        onPress={() => toggleGroupSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          {item.member_count && (
            <Text style={styles.groupMembers}>
              {item.member_count} members
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderStepContent = () => {
    if (currentStep === "idea") {
      const formatDeadline = (d: Date) => {
        return d.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
      };

      const openDeadlinePicker = () => {
        setTempDeadline(votingDeadline || new Date(Date.now() + DEFAULT_VOTE_WINDOW_HOURS * 60 * 60 * 1000));
        setShowDeadlinePicker(true);
      };

      const handleDeadlineChange = (event: any, selectedDate?: Date) => {
        if (Platform.OS === "android") {
          setShowDeadlinePicker(false);
          if (event.type === "set" && selectedDate) {
            setVotingDeadline(selectedDate);
          }
        } else if (selectedDate) {
          setTempDeadline(selectedDate);
        }
      };

      const handleDeadlineDone = () => {
        setVotingDeadline(tempDeadline);
        setShowDeadlinePicker(false);
      };

      return (
        <Animated.View
          style={[
            styles.stepContent,
            {
              opacity: inputOpacity,
              transform: [{ scale: inputScale }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.ideaScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.stepTitle}>Launch an idea</Text>
            <Text style={styles.stepSubtitle}>
              What do you want to do with your group?
            </Text>
            <View style={styles.inputContainer}>
              <IdeaInput
                value={ideaTitle}
                onChangeText={setIdeaTitle}
                onSubmit={handleIdeaSubmit}
                autoFocus={true}
              />
            </View>

            {/* Advanced Settings Toggle */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setAdvancedOpen(!advancedOpen)}
              activeOpacity={0.7}
            >
              <Text style={styles.advancedToggleText}>
                Advanced Settings
              </Text>
              <Text style={styles.advancedToggleArrow}>
                {advancedOpen ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>

            {advancedOpen && (
              <View style={styles.advancedPanel}>
                {/* Show my name */}
                <View style={styles.advancedRow}>
                  <View style={styles.advancedRowLabel}>
                    <Text style={styles.advancedLabel}>Show my name</Text>
                    <Text style={styles.advancedHint}>
                      {showMyName
                        ? "Your name will be visible"
                        : "You will appear anonymous"}
                    </Text>
                  </View>
                  <Switch
                    value={showMyName}
                    onValueChange={setShowMyName}
                    trackColor={{
                      false: "rgba(255,255,255,0.1)",
                      true: colors.primary,
                    }}
                    thumbColor={colors.white}
                  />
                </View>

                {/* Minimum YES votes */}
                <View style={styles.advancedSection}>
                  <Text style={styles.advancedLabel}>Minimum YES votes</Text>
                  <Text style={styles.advancedHint}>
                    Leave blank for default (33% of group members, min 2)
                  </Text>
                  <TextInput
                    style={styles.advancedInput}
                    value={customThreshold}
                    onChangeText={setCustomThreshold}
                    placeholder={
                      selectedGroups.length > 0
                        ? `Default: ${Math.max(2, Math.ceil((groups.find((g) => g.id === selectedGroups[0])?.member_count || 3) * 0.33))}`
                        : "Select groups first"
                    }
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>

                {/* Voting deadline */}
                <View style={styles.advancedSection}>
                  <Text style={styles.advancedLabel}>Voting deadline</Text>
                  <Text style={styles.advancedHint}>
                    Leave unset for default (48h)
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.deadlineChip,
                      votingDeadline && styles.deadlineChipFilled,
                    ]}
                    onPress={openDeadlinePicker}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.deadlineChipIcon}>⏳</Text>
                    <Text
                      style={[
                        styles.deadlineChipText,
                        votingDeadline && styles.deadlineChipTextFilled,
                      ]}
                    >
                      {votingDeadline
                        ? formatDeadline(votingDeadline)
                        : "Set deadline"}
                    </Text>
                    {votingDeadline && (
                      <TouchableOpacity
                        onPress={() => setVotingDeadline(null)}
                        style={styles.deadlineClear}
                      >
                        <Text style={styles.deadlineClearText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Estimated cost */}
                <View style={styles.advancedSection}>
                  <Text style={styles.advancedLabel}>Estimated cost</Text>
                  <Text style={styles.advancedHint}>
                    Leave blank for none set
                  </Text>
                  <View style={styles.costInputRow}>
                    <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.costInput}
                      value={costAmount}
                      onChangeText={setCostAmount}
                      placeholder="—"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      keyboardType="numeric"
                      maxLength={6}
                    />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Web Deadline Picker */}
          {Platform.OS === "web" && showDeadlinePicker && (
            <Modal transparent animationType="fade">
              <View style={styles.pickerModal}>
                <View style={styles.pickerContainer}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity
                      onPress={() => setShowDeadlinePicker(false)}
                    >
                      <Text style={styles.pickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.pickerTitle}>Voting Deadline</Text>
                    <View style={{ width: 50 }} />
                  </View>
                  <View style={{ padding: 20 }}>
                    <input
                      type="datetime-local"
                      defaultValue={votingDeadline ? votingDeadline.toISOString().slice(0, 16) : ""}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e: any) => {
                        if (e.target.value) {
                          setVotingDeadline(new Date(e.target.value));
                          setShowDeadlinePicker(false);
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

          {/* iOS Deadline Picker Modal */}
          {Platform.OS === "ios" && showDeadlinePicker && (
            <Modal transparent animationType="slide">
              <View style={styles.pickerModal}>
                <View style={styles.pickerContainer}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity
                      onPress={() => setShowDeadlinePicker(false)}
                    >
                      <Text style={styles.pickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.pickerTitle}>Voting Deadline</Text>
                    <TouchableOpacity onPress={handleDeadlineDone}>
                      <Text style={styles.pickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={tempDeadline}
                    mode="datetime"
                    display="spinner"
                    onChange={handleDeadlineChange}
                    minimumDate={new Date()}
                    textColor={colors.text.primary}
                  />
                </View>
              </View>
            </Modal>
          )}

          {/* Android Deadline Picker */}
          {Platform.OS === "android" && showDeadlinePicker && (
            <DateTimePicker
              value={tempDeadline}
              mode="datetime"
              display="default"
              onChange={handleDeadlineChange}
              minimumDate={new Date()}
            />
          )}
        </Animated.View>
      );
    }

    if (currentStep === "details") {
      return (
        <Animated.View
          style={[styles.stepContent, styles.detailsStepContent, { opacity: stepContentOpacity }]}
        >
          {/* Locked idea pill */}
          <View style={styles.detailsPillContainer}>
            <IdeaPill title={ideaTitle} animateIn={true} large />
          </View>

          {/* Detail chips */}
          <View style={styles.chipsContainer}>
            <DetailChips
              date={date}
              time={time}
              location={location}
              onDateChange={setDate}
              onTimeChange={setTime}
              onLocationChange={setLocation}
              minimumDate={votingDeadline && votingDeadline > new Date() ? votingDeadline : undefined}
            />
          </View>

          <View style={styles.detailsButtonRow}>
            <TouchableOpacity
              style={styles.detailsBackButton}
              onPress={handleBackToIdea}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsBackButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.detailsNextButton}
              onPress={handleDetailsNext}
              activeOpacity={0.8}
            >
              <Text style={styles.detailsNextButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }

    if (currentStep === "groups") {
      return (
        <Animated.View
          style={[styles.stepContent, { opacity: stepContentOpacity }]}
        >
          {/* Animated card that flies up on launch */}
          <Animated.View
            style={[
              styles.launchCard,
              {
                transform: [
                  { scale: launchCardScale },
                  { translateY: launchCardTranslateY },
                ],
                opacity: launchCardOpacity,
              },
            ]}
          >
            {/* Locked idea pill at top */}
            <View style={styles.pillContainer}>
              <IdeaPill title={ideaTitle} animateIn={false} />
            </View>

            {/* Details summary if any */}
            {(date || time || location) && (
              <View style={styles.detailsSummary}>
                {date && (
                  <Text style={styles.detailsSummaryText}>
                    📅{" "}
                    {date.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                )}
                {time && (
                  <Text style={styles.detailsSummaryText}>
                    🕐{" "}
                    {time.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                )}
                {location && (
                  <Text style={styles.detailsSummaryText}>📍 {location}</Text>
                )}
              </View>
            )}
          </Animated.View>

          {/* Step 3 content */}
          <View style={styles.groupsContent}>
            <Text style={styles.stepTitle}>Choose groups</Text>
            <Text style={styles.stepSubtitle}>
              Send this idea to one or more groups
            </Text>

            <ScrollView
              style={styles.groupsScrollArea}
              contentContainerStyle={styles.groupsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {loadingGroups ? (
                <ActivityIndicator
                  size="large"
                  color={colors.primary}
                  style={styles.loader}
                />
              ) : groups.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>📭</Text>
                  <Text style={styles.emptyTitle}>No groups yet</Text>
                  <Text style={styles.emptySubtitle}>
                    No worries — create your event and share the invite link
                  </Text>
                  <TouchableOpacity
                    style={[styles.createAndShareButton, creatingDirectEvent && styles.launchButtonDisabled]}
                    onPress={handleCreateAndShare}
                    disabled={creatingDirectEvent}
                    activeOpacity={0.8}
                  >
                    {creatingDirectEvent ? (
                      <ActivityIndicator size="small" color={colors.text.primary} />
                    ) : (
                      <>
                        <Ionicons name="rocket-outline" size={20} color={colors.text.primary} style={{ marginRight: spacing.sm }} />
                        <Text style={styles.createAndShareButtonText}>Create & Share Invite</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                groups.map((item) => (
                  <View key={item.id}>{renderGroupItem({ item })}</View>
                ))
              )}

            </ScrollView>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => animateToNextStep("details")}
                activeOpacity={0.7}
                disabled={isLaunching}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.launchButton,
                  (selectedGroups.length === 0 || isLaunching) &&
                    styles.launchButtonDisabled,
                ]}
                onPress={handleLaunch}
                disabled={selectedGroups.length === 0 || isLaunching}
                activeOpacity={0.8}
              >
                {isLaunching ? (
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Text style={styles.launchButtonText}>Launch 🚀</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      );
    }

    if (currentStep === "success") {
      const hasGroups = selectedGroups.length > 0;
      return (
        <Animated.View
          style={[styles.successContent, { opacity: successOpacity }]}
        >
          <Text style={styles.successIcon}>🎉</Text>
          <Text style={styles.successTitle}>
            {hasGroups ? "Idea launched!" : "Event created!"}
          </Text>
          <Text style={styles.successSubtitle}>
            {hasGroups
              ? `Your idea has been sent to ${
                  selectedGroups.length === 1
                    ? "1 group"
                    : `${selectedGroups.length} groups`
                }. Group members can now vote!`
              : "Your event is ready. Share the invite link to get people in!"}
          </Text>

          <View style={styles.successButtons}>
            {directEventRoomId && (
              <>
                <TouchableOpacity
                  style={styles.shareInviteButton}
                  onPress={handleShareInviteLink}
                  activeOpacity={0.8}
                >
                  <Ionicons name="link-outline" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
                  <Text style={styles.shareInviteButtonText}>Share Invite Link</Text>
                  <Ionicons name="share-outline" size={18} color={colors.primary} style={{ marginLeft: spacing.sm }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.goToEventButton}
                  onPress={() => navigation.navigate("EventRoom", { eventRoomId: directEventRoomId, title: ideaTitle.trim() })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.goToEventButtonText}>Go to Event Room</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.primarySuccessButton}
              onPress={resetForm}
              activeOpacity={0.8}
            >
              <Text style={styles.primarySuccessButtonText}>
                Launch another idea
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#1a1a2e", "#0a0a0f", "#0a0a0f"]}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />
      <Starfield />

      {/* Confetti overlay */}
      {showConfetti && (
        <ConfettiCannon
          ref={confettiRef}
          count={80}
          origin={{ x: -10, y: 0 }}
          autoStart={false}
          fadeOut={true}
          fallSpeed={2500}
          colors={[colors.primary, colors.success, "#fff", "#ffd700"]}
        />
      )}

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          enabled={Platform.OS !== "web"}
        >
          {/* Step indicator at top (hide on success) */}
          {currentStep !== "success" && (
            <View style={styles.header}>
              <StepIndicator
                totalSteps={TOTAL_STEPS}
                currentStep={getStepNumber(currentStep)}
              />
            </View>
          )}

          {/* Main content area */}
          <View style={styles.content}>{renderStepContent()}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Copied-to-clipboard toast */}
      {showCopiedToast && (
        <Animated.View style={[styles.copiedToast, { opacity: copiedToastOpacity }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          <Text style={styles.copiedToastText}>Link copied to clipboard</Text>
        </Animated.View>
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
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  content: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  ideaScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: spacing.xl,
  },
  detailsStepContent: {
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: "10%",
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  stepSubtitle: {
    fontSize: 16,
    color: colors.text.tertiary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  inputContainer: {
    marginTop: spacing.lg,
  },
  pillContainer: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: "center",
  },
  detailsPillContainer: {
    paddingBottom: spacing.xl,
    alignItems: "center",
  },
  chipsContainer: {
    marginBottom: spacing.xl,
    width: "100%",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  skipButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  skipButtonText: {
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: "500",
  },
  nextButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  nextButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  backButtonText: {
    color: colors.text.secondary,
    fontSize: 16,
    fontWeight: "500",
  },
  detailsButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    width: "100%",
  },
  detailsBackButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: borderRadius.md,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
  },
  detailsBackButtonText: {
    color: colors.text.secondary,
    fontSize: 18,
    fontWeight: "600",
  },
  detailsNextButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  detailsNextButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  launchCard: {
    // The card that animates on launch
  },
  detailsSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  detailsSummaryText: {
    fontSize: 12,
    color: colors.text.tertiary,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  groupsContent: {
    flex: 1,
  },
  groupsScrollArea: {
    flex: 1,
    marginTop: spacing.md,
  },
  groupsScrollContent: {
    paddingBottom: spacing.md,
  },
  groupsList: {
    flex: 1,
    marginTop: spacing.md,
  },
  groupsListContent: {
    paddingBottom: spacing.lg,
  },
  advancedToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  advancedToggleArrow: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  advancedPanel: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  advancedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  advancedRowLabel: {
    flex: 1,
    marginRight: spacing.md,
  },
  advancedSection: {
    marginBottom: spacing.lg,
  },
  advancedLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  advancedHint: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  advancedInput: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text.primary,
  },
  deadlineChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderStyle: "dashed",
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignSelf: "flex-start",
  },
  deadlineChipFilled: {
    backgroundColor: "rgba(87, 98, 183, 0.2)",
    borderColor: "rgba(87, 98, 183, 0.4)",
    borderStyle: "solid",
  },
  deadlineChipIcon: {
    fontSize: 16,
  },
  deadlineChipText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  deadlineChipTextFilled: {
    color: colors.text.primary,
    fontWeight: "500",
  },
  deadlineClear: {
    marginLeft: spacing.xs,
    padding: 4,
  },
  deadlineClearText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
  costInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: spacing.md,
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.secondary,
    marginRight: spacing.xs,
  },
  costInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text.primary,
  },
  pickerModal: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
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
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  groupRowSelected: {
    backgroundColor: "rgba(87, 98, 183, 0.15)",
    borderColor: "rgba(87, 98, 183, 0.4)",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    marginRight: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: "bold",
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  groupMembers: {
    fontSize: 13,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    marginTop: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  launchButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  launchButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  launchButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
  // Success state styles
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
    fontSize: 32,
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
  primarySuccessButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  primarySuccessButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  createAndShareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
    minHeight: 48,
  },
  createAndShareButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  shareInviteButton: {
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
  shareInviteButtonText: {
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

export default ProposeScreen;
