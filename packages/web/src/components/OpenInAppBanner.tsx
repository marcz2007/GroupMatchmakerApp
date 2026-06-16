"use client";

import { useEffect, useState } from "react";
import styles from "./OpenInAppBanner.module.css";

// Non-blocking "open in the Grapple app" prompt for mobile web visitors.
//
// The website is always the fallback: if the app isn't installed, tapping Open
// simply does nothing and the user stays on the page to sync/RSVP. We never
// redirect to an app store (no forced install).
//
// Note: on Android with verified App Links — and on iOS once Universal Links
// are enabled (needs the Apple Developer account) — the OS opens the app
// directly from the link and this banner is never seen. It's the fallback for
// every other case (iOS today, app-not-installed, unverified links).
export default function OpenInAppBanner({ deepLink }: { deepLink: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    if (!isMobile) return;
    if (sessionStorage.getItem("grapple_open_in_app_dismissed") === "1") return;
    setShow(true);
  }, []);

  if (!show) return null;

  const openApp = () => {
    // User-gesture navigation to the custom scheme. If a handler (the app)
    // exists it takes over; otherwise the browser stays on this page.
    window.location.href = deepLink;
  };

  const dismiss = () => {
    sessionStorage.setItem("grapple_open_in_app_dismissed", "1");
    setShow(false);
  };

  return (
    <div className={styles.banner}>
      <span className={styles.icon} aria-hidden>
        📱
      </span>
      <span className={styles.text}>Open in the Grapple app</span>
      <button type="button" className={styles.openBtn} onClick={openApp}>
        Open
      </button>
      <button
        type="button"
        className={styles.dismissBtn}
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
