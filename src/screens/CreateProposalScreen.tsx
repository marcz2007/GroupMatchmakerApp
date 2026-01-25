import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { addDays, addHours, format } from "date-fns";
import { createProposal } from "../services/proposalService";
import { colors, spacing, borderRadius } from "../theme/theme";
import { RootStackParamList } from "../navigation/AppNavigator";

type CreateProposalScreenRouteProp = RouteProp<
  RootStackParamList,
  "CreateProposal"
>;
type CreateProposalScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "CreateProposal"
>;

const CreateProposalScreen: React.FC = () => {
  const navigation = useNavigation<CreateProposalScreenNavigationProp>();
  const route = useRoute<CreateProposalScreenRouteProp>();
  const { groupId, groupName } = route.params;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [threshold, setThreshold] = useState("3");
  const [votingHours, setVotingHours] = useState("24"); // Hours until voting closes
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title for your proposal");
      return;
    }

    const thresholdNum = parseInt(threshold, 10);
    if (isNaN(thresholdNum) || thresholdNum < 1) {
      Alert.alert("Error", "Threshold must be at least 1");
      return;
    }

    const votingHoursNum = parseInt(votingHours, 10);
    if (isNaN(votingHoursNum) || votingHoursNum < 1) {
      Alert.alert("Error", "Voting window must be at least 1 hour");
      return;
    }

    setLoading(true);
    try {
      const voteWindowEndsAt = addHours(new Date(), votingHoursNum);

      await createProposal({
        group_id: groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        vote_window_ends_at: voteWindowEndsAt.toISOString(),
        threshold: thresholdNum,
      });

      Alert.alert("Success", "Proposal created!", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Error creating proposal:", error);
      Alert.alert("Error", "Failed to create proposal. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.groupLabel}>Creating proposal for</Text>
          <Text style={styles.groupName}>{groupName}</Text>

          <View style={styles.formSection}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="What are you proposing?"
              placeholderTextColor={colors.text.tertiary}
              maxLength={100}
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add more details about your proposal..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>Minimum YES votes needed</Text>
            <Text style={styles.hint}>
              Event room is created when this threshold is reached
            </Text>
            <View style={styles.thresholdRow}>
              {["2", "3", "4", "5"].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.thresholdOption,
                    threshold === val && styles.thresholdOptionSelected,
                  ]}
                  onPress={() => setThreshold(val)}
                >
                  <Text
                    style={[
                      styles.thresholdText,
                      threshold === val && styles.thresholdTextSelected,
                    ]}
                  >
                    {val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.label}>Voting window</Text>
            <Text style={styles.hint}>
              How long should voting remain open?
            </Text>
            <View style={styles.thresholdRow}>
              {[
                { val: "6", label: "6h" },
                { val: "12", label: "12h" },
                { val: "24", label: "24h" },
                { val: "48", label: "48h" },
              ].map(({ val, label }) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.thresholdOption,
                    votingHours === val && styles.thresholdOptionSelected,
                  ]}
                  onPress={() => setVotingHours(val)}
                >
                  <Text
                    style={[
                      styles.thresholdText,
                      votingHours === val && styles.thresholdTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Preview</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewProposalTitle}>
                {title || "Your proposal title"}
              </Text>
              {description ? (
                <Text style={styles.previewDescription}>{description}</Text>
              ) : null}
              <Text style={styles.previewMeta}>
                Needs {threshold} YES votes • Voting closes in {votingHours}h
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.createButton,
              (!title.trim() || loading) && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!title.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.createButtonText}>Create Proposal</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  groupLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
    textAlign: "center",
  },
  groupName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  formSection: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  thresholdRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  thresholdOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thresholdOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  thresholdText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
  },
  thresholdTextSelected: {
    color: colors.white,
  },
  previewSection: {
    marginTop: spacing.md,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewProposalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  previewDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  previewMeta: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  footer: {
    flexDirection: "row",
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    marginRight: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  createButton: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  createButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.white,
  },
});

export default CreateProposalScreen;
