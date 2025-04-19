import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackNavigationProp } from '../../App';
import { RootStackParamList } from '../navigation/AppNavigator';

type MatchmakingHomeNavigationProp = RootStackNavigationProp<'Main'>;

const MatchmakingHomeScreen = () => {
  const navigation = useNavigation<MatchmakingHomeNavigationProp>();
  const [activitySearch, setActivitySearch] = useState('');
  const [eventSearch, setEventSearch] = useState('');

  const handleActivitySearch = () => {
    if (activitySearch.trim().length === 0) return;
    
    navigation.navigate('MatchResults', {
      type: 'activity',
      query: activitySearch.trim()
    });
  };

  const handleEventSearch = () => {
    if (eventSearch.trim().length === 0) return;
    
    navigation.navigate('MatchResults', {
      type: 'event',
      query: eventSearch.trim()
    });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Find Your Match</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match by Activity</Text>
        <Text style={styles.sectionDescription}>
          Find groups that share your interests in specific activities
        </Text>
        
        <TextInput
          style={styles.searchInput}
          placeholder="What do you want to do? (e.g., 'casual bowling')"
          value={activitySearch}
          onChangeText={setActivitySearch}
        />
        
        <TouchableOpacity 
          style={[styles.searchButton, !activitySearch ? styles.disabledButton : null]}
          onPress={handleActivitySearch}
          disabled={!activitySearch}
        >
          <Text style={styles.buttonText}>Search Activities</Text>
        </TouchableOpacity>
        
        <Text style={styles.exampleText}>
          Examples: "Semi-serious bowling with drinks", "Casual people to play football with on Sundays"
        </Text>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Match by Event</Text>
        <Text style={styles.sectionDescription}>
          Find groups planning to attend specific events
        </Text>
        
        <TextInput
          style={styles.searchInput}
          placeholder="What event are you interested in? (e.g., 'concert in London')"
          value={eventSearch}
          onChangeText={setEventSearch}
        />
        
        <TouchableOpacity 
          style={[styles.searchButton, !eventSearch ? styles.disabledButton : null]}
          onPress={handleEventSearch}
          disabled={!eventSearch}
        >
          <Text style={styles.buttonText}>Search Events</Text>
        </TouchableOpacity>
        
        <Text style={styles.exampleText}>
          Examples: "Taylor Swift concert in London March 8th", "Gala music festival"
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  sectionDescription: {
    fontSize: 16,
    color: '#555',
    marginBottom: 20,
  },
  searchInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 15,
  },
  searchButton: {
    backgroundColor: '#5762b7',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  disabledButton: {
    backgroundColor: '#b5b5b5',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  exampleText: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 20,
  },
});

export default MatchmakingHomeScreen; 