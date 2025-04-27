import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Button, Alert, ActivityIndicator, Image, TouchableOpacity, Platform } from 'react-native';
import { supabase } from '../supabase';

interface Profile {
  id: string;
  username: string;
  bio: string;
  interests: string[];
  avatar_url?: string;
}

const ProfileScreen = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        Alert.alert('Error', 'Could not get user session.');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        // If the error is because profile doesn't exist, create one
        if (error.code === 'PGRST116') { // PostgreSQL error for "no rows returned"
          // Create a default profile
          const defaultProfile = {
            id: user.id,
            username: '',
            bio: '',
            interests: [],
            created_at: new Date(),
            updated_at: new Date(),
          };

          const { error: insertError } = await supabase
            .from('profiles')
            .insert(defaultProfile);

          if (insertError) {
            Alert.alert('Error', 'Failed to create profile: ' + insertError.message);
            return;
          }
          
          // Set the new profile
          setProfile(defaultProfile);
          setUsername('');
          setBio('');
          setInterests('');
          return;
        }
        
        // For other errors
        Alert.alert('Error', 'Failed to fetch profile: ' + error.message);
        console.error('Error fetching profile', error);
        return;
      }

      if (data) {
        setProfile(data);
        setUsername(data.username || '');
        setBio(data.bio || '');
        setInterests(data.interests ? data.interests.join(', ') : '');
        setAvatarUrl(data.avatar_url || null);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      Alert.alert('Error', 'An unexpected error occurred while fetching your profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        Alert.alert('Error', 'Could not get user session.');
        return;
      }

      const interestsArray = interests
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);

      const updates = {
        id: user.id,
        username,
        bio,
        interests: interestsArray,
        updated_at: new Date(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(updates)
        .eq('id', user.id);

      if (error) {
        Alert.alert('Error updating profile', error.message);
      } else {
        Alert.alert('Success', 'Profile updated successfully');
        setEditing(false);
        fetchProfile();
      }
    } catch (error: any) {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Simplified approach without expo-image-picker
  const pickImage = async () => {
    try {
      // Alert that this feature requires additional setup
      Alert.alert(
        "Development Note",
        "Profile image upload requires a rebuild of the app with properly configured native modules.\n\nPlease consider using Expo Go for testing this feature, or follow the complete setup instructions in the documentation.",
        [
          { 
            text: "Try Anyway", 
            onPress: () => {
              // Here we would normally launch image picker
              Alert.alert("Image Picker", "This would normally open your photo library.");
            } 
          },
          { text: "OK", style: "cancel" }
        ]
      );
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Could not select image');
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Create file path with unique name
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${user.id}-${Date.now()}.${fileExt}`;
      
      // This would normally handle the image upload
      // Since we're providing a temporary placeholder,
      // we'll simulate this with a mock avatar URL
      
      // Simulated profile URL for development
      const mockAvatarUrl = "https://ui-avatars.com/api/?name=" + 
        encodeURIComponent(username || "User") + 
        "&background=random&color=fff&size=200";
      
      // Update profile with the mock avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: mockAvatarUrl })
        .eq('id', user.id);
        
      if (updateError) {
        Alert.alert('Update failed', updateError.message);
        return;
      }
      
      // Update local state
      setAvatarUrl(mockAvatarUrl);
      
      Alert.alert('Success', 'Profile picture updated (development mode)');
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Error', 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (editing) {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Edit Profile</Text>
        
        <View style={styles.avatarContainer}>
          {uploading ? (
            <ActivityIndicator size="large" style={styles.avatar} />
          ) : (
            <Image
              source={avatarUrl ? { uri: avatarUrl } : require('../../assets/default-avatar.png')}
              style={styles.avatar}
            />
          )}
          <TouchableOpacity 
            style={styles.uploadButton} 
            onPress={pickImage}
            disabled={uploading}
          >
            <Text style={styles.uploadButtonText}>Change Photo</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="Enter username"
        />
        
        <Text style={styles.label}>Bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell others about yourself"
          multiline
        />
        
        <Text style={styles.label}>Interests (comma-separated)</Text>
        <TextInput
          style={styles.input}
          value={interests}
          onChangeText={setInterests}
          placeholder="e.g. art, movies, hiking"
        />
        
        <View style={styles.buttonContainer}>
          <Button
            title={isSaving ? "Saving..." : "Save Changes"}
            onPress={handleSave}
            disabled={isSaving}
          />
          <Button
            title="Cancel"
            onPress={() => setEditing(false)}
            disabled={isSaving}
            color="gray"
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Your Profile</Text>
      
      <View style={styles.avatarContainer}>
        <Image
          source={avatarUrl ? { uri: avatarUrl } : require('../../assets/default-avatar.png')}
          style={styles.avatar}
        />
      </View>
      
      <View style={styles.profileSection}>
        <Text style={styles.label}>Username</Text>
        <Text style={styles.profileValue}>{profile?.username || 'Not set'}</Text>
      </View>
      
      <View style={styles.profileSection}>
        <Text style={styles.label}>Bio</Text>
        <Text style={styles.profileValue}>{profile?.bio || 'Not set'}</Text>
      </View>
      
      <View style={styles.profileSection}>
        <Text style={styles.label}>Interests</Text>
        <Text style={styles.profileValue}>
          {profile?.interests && profile.interests.length > 0
            ? profile.interests.join(', ')
            : 'Not set'}
        </Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <Button title="Edit Profile" onPress={() => setEditing(true)} />
        <Button title="Logout" onPress={handleLogout} color="red" />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  profileSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  profileValue: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  bioInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    marginTop: 20,
    gap: 10,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e1e1e1',
    marginBottom: 10,
  },
  uploadButton: {
    backgroundColor: '#5762b7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 5,
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default ProfileScreen; 