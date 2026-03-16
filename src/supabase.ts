// src/supabase.ts
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@env";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// URL polyfill is only needed on native
if (Platform.OS !== "web") {
  require("react-native-url-polyfill/auto");
}

// On web, use localStorage; on native, use AsyncStorage
const storage = Platform.OS === "web" ? window.localStorage : AsyncStorage;

// Only detect session in URL when an auth callback is present
const shouldDetectSessionInUrl =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  (window.location.hash.includes("access_token") ||
    window.location.hash.includes("error"));

// On web, navigator.locks can permanently deadlock the Supabase auth.
// A serializing mutex also deadlocks because Supabase's internal auth
// code is re-entrant (e.g. _initialize → _callRefreshToken both acquire
// the same named lock). The safest approach is a no-op lock: it avoids
// both the navigator.locks deadlock and the re-entrancy deadlock.
// Cross-tab coordination is not needed for this app.
const webNoOpLock = async (
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<any>
) => {
  return await fn();
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: shouldDetectSessionInUrl,
    ...(Platform.OS === "web" ? { lock: webNoOpLock } : {}),
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
