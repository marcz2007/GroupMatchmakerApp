import { supabase } from "./supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface PublicEventData {
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  group_name: string | null;
  creator_name: string | null;
  participant_count: number;
  participant_names: string[];
  is_expired: boolean;
}

export async function fetchPublicEvent(
  eventRoomId: string
): Promise<PublicEventData> {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/get-public-event?event_room_id=${eventRoomId}`
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load event");
  }

  return res.json();
}

export interface RsvpResult {
  success: boolean;
  event_title: string;
  message: string;
}

export async function rsvpToEvent(eventRoomId: string): Promise<RsvpResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/web-rsvp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ event_room_id: eventRoomId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to RSVP");
  }

  return res.json();
}
