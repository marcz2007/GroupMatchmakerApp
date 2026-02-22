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
// This is an in-memory mutex with a timeout: it properly serializes
// auth operations but releases the lock if it takes too long (no deadlock).
const createWebLock = () => {
  const locks = new Map<string, Promise<void>>();

  return async (
    name: string,
    acquireTimeout: number,
    fn: () => Promise<any>
  ) => {
    const timeout = Math.max(acquireTimeout, 5000);

    // Wait for any existing lock on this name, with a timeout
    const existing = locks.get(name);
    if (existing) {
      await Promise.race([
        existing,
        new Promise<void>((resolve) => setTimeout(resolve, timeout)),
      ]);
    }

    // Create a new lock
    let release: () => void;
    const lockPromise = new Promise<void>((r) => {
      release = r;
    });
    locks.set(name, lockPromise);

    try {
      return await fn();
    } finally {
      release!();
      if (locks.get(name) === lockPromise) {
        locks.delete(name);
      }
    }
  };
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: shouldDetectSessionInUrl,
    ...(Platform.OS === "web" ? { lock: createWebLock() } : {}),
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
