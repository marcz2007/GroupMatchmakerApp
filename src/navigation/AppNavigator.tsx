import { createStackNavigator } from "@react-navigation/stack";
import React from "react";

// Import screens
import AddUserToGroupScreen from "../screens/AddUserToGroupScreen";
import CreateGroupScreen from "../screens/CreateGroupScreen";
import CreateProposalScreen from "../screens/CreateProposalScreen";
import EventRoomScreen from "../screens/EventRoomScreen";
import GroupActionsScreen from "../screens/GroupActionsScreen";
import GroupDetailsScreen from "../screens/GroupDetailsScreen";
import GroupsScreen from "../screens/GroupsScreen";
import LoginScreen from "../screens/LoginScreen";
import PublicProfileScreen from "../screens/PublicProfileScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import SignupScreen from "../screens/SignupScreen";

// Import the bottom tab navigator
import BottomTabNavigator from "./BottomTabNavigator";

// Define updated param list for Grapple Lite
export type RootStackParamList = {
  AuthLoading: undefined;
  Login: undefined;
  Signup: undefined;
  ResetPassword: undefined;
  Main: undefined;
  EditProfile: undefined;
  PublicProfile: { userId: string };
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetails: { groupId: string; groupName: string };
  AddUserToGroup: { groupId: string; groupName: string };
  GroupActions: { groupId: string; groupName: string };
  EventRoom: { eventRoomId: string; title?: string };
  CreateProposal: { groupId: string; groupName: string };
};

const Stack = createStackNavigator<RootStackParamList>();

// Auth stack that shows Login/Signup/ResetPassword screens
const AuthStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
    <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
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
      name="CreateGroup"
      component={CreateGroupScreen}
      options={{ title: "Create Group" }}
    />
    <Stack.Screen
      name="Groups"
      component={GroupsScreen}
      options={{ title: "Groups" }}
    />
    <Stack.Screen
      name="AddUserToGroup"
      component={AddUserToGroupScreen}
      options={({ route }) => ({
        title: `Add User to ${route.params.groupName}`,
      })}
    />
    <Stack.Screen
      name="GroupDetails"
      component={GroupDetailsScreen}
      options={({ route }) => ({
        title: route.params.groupName || "Group Details",
      })}
    />
    <Stack.Screen
      name="GroupActions"
      component={GroupActionsScreen}
      options={({ route }) => ({ title: `${route.params.groupName} Actions` })}
    />
    <Stack.Screen
      name="PublicProfile"
      component={PublicProfileScreen}
      options={{ title: "Profile" }}
    />
    <Stack.Screen
      name="EventRoom"
      component={EventRoomScreen}
      options={({ route }) => ({
        title: route.params.title || "Event Room",
      })}
    />
    <Stack.Screen
      name="CreateProposal"
      component={CreateProposalScreen}
      options={{ title: "New Proposal" }}
    />
  </Stack.Navigator>
);

// Conditional navigator based on authentication status
const AppNavigator = ({ isAuthenticated }: { isAuthenticated: boolean }) => {
  return isAuthenticated ? <AppStack /> : <AuthStack />;
};

export default AppNavigator;
