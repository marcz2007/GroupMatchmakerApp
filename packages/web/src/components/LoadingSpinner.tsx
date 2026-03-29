"use client";

import React from "react";

export default function LoadingSpinner() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "var(--color-background)",
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: "3px solid var(--color-surface-light)",
        borderTopColor: "var(--color-primary)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
