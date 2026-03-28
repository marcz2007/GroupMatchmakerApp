import { supabase } from "../supabase";

export interface SchedulingSlot {
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
}

export interface CandidateTime {
  id: string;
  candidate_start: string;
  candidate_end: string;
  available_count: number;
  conflict_count: number;
  rank: number | null;
}

export interface SyncedUser {
  user_id: string;
  display_name: string;
  calendar_provider: string;
  synced_at: string;
}

export interface SmartSchedulingStatus {
  scheduling_mode: "fixed" | "smart";
  scheduling_status: "none" | "collecting" | "scheduled" | "failed";
  date_range_start: string | null;
  date_range_end: string | null;
  scheduling_deadline: string | null;
  selected_slot_id: string | null;
  total_participants: number;
  synced_count: number;
  synced_users: SyncedUser[];
  user_has_synced: boolean;
  slots: {
    id: string;
    day_of_week: number;
    start_time: string;
    duration_minutes: number;
  }[];
  selected_time: CandidateTime | null;
  alternative_times: CandidateTime[];
}

export async function createSmartEvent(params: {
  title: string;
  description?: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  schedulingDeadline?: string;
  slots: SchedulingSlot[];
}) {
  const { data, error } = await supabase.rpc("create_smart_event", {
    p_title: params.title,
    p_description: params.description || null,
    p_date_range_start: params.dateRangeStart,
    p_date_range_end: params.dateRangeEnd,
    p_scheduling_deadline: params.schedulingDeadline || null,
    p_slots: params.slots,
  });

  if (error) throw error;
  return data as {
    event_room_id: string;
    title: string;
    scheduling_mode: string;
    scheduling_status: string;
    scheduling_deadline: string;
    candidate_count: number;
  };
}

export async function getSmartSchedulingStatus(
  eventRoomId: string
): Promise<SmartSchedulingStatus> {
  const { data, error } = await supabase.rpc("get_smart_scheduling_status", {
    p_event_room_id: eventRoomId,
  });

  if (error) throw error;
  return data as SmartSchedulingStatus;
}

export async function syncCalendarForEvent(
  eventRoomId: string,
  calendarProvider: string = "google"
) {
  const { data, error } = await supabase.rpc("sync_calendar_for_event", {
    p_event_room_id: eventRoomId,
    p_calendar_provider: calendarProvider,
  });

  if (error) throw error;
  return data as { success: boolean };
}

export async function requestReschedule(
  eventRoomId: string,
  candidateId: string
) {
  const { data, error } = await supabase.rpc("request_reschedule", {
    p_event_room_id: eventRoomId,
    p_candidate_id: candidateId,
  });

  if (error) throw error;
  return data as {
    success: boolean;
    new_start: string;
    new_end: string;
  };
}

export async function refreshCalendarAndSync(
  eventRoomId: string,
  userId: string,
  calendarProvider: string = "google"
) {
  if (calendarProvider === "google") {
    const { error: refreshError } = await supabase.functions.invoke(
      "refresh-calendar-busy-times",
      { body: { userId } }
    );

    if (refreshError) {
      console.error("Failed to refresh calendar:", refreshError);
      throw new Error("Failed to refresh calendar data");
    }
  }

  return syncCalendarForEvent(eventRoomId, calendarProvider);
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[dayOfWeek] || "Unknown";
}

export function formatTimeSlot(slot: SchedulingSlot): string {
  const day = getDayName(slot.day_of_week);
  const [hours, minutes] = slot.start_time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  const displayMinutes = minutes > 0 ? `:${String(minutes).padStart(2, "0")}` : "";
  return `${day} ${displayHour}${displayMinutes} ${period}`;
}
