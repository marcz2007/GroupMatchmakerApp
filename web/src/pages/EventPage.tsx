import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchPublicEvent, rsvpToEvent, PublicEventData } from "../lib/api";
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

  // Load event data
  useEffect(() => {
    if (!eventRoomId) {
      setState("not-found");
      return;
    }

    fetchPublicEvent(eventRoomId)
      .then((data) => {
        setEvent(data);
        setState("event");
      })
      .catch((err) => {
        if (err.message === "Event not found") {
          setState("not-found");
        } else {
          setErrorMsg(err.message);
          setState("error");
        }
      });
  }, [eventRoomId]);

  // After OAuth redirect, detect session and auto-RSVP
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (authEvent, session) => {
        if (authEvent === "SIGNED_IN" && session && eventRoomId && state === "event") {
          await performRsvp();
        }
      }
    );

    // Check for existing session on mount (returning from OAuth redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && eventRoomId && state === "event") {
        // User already has a session (returned from OAuth)
        // Check URL hash for auth callback indicators
        if (window.location.hash.includes("access_token")) {
          performRsvp();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [eventRoomId, state]);

  const performRsvp = async () => {
    if (!eventRoomId) return;
    setRsvpLoading(true);
    setAuthModalOpen(false);
    try {
      await rsvpToEvent(eventRoomId);
      setState("rsvp-success");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to RSVP");
      setState("error");
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleImIn = async () => {
    // Check if already signed in
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await performRsvp();
    } else {
      setAuthModalOpen(true);
    }
  };

  // Loading skeleton
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-grapple-bg flex items-center justify-center">
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
      <div className="min-h-screen bg-grapple-bg flex items-center justify-center px-6">
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
      <div className="min-h-screen bg-grapple-bg flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-gray-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
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
      <div className="min-h-screen bg-grapple-bg">
        <div className="w-full max-w-md mx-auto px-6 py-12">
          <DownloadCTA eventTitle={event.title} />
        </div>
      </div>
    );
  }

  // Main event view
  if (!event) return null;

  return (
    <div className="min-h-screen bg-grapple-bg">
      <div className="w-full max-w-md mx-auto px-6 py-12">
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

        {!event.is_expired && (
          <button
            onClick={handleImIn}
            disabled={rsvpLoading}
            className="w-full py-4 bg-grapple-primary text-white rounded-xl font-bold text-lg hover:bg-grapple-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rsvpLoading ? "Joining..." : "I'm In!"}
          </button>
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
