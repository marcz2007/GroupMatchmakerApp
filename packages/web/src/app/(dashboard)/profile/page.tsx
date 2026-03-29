"use client";

import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayName } from "@grapple/shared";
import styles from "./profile.module.css";

export default function ProfilePage() {
  const { profile, signOut } = useAuth();

  if (!profile) {
    return <div className={styles.loading}>Loading profile...</div>;
  }

  return (
    <div>
      <h1 className={styles.title}>Profile</h1>

      <div className={styles.card}>
        <div className={styles.avatarSection}>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>
              {getDisplayName(profile.username, profile.first_name)[0].toUpperCase()}
            </div>
          )}
          <div>
            <h2 className={styles.name}>
              {profile.first_name
                ? `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ""}`
                : profile.username || "User"}
            </h2>
            {profile.username && (
              <span className={styles.username}>@{profile.username}</span>
            )}
          </div>
        </div>

        {profile.email && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <span className={styles.fieldValue}>{profile.email}</span>
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Calendar</span>
          <span className={styles.fieldValue}>
            {profile.calendar_connected
              ? `Connected (${profile.calendar_provider || "Google"})`
              : "Not connected"}
          </span>
        </div>

        <p className={styles.hint}>
          Edit your profile, connect Spotify, and manage settings in the mobile app.
        </p>
      </div>

      <button onClick={signOut} className={styles.signOutButton}>
        Sign Out
      </button>
    </div>
  );
}
