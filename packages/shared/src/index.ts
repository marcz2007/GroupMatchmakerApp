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
  EventWithDetails,
  ChatExtensionStatus,
  ChatExtensionVoteResult,
} from "./services/eventService";
// Rename to avoid conflict with eventRoomService
export { sendEventMessage as sendEventServiceMessage } from "./services/eventService";
export type { EventRoom as EventServiceRoom, EventMessage as EventServiceMessage } from "./services/eventService";

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
} from "./services/eventRoomService";
// Use eventRoomService's types as the primary ones
export { sendEventMessage } from "./services/eventRoomService";
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
} from "./services/schedulingService";
export type {
  SchedulingSlot,
  CandidateTime,
  SyncedUser,
  SmartSchedulingStatus,
} from "./services/schedulingService";
