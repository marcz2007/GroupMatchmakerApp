import React, { useState, useRef, useCallback, useEffect } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { IdeaInput } from "../components/propose/IdeaInput";
import { IdeaPill } from "../components/propose/IdeaPill";
import { StepIndicator } from "../components/propose/StepIndicator";
import { DetailChips } from "../components/propose/DetailChips";
import { colors, spacing, borderRadius } from "../theme";
import { useAuth } from "../contexts/AuthContext";
import { getUserGroups } from "../services/groupService";

type Step = "idea" | "details" | "groups" | "launching" | "success";

interface Group {
  id: string;
  name: string;
  member_count?: number;
}

const TOTAL_STEPS = 4;

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
  const { user } = useAuth();
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

  // Animation values
  const inputOpacity = useRef(new Animated.Value(1)).current;
  const inputScale = useRef(new Animated.Value(1)).current;
  const stepContentOpacity = useRef(new Animated.Value(0)).current;

  // Load groups when reaching step 3
  useEffect(() => {
    if (currentStep === "groups" && user) {
      loadGroups();
    }
  }, [currentStep, user]);

  const loadGroups = async () => {
    if (!user) return;
    setLoadingGroups(true);
    try {
      const userGroups = await getUserGroups(user.id);
      setGroups(userGroups || []);
    } catch (error) {
      console.error("Error loading groups:", error);
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
        </Animated.View>
      );
    }

    if (currentStep === "details") {
      return (
        <Animated.View
          style={[styles.stepContent, { opacity: stepContentOpacity }]}
        >
          {/* Locked idea pill at top */}
          <View style={styles.pillContainer}>
            <IdeaPill title={ideaTitle} animateIn={true} />
          </View>

          {/* Step 2 content */}
          <View style={styles.detailsContent}>
            <Text style={styles.stepTitle}>Add details</Text>
            <Text style={styles.stepSubtitle}>When and where? (optional)</Text>

            <View style={styles.chipsContainer}>
              <DetailChips
                date={date}
                time={time}
                location={location}
                onDateChange={setDate}
                onTimeChange={setTime}
                onLocationChange={setLocation}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleDetailsNext}
                activeOpacity={0.7}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.nextButton}
                onPress={handleDetailsNext}
                activeOpacity={0.8}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      );
    }

    if (currentStep === "groups") {
      return (
        <Animated.View
          style={[styles.stepContent, { opacity: stepContentOpacity }]}
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
                  📅 {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              )}
              {time && (
                <Text style={styles.detailsSummaryText}>
                  🕐 {time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </Text>
              )}
              {location && (
                <Text style={styles.detailsSummaryText}>📍 {location}</Text>
              )}
            </View>
          )}

          {/* Step 3 content */}
          <View style={styles.groupsContent}>
            <Text style={styles.stepTitle}>Choose groups</Text>
            <Text style={styles.stepSubtitle}>
              Send this idea to one or more groups
            </Text>

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
                  Create or join a group to send ideas
                </Text>
              </View>
            ) : (
              <FlatList
                data={groups}
                keyExtractor={(item) => item.id}
                renderItem={renderGroupItem}
                style={styles.groupsList}
                contentContainerStyle={styles.groupsListContent}
              />
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => animateToNextStep("details")}
                activeOpacity={0.7}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.launchButton,
                  selectedGroups.length === 0 && styles.launchButtonDisabled,
                ]}
                onPress={() => {
                  // TODO: Implement launch in Task 3
                  console.log("Launch idea:", {
                    title: ideaTitle,
                    date,
                    time,
                    location,
                    groups: selectedGroups,
                  });
                }}
                disabled={selectedGroups.length === 0}
                activeOpacity={0.8}
              >
                <Text style={styles.launchButtonText}>
                  Launch 🚀
                </Text>
              </TouchableOpacity>
            </View>
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

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          {/* Step indicator at top */}
          <View style={styles.header}>
            <StepIndicator
              totalSteps={TOTAL_STEPS}
              currentStep={getStepNumber(currentStep)}
            />
          </View>

          {/* Main content area */}
          <View style={styles.content}>{renderStepContent()}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  detailsContent: {
    flex: 1,
    justifyContent: "center",
  },
  chipsContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
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
  groupsList: {
    flex: 1,
    marginTop: spacing.md,
  },
  groupsListContent: {
    paddingBottom: spacing.lg,
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
  },
  launchButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  launchButtonText: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: "700",
  },
});

export default ProposeScreen;
