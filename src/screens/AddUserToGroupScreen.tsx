import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/AppNavigator";
import { supabase } from "../supabase";
import { colors, spacing, borderRadius, typography } from "../theme";

// Define the type for the route parameters
type AddUserToGroupScreenRouteProp = RouteProp<
  RootStackParamList,
  "AddUserToGroup"
>;
// Define the type for the navigation prop
type AddUserToGroupScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AddUserToGroup"
>;

interface UserSearchResult {
  id: string;
  username: string;
  avatar_url?: string; // Optional: if you have avatars
}

const AddUserToGroupScreen = () => {
  const route = useRoute<AddUserToGroupScreenRouteProp>();
  const navigation = useNavigation<AddUserToGroupScreenNavigationProp>();
  const { groupId, groupName } = route.params;

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState<string | null>(null); // To show loading for specific user addition

  // Effect to set the title, can also be done in AppNavigator options
  useEffect(() => {
    navigation.setOptions({ title: `Add to ${groupName}` });
  }, [navigation, groupName]);

  const handleSearchUsers = async () => {
    if (searchTerm.trim().length < 2) {
      setSearchResults([]);
      // Alert.alert('Search too short', 'Please enter at least 2 characters to search.');
      return;
    }
    setIsLoading(true);
    try {
      // Assuming you have a 'profiles' table with a 'username' column
      // You might want to exclude users already in the group
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${searchTerm.trim()}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error: any) {
      console.error("Error searching users:", error);
      Alert.alert("Search Error", error.message || "Could not find users.");
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUserToGroup = async (userId: string, username: string) => {
    setIsAddingUser(userId);
    try {
      const { data, error } = await supabase.rpc("add_user_to_group", {
        p_group_id: groupId,
        p_user_id: userId,
      });

      if (error) throw error;

      Alert.alert("Success", `${username} has been added to ${groupName}.`);
      // Remove user from search results
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
    } catch (error: any) {
      console.error("Error adding user to group:", error);
      Alert.alert(
        "Error",
        error.message || `Could not add ${username} to the group.`
      );
    } finally {
      setIsAddingUser(null);
    }
  };

  const renderUserItem = ({ item }: { item: UserSearchResult }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleAddUserToGroup(item.id, item.username)}
      disabled={isAddingUser === item.id}
      activeOpacity={0.7}
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {item.username?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
      )}
      <Text style={styles.username}>{item.username}</Text>
      {isAddingUser === item.id ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View style={styles.addIcon}>
          <Ionicons name="add" size={20} color={colors.text.primary} />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.backgroundGradient}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrapper}>
              <Ionicons name="search" size={20} color={colors.text.tertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor={colors.text.tertiary}
                value={searchTerm}
                onChangeText={setSearchTerm}
                onSubmitEditing={handleSearchUsers}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={[styles.searchButton, isLoading && styles.searchButtonDisabled]}
              onPress={handleSearchUsers}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={searchResults}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                {searchTerm.length > 1 && !isLoading ? (
                  <>
                    <Ionicons name="person-outline" size={48} color={colors.text.tertiary} />
                    <Text style={styles.emptyText}>
                      No users found matching "{searchTerm}"
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="search-outline" size={48} color={colors.text.tertiary} />
                    <Text style={styles.emptyText}>
                      Search for users to add to this group
                    </Text>
                  </>
                )}
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  searchContainer: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.md,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 48,
    ...typography.body,
    color: colors.text.primary,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  searchButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  searchButtonText: {
    color: colors.text.primary,
    fontWeight: "600",
  },
  listContent: {
    flexGrow: 1,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceGlass,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: spacing.md,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: spacing.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    ...typography.subtitle,
    color: colors.text.primary,
  },
  username: {
    ...typography.body,
    flex: 1,
    color: colors.text.primary,
  },
  addIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xl * 2,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.tertiary,
    textAlign: "center",
    marginTop: spacing.md,
  },
});

export default AddUserToGroupScreen;
