import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

/**
 * Platform-agnostic Supabase client factory.
 * Call initSupabase() once at app startup with platform-specific options.
 * After initialization, import `supabase` directly.
 */
export function initSupabase(
  url: string,
  anonKey: string,
  options?: {
    storage?: any;
    fetch?: typeof fetch;
    lock?: (name: string, acquireTimeout: number, fn: () => Promise<any>) => Promise<any>;
    detectSessionInUrl?: boolean;
  }
): SupabaseClient {
  _supabase = createClient(url, anonKey, {
    global: {
      ...(options?.fetch ? { fetch: options.fetch } : {}),
    },
    auth: {
      storage: options?.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: options?.detectSessionInUrl ?? false,
      ...(options?.lock ? { lock: options.lock } : {}),
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
  return _supabase;
}

/**
 * Get the initialized Supabase client.
 * Throws if initSupabase() hasn't been called yet.
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    throw new Error(
      "Supabase not initialized. Call initSupabase() before using the client."
    );
  }
  return _supabase;
}

/** Convenience getter — same as getSupabase() but shorter for service files. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop];
  },
});
