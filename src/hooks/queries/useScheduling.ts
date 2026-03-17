import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../queryKeys";
import { getSmartSchedulingStatus } from "../../services/schedulingService";

export function useSmartSchedulingStatus(eventRoomId: string) {
  return useQuery({
    queryKey: queryKeys.smartSchedulingStatus(eventRoomId),
    queryFn: () => getSmartSchedulingStatus(eventRoomId),
    staleTime: 15 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.scheduling_status === "collecting") return 30 * 1000;
      return false;
    },
  });
}
