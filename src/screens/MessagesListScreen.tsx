import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../supabase';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackNavigationProp } from '../../App';
import { RootStackParamList } from '../navigation/AppNavigator';

interface ChatPreview {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: Date;
  isGroup: boolean;
}

type MessagesScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Main'>;

const MessagesListScreen = () => {
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<MessagesScreenNavigationProp>();

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setChats([]);
        Alert.alert('Error', 'Could not get user session.');
        return;
      }

      // Fetch groups user is member of
      const { data: groupsData, error: groupsError } = await supabase
        .from('group_members')
        .select(`
          groups (
            id,
            name
          )
        `)
        .eq('user_id', user.id);

      if (groupsError) {
        console.error('Error fetching group chats:', groupsError);
        Alert.alert('Error', 'Could not fetch group chats.');
        return;
      }

      // Fetch latest message for each group
      const groupPreviews: ChatPreview[] = [];
      
      if (groupsData) {
        for (const item of groupsData) {
          if (!item.groups) continue;
          
          const { data: latestMessage, error: messageError } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('group_id', item.groups.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (!messageError && latestMessage) {
            groupPreviews.push({
              id: item.groups.id,
              name: item.groups.name,
              lastMessage: latestMessage.content,
              timestamp: new Date(latestMessage.created_at),
              isGroup: true
            });
          } else {
            // If no messages, still show the group
            groupPreviews.push({
              id: item.groups.id,
              name: item.groups.name,
              lastMessage: 'No messages yet',
              timestamp: new Date(),
              isGroup: true
            });
          }
        }
      }

      // Sort by timestamp, newest first
      groupPreviews.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setChats(groupPreviews);
    } catch (error) {
      console.error('Unexpected error fetching chats:', error);
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
    
    // Refresh when screen comes into focus
    const unsubscribe = navigation.addListener('focus', fetchChats);
    return unsubscribe;
  }, [fetchChats, navigation]);

  const navigateToChat = (chat: ChatPreview) => {
    if (chat.isGroup) {
      navigation.navigate('Chat', { 
        groupId: chat.id, 
        groupName: chat.name 
      });
    }
    // Will handle direct messages in future implementation
  };

  const renderChatItem = ({ item }: { item: ChatPreview }) => (
    <TouchableOpacity 
      style={styles.chatItem}
      onPress={() => navigateToChat(item)}
    >
      <View style={styles.chatContent}>
        <Text style={styles.chatName}>{item.name}</Text>
        <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
      </View>
      <Text style={styles.timestamp}>
        {item.timestamp.toLocaleDateString(undefined, { 
          month: 'short', 
          day: 'numeric' 
        })}
      </Text>
    </TouchableOpacity>
  );

  if (loading && chats.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messages</Text>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet</Text>
        }
        refreshing={loading}
        onRefresh={fetchChats}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  chatItem: {
    flexDirection: 'row',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    borderRadius: 5,
    marginBottom: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatContent: {
    flex: 1,
  },
  chatName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: '#666',
    fontSize: 16,
  },
});

export default MessagesListScreen; 