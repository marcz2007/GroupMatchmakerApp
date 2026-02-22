import { Session, User } from "@supabase/supabase-js";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../supabase";

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
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  calendarConnected: boolean;
  isGuest: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  calendarConnected: false,
  isGuest: false,
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
        .select("id, username, email, first_name, last_name, avatar_url, calendar_connected, calendar_provider, is_guest")
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
    let resolved = false;

    // Safety timeout — if getSession() hangs, unblock after 5s
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn("[Auth] getSession() timed out after 5s, unblocking app");
        resolved = true;
        setLoading(false);
      }
    }, 5000);

    // Get initial session
    console.log("[Auth] Calling getSession()...");
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log("[Auth] getSession() resolved, session:", !!session);
      if (resolved) return; // timeout already fired
      resolved = true;
      clearTimeout(timeout);

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user?.id) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      }

      setLoading(false);
    }).catch((error) => {
      console.error("[Auth] getSession() error:", error);
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("[Auth] onAuthStateChange:", _event);
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user?.id) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      } else {
        setProfile(null);
      }

      // If getSession() hung but auth state change came through, unblock
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const calendarConnected = profile?.calendar_connected ?? false;
  const isGuest = profile?.is_guest ?? false;

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, calendarConnected, isGuest, refreshProfile }}>
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
