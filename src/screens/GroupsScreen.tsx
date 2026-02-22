import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/AppNavigator";
import { createGroup, getUserGroups, Group } from "../services/groupService";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing, borderRadius, typography } from "../theme";

type GroupsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Groups"
>;

interface GroupsScreenProps {
  onSelectGroup?: (group: { id: string; name: string }) => void;
  selectedGroupId?: string;
}

const GroupsScreen = ({ onSelectGroup, selectedGroupId }: GroupsScreenProps = {}) => {
  const navigation = useNavigation<GroupsScreenNavigationProp>();
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchGroups = useCallback(async () => {
    try {
      console.log("[Groups] fetchGroups called, user:", user?.id ?? "null");
      if (!user) {
        console.log("[Groups] No user, skipping fetch");
        return;
      }

      console.log("[Groups] Calling getUserGroups...");
      const userGroups = await getUserGroups(user.id);
      console.log("[Groups] Got groups:", userGroups.length);
      setGroups(userGroups);
    } catch (error) {
      console.error("[Groups] Error fetching groups:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchGroups();
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;

    setIsCreating(true);
    try {
      await createGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim(),
        created_by: user.id,
      });

      setNewGroupName("");
      setNewGroupDescription("");
      setShowCreateForm(false);
      fetchGroups();
    } catch (error: any) {
      console.error("Error creating group:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const renderGroupItem = ({ item }: { item: Group }) => {
    const isSelected = selectedGroupId === item.id;

    return (
    <TouchableOpacity
      style={[styles.groupCard, isSelected && styles.groupCardSelected]}
      onPress={() => {
        if (onSelectGroup) {
          onSelectGroup({ id: item.id, name: item.name });
        } else {
          navigation.navigate("GroupDetails", {
            groupId: item.id,
            groupName: item.name,
          });
        }
      }}
      activeOpacity={0.7}
    >
      <View style={styles.groupIconContainer}>
        <LinearGradient
          colors={[colors.primary, colors.secondary]}
          style={styles.groupIcon}
        >
          <Text style={styles.groupInitial}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </LinearGradient>
      </View>

      <View style={styles.groupInfo}>
        <Text style={styles.groupName} numberOfLines={1}>
          {item.name}
        </Text>
        {item.description && (
          <Text style={styles.groupDescription} numberOfLines={1}>
            {item.description}
          </Text>
        )}
        <Text style={styles.groupMembers}>
          {item.member_count || 1} member{(item.member_count || 1) !== 1 ? "s" : ""}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
    </TouchableOpacity>
  );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>👥</Text>
      <Text style={styles.emptyTitle}>No groups yet</Text>
      <Text style={styles.emptySubtitle}>
        Create a group to start planning{"\n"}activities with friends
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => setShowCreateForm(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.emptyButtonText}>+ Create your first group</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCreateForm = () => (
    <View style={styles.createForm}>
      <View style={styles.createFormHeader}>
        <Text style={styles.createFormTitle}>New Group</Text>
        <TouchableOpacity onPress={() => setShowCreateForm(false)}>
          <Ionicons name="close" size={24} color={colors.text.tertiary} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Group name"
        placeholderTextColor={colors.text.tertiary}
        value={newGroupName}
        onChangeText={setNewGroupName}
        editable={!isCreating}
        autoFocus
      />

      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder="Description (optional)"
        placeholderTextColor={colors.text.tertiary}
        value={newGroupDescription}
        onChangeText={setNewGroupDescription}
        editable={!isCreating}
        multiline
        numberOfLines={2}
      />

      <TouchableOpacity
        style={[
          styles.createButton,
          (!newGroupName.trim() || isCreating) && styles.createButtonDisabled,
        ]}
        onPress={handleCreateGroup}
        disabled={!newGroupName.trim() || isCreating}
        activeOpacity={0.8}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color={colors.text.primary} />
        ) : (
          <Text style={styles.createButtonText}>Create Group</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Groups</Text>
          {!showCreateForm && groups.length > 0 && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateForm(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Create Form */}
        {showCreateForm && renderCreateForm()}

        {/* Groups List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={groups}
            renderItem={renderGroupItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.text.primary}
              />
            }
            ListEmptyComponent={!showCreateForm ? renderEmptyState : null}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.text.primary,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupCardSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryBorder,
  },
  groupIconContainer: {
    marginRight: spacing.md,
  },
  groupIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  groupInitial: {
    ...typography.h3,
    color: colors.text.primary,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    ...typography.subtitle,
    color: colors.text.primary,
    marginBottom: 2,
  },
  groupDescription: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  groupMembers: {
    ...typography.caption,
    color: colors.text.tertiary,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.text.tertiary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  createForm: {
    backgroundColor: colors.surfaceGlass,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  createFormHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  createFormTitle: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    ...typography.body,
    color: colors.text.primary,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  createButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  createButtonText: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
});

export default GroupsScreen;
