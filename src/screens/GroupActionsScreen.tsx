import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { format } from "date-fns";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import { supabase } from "../supabase";
import { colors, spacing, typography } from "../theme/theme";

type GroupActionsScreenRouteProp = RouteProp<
  RootStackParamList,
  "GroupActions"
>;
type GroupActionsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "GroupActions"
>;

interface ActivitySuggestion {
  id: string;
  group_id: string;
  suggestion: string;
  description: string;
  suggested_date: string;
  created_by: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const GroupActionsScreen = () => {
  const navigation = useNavigation<GroupActionsScreenNavigationProp>();
  const route = useRoute<GroupActionsScreenRouteProp>();
  const { groupId, groupName } = route.params;
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<ActivitySuggestion | null>(null);
  const [date, setDate] = useState(new Date());
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [newSuggestion, setNewSuggestion] = useState({
    title: "",
    description: "",
    date: new Date(),
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());

  const handleSuggestActivity = async () => {
    if (!newSuggestion.title.trim()) {
      Alert.alert("Error", "Please enter an activity title");
      return;
    }

    console.log("Current user:", user);
    console.log("User ID:", user?.id);
    console.log("User email:", user?.email);

    if (!user) {
      Alert.alert("Error", "You must be logged in to suggest an activity");
      return;
    }

    try {
      console.log("Attempting to insert activity suggestion with data:", {
        group_id: groupId,
        suggestion: newSuggestion.title.trim(),
        suggested_date: newSuggestion.date.toISOString(),
        description: newSuggestion.description.trim(),
        created_by: user.id,
        status: "pending",
      });

      const { data, error } = await supabase
        .from("group_activity_suggestions")
        .insert({
          group_id: groupId,
          suggestion: newSuggestion.title.trim(),
          suggested_date: newSuggestion.date.toISOString(),
          description: newSuggestion.description.trim(),
          created_by: user.id,
          status: "pending",
        })
        .select();

      console.log("Supabase response - data:", data);
      console.log("Supabase response - error:", error);

      if (error) {
        console.error("Supabase error details:", error);
        throw error;
      }

      console.log("Activity suggestion inserted successfully:", data);

      // Notify group members about the new suggestion
      const { data: members, error: membersError } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);

      console.log("Group members query - data:", members);
      console.log("Group members query - error:", membersError);

      if (membersError) {
        console.error("Error fetching group members:", membersError);
      }

      if (members) {
        for (const member of members) {
          if (member.user_id !== user.id) {
            const { error: notificationError } = await supabase
              .from("notifications")
              .insert({
                user_id: member.user_id,
                type: "activity_suggestion",
                group_id: groupId,
                message: `New activity suggestion in ${groupName}`,
                read: false,
              });

            if (notificationError) {
              console.error(
                "Error creating notification for member:",
                member.user_id,
                notificationError
              );
            }
          }
        }
      }

      Alert.alert("Success", "Activity suggestion submitted successfully");
      setShowSuggestionModal(false);
      setNewSuggestion({
        title: "",
        description: "",
        date: new Date(),
      });
    } catch (error: any) {
      console.error("Error suggesting activity:", error);
      console.error("Error message:", error.message);
      console.error("Error details:", error.details);
      console.error("Error hint:", error.hint);
      Alert.alert(
        "Error",
        `Failed to submit activity suggestion: ${
          error.message || "Unknown error"
        }`
      );
    }
  };

  const handleDateConfirm = () => {
    const newDate = new Date(selectedYear, selectedMonth, selectedDay);
    setNewSuggestion((prev) => ({ ...prev, date: newDate }));
    setShowDatePicker(false);
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const renderDatePicker = () => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, i) => currentYear + i);
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <Modal visible={showDatePicker} animationType="slide" transparent={true}>
        <View style={styles.datePickerModalContainer}>
          <View style={styles.datePickerModalContent}>
            <Text style={styles.datePickerTitle}>Select Date</Text>

            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>Year:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pickerContainer}
                contentContainerStyle={styles.pickerContentContainer}
              >
                {years.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.pickerOption,
                      selectedYear === year && styles.pickerOptionSelected,
                    ]}
                    onPress={() => setSelectedYear(year)}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        selectedYear === year &&
                          styles.pickerOptionTextSelected,
                      ]}
                    >
                      {year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>Month:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pickerContainer}
                contentContainerStyle={styles.pickerContentContainer}
              >
                {months.map((month, index) => (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.pickerOption,
                      selectedMonth === index && styles.pickerOptionSelected,
                    ]}
                    onPress={() => setSelectedMonth(index)}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        selectedMonth === index &&
                          styles.pickerOptionTextSelected,
                      ]}
                    >
                      {month}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.datePickerRow}>
              <Text style={styles.datePickerLabel}>Day:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pickerContainer}
                contentContainerStyle={styles.pickerContentContainer}
              >
                {days.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={[
                      styles.pickerOption,
                      selectedDay === day && styles.pickerOptionSelected,
                    ]}
                    onPress={() => setSelectedDay(day)}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        selectedDay === day && styles.pickerOptionTextSelected,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.datePickerButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleDateConfirm}
              >
                <Text style={styles.modalButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.actionCard}
        onPress={() => setShowSuggestionModal(true)}
      >
        <Text style={styles.actionTitle}>Suggest an Activity</Text>
        <Text style={styles.actionDescription}>
          Propose an anonymous activity for the group to vote on
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showSuggestionModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Suggest an Activity</Text>

            <TextInput
              style={styles.input}
              placeholder="Activity Title"
              value={newSuggestion.title}
              onChangeText={(text) =>
                setNewSuggestion((prev) => ({ ...prev, title: text }))
              }
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description"
              multiline
              numberOfLines={4}
              value={newSuggestion.description}
              onChangeText={(text) =>
                setNewSuggestion((prev) => ({ ...prev, description: text }))
              }
            />

            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {format(newSuggestion.date, "PPP")}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowSuggestionModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleSuggestActivity}
              >
                <Text style={styles.modalButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {renderDatePicker()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  actionCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md,
    elevation: 2,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionTitle: {
    ...typography.title,
    marginBottom: spacing.xs,
  },
  actionDescription: {
    ...typography.body,
    color: colors.text.secondary,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: spacing.lg,
    width: "90%",
    maxWidth: 500,
  },
  modalTitle: {
    ...typography.title,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...typography.body,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dateButtonText: {
    ...typography.body,
    color: colors.text.primary,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  modalButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 8,
    marginHorizontal: spacing.xs,
  },
  cancelButton: {
    backgroundColor: colors.border,
  },
  submitButton: {
    backgroundColor: colors.primary,
  },
  modalButtonText: {
    ...typography.body,
    color: colors.white,
    textAlign: "center",
    fontWeight: "bold",
  },
  textArea: {
    height: 100,
  },
  datePickerModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  datePickerModalContent: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: spacing.lg,
    width: "90%",
    maxWidth: 500,
  },
  datePickerTitle: {
    ...typography.title,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  datePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  datePickerLabel: {
    ...typography.body,
    color: colors.text.primary,
    marginRight: spacing.md,
  },
  pickerContainer: {
    flexDirection: "row",
  },
  pickerOption: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  pickerOptionSelected: {
    backgroundColor: colors.primary,
  },
  pickerOptionText: {
    ...typography.body,
    color: colors.text.primary,
  },
  pickerOptionTextSelected: {
    ...typography.body,
    color: colors.white,
  },
  datePickerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  pickerContentContainer: {
    alignItems: "center",
  },
});

export default GroupActionsScreen;
