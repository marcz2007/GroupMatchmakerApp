import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchPublicEvent, rsvpToEvent, guestRsvpToEvent, PublicEventData } from "../lib/api";
import EventHeader from "../components/EventHeader";
import EventDetails from "../components/EventDetails";
import ParticipantList from "../components/ParticipantList";
import AuthModal from "../components/AuthModal";
import DownloadCTA from "../components/DownloadCTA";

type PageState = "loading" | "event" | "rsvp-success" | "error" | "not-found";

export default function EventPage() {
  const { eventRoomId } = useParams<{ eventRoomId: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [event, setEvent] = useState<PublicEventData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Guest form fields
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  const loadEvent = async () => {
    if (!eventRoomId) {
      setState("not-found");
      return;
    }

    try {
      const data = await fetchPublicEvent(eventRoomId);
      setEvent(data);
      setState("event");
    } catch (err: any) {
      if (err.message === "Event not found") {
        setState("not-found");
      } else {
        setErrorMsg(err.message);
        setState("error");
      }
    }
  };

  // Load event data
  useEffect(() => {
    loadEvent();
  }, [eventRoomId]);

  // After OAuth redirect, detect session and auto-RSVP
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (authEvent) => {
        if (authEvent === "SIGNED_IN" && eventRoomId) {
          // Re-fetch event to check if already RSVP'd, then RSVP if not
          await performAuthRsvp();
        }
      }
    );

    // Check for OAuth callback on mount
    if (window.location.hash.includes("access_token") && eventRoomId) {
      performAuthRsvp();
    }

    return () => subscription.unsubscribe();
  }, [eventRoomId]);

  const performAuthRsvp = async () => {
    if (!eventRoomId) return;
    setRsvpLoading(true);
    setAuthModalOpen(false);
    try {
      await rsvpToEvent(eventRoomId);
      setState("rsvp-success");
      // Re-fetch to get updated data
      const data = await fetchPublicEvent(eventRoomId);
      setEvent(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to RSVP");
      setState("error");
    } finally {
      setRsvpLoading(false);
    }
  };

  const performGuestRsvp = async () => {
    if (!eventRoomId || !guestName.trim() || !guestEmail.trim()) return;
    setRsvpLoading(true);
    try {
      await guestRsvpToEvent(eventRoomId, guestName, guestEmail);
      setState("rsvp-success");
      const data = await fetchPublicEvent(eventRoomId);
      setEvent(data);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to RSVP");
      setState("error");
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleImIn = async () => {
    // Check if already signed in via OAuth
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await performAuthRsvp();
    } else {
      setAuthModalOpen(true);
    }
  };

  // Loading skeleton
  if (state === "loading") {
    return (
      <div className="h-screen overflow-y-auto bg-grapple-bg flex items-center justify-center">
        <div className="w-full max-w-md mx-auto px-6 animate-pulse">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 rounded-full bg-grapple-surfaceLight mb-4" />
            <div className="h-8 w-48 bg-grapple-surfaceLight rounded mb-2" />
            <div className="h-5 w-32 bg-grapple-surfaceLight rounded" />
          </div>
          <div className="bg-grapple-surfaceLight rounded-2xl h-40 mb-6" />
          <div className="bg-grapple-surfaceLight rounded-2xl h-24 mb-6" />
          <div className="bg-grapple-surfaceLight rounded-xl h-14" />
        </div>
      </div>
    );
  }

  // Not found
  if (state === "not-found") {
    return (
      <div className="h-screen overflow-y-auto bg-grapple-bg flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold text-white mb-2">Event not found</h1>
          <p className="text-gray-400">
            This event may have been removed or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (state === "error") {
    return (
      <div className="h-screen overflow-y-auto bg-grapple-bg flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => {
              setState("loading");
              loadEvent();
            }}
            className="px-6 py-3 bg-grapple-primary text-white rounded-xl font-semibold hover:bg-grapple-primary/80 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // RSVP success
  if (state === "rsvp-success" && event) {
    return (
      <div className="h-screen overflow-y-auto bg-grapple-bg">
        <div className="w-full max-w-md mx-auto px-6 py-12">
          <DownloadCTA eventTitle={event.title} />
        </div>
      </div>
    );
  }

  // Main event view
  if (!event) return null;

  const isAlreadyRsvpd = event.already_rsvpd;

  return (
    <div className="h-screen overflow-y-auto bg-grapple-bg">
      <div className="w-full max-w-md mx-auto px-6 py-12 pb-24">
        {/* Signed-in greeting */}
        {event.user_name && (
          <p className="text-gray-400 text-sm text-center mb-6">
            Hey {event.user_name}!
          </p>
        )}

        <EventHeader
          title={event.title}
          groupName={event.group_name}
          isExpired={event.is_expired}
        />

        <EventDetails
          startsAt={event.starts_at}
          endsAt={event.ends_at}
          description={event.description}
        />

        <ParticipantList
          names={event.participant_names}
          count={event.participant_count}
        />

        {event.creator_name && (
          <p className="text-gray-500 text-sm text-center mb-6">
            Created by {event.creator_name}
          </p>
        )}

        {/* Already RSVP'd */}
        {isAlreadyRsvpd && !event.is_expired && (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-grapple-success/20 mx-auto mb-3 flex items-center justify-center">
              <svg className="w-6 h-6 text-grapple-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-semibold mb-1">You're going!</p>
            <p className="text-gray-400 text-sm mb-6">You've already RSVP'd to this event.</p>
            <DownloadCTA eventTitle={event.title} />
          </div>
        )}

        {/* Not RSVP'd and not expired — show RSVP options */}
        {!isAlreadyRsvpd && !event.is_expired && (
          <div className="space-y-4">
            {/* Guest RSVP form */}
            <div className="bg-grapple-surface border border-grapple-border rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-4">RSVP to this event</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Your name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-4 py-3 bg-grapple-bg border border-grapple-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-grapple-primary"
                />
                <input
                  type="email"
                  placeholder="Your email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-grapple-bg border border-grapple-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-grapple-primary"
                />
                <button
                  onClick={performGuestRsvp}
                  disabled={rsvpLoading || !guestName.trim() || !guestEmail.trim()}
                  className="w-full py-4 bg-grapple-primary text-white rounded-xl font-bold text-lg hover:bg-grapple-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rsvpLoading ? "Joining..." : "I'm In!"}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-grapple-border" />
              <span className="text-gray-500 text-sm">or sign in with</span>
              <div className="flex-1 h-px bg-grapple-border" />
            </div>

            {/* OAuth buttons inline */}
            <div className="flex gap-3">
              <button
                onClick={handleImIn}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>
              <button
                onClick={() => {
                  supabase.auth.signInWithOAuth({
                    provider: "apple",
                    options: { redirectTo: window.location.href },
                  });
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-gray-900 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
                Apple
              </button>
            </div>
          </div>
        )}
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        redirectUrl={window.location.href}
      />
    </div>
  );
}
