"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import styles from "./login.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/groups");
    }
  }, [user, authLoading, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        router.push("/groups");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Magic-link sign-in: lets a returning user reclaim their existing account
  // (incl. guest accounts created via a web RSVP, which already carry an email)
  // on any device — no password needed. shouldCreateUser:false so this only
  // ever signs into an existing account, never creates a fresh one here.
  const handleMagicLink = async () => {
    setError("");
    if (!email) {
      setError("Enter your email above, then tap the link option.");
      return;
    }
    setMagicLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/groups`,
        },
      });
      // Show the same confirmation whether or not the account exists, so we
      // don't leak which emails are registered.
      if (error && !/not.*found|no.*user|signups?\s+not\s+allowed/i.test(error.message)) {
        setError(error.message);
      } else {
        setMagicSent(true);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setMagicLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Grapple</h1>
        <p className={styles.subtitle}>Sign in to your account</p>

        <form onSubmit={handleLogin} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="Your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={styles.button}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {magicSent ? (
          <p className={styles.subtitle} style={{ marginTop: 16 }}>
            Check your email — if an account exists for {email}, we&apos;ve sent
            a sign-in link.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading}
            className={styles.button}
            style={{ marginTop: 12, background: "transparent", border: "1px solid #5762b7", color: "#5762b7" }}
          >
            {magicLoading ? "Sending…" : "Email me a sign-in link instead"}
          </button>
        )}

        <div className={styles.links}>
          <a href="/signup" className={styles.link}>
            Don't have an account? Sign up
          </a>
          <a href="/reset-password" className={styles.link}>
            Forgot password?
          </a>
        </div>
      </div>
    </div>
  );
}
