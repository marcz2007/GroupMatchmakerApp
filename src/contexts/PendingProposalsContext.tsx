import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  PendingProposal,
  getPendingProposals,
  subscribeToPendingProposals,
} from "../services/proposalService";
import { useAuth } from "./AuthContext";

interface PendingProposalsContextType {
  pendingProposals: PendingProposal[];
  currentProposal: PendingProposal | null;
  dismissCurrent: () => void;
  refreshPending: () => Promise<void>;
  lockCurrent: () => void;
}

const PendingProposalsContext = createContext<PendingProposalsContextType>({
  pendingProposals: [],
  currentProposal: null,
  dismissCurrent: () => {},
  refreshPending: async () => {},
  lockCurrent: () => {},
});

export const usePendingProposals = () => useContext(PendingProposalsContext);

export const PendingProposalsProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { user } = useAuth();
  const [pendingProposals, setPendingProposals] = useState<PendingProposal[]>(
    []
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // When locked, currentProposal stays fixed even if the list changes
  const [lockedProposal, setLockedProposal] = useState<PendingProposal | null>(null);

  const refreshPending = useCallback(async () => {
    if (!user) {
      setPendingProposals([]);
      return;
    }

    try {
      const proposals = await getPendingProposals();
      setPendingProposals(proposals);
    } catch (error) {
      console.error("Error refreshing pending proposals:", error);
    }
  }, [user]);

  const nextProposal =
    pendingProposals.find((p) => !dismissedIds.has(p.proposal.id)) ?? null;

  // Lock the current proposal so it doesn't change during celebration
  const lockCurrent = useCallback(() => {
    if (nextProposal) {
      setLockedProposal(nextProposal);
    }
  }, [nextProposal]);

  const dismissCurrent = useCallback(() => {
    if (lockedProposal) {
      setDismissedIds((prev) => new Set(prev).add(lockedProposal.proposal.id));
      setLockedProposal(null);
    } else if (nextProposal) {
      setDismissedIds((prev) => new Set(prev).add(nextProposal.proposal.id));
    }
  }, [lockedProposal, nextProposal]);

  useEffect(() => {
    if (user) {
      refreshPending();
      const unsubscribe = subscribeToPendingProposals(() => {
        refreshPending();
      });
      return () => {
        unsubscribe();
      };
    } else {
      setPendingProposals([]);
      setDismissedIds(new Set());
      setLockedProposal(null);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // If locked, show the locked proposal; otherwise show the next undismissed one
  const currentProposal = lockedProposal ?? nextProposal;

  return (
    <PendingProposalsContext.Provider
      value={{
        pendingProposals,
        currentProposal,
        dismissCurrent,
        refreshPending,
        lockCurrent,
      }}
    >
      {children}
    </PendingProposalsContext.Provider>
  );
};
