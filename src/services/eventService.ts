import { supabase } from "../supabase";

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

export interface EventWithDetails {
  event_room: EventRoom;
  group_name: string;
  participant_count: number;
  last_message: {
    content: string;
    created_at: string;
    sender_name: string;
  } | null;
  unread_count: number;
  is_expired: boolean;
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
  is_system: boolean;
}

/**
 * Get all active events for the current user
 */
export async function getUserEvents(): Promise<EventWithDetails[]> {
  const { data, error } = await supabase.rpc("get_user_events_with_details");

  if (error) {
    console.error("Error fetching user events:", error);
    throw new Error(error.message || "Failed to fetch events");
  }

  return data || [];
}

/**
 * Get event details by ID
 */
export async function getEventDetails(eventRoomId: string): Promise<EventWithDetails | null> {
  const { data, error } = await supabase.rpc("get_event_details", {
    p_event_room_id: eventRoomId,
  });

  if (error) {
    console.error("Error fetching event details:", error);
    throw new Error(error.message || "Failed to fetch event details");
  }

  return data;
}

/**
 * Get messages for an event room
 */
export async function getEventMessages(
  eventRoomId: string,
  limit: number = 50,
  offset: number = 0
): Promise<EventMessage[]> {
  const { data, error } = await supabase.rpc("get_event_room_messages_v2", {
    p_event_room_id: eventRoomId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("Error fetching event messages:", error);
    throw new Error(error.message || "Failed to fetch messages");
  }

  return data?.messages || [];
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
      content: content.trim(),
    })
    .select(`
      id,
      content,
      created_at,
      user_id
    `)
    .single();

  if (error) {
    console.error("Error sending message:", error);
    throw new Error(error.message || "Failed to send message");
  }

  // Fetch user profile for the response
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, first_name, avatar_url")
    .eq("id", user.user.id)
    .single();

  return {
    id: data.id,
    content: data.content,
    created_at: data.created_at,
    user: {
      id: profile?.id || user.user.id,
      display_name: profile?.username || profile?.first_name || "You",
      avatar_url: profile?.avatar_url || null,
    },
    is_system: false,
  };
}

/**
 * Get event participants
 */
export async function getEventParticipants(eventRoomId: string): Promise<Array<{
  id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
}>> {
  const { data, error } = await supabase
    .from("event_room_participants")
    .select(`
      joined_at,
      profiles:user_id (
        id,
        username,
        first_name,
        avatar_url
      )
    `)
    .eq("event_room_id", eventRoomId);

  if (error) {
    console.error("Error fetching participants:", error);
    throw new Error(error.message || "Failed to fetch participants");
  }

  return (data || []).map((p: any) => ({
    id: p.profiles.id,
    display_name: p.profiles.username || p.profiles.first_name || "Unknown",
    avatar_url: p.profiles.avatar_url,
    joined_at: p.joined_at,
  }));
}

/**
 * Subscribe to new messages in an event room
 */
export function subscribeToEventMessages(
  eventRoomId: string,
  onMessage: (message: EventMessage) => void
) {
  const channel = supabase
    .channel(`event_messages:${eventRoomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "event_messages",
        filter: `event_room_id=eq.${eventRoomId}`,
      },
      async (payload) => {
        // Fetch the user profile for this message
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, first_name, avatar_url")
          .eq("id", payload.new.user_id)
          .single();

        onMessage({
          id: payload.new.id,
          content: payload.new.content,
          created_at: payload.new.created_at,
          user: {
            id: profile?.id || payload.new.user_id,
            display_name: profile?.username || profile?.first_name || "Unknown",
            avatar_url: profile?.avatar_url || null,
          },
          is_system: false,
        });
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Subscribe to user's event list changes
 */
export function subscribeToUserEvents(onUpdate: () => void) {
  // Use unique channel name to avoid "subscribe multiple times" error
  const channelName = `user_events_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_room_participants",
      },
      onUpdate
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "event_rooms",
      },
      onUpdate
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Check if user has any active events
 */
export async function hasActiveEvents(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_user_event_count");

  if (error) {
    console.error("Error checking active events:", error);
    return false;
  }

  return (data || 0) > 0;
}
