import { supabase } from "../supabase";
import { Proposal } from "./proposalService";

export interface EventRoom {
  id: string;
  proposal_id: string;
  group_id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
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
  user: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface EventRoomWithDetails {
  event_room: EventRoom;
  proposal: Proposal;
  group: {
    id: string;
    name: string;
  };
  participant_count: number;
  is_expired: boolean;
}

export interface EventRoomMessagesResult {
  messages: EventMessage[];
  is_expired: boolean;
}

/**
 * Get all event rooms the current user is a participant in
 */
export async function getUserEventRooms(): Promise<EventRoomWithDetails[]> {
  const { data, error } = await supabase.rpc("get_user_event_rooms");

  if (error) {
    console.error("Error fetching user event rooms:", error);
    throw error;
  }

  return data || [];
}

/**
 * Get event rooms for a specific group
 */
export async function getGroupEventRooms(
  groupId: string
): Promise<EventRoomWithDetails[]> {
  const allRooms = await getUserEventRooms();
  return allRooms.filter((room) => room.group.id === groupId);
}

/**
 * Get messages for an event room
 */
export async function getEventRoomMessages(
  eventRoomId: string,
  limit: number = 50,
  offset: number = 0
): Promise<EventRoomMessagesResult> {
  const { data, error } = await supabase.rpc("get_event_room_messages", {
    p_event_room_id: eventRoomId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("Error fetching event room messages:", error);
    throw error;
  }

  return data;
}

/**
 * Send a message to an event room
 */
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
    console.error("Error sending message:", error);
    throw error;
  }

  // Transform the response to match EventMessage interface
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
      display_name: profiles.username || profiles.first_name || "Unknown",
      avatar_url: profiles.avatar_url,
    },
  };
}

/**
 * Get event room details by ID
 */
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
    console.error("Error fetching event room:", error);
    throw error;
  }

  return data;
}

/**
 * Get participants of an event room
 */
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
    console.error("Error fetching participants:", error);
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
        display_name: profile.username || profile.first_name || "Unknown",
        avatar_url: profile.avatar_url,
        joined_at: item.joined_at,
      };
    }) || []
  );
}

/**
 * Check if an event room is expired
 */
export function isEventRoomExpired(eventRoom: EventRoom): boolean {
  const now = new Date();

  if (eventRoom.ends_at) {
    // Expires 12 hours after ends_at
    const expiryTime = new Date(eventRoom.ends_at);
    expiryTime.setHours(expiryTime.getHours() + 12);
    return now >= expiryTime;
  } else {
    // Expires 72 hours after created_at
    const expiryTime = new Date(eventRoom.created_at);
    expiryTime.setHours(expiryTime.getHours() + 72);
    return now >= expiryTime;
  }
}

/**
 * Calculate remaining time for an event room
 */
export function getEventRoomTimeRemaining(eventRoom: EventRoom): {
  expired: boolean;
  hours: number;
  minutes: number;
} {
  const now = new Date();
  let expiryTime: Date;

  if (eventRoom.ends_at) {
    expiryTime = new Date(eventRoom.ends_at);
    expiryTime.setHours(expiryTime.getHours() + 12);
  } else {
    expiryTime = new Date(eventRoom.created_at);
    expiryTime.setHours(expiryTime.getHours() + 72);
  }

  const diffMs = expiryTime.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { expired: true, hours: 0, minutes: 0 };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return { expired: false, hours, minutes };
}

/**
 * Subscribe to new messages in an event room
 */
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
        // Fetch the full message with user profile
        const { data } = await supabase
          .from("event_messages")
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
            user: {
              id: profiles.id,
              display_name: profiles.username || profiles.first_name || "Unknown",
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
