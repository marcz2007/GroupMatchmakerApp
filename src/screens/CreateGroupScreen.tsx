import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button } from "../components/Button";
import { RootStackParamList } from "../navigation/AppNavigator"; // Adjust path if needed
import { supabase } from "../supabase"; // Adjust path if needed

// Define the type for the navigation prop
type CreateGroupScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "CreateGroup"
>;

const CreateGroupScreen = () => {
  const navigation = useNavigation<CreateGroupScreenNavigationProp>();
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Validation Error", "Group name is required.");
      return;
    }
    setIsLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert(
          "Authentication Error",
          "You must be logged in to create a group."
        );
        setIsLoading(false);
        return;
      }

      // Insert into groups table
      const { data: newGroup, error: groupInsertError } = await supabase
        .from("groups")
        .insert({
          name: groupName.trim(),
          description: description.trim(),
          owner_id: user.id, // Assuming you have an owner_id column
        })
        .select()
        .single();

      if (groupInsertError) throw groupInsertError;

      if (newGroup) {
        // Add the creator as a member of the group
        const { error: memberInsertError } = await supabase
          .from("group_members")
          .insert({ group_id: newGroup.id, user_id: user.id });

        if (memberInsertError) throw memberInsertError;

        Alert.alert(
          "Success",
          `Group "${newGroup.name}" created successfully!`
        );
        // Navigate to the Groups screen or the new Chat screen for the group
        // navigation.navigate('Groups');
        navigation.replace("Chat", {
          groupId: newGroup.id,
          groupName: newGroup.name,
        }); // Or navigate to chat of new group
      } else {
        Alert.alert(
          "Creation Error",
          "Failed to create the group. No data returned."
        );
      }
    } catch (error: any) {
      console.error("Error creating group:", error);
      Alert.alert(
        "Error",
        error.message ||
          "An unexpected error occurred while creating the group."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create a New Group</Text>
      <TextInput
        style={styles.input}
        placeholder="Group Name"
        placeholderTextColor="#b0b0b0"
        value={groupName}
        onChangeText={setGroupName}
        maxLength={50} // Optional: set a max length
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Group Description (Optional)"
        placeholderTextColor="#b0b0b0"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={4}
        maxLength={200} // Optional
      />
      {isLoading ? (
        <ActivityIndicator size="large" color="#5762b7" />
      ) : (
        <Button variant="primary" onPress={handleCreateGroup} fullWidth>
          Create Group
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#1a1a1a", // Anthracite grey background
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 25,
    textAlign: "center",
    color: "#ffffff", // White text
  },
  input: {
    height: 50,
    borderColor: "#404040", // Dark border
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: "#3a3a3a", // Dark surface background
    fontSize: 16,
    color: "#ffffff", // White text
  },
  textArea: {
    height: 100, // Adjust height for multiline input
    textAlignVertical: "top", // Align text to the top for multiline
    paddingTop: 15, // Adjust padding for multiline
  },
});

export default CreateGroupScreen;
