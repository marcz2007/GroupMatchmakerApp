// src/supabase.ts
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@env";
import { initSupabase } from "@grapple/shared";
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
const webNoOpLock = async (
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<any>
) => {
  return await fn();
};

// On web, browser fetch() has no default timeout
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId)
  );
};

export const supabase = initSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, {
  storage,
  detectSessionInUrl: shouldDetectSessionInUrl,
  ...(Platform.OS === "web" ? { fetch: fetchWithTimeout, lock: webNoOpLock } : {}),
});
