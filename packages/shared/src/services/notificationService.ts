import { supabase } from "../supabase";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  event_room_id: string | null;
  group_id: string | null;
  title: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

export async function getNotifications(limit = 50): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[NotificationService] getNotifications failed:", error);
    throw error;
  }
  return (data || []) as Notification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) {
    console.error("[NotificationService] getUnreadNotificationCount failed:", error);
    throw error;
  }
  return (data as number) || 0;
}

export async function markNotificationsRead(
  ids?: string[]
): Promise<number> {
  const { data, error } = await supabase.rpc("mark_notifications_read", {
    p_notification_ids: ids ?? null,
  });
  if (error) {
    console.error("[NotificationService] markNotificationsRead failed:", error);
    throw error;
  }
  return (data as number) || 0;
}

export function subscribeToNotifications(
  userId: string,
  onInsert: (notification: Notification) => void
) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onInsert(payload.new as Notification);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
