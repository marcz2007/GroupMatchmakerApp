// src/supabase.ts
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@env";
import { createClient } from "@supabase/supabase-js";
import { MMKV } from "react-native-mmkv";
import "react-native-url-polyfill/auto"; // Required for Supabase on React Native

// Initialize MMKV storage
const storage = new MMKV({
  id: "supabase-auth-storage", // Unique ID for storage instance
});

// Custom storage adapter using MMKV
const mmkvStorageAdapter = {
  getItem: (key: string) => {
    const value = storage.getString(key);
    return value ? value : null;
  },
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: mmkvStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important for React Native
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
