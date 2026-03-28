"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, getUserEventRooms } from "@grapple/shared";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import styles from "./events.module.css";

export default function EventsPage() {
  const { user } = useAuth();

  const { data: eventRooms = [], isLoading } = useQuery({
    queryKey: queryKeys.userEvents(),
    queryFn: getUserEventRooms,
    enabled: !!user,
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Events</h1>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading events...</div>
      ) : eventRooms.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No events yet</p>
          <p className={styles.emptySubtext}>
            Events are created when proposals reach their vote threshold.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {eventRooms.map(({ event_room, group, participant_count, is_expired }) => (
            <Link
              key={event_room.id}
              href={`/events/${event_room.id}`}
              className={`${styles.card} ${is_expired ? styles.cardExpired : ""}`}
            >
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{event_room.title}</h3>
                {is_expired ? (
                  <span className={styles.badge + " " + styles.badgeExpired}>Expired</span>
                ) : (
                  <span className={styles.badge + " " + styles.badgeActive}>Active</span>
                )}
              </div>

              {group && (
                <span className={styles.groupName}>{group.name}</span>
              )}

              <div className={styles.meta}>
                <span>{participant_count} participant{participant_count !== 1 ? "s" : ""}</span>
                {event_room.starts_at && (
                  <span>
                    {new Date(event_room.starts_at).toLocaleDateString()} at{" "}
                    {new Date(event_room.starts_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>

              {event_room.description && (
                <p className={styles.cardDescription}>{event_room.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
