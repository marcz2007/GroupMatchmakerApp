// Minimal headless integration-test harness for Grapple.
//
// No emulator, no real emails, no Google OAuth: we create synthetic users via
// the Supabase admin API and seed calendar availability directly, then drive
// the real RPCs/edge functions and assert DB state. Self-cleaning.
//
// Env required (point at a dev/test Supabase project):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//
// Run:  node tests/run.mjs

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

if (!URL || !SERVICE || !ANON) {
  console.error(
    "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY"
  );
  process.exit(2);
}

export const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_PASSWORD = "Test123456!";

// --- cleanup registry ---
const createdUsers = [];
const createdEvents = [];
export const trackEvent = (id) => id && createdEvents.push(id);
// Register a user created outside the factory (e.g. a guest made by web-rsvp)
// so cleanup removes it too.
export const trackUser = (id) => id && createdUsers.push(id);

// Call a deployed edge function. Default: apikey only (the web app's guest
// path; an Authorization header would make web-rsvp treat it as a user token).
// Pass { auth: true } for functions that don't read it as a user token but may
// require a JWT (e.g. google-calendar-auth).
export async function callFunction(name, body, { auth = false } = {}) {
  const headers = { "Content-Type": "application/json", apikey: ANON };
  if (auth) headers.Authorization = `Bearer ${ANON}`;
  const res = await fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  try {
    return await res.json();
  } catch {
    return { error: `HTTP ${res.status}` };
  }
}

// --- user factory ---
export async function createTestUser(firstName = "Tester") {
  const email = `t-${randomUUID()}@grapple.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true, // no real inbox / confirmation needed
    user_metadata: { first_name: firstName },
  });
  if (error) throw new Error(`createTestUser: ${error.message}`);
  const id = data.user.id;
  createdUsers.push(id);

  // A client signed in AS this user, so RPCs see the right auth.uid().
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw new Error(`signIn ${email}: ${signInError.message}`);

  return { id, email, client };
}

// Mark a user as calendar-connected (bypasses Google OAuth).
export async function setConnected(userId) {
  const { error } = await admin
    .from("profiles")
    .update({ calendar_connected: true, calendar_provider: "google" })
    .eq("id", userId);
  if (error) throw new Error(`setConnected: ${error.message}`);
}

// Add a participant and ensure they're recorded as synced for a smart event.
export async function enroll(eventId, userId) {
  await admin
    .from("event_room_participants")
    .upsert(
      { event_room_id: eventId, user_id: userId },
      { onConflict: "event_room_id,user_id" }
    );
  await admin
    .from("scheduling_calendar_syncs")
    .upsert(
      { event_room_id: eventId, user_id: userId, calendar_provider: "google" },
      { onConflict: "event_room_id,user_id" }
    );
}

export async function addParticipant(eventId, userId) {
  await admin
    .from("event_room_participants")
    .upsert(
      { event_room_id: eventId, user_id: userId },
      { onConflict: "event_room_id,user_id" }
    );
}

// Seed busy intervals directly (what the FreeBusy fetch would have written).
export async function seedBusy(userId, intervals) {
  const rows = intervals.map((iv) => ({
    user_id: userId,
    start_time: iv.start,
    end_time: iv.end,
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await admin.from("calendar_busy_times").insert(rows);
  if (error) throw new Error(`seedBusy: ${error.message}`);
}

// --- tiny test runner ---
let passed = 0;
let failed = 0;
const failures = [];

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}\n     ${e.message}`);
  }
}

export async function cleanup() {
  console.log("\nCleaning up…");
  for (const id of createdEvents) {
    await admin.from("event_rooms").delete().eq("id", id); // cascades children
  }
  for (const id of createdUsers) {
    await admin.from("calendar_busy_times").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`Removed ${createdEvents.length} events, ${createdUsers.length} users.`);
}

export function summary() {
  console.log(`\n${passed} passed, ${failed} failed.`);
  return failed === 0;
}

// date helpers
export const iso = (d) => d.toISOString();
export function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
