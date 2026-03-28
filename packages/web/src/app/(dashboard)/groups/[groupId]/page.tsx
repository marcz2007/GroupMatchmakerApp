"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, getGroupById, getGroupProposals } from "@grapple/shared";
import Link from "next/link";
import styles from "./groupDetail.module.css";

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();

  const { data: group, isLoading: groupLoading } = useQuery({
    queryKey: queryKeys.groupDetails(groupId),
    queryFn: () => getGroupById(groupId),
    enabled: !!groupId,
  });

  const { data: proposals = [], isLoading: proposalsLoading } = useQuery({
    queryKey: queryKeys.groupProposals(groupId),
    queryFn: () => getGroupProposals(groupId),
    enabled: !!groupId,
  });

  if (groupLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!group) {
    return <div className={styles.loading}>Group not found</div>;
  }

  return (
    <div>
      <Link href="/groups" className={styles.back}>
        ← Back to Groups
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{group.name}</h1>
        {group.description && (
          <p className={styles.description}>{group.description}</p>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Proposals</h2>

        {proposalsLoading ? (
          <div className={styles.loading}>Loading proposals...</div>
        ) : proposals.length === 0 ? (
          <p className={styles.emptyText}>No proposals yet</p>
        ) : (
          <div className={styles.proposalList}>
            {proposals.map(({ proposal, vote_counts, my_vote }) => (
              <div key={proposal.id} className={styles.proposalCard}>
                <div className={styles.proposalHeader}>
                  <h3 className={styles.proposalTitle}>{proposal.title}</h3>
                  <span
                    className={`${styles.status} ${
                      proposal.status === "open"
                        ? styles.statusOpen
                        : proposal.status === "triggered"
                        ? styles.statusTriggered
                        : styles.statusClosed
                    }`}
                  >
                    {proposal.status}
                  </span>
                </div>

                {proposal.description && (
                  <p className={styles.proposalDescription}>
                    {proposal.description}
                  </p>
                )}

                <div className={styles.voteBar}>
                  <span className={styles.voteYes}>
                    {vote_counts.yes_count} Yes
                  </span>
                  <span className={styles.voteMaybe}>
                    {vote_counts.maybe_count} Maybe
                  </span>
                  <span className={styles.voteNo}>
                    {vote_counts.no_count} No
                  </span>
                  {my_vote && (
                    <span className={styles.myVote}>You voted: {my_vote}</span>
                  )}
                </div>

                {proposal.starts_at && (
                  <span className={styles.proposalDate}>
                    {new Date(proposal.starts_at).toLocaleDateString()} at{" "}
                    {new Date(proposal.starts_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
