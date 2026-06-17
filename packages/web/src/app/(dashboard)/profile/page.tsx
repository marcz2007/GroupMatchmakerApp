"use client";

import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getDisplayName } from "@grapple/shared";
import styles from "./profile.module.css";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d0d0d8",
  fontSize: 15,
  marginTop: 4,
};

export default function ProfilePage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!profile) {
    return <div className={styles.loading}>Loading profile...</div>;
  }

  const startEdit = () => {
    setFirstName(profile.first_name || "");
    setLastName(profile.last_name || "");
    setUsername(profile.username || "");
    setError("");
    setEditing(true);
  };

  const save = async () => {
    setError("");
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          username: username.trim() || null,
        })
        .eq("id", profile.id);

      if (updateError) {
        setError(
          /duplicate|unique/i.test(updateError.message)
            ? "That username is already taken."
            : updateError.message
        );
      } else {
        await refreshProfile();
        setEditing(false);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className={styles.title}>Profile</h1>

      <div className={styles.card}>
        <div className={styles.avatarSection}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className={styles.avatar} />
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

        {editing ? (
          <>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>First name</label>
              <input
                style={inputStyle}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Last name</label>
              <input
                style={inputStyle}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name (optional)"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Username</label>
              <input
                style={inputStyle}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                onClick={save}
                disabled={saving}
                className={styles.signOutButton}
                style={{ background: "#5762b7", color: "#fff" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className={styles.signOutButton}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
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

            <button
              onClick={startEdit}
              className={styles.signOutButton}
              style={{ background: "#5762b7", color: "#fff", marginTop: 8 }}
            >
              Edit profile
            </button>

            <p className={styles.hint}>
              Connect Spotify and manage advanced settings in the mobile app.
            </p>
          </>
        )}
      </div>

      <button onClick={signOut} className={styles.signOutButton}>
        Sign Out
      </button>
    </div>
  );
}
