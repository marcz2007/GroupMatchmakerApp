import { supabase } from "../supabase";

export type VoteValue = "YES" | "MAYBE" | "NO";

export interface Proposal {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  vote_window_ends_at: string;
  threshold: number;
  status: "open" | "closed" | "triggered";
  is_anonymous: boolean;
  estimated_cost: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoteCounts {
  yes_count: number;
  maybe_count: number;
  no_count: number;
  total_votes: number;
}

export interface ProposalWithVotes {
  proposal: Proposal;
  vote_counts: VoteCounts;
  my_vote: VoteValue | null;
  created_by_profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export interface PendingProposal extends ProposalWithVotes {
  group_name: string;
}

export interface CastVoteResult {
  success: boolean;
  vote: VoteValue;
  yes_count: number;
  maybe_count: number;
  threshold_met: boolean;
  event_room_id: string | null;
}

export interface CreateProposalInput {
  group_id: string;
  title: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
  vote_window_ends_at: string;
  threshold?: number;
  is_anonymous?: boolean;
  estimated_cost?: string | null;
}

/**
 * Get all proposals for a group with vote counts and user's vote
 */
export async function getGroupProposals(
  groupId: string
): Promise<ProposalWithVotes[]> {
  const { data, error } = await supabase.rpc("get_group_proposals", {
    p_group_id: groupId,
  });

  if (error) {
    console.error("Error fetching group proposals:", error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single proposal with vote counts and user's vote
 */
export async function getProposalWithVotes(
  proposalId: string
): Promise<ProposalWithVotes | null> {
  const { data, error } = await supabase.rpc("get_proposal_with_votes", {
    p_proposal_id: proposalId,
  });

  if (error) {
    console.error("Error fetching proposal:", error);
    throw error;
  }

  return data;
}

/**
 * Create a new proposal using SECURITY DEFINER function
 * This bypasses RLS while validating group membership server-side
 */
export async function createProposal(
  input: CreateProposalInput
): Promise<Proposal> {
  const { data, error } = await supabase.rpc("create_proposal_rpc", {
    p_group_id: input.group_id,
    p_title: input.title,
    p_description: input.description || null,
    p_starts_at: input.starts_at || null,
    p_ends_at: input.ends_at || null,
    p_vote_window_ends_at: input.vote_window_ends_at,
    p_threshold: input.threshold || 3,
    p_is_anonymous: input.is_anonymous ?? true,
    p_estimated_cost: input.estimated_cost || null,
  });

  if (error) {
    console.error("Error creating proposal:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message || "Failed to create proposal");
  }

  // Fire-and-forget: classify the proposal in the background
  classifyProposalAsync(data, input);

  return data;
}

/**
 * Classify a proposal via AI edge function (fire-and-forget).
 * Failures are silently logged — classification is non-critical.
 */
async function classifyProposalAsync(
  proposal: Proposal,
  input: CreateProposalInput
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("classify-proposal", {
      body: {
        proposal_id: proposal.id,
        title: input.title,
        description: input.description || null,
        estimated_cost: input.estimated_cost || null,
        starts_at: input.starts_at || null,
      },
    });
    if (error) {
      console.warn("Proposal classification failed:", error);
    }
  } catch (err) {
    console.warn("Proposal classification error:", err);
  }
}

/**
 * Update an existing proposal (only creator can update)
 */
export async function updateProposal(
  proposalId: string,
  updates: Partial<
    Pick<
      Proposal,
      "title" | "description" | "starts_at" | "ends_at" | "vote_window_ends_at"
    >
  >
): Promise<Proposal> {
  const { data, error } = await supabase
    .from("proposals")
    .update(updates)
    .eq("id", proposalId)
    .select()
    .single();

  if (error) {
    console.error("Error updating proposal:", error);
    throw error;
  }

  return data;
}

/**
 * Delete a proposal (only creator can delete)
 */
export async function deleteProposal(proposalId: string): Promise<void> {
  const { error } = await supabase
    .from("proposals")
    .delete()
    .eq("id", proposalId);

  if (error) {
    console.error("Error deleting proposal:", error);
    throw error;
  }
}

/**
 * Cast or update a vote on a proposal
 */
export async function castVote(
  proposalId: string,
  vote: VoteValue
): Promise<CastVoteResult> {
  const { data, error } = await supabase.rpc("cast_vote", {
    p_proposal_id: proposalId,
    p_vote: vote,
  });

  if (error) {
    console.error("Error casting vote:", error);
    throw error;
  }

  return data;
}

/**
 * Remove user's vote from a proposal
 */
export async function removeVote(proposalId: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error("Not authenticated");
  }

  const { error } = await supabase
    .from("votes")
    .delete()
    .eq("proposal_id", proposalId)
    .eq("user_id", user.user.id);

  if (error) {
    console.error("Error removing vote:", error);
    throw error;
  }
}

/**
 * Subscribe to proposal updates for a group
 */
export function subscribeToGroupProposals(
  groupId: string,
  onUpdate: () => void
) {
  const channel = supabase
    .channel(`proposals:group_id=eq.${groupId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "proposals",
        filter: `group_id=eq.${groupId}`,
      },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Get all pending (unvoted) proposals for the current user across all groups
 */
export async function getPendingProposals(): Promise<PendingProposal[]> {
  const { data, error } = await supabase.rpc("get_pending_proposals_for_user");

  if (error) {
    console.error("Error fetching pending proposals:", error);
    throw error;
  }

  return data || [];
}

/**
 * Subscribe to new proposals and votes across all tables (for pending proposals refresh)
 */
export function subscribeToPendingProposals(onUpdate: () => void) {
  const channel = supabase
    .channel("pending-proposals-global")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "proposals" },
      () => onUpdate()
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "votes" },
      () => onUpdate()
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "votes" },
      () => onUpdate()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to vote updates for a proposal
 */
export function subscribeToProposalVotes(
  proposalId: string,
  onUpdate: () => void
) {
  const channel = supabase
    .channel(`votes:proposal_id=eq.${proposalId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "votes",
        filter: `proposal_id=eq.${proposalId}`,
      },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
