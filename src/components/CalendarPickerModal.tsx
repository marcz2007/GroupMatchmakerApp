import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius } from "../theme";

export type CalendarProvider = "google" | "apple" | "outlook";

interface CalendarOption {
  provider: CalendarProvider;
  name: string;
  iconName: keyof typeof Ionicons.glyphMap;
  color: string;
  available: boolean;
}

const CALENDAR_OPTIONS: CalendarOption[] = [
  {
    provider: "google",
    name: "Google\nCalendar",
    iconName: "logo-google",
    color: "#4285F4",
    available: true,
  },
  {
    provider: "apple",
    name: "Apple\nCalendar",
    iconName: "logo-apple",
    color: "#FF3B30",
    available: false,
  },
  {
    provider: "outlook",
    name: "Outlook\nCalendar",
    iconName: "mail",
    color: "#0078D4",
    available: false,
  },
];

interface CalendarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (provider: CalendarProvider) => void;
  loading?: CalendarProvider | null;
}

const CalendarPickerModal: React.FC<CalendarPickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  loading,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.modal}>
          <View style={styles.header}>
            <Ionicons name="calendar" size={24} color={colors.primary} />
            <Text style={styles.title}>Sync Your Calendar</Text>
          </View>
          <Text style={styles.subtitle}>
            Choose a calendar to share your availability
          </Text>

          <View style={styles.optionsContainer}>
            {CALENDAR_OPTIONS.map((option) => {
              const isLoading = loading === option.provider;
              const isDisabled = !option.available || !!loading;

              return (
                <TouchableOpacity
                  key={option.provider}
                  style={[
                    styles.optionCard,
                    option.available && styles.optionCardAvailable,
                    !option.available && styles.optionCardDisabled,
                  ]}
                  onPress={() => option.available && onSelect(option.provider)}
                  disabled={isDisabled}
                  activeOpacity={0.7}
                >
                  {isLoading ? (
                    <View style={[styles.iconCircle, { backgroundColor: option.color + "20" }]}>
                      <ActivityIndicator size="large" color={option.color} />
                    </View>
                  ) : (
                    <View style={[styles.iconCircle, { backgroundColor: option.color + "20" }]}>
                      <Ionicons name={option.iconName} size={32} color={option.color} />
                    </View>
                  )}
                  <Text
                    style={[
                      styles.optionName,
                      !option.available && styles.optionNameDisabled,
                    ]}
                  >
                    {option.name}
                  </Text>
                  {!option.available && (
                    <View style={styles.comingSoonBadge}>
                      <Text style={styles.comingSoonText}>Coming soon</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text.primary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  optionsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  optionCard: {
    alignItems: "center",
    flex: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  optionCardAvailable: {
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  optionCardDisabled: {
    opacity: 0.35,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  optionName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
    textAlign: "center",
    lineHeight: 18,
  },
  optionNameDisabled: {
    color: colors.text.tertiary,
  },
  comingSoonBadge: {
    marginTop: 6,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  comingSoonText: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontStyle: "italic",
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontSize: 15,
    color: colors.text.tertiary,
    fontWeight: "500",
  },
});

export default CalendarPickerModal;
