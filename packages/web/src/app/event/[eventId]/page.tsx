"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDate } from "@grapple/shared";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./publicEvent.module.css";

interface PublicEventData {
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  group_name: string | null;
  creator_name: string | null;
  participant_count: number;
  participant_names: string[];
  is_expired: boolean;
  already_rsvpd: boolean;
  user_name: string | null;
  scheduling_mode: string;
  scheduling_status: string;
  scheduling_deadline: string | null;
}

export default function PublicEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<PublicEventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // RSVP form state
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;

    const fetchEvent = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        if (!supabaseUrl) {
          throw new Error("Supabase URL not configured");
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/get-public-event?event_room_id=${eventId}`,
          {
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
            },
          }
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load event");
        }

        const data = await response.json();
        setEvent(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  const handleGuestRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRsvpError(null);

    const cleanName = guestName.trim();
    const cleanEmail = guestEmail.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setRsvpError("Please enter your name and email.");
      return;
    }

    setRsvpSubmitting(true);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("Supabase URL not configured");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/web-rsvp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        },
        body: JSON.stringify({
          event_room_id: eventId,
          guest_name: cleanName,
          guest_email: cleanEmail,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to RSVP");
      }

      setRsvpSuccess(true);
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : "Failed to RSVP");
    } finally {
      setRsvpSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !event) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>Event not found</h1>
          <p className={styles.description}>
            {error || "This event does not exist or has been removed."}
          </p>
        </div>
      </div>
    );
  }

  if (event.is_expired) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>{event.title}</h1>
          <p className={styles.description}>This event has expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <header className={styles.header}>
          {event.group_name && (
            <span className={styles.groupBadge}>{event.group_name}</span>
          )}
          <h1 className={styles.title}>{event.title}</h1>
          {event.creator_name && (
            <p className={styles.creator}>Organised by {event.creator_name}</p>
          )}
        </header>

        {event.description && (
          <section className={styles.section}>
            <p className={styles.description}>{event.description}</p>
          </section>
        )}

        {event.starts_at && (
          <section className={styles.section}>
            <span className={styles.label}>When</span>
            <span className={styles.value}>{formatDate(event.starts_at)}</span>
          </section>
        )}

        <section className={styles.section}>
          <span className={styles.label}>
            {event.participant_count} going
          </span>
          {event.participant_names.length > 0 && (
            <span className={styles.value}>
              {event.participant_names.slice(0, 5).join(", ")}
              {event.participant_names.length > 5
                ? ` +${event.participant_names.length - 5} more`
                : ""}
            </span>
          )}
        </section>

        {rsvpSuccess ? (
          <section className={styles.successBox}>
            <h2 className={styles.successTitle}>You&apos;re in!</h2>
            <p className={styles.description}>
              You&apos;ll get an update when the event time is confirmed.
            </p>
            <button
              className={styles.secondaryButton}
              onClick={() => router.push("/signup")}
            >
              Create a Grapple account to track this event
            </button>
          </section>
        ) : event.already_rsvpd ? (
          <section className={styles.section}>
            <p className={styles.description}>
              You&apos;re already signed up as {event.user_name}.
            </p>
          </section>
        ) : (
          <form onSubmit={handleGuestRsvp} className={styles.form}>
            <h2 className={styles.formTitle}>Join this event</h2>
            <p className={styles.formSubtitle}>
              Enter your details to RSVP. No account required.
            </p>
            <input
              type="text"
              className={styles.input}
              placeholder="First name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              disabled={rsvpSubmitting}
              required
            />
            <input
              type="email"
              className={styles.input}
              placeholder="Email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              disabled={rsvpSubmitting}
              required
            />
            {rsvpError && <p className={styles.error}>{rsvpError}</p>}
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={rsvpSubmitting}
            >
              {rsvpSubmitting ? "Joining..." : "Count me in"}
            </button>
            <p className={styles.fineprint}>
              Already have a Grapple account?{" "}
              <a href="/login" className={styles.link}>
                Sign in
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
