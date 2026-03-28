"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { queryKeys, getUserGroups } from "@grapple/shared";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import styles from "./groups.module.css";

export default function GroupsPage() {
  const { user } = useAuth();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: queryKeys.userGroups(user?.id || ""),
    queryFn: () => getUserGroups(user!.id),
    enabled: !!user?.id,
  });

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Groups</h1>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No groups yet</p>
          <p className={styles.emptySubtext}>
            Create a group in the mobile app to get started.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {groups.map((group) => (
            <Link
              key={group.id}
              href={`/groups/${group.id}`}
              className={styles.card}
            >
              <h3 className={styles.cardTitle}>{group.name}</h3>
              <p className={styles.cardDescription}>
                {group.description || "No description"}
              </p>
              <span className={styles.cardDate}>
                Created {new Date(group.created_at).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
