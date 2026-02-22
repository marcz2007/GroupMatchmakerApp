import React, { useState, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import DateTimePicker from "@react-native-community/datetimepicker";
import { addHours } from "date-fns";
import { createProposal } from "../services/proposalService";
import { getGroupMemberCount } from "../services/groupService";
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

const CreateProposalScreen: React.FC = () => {
  const navigation = useNavigation<CreateProposalScreenNavigationProp>();
  const route = useRoute<CreateProposalScreenRouteProp>();
  const { groupId, groupName } = route.params;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showMyName, setShowMyName] = useState(false);
  const [customThreshold, setCustomThreshold] = useState("");
  const [votingDeadline, setVotingDeadline] = useState<Date | null>(null);
  const [costAmount, setCostAmount] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Deadline picker state
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [tempDeadline, setTempDeadline] = useState<Date>(new Date());

  const currencySymbol = useMemo(() => getLocaleCurrencySymbol(), []);

  useEffect(() => {
    getGroupMemberCount(groupId)
      .then(setMemberCount)
      .catch(() => setMemberCount(null));
  }, [groupId]);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title for your proposal");
      return;
    }

    setLoading(true);
    try {
      const voteWindowEndsAt = votingDeadline
        ? votingDeadline
        : addHours(new Date(), DEFAULT_VOTE_WINDOW_HOURS);

      // Threshold: if user set a custom value, use it; otherwise let RPC default (3)
      const computedThreshold = customThreshold.trim()
        ? Math.max(1, parseInt(customThreshold, 10) || 3)
        : undefined;

      // Cost: if user entered an amount, format with currency symbol
      const estimatedCost = costAmount.trim()
        ? `${currencySymbol}${costAmount.trim()}`
        : null;

      await createProposal({
        group_id: groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        vote_window_ends_at: voteWindowEndsAt.toISOString(),
        threshold: computedThreshold,
        is_anonymous: !showMyName,
        estimated_cost: estimatedCost,
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

  const formatDeadline = (d: Date) => {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const openDeadlinePicker = () => {
    setTempDeadline(votingDeadline || addHours(new Date(), DEFAULT_VOTE_WINDOW_HOURS));
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

          {/* Title */}
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

          {/* Description */}
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

          {/* Advanced Settings Toggle */}
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setAdvancedOpen(!advancedOpen)}
            activeOpacity={0.7}
          >
            <Text style={styles.advancedToggleText}>Advanced Settings</Text>
            <Text style={styles.advancedToggleArrow}>
              {advancedOpen ? "▲" : "▼"}
            </Text>
          </TouchableOpacity>

          {/* Advanced Settings Panel */}
          {advancedOpen && (
            <View style={styles.advancedPanel}>
              {/* Show my name */}
              <View style={styles.advancedRow}>
                <View style={styles.advancedRowLabel}>
                  <Text style={styles.label}>Show my name</Text>
                  <Text style={styles.hint}>
                    {showMyName
                      ? "Your name will be visible"
                      : "You will appear anonymous"}
                  </Text>
                </View>
                <Switch
                  value={showMyName}
                  onValueChange={setShowMyName}
                  trackColor={{ false: colors.surfaceLight, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>

              {/* Minimum YES votes */}
              <View style={styles.formSection}>
                <Text style={styles.label}>Minimum YES votes</Text>
                <Text style={styles.hint}>Leave blank to use default</Text>
                <TextInput
                  style={styles.input}
                  value={customThreshold}
                  onChangeText={setCustomThreshold}
                  placeholder="Default"
                  placeholderTextColor={colors.text.tertiary}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              {/* Voting deadline */}
              <View style={styles.formSection}>
                <Text style={styles.label}>Voting deadline</Text>
                <Text style={styles.hint}>
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
                  <Text style={styles.deadlineChipText}>
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
              <View style={styles.formSection}>
                <Text style={styles.label}>Estimated cost</Text>
                <Text style={styles.hint}>Leave blank for no cost</Text>
                <View style={styles.costInputRow}>
                  <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
                  <TextInput
                    style={styles.costInput}
                    value={costAmount}
                    onChangeText={setCostAmount}
                    placeholder="—"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Preview */}
          <View style={styles.previewSection}>
            <Text style={styles.previewTitle}>Preview</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewProposalTitle}>
                {title || "Your proposal title"}
              </Text>
              {description ? (
                <Text style={styles.previewDescription}>{description}</Text>
              ) : null}
              <View style={styles.previewMetaRow}>
                <Text style={styles.previewMeta}>
                  {customThreshold.trim()
                    ? `Needs ${customThreshold} YES votes`
                    : "Default threshold"}
                  {" • "}
                  {votingDeadline
                    ? `Voting closes ${formatDeadline(votingDeadline)}`
                    : "Default deadline (48h)"}
                </Text>
                {costAmount.trim() ? (
                  <View style={styles.previewCostBadge}>
                    <Text style={styles.previewCostText}>
                      {currencySymbol}{costAmount.trim()}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.previewAnonymous}>
                {showMyName ? "Your name will be shown" : "Anonymous proposal"}
              </Text>
            </View>
          </View>
        </ScrollView>

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
  advancedToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
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
  deadlineChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignSelf: "flex-start",
  },
  deadlineChipFilled: {
    backgroundColor: colors.primary + "20",
    borderColor: colors.primary,
  },
  deadlineChipText: {
    fontSize: 14,
    color: colors.text.secondary,
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
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
    paddingVertical: spacing.md,
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
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
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
  previewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  previewMeta: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  previewCostBadge: {
    backgroundColor: colors.warning,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    marginLeft: spacing.xs,
  },
  previewCostText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.background,
  },
  previewAnonymous: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
    fontStyle: "italic",
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
