"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayName } from "@grapple/shared";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  { href: "/events", label: "Events", icon: "📅" },
  { href: "/groups", label: "Groups", icon: "👥" },
  { href: "/propose", label: "Propose", icon: "🚀" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>
        <h1 className={styles.logoText}>Grapple</h1>
      </div>

      <div className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${
              pathname.startsWith(item.href) ? styles.navItemActive : ""
            }`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className={styles.footer}>
        {profile && (
          <div className={styles.userInfo}>
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
            <span className={styles.username}>
              {getDisplayName(profile.username, profile.first_name)}
            </span>
          </div>
        )}
        <button onClick={signOut} className={styles.signOutButton}>
          Sign Out
        </button>
      </div>
    </nav>
  );
}
