import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack"; // Import StackNavigationProp
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Text,
  TextInput,
  View,
} from "react-native";
import { RootStackParamList } from "../navigation/AppNavigator"; // Corrected import path
import { createGroup, getUserGroups, Group } from "../services/groupService";
import { supabase } from "../supabase"; // Adjust path if needed
import { commonStyles } from "../theme/commonStyles";
import { colors, spacing, typography } from "../theme/theme";

type GroupsScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "Groups"
>;

const GroupsScreen = () => {
  const navigation = useNavigation<GroupsScreenNavigationProp>();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Could not get user session.");
        return;
      }

      const userGroups = await getUserGroups(user.id);
      setGroups(userGroups);
    } catch (error) {
      console.error("Error fetching groups:", error);
      Alert.alert("Error", "Could not fetch groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Alert.alert("Error", "Please enter a group name.");
      return;
    }

    setIsCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "Could not get user session.");
        return;
      }

      await createGroup({
        name: newGroupName.trim(),
        description: newGroupDescription.trim(),
        created_by: user.id,
      });

      setNewGroupName("");
      setNewGroupDescription("");
      fetchGroups();
    } catch (error: any) {
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setIsCreating(false);
    }
  };

  const renderItem = ({ item }: { item: Group }) => (
    <View style={commonStyles.containerCard}>
      <Text
        style={[
          typography.sectionTitle,
          { marginBottom: spacing.xs, color: colors.text.primary },
        ]}
      >
        {item.name}
      </Text>
      <Text
        style={[
          typography.body,
          { color: colors.text.secondary, marginBottom: spacing.md },
        ]}
      >
        {item.description}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          flexWrap: "wrap",
          gap: spacing.sm,
        }}
      >
        <Button
          title="Add User"
          onPress={() =>
            navigation.navigate("AddUserToGroup", {
              groupId: item.id,
              groupName: item.name,
            })
          }
        />
        <Button
          title="Details"
          onPress={() =>
            navigation.navigate("GroupDetails", {
              groupId: item.id,
              groupName: item.name,
            })
          }
        />
      </View>
    </View>
  );

  return (
    <View style={commonStyles.container}>
      <Text style={commonStyles.title}>Your Groups</Text>
      {loading && groups.length === 0 ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <FlatList
          data={groups}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text
              style={[
                typography.body,
                {
                  color: colors.text.secondary,
                  textAlign: "center",
                  marginTop: spacing.xl,
                },
              ]}
            >
              You haven't joined any groups yet.
            </Text>
          }
          refreshing={loading}
          onRefresh={fetchGroups}
        />
      )}
      <View style={commonStyles.containerCard}>
        <Text
          style={[
            typography.sectionTitle,
            { marginBottom: spacing.sm, color: colors.text.primary },
          ]}
        >
          Create New Group
        </Text>
        <TextInput
          style={commonStyles.searchInput}
          placeholder="Group Name"
          placeholderTextColor={colors.text.tertiary}
          value={newGroupName}
          onChangeText={setNewGroupName}
          editable={!isCreating}
        />
        <TextInput
          style={commonStyles.searchInput}
          placeholder="Group Description"
          placeholderTextColor={colors.text.tertiary}
          value={newGroupDescription}
          onChangeText={setNewGroupDescription}
          editable={!isCreating}
        />
        <Button
          title={isCreating ? "Creating..." : "Create Group"}
          onPress={handleCreateGroup}
          disabled={isCreating}
        />
      </View>
    </View>
  );
};

export default GroupsScreen;
