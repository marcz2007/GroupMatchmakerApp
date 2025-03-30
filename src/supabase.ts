// src/supabase.ts
import 'react-native-url-polyfill/auto'; // Required for Supabase on React Native
import { createClient } from '@supabase/supabase-js';
import { MMKV } from 'react-native-mmkv';

// Initialize MMKV storage
const storage = new MMKV({
    id: 'supabase-auth-storage', // Unique ID for storage instance
});

const supabaseUrl = 'https://nqtycfrgzjiehatokmfn.supabase.co'; // Replace with your actual Supabase URL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xdHljZnJnemppZWhhdG9rbWZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMyNDU5MDcsImV4cCI6MjA1ODgyMTkwN30.QVuNoevXuJ9rTBAOe_yObjVLdqT-FqwsRw__3HeYDDQ'; // Replace with your actual Anon Key

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: mmkvStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Important for React Native
    },
});