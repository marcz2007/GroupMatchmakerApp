import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  Animated,
  SafeAreaView,
  Text,
  Keyboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { IdeaInput } from "../components/propose/IdeaInput";
import { IdeaPill } from "../components/propose/IdeaPill";
import { StepIndicator } from "../components/propose/StepIndicator";
import { colors, spacing } from "../theme";

type Step = "idea" | "details" | "groups" | "launching" | "success";

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
  const [currentStep, setCurrentStep] = useState<Step>("idea");
  const [ideaTitle, setIdeaTitle] = useState("");

  // Animation values
  const inputOpacity = useRef(new Animated.Value(1)).current;
  const inputScale = useRef(new Animated.Value(1)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;
  const step2Opacity = useRef(new Animated.Value(0)).current;

  const handleIdeaSubmit = useCallback(() => {
    if (ideaTitle.trim().length === 0) return;

    Keyboard.dismiss();

    // Animate input out and pill in
    Animated.parallel([
      // Fade and shrink input
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
      // After input fades, show pill and move to step 2
      setCurrentStep("details");

      Animated.parallel([
        Animated.timing(pillOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(step2Opacity, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [ideaTitle, inputOpacity, inputScale, pillOpacity, step2Opacity]);

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

    // Steps 2-4 (to be implemented in Task 2 & 3)
    return (
      <View style={styles.stepContent}>
        {/* Locked idea pill at top */}
        <Animated.View style={[styles.pillContainer, { opacity: pillOpacity }]}>
          <IdeaPill title={ideaTitle} animateIn={false} />
        </Animated.View>

        {/* Step 2 content placeholder */}
        <Animated.View style={[styles.nextStepContent, { opacity: step2Opacity }]}>
          <Text style={styles.stepTitle}>Add details</Text>
          <Text style={styles.stepSubtitle}>
            When and where? (optional)
          </Text>

          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderText}>
              📅 Date & Time chips coming in Task 2
            </Text>
            <Text style={styles.placeholderText}>
              📍 Location chip coming in Task 2
            </Text>
          </View>
        </Animated.View>
      </View>
    );
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
          <View style={styles.content}>
            {renderStepContent()}
          </View>
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
    justifyContent: "center",
  },
  stepContent: {
    flex: 1,
    justifyContent: "center",
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
    marginBottom: spacing.xl,
  },
  inputContainer: {
    marginTop: spacing.lg,
  },
  pillContainer: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  nextStepContent: {
    flex: 1,
    paddingTop: spacing.xl,
  },
  placeholderBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
  },
  placeholderText: {
    fontSize: 14,
    color: colors.text.tertiary,
  },
});

export default ProposeScreen;
