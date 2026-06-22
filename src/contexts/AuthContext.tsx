import { Session, User } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@grapple/shared";

/** Timeout in milliseconds before unblocking the app if Supabase init hangs */
const AUTH_INIT_TIMEOUT_MS = 5000;

interface Profile {
  id: string;
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  calendar_connected?: boolean;
  calendar_provider?: string;
  is_guest?: boolean;
  email_verified_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  calendarConnected: boolean;
  isGuest: boolean;
  isEmailVerified: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  calendarConnected: false,
  isGuest: false,
  isEmailVerified: false,
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, email, first_name, last_name, avatar_url, calendar_connected, calendar_provider, is_guest, email_verified_at")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return null;
      }

      return data as Profile;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    // Safety timeout — if Supabase init hangs, unblock after 5s
    const timeout = setTimeout(() => {
      console.warn("[Auth] Supabase init timed out after 5s, unblocking app");
      setLoading(false);
    }, AUTH_INIT_TIMEOUT_MS);

    // onAuthStateChange fires INITIAL_SESSION once Supabase finishes
    // initializing, giving us the session without a separate getSession()
    // call (which would compete for the same internal lock).
    //
    // IMPORTANT: this callback must NOT await other Supabase calls — the
    // auth client holds an internal lock while it runs, so an awaited query
    // here deadlocks any concurrent query (e.g. getUserGroups) on cold
    // start. We only do synchronous state updates; the profile is fetched
    // in a separate effect below, after the lock is released.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("[Auth] onAuthStateChange:", _event);
      clearTimeout(timeout);

      setSession(session);
      setUser(session?.user ?? null);

      // Unblock the app immediately — don't wait for profile fetch.
      // Profile loads in the background; screens that need it have
      // their own loading states.
      setLoading(false);

      if (!session?.user?.id) {
        setProfile(null);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Fetch the profile outside the auth-state callback so it never runs while
  // the Supabase auth lock is held (which would deadlock cold-start queries).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    fetchProfile(user.id).then((profileData) => {
      if (!cancelled) setProfile(profileData);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, fetchProfile]);

  const calendarConnected = profile?.calendar_connected ?? false;
  const isGuest = profile?.is_guest ?? false;
  const isEmailVerified = !!profile?.email_verified_at;

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, calendarConnected, isGuest, isEmailVerified, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
