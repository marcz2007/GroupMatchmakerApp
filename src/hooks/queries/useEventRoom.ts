import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../../queryKeys";
import {
  getEventRoomById,
  getEventRoomMessages,
  getEventRoomParticipants,
  sendEventMessage,
  subscribeToEventRoomMessages,
  EventMessage,
  EventRoomMessagesResult,
} from "../../services/eventRoomService";

export function useEventRoom(eventRoomId: string) {
  return useQuery({
    queryKey: queryKeys.eventRoomDetail(eventRoomId),
    queryFn: () => getEventRoomById(eventRoomId),
    staleTime: 60 * 1000,
  });
}

export function useEventRoomMessages(eventRoomId: string) {
  return useQuery({
    queryKey: queryKeys.eventRoomMessages(eventRoomId),
    queryFn: () => getEventRoomMessages(eventRoomId),
    staleTime: 10 * 1000,
  });
}

export function useEventRoomParticipants(eventRoomId: string) {
  return useQuery({
    queryKey: queryKeys.eventRoomParticipants(eventRoomId),
    queryFn: () => getEventRoomParticipants(eventRoomId),
    staleTime: 60 * 1000,
  });
}

/** Subscribes to realtime messages and writes them into the React Query cache. */
export function useEventRoomRealtimeMessages(eventRoomId: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToEventRoomMessages(
      eventRoomId,
      (newMessage) => {
        qc.setQueryData<EventRoomMessagesResult>(
          queryKeys.eventRoomMessages(eventRoomId),
          (old) => {
            if (!old) return old;
            if (old.messages.some((m) => m.id === newMessage.id)) return old;
            return { ...old, messages: [...old.messages, newMessage] };
          }
        );
      }
    );
    return unsubscribe;
  }, [eventRoomId, qc]);
}

export function useSendEventMessage(eventRoomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => sendEventMessage(eventRoomId, content),
    onSuccess: (sent) => {
      // Replace any optimistic message or append the real one
      qc.setQueryData<EventRoomMessagesResult>(
        queryKeys.eventRoomMessages(eventRoomId),
        (old) => {
          if (!old) return old;
          const exists = old.messages.some((m) => m.id === sent.id);
          if (exists) return old;
          // Remove optimistic messages (id starts with "optimistic-") and add real one
          const cleaned = old.messages.filter(
            (m) => !m.id.startsWith("optimistic-")
          );
          return { ...old, messages: [...cleaned, sent] };
        }
      );
    },
  });
}
