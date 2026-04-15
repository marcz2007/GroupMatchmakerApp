"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDate } from "@grapple/shared";
import LoadingSpinner from "@/components/LoadingSpinner";
import styles from "./publicEvent.module.css";

interface PollOption {
  id: string;
  starts_at: string;
  ends_at: string;
  yes_count: number;
  is_selected: boolean;
}

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
  poll_options: PollOption[] | null;
}

type VoteState = Record<string, "YES" | "NO" | undefined>;

function formatOptionTime(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startStr = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const endStr = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateStr} · ${startStr} – ${endStr}`;
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
  const [syncCalendar, setSyncCalendar] = useState(true);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  // Calendar return-from-OAuth banner state. We read the query params
  // from window.location inside a useEffect (rather than using
  // useSearchParams) so we don't need to wrap the page in a Suspense
  // boundary for Next 15's prerender rules.
  const [calendarBanner, setCalendarBanner] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  // Poll vote state
  const [myVotes, setMyVotes] = useState<VoteState>({});
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState(false);

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
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
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Capture the calendar-return query params into component state, then
  // strip them from the URL so a refresh doesn't keep showing the banner.
  // Also restore `submittedEmail` from localStorage so poll voting still
  // works after the OAuth round-trip (we lose component state when the
  // browser redirects out to Google).
  useEffect(() => {
    if (!eventId) return;
    try {
      const stored = localStorage.getItem(`grapple.rsvp.${eventId}`);
      if (stored) setSubmittedEmail(stored);
    } catch {
      // localStorage disabled — poll voting post-OAuth just won't work.
    }

    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("calendar_connected") === "true") {
      setCalendarBanner({
        kind: "success",
        message:
          "Your Google Calendar is now synced — we'll use your availability to pick the best time.",
      });
      router.replace(`/event/${eventId}`);
    } else if (params.get("calendar_error")) {
      setCalendarBanner({
        kind: "error",
        message:
          "We couldn't connect your calendar. You're still RSVP'd — you can try again any time.",
      });
      router.replace(`/event/${eventId}`);
    }
    // We only want this to run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCalendarOAuth = useCallback(
    async (userId: string): Promise<boolean> => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) return false;

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/google-calendar-auth`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""}`,
            },
            body: JSON.stringify({
              userId,
              platform: "web",
              returnPath: `/event/${eventId}`,
            }),
          }
        );

        if (!response.ok) {
          console.error(
            "google-calendar-auth failed with status",
            response.status
          );
          return false;
        }

        const data = await response.json();
        if (!data?.authUrl) {
          console.error("google-calendar-auth returned no authUrl", data);
          return false;
        }

        // Full-page redirect to Google — on return the callback redirects
        // back here with ?calendar_connected=true.
        window.location.href = data.authUrl;
        return true;
      } catch (err) {
        console.error("Failed to start calendar OAuth:", err);
        return false;
      }
    },
    [eventId]
  );

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

      const body = await response.json().catch(() => ({}));
      const userId: string | undefined = body?.user_id;
      const alreadyConnected: boolean = body?.calendar_connected === true;

      setSubmittedEmail(cleanEmail);
      try {
        localStorage.setItem(`grapple.rsvp.${eventId}`, cleanEmail);
      } catch {
        // localStorage may be unavailable — non-fatal.
      }
      setRsvpSuccess(true);

      // If the user ticked "Sync my Google Calendar" and they don't
      // already have one connected, kick off OAuth. This is a full-page
      // redirect — the callback will land us back on this event page
      // with ?calendar_connected=true.
      if (syncCalendar && userId && !alreadyConnected) {
        const started = await startCalendarOAuth(userId);
        if (started) return; // redirecting — stop work here
        // On failure we fall through to the normal success UI.
        setCalendarBanner({
          kind: "error",
          message:
            "We couldn't start the calendar sync. You're RSVP'd — try again from the event page if needed.",
        });
      }

      // Refetch to reveal poll options with the new participant included
      await fetchEvent();
    } catch (err) {
      setRsvpError(err instanceof Error ? err.message : "Failed to RSVP");
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const toggleVote = (optionId: string, vote: "YES" | "NO") => {
    setVoteError(null);
    setVoteSuccess(false);
    setMyVotes((prev) => ({
      ...prev,
      [optionId]: prev[optionId] === vote ? undefined : vote,
    }));
  };

  const handleSubmitVotes = async () => {
    if (!event || !submittedEmail) return;
    const voteEntries = Object.entries(myVotes).filter(
      ([, v]) => v !== undefined
    ) as [string, "YES" | "NO"][];

    if (voteEntries.length === 0) {
      setVoteError("Pick at least one option.");
      return;
    }

    setVoteError(null);
    setVoteSubmitting(true);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error("Supabase URL not configured");
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/web-poll-vote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          },
          body: JSON.stringify({
            event_room_id: eventId,
            guest_email: submittedEmail,
            votes: voteEntries.map(([candidate_time_id, vote]) => ({
              candidate_time_id,
              vote,
            })),
          }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit votes");
      }

      setVoteSuccess(true);
      await fetchEvent();
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setVoteSubmitting(false);
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

  const isPoll = event.scheduling_mode === "poll";
  const pollFinalized = event.scheduling_status === "scheduled";
  const showPollVoting =
    isPoll &&
    !pollFinalized &&
    (rsvpSuccess || event.already_rsvpd) &&
    event.poll_options &&
    event.poll_options.length > 0;

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

        {calendarBanner && (
          <div
            className={
              calendarBanner.kind === "success"
                ? styles.calendarBannerSuccess
                : styles.calendarBannerError
            }
          >
            {calendarBanner.message}
          </div>
        )}

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

        {rsvpSuccess && !isPoll ? (
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
        ) : event.already_rsvpd && !rsvpSuccess && !showPollVoting ? (
          <section className={styles.section}>
            <p className={styles.description}>
              You&apos;re already signed up as {event.user_name}.
            </p>
          </section>
        ) : !rsvpSuccess && !event.already_rsvpd ? (
          <form onSubmit={handleGuestRsvp} className={styles.form}>
            <h2 className={styles.formTitle}>
              {isPoll ? "Vote on this event" : "Join this event"}
            </h2>
            <p className={styles.formSubtitle}>
              {isPoll
                ? "Enter your details — then pick the times that work."
                : "Enter your details to RSVP. No account required."}
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
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={syncCalendar}
                onChange={(e) => setSyncCalendar(e.target.checked)}
                disabled={rsvpSubmitting}
              />
              <span className={styles.checkboxLabel}>
                Sync my Google Calendar so Grapple can find a time that works
                for everyone.
              </span>
            </label>
            {rsvpError && <p className={styles.error}>{rsvpError}</p>}
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={rsvpSubmitting}
            >
              {rsvpSubmitting
                ? syncCalendar
                  ? "Joining & connecting calendar..."
                  : "Joining..."
                : isPoll
                ? "Continue to vote"
                : syncCalendar
                ? "Count me in & connect calendar"
                : "Count me in"}
            </button>
            <p className={styles.fineprint}>
              Already have a Grapple account?{" "}
              <a href="/login" className={styles.link}>
                Sign in
              </a>
            </p>
          </form>
        ) : null}

        {showPollVoting && event.poll_options && (
          <section className={styles.pollSection}>
            <h2 className={styles.formTitle}>Which times work for you?</h2>
            <p className={styles.formSubtitle}>
              Tap &ldquo;Yes&rdquo; for every time you could make.
            </p>
            <div className={styles.pollOptions}>
              {event.poll_options.map((option) => {
                const myVote = myVotes[option.id];
                return (
                  <div key={option.id} className={styles.pollOption}>
                    <div className={styles.pollOptionInfo}>
                      <span className={styles.pollOptionTime}>
                        {formatOptionTime(option.starts_at, option.ends_at)}
                      </span>
                      <span className={styles.pollOptionVotes}>
                        {option.yes_count} yes
                      </span>
                    </div>
                    <div className={styles.voteButtons}>
                      <button
                        type="button"
                        className={`${styles.voteButton} ${styles.voteYes} ${myVote === "YES" ? styles.voteSelected : ""}`}
                        onClick={() => toggleVote(option.id, "YES")}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={`${styles.voteButton} ${styles.voteNo} ${myVote === "NO" ? styles.voteSelected : ""}`}
                        onClick={() => toggleVote(option.id, "NO")}
                      >
                        No
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {voteError && <p className={styles.error}>{voteError}</p>}
            {voteSuccess && (
              <p className={styles.successText}>Votes submitted!</p>
            )}
            <button
              type="button"
              className={styles.primaryButton}
              disabled={voteSubmitting}
              onClick={handleSubmitVotes}
            >
              {voteSubmitting ? "Submitting..." : "Submit votes"}
            </button>
          </section>
        )}

        {isPoll && pollFinalized && event.starts_at && (
          <section className={styles.successBox}>
            <h2 className={styles.successTitle}>Time confirmed!</h2>
            <p className={styles.description}>
              Grapple picked {formatDate(event.starts_at)}.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
