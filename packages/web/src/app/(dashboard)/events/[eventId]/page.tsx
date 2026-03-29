"use client";

import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  getEventRoomById,
  getEventRoomMessages,
  getEventRoomParticipants,
  sendEventMessage as sendMessage,
  subscribeToEventRoomMessages,
  EventRoomMessagesResult,
  formatDate,
} from "@grapple/shared";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import styles from "./eventDetail.module.css";

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: eventRoom } = useQuery({
    queryKey: queryKeys.eventRoomDetail(eventId),
    queryFn: () => getEventRoomById(eventId),
    enabled: !!eventId,
  });

  const { data: messagesResult } = useQuery({
    queryKey: queryKeys.eventRoomMessages(eventId),
    queryFn: () => getEventRoomMessages(eventId),
    enabled: !!eventId,
  });

  const { data: participants = [] } = useQuery({
    queryKey: queryKeys.eventRoomParticipants(eventId),
    queryFn: () => getEventRoomParticipants(eventId),
    enabled: !!eventId,
  });

  const messages = messagesResult?.messages || [];

  // Subscribe to realtime messages
  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = subscribeToEventRoomMessages(eventId, (newMessage) => {
      qc.setQueryData<EventRoomMessagesResult>(
        queryKeys.eventRoomMessages(eventId),
        (old) => {
          if (!old) return old;
          if (old.messages.some((m) => m.id === newMessage.id)) return old;
          return { ...old, messages: [...old.messages, newMessage] };
        }
      );
    });
    return unsubscribe;
  }, [eventId, qc]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (content: string) => sendMessage(eventId, content),
    onSuccess: (sent) => {
      qc.setQueryData<EventRoomMessagesResult>(
        queryKeys.eventRoomMessages(eventId),
        (old) => {
          if (!old) return old;
          if (old.messages.some((m) => m.id === sent.id)) return old;
          return { ...old, messages: [...old.messages, sent] };
        }
      );
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = messageInput.trim();
    if (!trimmed) return;
    setMessageInput("");
    sendMutation.mutate(trimmed);
  };

  return (
    <div className={styles.container}>
      <div className={styles.chatArea}>
        <div className={styles.chatHeader}>
          <Link href="/events" className={styles.back}>←</Link>
          <div>
            <h2 className={styles.title}>{eventRoom?.title || "Event"}</h2>
            <span className={styles.participantCount}>
              {participants.length} participant{participants.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className={styles.messages}>
          {messages.map((msg) => {
            const isOwn = msg.user.id === user?.id;
            return (
              <div
                key={msg.id}
                className={`${styles.message} ${
                  msg.is_system_message
                    ? styles.systemMessage
                    : isOwn
                    ? styles.ownMessage
                    : styles.otherMessage
                }`}
              >
                {!msg.is_system_message && !isOwn && (
                  <span className={styles.senderName}>
                    {msg.user.display_name}
                  </span>
                )}
                <div className={styles.messageBubble}>
                  {msg.content}
                </div>
                <span className={styles.messageTime}>
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className={styles.inputBar}>
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            className={styles.input}
          />
          <button
            type="submit"
            disabled={!messageInput.trim() || sendMutation.isPending}
            className={styles.sendButton}
          >
            Send
          </button>
        </form>
      </div>

      <aside className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Details</h3>
        {eventRoom?.starts_at && (
          <div className={styles.detail}>
            <span className={styles.detailLabel}>When</span>
            <span className={styles.detailValue}>
              {formatDate(eventRoom.starts_at)}
            </span>
          </div>
        )}
        {eventRoom?.description && (
          <div className={styles.detail}>
            <span className={styles.detailLabel}>About</span>
            <span className={styles.detailValue}>{eventRoom.description}</span>
          </div>
        )}

        <h3 className={styles.sidebarTitle} style={{ marginTop: 24 }}>
          Participants
        </h3>
        <div className={styles.participantList}>
          {participants.map((p) => (
            <div key={p.id} className={styles.participant}>
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className={styles.participantAvatar} />
              ) : (
                <div className={styles.participantAvatarPlaceholder}>
                  {p.display_name[0]?.toUpperCase() || "?"}
                </div>
              )}
              <span className={styles.participantName}>{p.display_name}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
