import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys, hasActiveEvents, subscribeToUserEvents, getUserEventRooms } from "@grapple/shared";
import { useAuth } from "../../contexts/AuthContext";

/** Replaces EventsContext — tracks whether user has active events (for tab badge). */
export function useHasActiveEvents() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserEvents(() => {
      qc.invalidateQueries({ queryKey: queryKeys.hasActiveEvents() });
      qc.invalidateQueries({ queryKey: queryKeys.userEvents() });
    });
    return unsub;
  }, [user, qc]);

  return useQuery({
    queryKey: queryKeys.hasActiveEvents(),
    queryFn: hasActiveEvents,
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export function useUserEventRooms() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.userEvents(),
    queryFn: getUserEventRooms,
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}
