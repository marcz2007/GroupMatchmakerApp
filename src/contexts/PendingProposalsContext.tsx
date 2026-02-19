import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
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
}

const PendingProposalsContext = createContext<PendingProposalsContextType>({
  pendingProposals: [],
  currentProposal: null,
  dismissCurrent: () => {},
  refreshPending: async () => {},
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

  const dismissCurrent = useCallback(() => {
    const current = pendingProposals.find(
      (p) => !dismissedIds.has(p.proposal.id)
    );
    if (current) {
      setDismissedIds((prev) => new Set(prev).add(current.proposal.id));
    }
  }, [pendingProposals, dismissedIds]);

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
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentProposal =
    pendingProposals.find((p) => !dismissedIds.has(p.proposal.id)) ?? null;

  return (
    <PendingProposalsContext.Provider
      value={{
        pendingProposals,
        currentProposal,
        dismissCurrent,
        refreshPending,
      }}
    >
      {children}
    </PendingProposalsContext.Provider>
  );
};
