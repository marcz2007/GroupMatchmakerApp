import React, { useRef, useEffect } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  Text,
  Animated,
} from "react-native";
import { colors, spacing, borderRadius } from "../../theme";

interface IdeaInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const IdeaInput: React.FC<IdeaInputProps> = ({
  value,
  onChangeText,
  onSubmit,
  disabled = false,
  autoFocus = true,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleSubmit = () => {
    if (value.trim().length > 0 && !disabled) {
      onSubmit();
    }
  };

  const canSubmit = value.trim().length > 0 && !disabled;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder="What should we do?"
          placeholderTextColor={colors.text.tertiary}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={handleSubmit}
          returnKeyType="done"
          autoFocus={autoFocus}
          editable={!disabled}
          maxLength={100}
          multiline={false}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.8}
      >
        <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
          Next
        </Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {value.length}/100 characters
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  inputWrapper: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  input: {
    fontSize: 20,
    fontWeight: "500",
    color: colors.text.primary,
    textAlign: "center",
    minHeight: 28,
  },
  submitButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  submitButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  submitText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  submitTextDisabled: {
    color: colors.text.tertiary,
  },
  hint: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.text.tertiary,
  },
});
