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
import DatePicker from "react-native-date-picker";

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

  const handleSuggestActivity = async () => {
    if (!newSuggestion.title.trim()) {
      Alert.alert("Error", "Please enter an activity title");
      return;
    }

    if (!user) {
      Alert.alert("Error", "You must be logged in to suggest an activity");
      return;
    }

    try {
      const { error } = await supabase
        .from("group_activity_suggestions")
        .insert({
          group_id: groupId,
          suggestion: newSuggestion.title.trim(),
          suggested_date: newSuggestion.date.toISOString(),
          description: newSuggestion.description.trim(),
          created_by: user.id,
          status: "pending",
        });

      if (error) throw error;

      // Notify group members about the new suggestion
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId);

      if (members) {
        for (const member of members) {
          if (member.user_id !== user.id) {
            await supabase.from("notifications").insert({
              user_id: member.user_id,
              type: "activity_suggestion",
              group_id: groupId,
              message: `New activity suggestion in ${groupName}`,
              read: false,
            });
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
      Alert.alert("Error", "Failed to submit activity suggestion");
    }
  };

  const handleDateSelect = (daysToAdd: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + daysToAdd);
    setNewSuggestion((prev) => ({ ...prev, date: newDate }));
    setShowDatePicker(false);
  };

  const renderDateOptions = () => {
    const options = [
      { label: "Today", days: 0 },
      { label: "Tomorrow", days: 1 },
      { label: "In 2 days", days: 2 },
      { label: "In 3 days", days: 3 },
      { label: "In 4 days", days: 4 },
      { label: "In 5 days", days: 5 },
      { label: "In 6 days", days: 6 },
      { label: "Next week", days: 7 },
    ];

    return (
      <View style={styles.dateOptionsContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.label}
            style={styles.dateOption}
            onPress={() => handleDateSelect(option.days)}
          >
            <Text style={styles.dateOptionText}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
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

            <Modal
              visible={showDatePicker}
              transparent={true}
              animationType="slide"
            >
              <View style={styles.datePickerModalContainer}>
                <View style={styles.datePickerModalContent}>
                  <Text style={styles.datePickerTitle}>Select Date</Text>
                  <DatePicker date={date} onDateChange={setDate} mode="date" />
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

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
  dateOptionsContainer: {
    padding: spacing.md,
  },
  dateOption: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateOptionText: {
    ...typography.body,
    color: colors.text.primary,
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
    maxHeight: "80%",
  },
  datePickerTitle: {
    ...typography.title,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
});

export default GroupActionsScreen;
