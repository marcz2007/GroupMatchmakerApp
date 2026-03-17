import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../queryKeys";
import {
  getPublicEventDetails,
  joinEventRoom,
  PublicEventDetails,
} from "../../services/eventRoomService";

export function usePublicEventDetails(
  eventRoomId: string,
  initialData?: PublicEventDetails
) {
  return useQuery({
    queryKey: queryKeys.publicEventDetails(eventRoomId),
    queryFn: () => getPublicEventDetails(eventRoomId),
    initialData,
    staleTime: 60 * 1000,
  });
}

export function useJoinEventRoom(eventRoomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => joinEventRoom(eventRoomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.publicEventDetails(eventRoomId) });
      qc.invalidateQueries({ queryKey: queryKeys.userEvents() });
      qc.invalidateQueries({ queryKey: queryKeys.hasActiveEvents() });
    },
  });
}
