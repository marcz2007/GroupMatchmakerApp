import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { queryKeys } from "../../queryKeys";
import {
  PendingProposal,
  getPendingProposals,
  subscribeToPendingProposals,
} from "../../services/proposalService";
import { useAuth } from "../../contexts/AuthContext";

/** Replaces PendingProposalsContext — fetches pending proposals + realtime. */
export function usePendingProposalsQuery() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToPendingProposals(() => {
      qc.invalidateQueries({ queryKey: queryKeys.pendingProposals() });
    });
    return unsub;
  }, [user, qc]);

  return useQuery({
    queryKey: queryKeys.pendingProposals(),
    queryFn: getPendingProposals,
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

/** UI-state hook for the pending proposal modal (dismiss/lock logic). */
export function usePendingProposalModal() {
  const { data: proposals = [] } = usePendingProposalsQuery();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [lockedProposal, setLockedProposal] = useState<PendingProposal | null>(null);

  const nextProposal =
    proposals.find((p) => !dismissedIds.has(p.proposal.id)) ?? null;
  const currentProposal = lockedProposal ?? nextProposal;

  const lockCurrent = useCallback(() => {
    if (nextProposal) setLockedProposal(nextProposal);
  }, [nextProposal]);

  const dismissCurrent = useCallback(() => {
    const target = lockedProposal ?? nextProposal;
    if (target) {
      setDismissedIds((prev) => new Set(prev).add(target.proposal.id));
      setLockedProposal(null);
    }
  }, [lockedProposal, nextProposal]);

  const qc = useQueryClient();
  const refreshPending = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.pendingProposals() });
  }, [qc]);

  return { currentProposal, dismissCurrent, lockCurrent, refreshPending, pendingProposals: proposals };
}
