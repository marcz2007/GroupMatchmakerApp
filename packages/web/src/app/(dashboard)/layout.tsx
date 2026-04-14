"use client";

import React from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import NotificationsBell from "@/components/NotificationsBell";
import styles from "./dashboard.module.css";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className={styles.layout}>
        <Sidebar />
        <div className={styles.contentColumn}>
          <div className={styles.topBar}>
            <NotificationsBell />
          </div>
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
