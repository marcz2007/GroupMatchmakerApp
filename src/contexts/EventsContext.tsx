import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { hasActiveEvents, subscribeToUserEvents } from "../services/eventService";
import { useAuth } from "./AuthContext";

interface EventsContextType {
  hasEvents: boolean;
  eventCount: number;
  refreshEvents: () => Promise<void>;
}

const EventsContext = createContext<EventsContextType>({
  hasEvents: false,
  eventCount: 0,
  refreshEvents: async () => {},
});

export const useEvents = () => useContext(EventsContext);

export const EventsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const [hasEvents, setHasEvents] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  const refreshEvents = useCallback(async () => {
    if (!user) {
      setHasEvents(false);
      setEventCount(0);
      return;
    }

    try {
      const active = await hasActiveEvents();
      setHasEvents(active);
      // For now, we just track if there are any events
      // Could be expanded to track exact count
      setEventCount(active ? 1 : 0);
    } catch (error) {
      console.error("Error checking events:", error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refreshEvents();
      const unsubscribe = subscribeToUserEvents(() => {
        refreshEvents();
      });
      return () => {
        unsubscribe();
      };
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <EventsContext.Provider value={{ hasEvents, eventCount, refreshEvents }}>
      {children}
    </EventsContext.Provider>
  );
};
