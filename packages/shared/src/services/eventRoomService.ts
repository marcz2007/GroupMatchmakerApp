import { supabase } from "../supabase";
import { getDisplayName } from "../utils";
import { Proposal } from "./proposalService";

/** Hours after ends_at or starts_at before an event room expires */
const EVENT_EXPIRY_HOURS_WITH_DATES = 48;
/** Hours after created_at before an event room without dates expires */
const EVENT_EXPIRY_HOURS_WITHOUT_DATES = 72;
/** Default number of messages to fetch per page */
const DEFAULT_MESSAGE_LIMIT = 50;
/** Milliseconds per hour, used for time-remaining calculations */
const MS_PER_HOUR = 1000 * 60 * 60;
/** Milliseconds per minute, used for time-remaining calculations */
const MS_PER_MINUTE = 1000 * 60;

export interface EventRoom {
  id: string;
  proposal_id: string | null;
  group_id: string | null;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  created_by?: string | null;
  scheduling_mode?: "fixed" | "smart" | "poll";
  scheduling_status?: "none" | "collecting" | "scheduled" | "failed";
  scheduling_deadline?: string | null;
}

export interface EventRoomParticipant {
  id: string;
  event_room_id: string;
  user_id: string;
  joined_at: string;
}

export interface EventMessage {
  id: string;
  content: string;
  created_at: string;
  is_system_message?: boolean;
  user: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface EventRoomWithDetails {
  event_room: EventRoom;
  proposal: Proposal | null;
  group: {
    id: string | null;
    name: string;
  } | null;
  participant_count: number;
  is_expired: boolean;
}

export interface EventRoomMessagesResult {
  messages: EventMessage[];
  is_expired: boolean;
}

export async function getUserEventRooms(): Promise<EventRoomWithDetails[]> {
  const { data, error } = await supabase.rpc("get_user_event_rooms");

  if (error) {
    console.error("[EventRoomService] getUserEventRooms failed:", error);
    throw error;
  }

  return data || [];
}

export async function getGroupEventRooms(
  groupId: string
): Promise<EventRoomWithDetails[]> {
  const allRooms = await getUserEventRooms();
  return allRooms.filter((room) => room.group?.id === groupId);
}

export async function getEventRoomMessages(
  eventRoomId: string,
  limit: number = DEFAULT_MESSAGE_LIMIT,
  offset: number = 0
): Promise<EventRoomMessagesResult> {
  const { data, error } = await supabase.rpc("get_event_room_messages", {
    p_event_room_id: eventRoomId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("[EventRoomService] getEventRoomMessages failed:", error);
    throw error;
  }

  return data;
}

export async function sendEventMessage(
  eventRoomId: string,
  content: string
): Promise<EventMessage> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase
    .from("event_messages")
    .insert({
      event_room_id: eventRoomId,
      user_id: user.user.id,
      content: content,
    })
    .select(
      `
      id,
      content,
      created_at,
      profiles!event_messages_user_id_fkey (
        id,
        username,
        first_name,
        avatar_url
      )
    `
    )
    .single();

  if (error) {
    console.error("[EventRoomService] sendEventMessage failed:", error);
    throw error;
  }

  const profiles = data.profiles as unknown as {
    id: string;
    username: string | null;
    first_name: string | null;
    avatar_url: string | null;
  };

  return {
    id: data.id,
    content: data.content,
    created_at: data.created_at,
    user: {
      id: profiles.id,
      display_name: getDisplayName(profiles.username, profiles.first_name),
      avatar_url: profiles.avatar_url,
    },
  };
}

export async function getEventRoomById(
  eventRoomId: string
): Promise<EventRoom | null> {
  const { data, error } = await supabase
    .from("event_rooms")
    .select("*")
    .eq("id", eventRoomId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("[EventRoomService] getEventRoomById failed:", error);
    throw error;
  }

  return data;
}

export async function getEventRoomParticipants(
  eventRoomId: string
): Promise<
  Array<{
    id: string;
    display_name: string;
    avatar_url: string | null;
    joined_at: string;
  }>
> {
  const { data, error } = await supabase
    .from("event_room_participants")
    .select(
      `
      joined_at,
      profiles!event_room_participants_user_id_fkey (
        id,
        username,
        first_name,
        avatar_url
      )
    `
    )
    .eq("event_room_id", eventRoomId);

  if (error) {
    console.error("[EventRoomService] getEventRoomParticipants failed:", error);
    throw error;
  }

  return (
    data?.map((item) => {
      const profile = item.profiles as unknown as {
        id: string;
        username: string | null;
        first_name: string | null;
        avatar_url: string | null;
      };
      return {
        id: profile.id,
        display_name: getDisplayName(profile.username, profile.first_name),
        avatar_url: profile.avatar_url,
        joined_at: item.joined_at,
      };
    }) || []
  );
}

/**
 * Calculates the expiry time for an event room based on its date fields.
 * Uses ends_at or starts_at (+ 48h) if available, otherwise created_at (+ 72h).
 */
function calculateEventExpiryTime(eventRoom: EventRoom): Date {
  if (eventRoom.ends_at) {
    const expiryTime = new Date(eventRoom.ends_at);
    expiryTime.setHours(expiryTime.getHours() + EVENT_EXPIRY_HOURS_WITH_DATES);
    return expiryTime;
  } else if (eventRoom.starts_at) {
    const expiryTime = new Date(eventRoom.starts_at);
    expiryTime.setHours(expiryTime.getHours() + EVENT_EXPIRY_HOURS_WITH_DATES);
    return expiryTime;
  } else {
    const expiryTime = new Date(eventRoom.created_at);
    expiryTime.setHours(expiryTime.getHours() + EVENT_EXPIRY_HOURS_WITHOUT_DATES);
    return expiryTime;
  }
}

export function isEventRoomExpired(eventRoom: EventRoom): boolean {
  return new Date() >= calculateEventExpiryTime(eventRoom);
}

export function getEventRoomTimeRemaining(eventRoom: EventRoom): {
  expired: boolean;
  hours: number;
  minutes: number;
} {
  const diffMs = calculateEventExpiryTime(eventRoom).getTime() - new Date().getTime();

  if (diffMs <= 0) {
    return { expired: true, hours: 0, minutes: 0 };
  }

  const hours = Math.floor(diffMs / MS_PER_HOUR);
  const minutes = Math.floor((diffMs % MS_PER_HOUR) / MS_PER_MINUTE);

  return { expired: false, hours, minutes };
}

export async function createDirectEvent({
  title,
  description,
  starts_at,
  ends_at,
}: {
  title: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
}): Promise<EventRoom> {
  const { data, error } = await supabase.rpc("create_direct_event", {
    p_title: title,
    p_description: description || null,
    p_starts_at: starts_at || null,
    p_ends_at: ends_at || null,
  });

  if (error) {
    console.error("[EventRoomService] createDirectEvent failed:", error);
    throw error;
  }

  return data;
}

export interface PublicEventDetails {
  event_room: EventRoom;
  group_name: string;
  participant_count: number;
  participants: Array<{
    id: string;
    display_name: string;
    avatar_url: string | null;
  }>;
  creator_name: string | null;
  is_participant: boolean;
  is_expired: boolean;
}

export async function getPublicEventDetails(
  eventRoomId: string
): Promise<PublicEventDetails> {
  const { data, error } = await supabase.rpc("get_public_event_details", {
    p_event_room_id: eventRoomId,
  });

  if (error) {
    console.error("[EventRoomService] getPublicEventDetails failed:", error);
    throw error;
  }

  return data;
}

export async function joinEventRoom(
  eventRoomId: string
): Promise<{ success: boolean; event_room_id: string; title: string }> {
  const { data, error } = await supabase.rpc("join_event_room", {
    p_event_room_id: eventRoomId,
  });

  if (error) {
    console.error("[EventRoomService] joinEventRoom failed:", error);
    throw error;
  }

  return data;
}

export function subscribeToEventRoomMessages(
  eventRoomId: string,
  onNewMessage: (message: EventMessage) => void
) {
  const channel = supabase
    .channel(`event_messages:event_room_id=eq.${eventRoomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "event_messages",
        filter: `event_room_id=eq.${eventRoomId}`,
      },
      async (payload) => {
        const { data } = await supabase
          .from("event_messages")
          .select(
            `
            id,
            content,
            created_at,
            is_system_message,
            profiles!event_messages_user_id_fkey (
              id,
              username,
              first_name,
              avatar_url
            )
          `
          )
          .eq("id", payload.new.id)
          .single();

        if (data) {
          const profiles = data.profiles as unknown as {
            id: string;
            username: string | null;
            first_name: string | null;
            avatar_url: string | null;
          };

          onNewMessage({
            id: data.id,
            content: data.content,
            created_at: data.created_at,
            is_system_message: data.is_system_message || false,
            user: {
              id: profiles.id,
              display_name: getDisplayName(profiles.username, profiles.first_name),
              avatar_url: profiles.avatar_url,
            },
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
