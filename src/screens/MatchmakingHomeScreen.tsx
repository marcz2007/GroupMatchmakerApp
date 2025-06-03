import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RootStackNavigationProp } from '../../App';
import { commonStyles } from '../theme/commonStyles';

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
    <ScrollView style={commonStyles.container}>
      <Text style={commonStyles.title}>Find Your Match</Text>
      
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>Match by Activity</Text>
        <Text style={commonStyles.sectionDescription}>
          Find groups that share your interests in specific activities
        </Text>
        
        <TextInput
          style={commonStyles.searchInput}
          placeholder="What do you want to do? (e.g., 'casual bowling')"
          value={activitySearch}
          onChangeText={setActivitySearch}
        />
        
        <TouchableOpacity 
          style={[commonStyles.button, !activitySearch ? commonStyles.disabledButton : null]}
          onPress={handleActivitySearch}
          disabled={!activitySearch}
        >
          <Text style={commonStyles.buttonText}>Search Activities</Text>
        </TouchableOpacity>
        
        <Text style={commonStyles.caption}>
          Examples: "Semi-serious bowling with drinks", "Casual people to play football with on Sundays"
        </Text>
      </View>
      
      <View style={commonStyles.divider} />
      
      <View style={commonStyles.section}>
        <Text style={commonStyles.sectionTitle}>Match by Event</Text>
        <Text style={commonStyles.sectionDescription}>
          Find groups planning to attend specific events
        </Text>
        
        <TextInput
          style={commonStyles.searchInput}
          placeholder="What event are you interested in? (e.g., 'concert in London')"
          value={eventSearch}
          onChangeText={setEventSearch}
        />
        
        <TouchableOpacity 
          style={[commonStyles.button, !eventSearch ? commonStyles.disabledButton : null]}
          onPress={handleEventSearch}
          disabled={!eventSearch}
        >
          <Text style={commonStyles.buttonText}>Search Events</Text>
        </TouchableOpacity>
        
        <Text style={commonStyles.caption}>
          Examples: "Taylor Swift concert in London March 8th", "Gala music festival"
        </Text>
      </View>
    </ScrollView>
  );
};

export default MatchmakingHomeScreen; 