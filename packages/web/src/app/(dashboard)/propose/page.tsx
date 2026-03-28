"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, getUserGroups, getPendingProposals } from "@grapple/shared";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./propose.module.css";

export default function ProposePage() {
  const { user } = useAuth();

  const { data: pendingProposals = [], isLoading } = useQuery({
    queryKey: queryKeys.pendingProposals(),
    queryFn: getPendingProposals,
    enabled: !!user,
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Proposals</h1>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Pending Votes</h2>

        {isLoading ? (
          <div className={styles.loading}>Loading...</div>
        ) : pendingProposals.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No pending proposals</p>
            <p className={styles.emptySubtext}>
              You're all caught up! New proposals from your groups will appear here.
            </p>
          </div>
        ) : (
          <div className={styles.list}>
            {pendingProposals.map(({ proposal, vote_counts, group_name }) => (
              <div key={proposal.id} className={styles.card}>
                <span className={styles.groupTag}>{group_name}</span>
                <h3 className={styles.cardTitle}>{proposal.title}</h3>
                {proposal.description && (
                  <p className={styles.cardDescription}>{proposal.description}</p>
                )}
                <div className={styles.voteInfo}>
                  <span>
                    {vote_counts.total_votes} vote{vote_counts.total_votes !== 1 ? "s" : ""} so far
                  </span>
                  {proposal.starts_at && (
                    <span>
                      {new Date(proposal.starts_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className={styles.hint}>
                  Vote on this proposal in the mobile app
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
