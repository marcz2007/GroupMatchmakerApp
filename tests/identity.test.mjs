// Guest RSVP (web-rsvp) + durable Google identity (link_google_identity).
import {
  admin,
  createTestUser,
  setConnected,
  enroll,
  callFunction,
  trackUser,
  test,
  assert,
  trackEvent,
  iso,
  daysFromNow,
} from "./harness.mjs";

async function createSmartEvent(creator) {
  const res = await creator.client.rpc("create_smart_event", {
    p_title: "Identity test event",
    p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
    p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
    p_scheduling_deadline: iso(daysFromNow(1)),
    p_slots: [{ day_of_week: 1, start_time: "18:00", duration_minutes: 60 }],
    p_min_synced_users: null,
    p_timezone: "UTC",
  });
  assert(!res.error, `create_smart_event: ${res.error?.message}`);
  trackEvent(res.data.event_room_id);
  return res.data.event_room_id;
}

export async function run() {
  console.log("\nGuest RSVP & identity:");

  // web-rsvp: brand-new RSVP creates a REAL but UNVERIFIED account + participant.
  await test("web-rsvp creates a real unverified account + participant", async () => {
    const host = await createTestUser("Host");
    const eventId = await createSmartEvent(host);
    const email = `guest-${Date.now()}-a@grapple.test`;

    const r = await callFunction("web-rsvp", {
      event_room_id: eventId,
      first_name: "Gwen",
      email,
      password: "Test123456!",
    });
    assert(r.user_id, `no user_id: ${JSON.stringify(r)}`);
    assert(r.needs_verification === true, "new account should need verification");
    trackUser(r.user_id);

    const { data: prof } = await admin
      .from("profiles")
      .select("is_guest, email, email_verified_at")
      .eq("id", r.user_id)
      .single();
    assert(prof.is_guest === false, "should be a real (non-guest) account");
    assert(prof.email_verified_at === null, "should start unverified");
    assert(prof.email === email, `email mismatch: ${prof.email}`);

    const { data: part } = await admin
      .from("event_room_participants")
      .select("user_id")
      .eq("event_room_id", eventId)
      .eq("user_id", r.user_id)
      .maybeSingle();
    assert(part, "guest was not added as a participant");
  });

  // web-rsvp: the same (still-unverified) email returns the SAME profile.
  await test("web-rsvp reuses the profile for a returning email", async () => {
    const host = await createTestUser("Host");
    const eventId = await createSmartEvent(host);
    const email = `guest-${Date.now()}-b@grapple.test`;

    const r1 = await callFunction("web-rsvp", {
      event_room_id: eventId,
      first_name: "Gwen",
      email,
      password: "Test123456!",
    });
    assert(r1.user_id, `no user_id: ${JSON.stringify(r1)}`);
    trackUser(r1.user_id);

    // Returning with the same unverified email reuses the account — no password
    // needed the second time (we never overwrite an existing account's password).
    const r2 = await callFunction("web-rsvp", {
      event_room_id: eventId,
      first_name: "Gwen Again",
      email,
    });
    assert(r2.user_id === r1.user_id, `expected reuse, got ${r2.user_id}`);
  });

  // web-rsvp: an email belonging to a full account is rejected (no hijack).
  await test("web-rsvp rejects an email on a full account", async () => {
    const host = await createTestUser("Host");
    const eventId = await createSmartEvent(host);
    const r = await callFunction("web-rsvp", {
      event_room_id: eventId,
      guest_name: "Imposter",
      guest_email: host.email, // host is a full (non-guest) account
    });
    assert(
      r.error && /sign in|already/i.test(r.error),
      `expected rejection, got ${JSON.stringify(r)}`
    );
  });

  // link_google_identity: first connect claims the account on the profile.
  await test("link_google_identity claims the account on first connect", async () => {
    const u = await createTestUser("Newbie");
    const sub = `sub-${Date.now()}-first`;
    const { data: ret, error } = await admin.rpc("link_google_identity", {
      p_user_id: u.id,
      p_google_sub: sub,
      p_google_email: "a@example.com",
      p_event_room_id: null,
    });
    assert(!error, `rpc error: ${error?.message}`);
    assert(ret === u.id, `expected ${u.id}, got ${ret}`);
    const { data: prof } = await admin
      .from("profiles")
      .select("google_sub")
      .eq("id", u.id)
      .single();
    assert(prof.google_sub === sub, "google_sub not stored");
  });

  // link_google_identity: a returning user on a new device (fresh duplicate
  // profile) is re-pointed to their existing canonical profile, and the
  // current event's participant + sync move with them.
  await test("link_google_identity re-points a duplicate to the canonical profile", async () => {
    const canonical = await createTestUser("Canon");
    const sub = `sub-${Date.now()}-repoint`;
    await admin
      .from("profiles")
      .update({ google_sub: sub, google_email: "c@example.com" })
      .eq("id", canonical.id);

    const dup = await createTestUser("Dup");
    const host = await createTestUser("Host");
    const eventId = await createSmartEvent(host);
    await setConnected(dup.id);
    await enroll(eventId, dup.id); // dup is participant + synced

    const { data: ret, error } = await admin.rpc("link_google_identity", {
      p_user_id: dup.id,
      p_google_sub: sub,
      p_google_email: "c@example.com",
      p_event_room_id: eventId,
    });
    assert(!error, `rpc error: ${error?.message}`);
    assert(ret === canonical.id, `expected canonical ${canonical.id}, got ${ret}`);

    const { data: canonPart } = await admin
      .from("event_room_participants")
      .select("user_id")
      .eq("event_room_id", eventId)
      .eq("user_id", canonical.id)
      .maybeSingle();
    assert(canonPart, "canonical not re-pointed as participant");

    const { data: dupPart } = await admin
      .from("event_room_participants")
      .select("user_id")
      .eq("event_room_id", eventId)
      .eq("user_id", dup.id)
      .maybeSingle();
    assert(!dupPart, "duplicate is still a participant");

    const { data: canonSync } = await admin
      .from("scheduling_calendar_syncs")
      .select("user_id")
      .eq("event_room_id", eventId)
      .eq("user_id", canonical.id)
      .maybeSingle();
    assert(canonSync, "canonical sync row not created");
  });
}
