// Calendar-sync TEST_MODE bypass: google-calendar-auth fakes a synced calendar
// (no Google) so the sync button can be exercised end-to-end. Gated on the
// CALENDAR_TEST_MODE env (set on the dev project only) + testMode in the body.
import {
  admin,
  createTestUser,
  callFunction,
  test,
  assert,
  trackEvent,
  iso,
  daysFromNow,
} from "./harness.mjs";

export async function run() {
  console.log("\nCalendar sync (test bypass):");

  await test("google-calendar-auth test bypass marks the user synced (no Google)", async () => {
    const host = await createTestUser("Host");
    const res = await host.client.rpc("create_smart_event", {
      p_title: "Bypass test",
      p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
      p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
      p_scheduling_deadline: iso(daysFromNow(1)),
      p_slots: [{ day_of_week: 1, start_time: "18:00", duration_minutes: 60 }],
      p_min_synced_users: null,
      p_timezone: "UTC",
    });
    assert(!res.error, `create_smart_event: ${res.error?.message}`);
    const eventId = res.data.event_room_id;
    trackEvent(eventId);

    const guest = await createTestUser("Guest");
    const out = await callFunction(
      "google-calendar-auth",
      {
        userId: guest.id,
        platform: "web",
        returnPath: `/event/${eventId}`,
        testMode: true,
      },
      { auth: true }
    );

    assert(
      out.authUrl && out.authUrl.includes("calendar_connected=true"),
      `expected bypass redirect, got ${JSON.stringify(out)}`
    );

    const { data: prof } = await admin
      .from("profiles")
      .select("calendar_connected")
      .eq("id", guest.id)
      .single();
    assert(prof.calendar_connected === true, "user not marked connected");

    const { data: busy } = await admin
      .from("calendar_busy_times")
      .select("id")
      .eq("user_id", guest.id);
    assert(busy.length >= 1, "no busy times seeded");

    const { data: sync } = await admin
      .from("scheduling_calendar_syncs")
      .select("user_id")
      .eq("event_room_id", eventId)
      .eq("user_id", guest.id)
      .maybeSingle();
    assert(sync, "event sync not recorded");
  });
}
