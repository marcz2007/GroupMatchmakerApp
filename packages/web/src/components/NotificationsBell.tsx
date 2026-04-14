"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsRead,
  subscribeToNotifications,
  Notification,
} from "@grapple/shared";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./NotificationsBell.module.css";

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: queryKeys.notifications(),
    queryFn: () => getNotifications(20),
    enabled: !!user,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.notificationUnreadCount(),
    queryFn: getUnreadNotificationCount,
    enabled: !!user,
  });

  // Realtime: refetch list + count when a new notification arrives
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToNotifications(user.id, () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications() });
      qc.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount() });
    });
    return unsubscribe;
  }, [user?.id, qc]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const markAllRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications() });
      qc.invalidateQueries({ queryKey: queryKeys.notificationUnreadCount() });
    },
  });

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    // Mark everything as read when opening
    if (next && unreadCount > 0) {
      markAllRead.mutate();
    }
  };

  const renderItem = (n: Notification) => {
    const href = n.event_room_id ? `/events/${n.event_room_id}` : "#";
    const body = (
      <>
        {n.title && <div className={styles.itemTitle}>{n.title}</div>}
        <div className={styles.itemMessage}>{n.message}</div>
        <div className={styles.itemTime}>{formatRelative(n.created_at)}</div>
      </>
    );
    return (
      <Link
        key={n.id}
        href={href}
        className={`${styles.item} ${n.read ? "" : styles.itemUnread}`}
        onClick={() => setOpen(false)}
      >
        {body}
      </Link>
    );
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.bellButton}
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <span className={styles.bellIcon}>🔔</span>
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span>Notifications</span>
          </div>
          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>No notifications yet</div>
            ) : (
              notifications.map(renderItem)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
