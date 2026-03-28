import { initSupabase, getSupabase } from "@grapple/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

let _initialized = false;

function ensureInit(): SupabaseClient {
  if (_initialized) return getSupabase();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  // Detect session in URL only when auth callback is present
  const shouldDetectSessionInUrl =
    typeof window !== "undefined" &&
    (window.location.hash.includes("access_token") ||
      window.location.hash.includes("error"));

  // No-op lock to avoid navigator.locks deadlock
  const webNoOpLock = async (
    _name: string,
    _acquireTimeout: number,
    fn: () => Promise<any>
  ) => {
    return await fn();
  };

  // Timeout wrapper for fetch
  const fetchWithTimeout: typeof fetch = (input, init) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    return fetch(input, { ...init, signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId)
    );
  };

  initSupabase(supabaseUrl, supabaseAnonKey, {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    fetch: fetchWithTimeout,
    lock: webNoOpLock,
    detectSessionInUrl: shouldDetectSessionInUrl,
  });

  _initialized = true;
  return getSupabase();
}

// Proxy that lazily initializes on first use
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (ensureInit() as any)[prop];
  },
});
