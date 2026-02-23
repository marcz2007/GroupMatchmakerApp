import { createStackNavigator } from "@react-navigation/stack";
import React from "react";

// Import screens
import AddUserToGroupScreen from "../screens/AddUserToGroupScreen";
import CalendarLinkScreen from "../screens/CalendarLinkScreen";
import CreateGroupScreen from "../screens/CreateGroupScreen";
import CreateProposalScreen from "../screens/CreateProposalScreen";
import EventRoomScreen from "../screens/EventRoomScreen";
import EventChatScreen from "../screens/EventChatScreen";
import EventDetailScreen from "../screens/EventDetailScreen";
import GroupActionsScreen from "../screens/GroupActionsScreen";
import GroupDetailsScreen from "../screens/GroupDetailsScreen";
import GroupsScreen from "../screens/GroupsScreen";
import LoginScreen from "../screens/LoginScreen";
import PublicProfileScreen from "../screens/PublicProfileScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import SignupScreen from "../screens/SignupScreen";
import GuestEntryScreen from "../screens/GuestEntryScreen";

// Import the bottom tab navigator
import BottomTabNavigator from "./BottomTabNavigator";

// Import theme
import { colors } from "../theme";

// Define updated param list for Grapple Lite
export type RootStackParamList = {
  AuthLoading: undefined;
  Login: undefined;
  Signup: undefined;
  GuestEntry: undefined;
  ResetPassword: undefined;
  CalendarLink: undefined;
  Main: undefined;
  EditProfile: undefined;
  PublicProfile: { userId: string };
  Groups: undefined;
  CreateGroup: undefined;
  GroupDetails: { groupId: string; groupName: string };
  AddUserToGroup: { groupId: string; groupName: string };
  GroupActions: { groupId: string; groupName: string };
  EventRoom: { eventRoomId: string; title?: string };
  EventChat: { eventRoomId: string };
  EventDetail: { eventRoomId: string; eventDetails?: any };
  CreateProposal: { groupId: string; groupName: string };
  GroupAvailability: { groupId: string; groupName: string };
};

const Stack = createStackNavigator<RootStackParamList>();

// Auth stack that shows Login/Signup/ResetPassword/GuestEntry screens
const AuthStack = ({ hasPendingEvent }: { hasPendingEvent?: boolean }) => (
  <Stack.Navigator
    screenOptions={{ headerShown: false }}
    initialRouteName={hasPendingEvent ? "GuestEntry" : "Login"}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
    <Stack.Screen name="GuestEntry" component={GuestEntryScreen} />
    <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
  </Stack.Navigator>
);

// Shared screen options for futuristic dark theme
const screenOptions = {
  headerStyle: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: colors.text.primary,
  headerTitleStyle: {
    fontWeight: "600" as const,
  },
  cardStyle: {
    backgroundColor: colors.background,
  },
};

// Main app stack that includes the bottom tab navigator and other screens
const AppStack = () => (
  <Stack.Navigator screenOptions={screenOptions}>
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
      name="EventChat"
      component={EventChatScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="EventDetail"
      component={EventDetailScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="CreateProposal"
      component={CreateProposalScreen}
      options={{ title: "New Proposal" }}
    />
    <Stack.Screen
      name="CalendarLink"
      component={CalendarLinkScreen}
      options={{ title: "Connect Calendar" }}
    />
  </Stack.Navigator>
);

// Conditional navigator based on authentication status
// Calendar connection is no longer a gate — it's optional via profile settings
const AppNavigator = ({ isAuthenticated, hasPendingEvent }: { isAuthenticated: boolean; hasPendingEvent?: boolean }) => {
  // If not authenticated, show auth screens
  if (!isAuthenticated) {
    return <AuthStack hasPendingEvent={hasPendingEvent} />;
  }

  // If authenticated (guest or full account), show main app
  return <AppStack />;
};

export default AppNavigator;
