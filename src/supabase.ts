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

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web", // true on web for OAuth redirect
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
