import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ChatScreen from '../screens/ChatScreen';
import MatchingScreen from '../screens/MatchingScreen';
import MatchResultsScreen from '../screens/MatchResultsScreen';

// Import the bottom tab navigator
import BottomTabNavigator from './BottomTabNavigator';

// Define updated param list
export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Main: undefined;
  Chat: { groupId: string; groupName: string };
  Matching: { currentGroupId: string; currentGroupName: string };
  MatchResults: { 
    type: 'activity' | 'event'; 
    query: string; 
    currentGroupId?: string;
  };
};

const Stack = createStackNavigator<RootStackParamList>();

// Auth stack that shows Login/Signup screens
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
  </Stack.Navigator>
);

// Main app stack that includes the bottom tab navigator and other screens
const AppStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="Main" 
      component={BottomTabNavigator} 
      options={{ headerShown: false }}
    />
    <Stack.Screen 
      name="Chat" 
      component={ChatScreen} 
      options={({ route }) => ({ title: route.params.groupName })}
    />
    <Stack.Screen 
      name="Matching" 
      component={MatchingScreen} 
      options={({ route }) => ({ title: `Match: ${route.params.currentGroupName}` })}
    />
    <Stack.Screen 
      name="MatchResults" 
      component={MatchResultsScreen} 
      options={{ title: 'Match Results' }}
    />
  </Stack.Navigator>
);

// Conditional navigator based on authentication status
const AppNavigator = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return isAuthenticated ? <AppStack /> : <AuthStack />;
};

export default AppNavigator; 