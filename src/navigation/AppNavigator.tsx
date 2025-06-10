import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';

// Import screens
import AddUserToGroupScreen from '../screens/AddUserToGroupScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import GroupDetailsScreen from '../screens/GroupDetailsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import LoginScreen from '../screens/LoginScreen';
import MatchingScreen from '../screens/MatchingScreen';
import MatchResultsScreen from '../screens/MatchResultsScreen';
import MessagesListScreen from '../screens/MessagesListScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import SignupScreen from '../screens/SignupScreen';

// Import the bottom tab navigator
import BottomTabNavigator from './BottomTabNavigator';

// Define updated param list
export type RootStackParamList = {
  AuthLoading: undefined;
  Login: undefined;
  Signup: undefined;
  Main: undefined;
  Profile: { code?: string; state?: string; error?: string };
  PublicProfile: { userId: string };
  Chat: { groupId: string; groupName: string };
  MessagesList: undefined;
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetails: { groupId: string; groupName: string };
  AddUserToGroup: { groupId: string; groupName: string };
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
    <Stack.Screen 
      name="MessagesList" 
      component={MessagesListScreen} 
      options={{ title: 'Messages List' }}
    />
    <Stack.Screen 
      name="CreateGroup" 
      component={CreateGroupScreen}
      options={{ title: 'Create Group' }}
    />
    <Stack.Screen 
      name="Groups" 
      component={GroupsScreen} 
      options={{ title: 'Groups' }}
    />
    <Stack.Screen 
      name="AddUserToGroup" 
      component={AddUserToGroupScreen} 
      options={({ route }) => ({ title: `Add User to ${route.params.groupName}` })}
    />
    <Stack.Screen 
      name="GroupDetails" 
      component={GroupDetailsScreen} 
      options={({ route }) => ({ title: route.params.groupName || 'Group Details' })} 
    />
    <Stack.Screen 
      name="PublicProfile" 
      component={PublicProfileScreen} 
      options={{ title: 'Profile' }}
    />
  </Stack.Navigator>
);

// Conditional navigator based on authentication status
const AppNavigator = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return isAuthenticated ? <AppStack /> : <AuthStack />;
};

export default AppNavigator; 