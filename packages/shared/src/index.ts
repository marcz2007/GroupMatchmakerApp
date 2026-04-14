// Utils
export { getDisplayName, pluralize, formatDate } from "./utils";

// Supabase client
export { initSupabase, getSupabase, supabase } from "./supabase";

// Types
export type { Profile } from "./types";

// Theme
export { colors, typography, spacing, borderRadius } from "./theme";

// Query keys
export { queryKeys } from "./queryKeys";

// Services - User
export { getProfileById, getProfilesByIds, updateUserProfile } from "./services/userService";
export type { User } from "./services/userService";

// Services - Group
export { getUserGroups, getGroupById, createGroup, getGroupMemberCount } from "./services/groupService";
export type { Group } from "./services/groupService";

// Services - Proposal
export {
  getGroupProposals,
  getProposalWithVotes,
  createProposal,
  updateProposal,
  deleteProposal,
  castVote,
  removeVote,
  subscribeToGroupProposals,
  getPendingProposals,
  subscribeToPendingProposals,
  subscribeToProposalVotes,
} from "./services/proposalService";
export type {
  VoteValue,
  Proposal,
  VoteCounts,
  ProposalWithVotes,
  PendingProposal,
  CastVoteResult,
  CreateProposalInput,
} from "./services/proposalService";

// Services - Event (high-level)
export {
  getUserEvents,
  getEventDetails,
  getEventMessages,
  getEventParticipants,
  subscribeToEventMessages,
  subscribeToUserEvents,
  hasActiveEvents,
  voteToChatExtend,
  getChatExtensionStatus,
} from "./services/eventService";
export type {
  EventSummaryRoom,
  EventWithDetails,
  EventChatMessage,
  ChatExtensionStatus,
  ChatExtensionVoteResult,
} from "./services/eventService";
export { sendEventChatMessage } from "./services/eventService";

// Services - Event Room
export {
  getUserEventRooms,
  getGroupEventRooms,
  getEventRoomMessages,
  getEventRoomById,
  getEventRoomParticipants,
  isEventRoomExpired,
  getEventRoomTimeRemaining,
  createDirectEvent,
  getPublicEventDetails,
  joinEventRoom,
  subscribeToEventRoomMessages,
  sendEventMessage,
} from "./services/eventRoomService";
export type {
  EventRoom,
  EventRoomParticipant,
  EventMessage,
  EventRoomWithDetails,
  EventRoomMessagesResult,
  PublicEventDetails,
} from "./services/eventRoomService";

// Services - Scheduling
export {
  createSmartEvent,
  getSmartSchedulingStatus,
  syncCalendarForEvent,
  requestReschedule,
  refreshCalendarAndSync,
  getDayName,
  formatTimeSlot,
  createPollEvent,
  castPollVote,
  getPollStatus,
  finalizePollEvent,
} from "./services/schedulingService";
export type {
  SchedulingSlot,
  CandidateTime,
  SyncedUser,
  SmartSchedulingStatus,
  SchedulingMode,
  SchedulingStatus,
  PollOption,
  PollOptionInput,
  PollStatus,
} from "./services/schedulingService";

// Services - Notifications
export {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  subscribeToNotifications,
} from "./services/notificationService";
export type { Notification } from "./services/notificationService";
