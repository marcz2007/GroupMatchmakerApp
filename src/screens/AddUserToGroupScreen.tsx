import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RootStackParamList } from '../navigation/AppNavigator'; // Adjust path if needed
import { supabase } from '../supabase'; // Adjust path if needed

// Define the type for the route parameters
type AddUserToGroupScreenRouteProp = RouteProp<RootStackParamList, 'AddUserToGroup'>;
// Define the type for the navigation prop
type AddUserToGroupScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AddUserToGroup'>;

interface UserSearchResult {
  id: string;
  username: string;
  avatar_url?: string; // Optional: if you have avatars
}

const AddUserToGroupScreen = () => {
  const route = useRoute<AddUserToGroupScreenRouteProp>();
  const navigation = useNavigation<AddUserToGroupScreenNavigationProp>();
  const { groupId, groupName } = route.params;

  const [searchTerm, setSearchTerm] = useState('');
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
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${searchTerm.trim()}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error: any) {
      console.error('Error searching users:', error);
      Alert.alert('Search Error', error.message || 'Could not find users.');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUserToGroup = async (userId: string, username: string) => {
    setIsAddingUser(userId); // Show loading for this specific user
    try {
        // Check if user is already a member (optional but good practice)
        const { data: existingMember, error: checkError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .maybeSingle(); // Returns one row or null, doesn't error if not found

        if (checkError) throw checkError;

        if (existingMember) {
            Alert.alert('Already Member', `${username} is already in this group.`);
            return;
        }

        // Add user to group_members table
        const { error: insertError } = await supabase
            .from('group_members')
            .insert({ group_id: groupId, user_id: userId });

        if (insertError) throw insertError;

        Alert.alert('Success', `${username} has been added to ${groupName}.`);
        // Optionally, navigate back or clear search, etc.
        // navigation.goBack(); 

    } catch (error: any) {
        console.error('Error adding user to group:', error);
        Alert.alert('Error', error.message || `Could not add ${username} to the group.`);
    } finally {
        setIsAddingUser(null);
    }
  };

  const renderUserItem = ({ item }: { item: UserSearchResult }) => (
    <TouchableOpacity 
        style={styles.userItem}
        onPress={() => handleAddUserToGroup(item.id, item.username)}
        disabled={isAddingUser === item.id} // Disable button while this user is being added
    >
      {item.avatar_url ? (
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder} /> // Placeholder for avatar
      )}
      <Text style={styles.username}>{item.username}</Text>
      {isAddingUser === item.id && <ActivityIndicator size="small" color="#007AFF" />}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder={`Search users to add to "${groupName}"`}
        value={searchTerm}
        onChangeText={setSearchTerm}
        onSubmitEditing={handleSearchUsers} // Search when user presses return/submit
        returnKeyType="search"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.searchButton} onPress={handleSearchUsers} disabled={isLoading}>
        {isLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.searchButtonText}>Search</Text>}
      </TouchableOpacity>

      {searchResults.length === 0 && !isLoading && searchTerm.length > 1 && (
          <Text style={styles.emptyResultsText}>No users found matching "{searchTerm}".</Text>
      )}

      <FlatList
        data={searchResults}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !isLoading && searchTerm.length > 1 && searchResults.length === 0 ? null : 
          <Text style={styles.infoText}>Enter a username to search for users.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#f4f4f8',
  },
  searchInput: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 10,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderRadius: 8,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    backgroundColor: '#e0e0e0',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
    backgroundColor: '#ccc', // A bit darker for placeholder
  },
  username: {
    fontSize: 16,
    flex: 1, // Allow username to take remaining space
  },
  infoText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  emptyResultsText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#888',
  }
});

export default AddUserToGroupScreen; 