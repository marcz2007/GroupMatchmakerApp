// Smart-scheduling scenarios: timezone correctness + "most people free" pick +
// finalization under the service-role (cron) path.
import {
  admin,
  createTestUser,
  setConnected,
  enroll,
  seedBusy,
  test,
  assert,
  trackEvent,
  iso,
  daysFromNow,
} from "./harness.mjs";

export async function run() {
  console.log("\nSmart scheduling:");

  // 1) Timezone: a London 6pm summer slot must store as 17:00 UTC (BST).
  await test("create_smart_event anchors slot to creator timezone (BST→17:00Z)", async () => {
    const a = await createTestUser("Alice");
    const res = await a.client.rpc("create_smart_event", {
      p_title: "TZ check",
      p_date_range_start: "2026-07-20",
      p_date_range_end: "2026-07-27",
      p_scheduling_deadline: iso(daysFromNow(1)),
      p_slots: [{ day_of_week: 2, start_time: "18:00", duration_minutes: 60 }], // Tue
      p_min_synced_users: null,
      p_timezone: "Europe/London",
    });
    assert(!res.error, `rpc error: ${res.error?.message}`);
    const eventId = res.data.event_room_id;
    trackEvent(eventId);
    const { data: cands } = await admin
      .from("scheduling_candidate_times")
      .select("candidate_start")
      .eq("event_room_id", eventId)
      .order("candidate_start");
    assert(cands.length >= 1, "no candidates generated");
    // 2026-07-21 is the Tuesday; 18:00 BST == 17:00:00+00
    assert(
      cands[0].candidate_start.includes("17:00:00"),
      `expected 17:00:00 UTC, got ${cands[0].candidate_start}`
    );
  });

  // 2) Engine picks the slot where the MOST synced users are free, and
  //    finalizes cleanly when run as service role (cron/trigger path).
  await test("run_smart_scheduling picks most-available slot & finalizes via service role", async () => {
    const a = await createTestUser("Alice");
    const b = await createTestUser("Bob");
    const c = await createTestUser("Cara");
    for (const u of [a, b, c]) await setConnected(u.id);

    const res = await a.client.rpc("create_smart_event", {
      p_title: "Most-free check",
      p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
      p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
      p_scheduling_deadline: iso(daysFromNow(1)),
      p_slots: [
        { day_of_week: 1, start_time: "18:00", duration_minutes: 60 },
        { day_of_week: 4, start_time: "18:00", duration_minutes: 60 },
      ],
      p_min_synced_users: null,
      p_timezone: "UTC",
    });
    assert(!res.error, `rpc error: ${res.error?.message}`);
    const eventId = res.data.event_room_id;
    trackEvent(eventId);

    await enroll(eventId, a.id);
    await enroll(eventId, b.id);
    await enroll(eventId, c.id);

    const { data: cands } = await admin
      .from("scheduling_candidate_times")
      .select("id, candidate_start, candidate_end")
      .eq("event_room_id", eventId)
      .order("candidate_start");
    assert(cands.length >= 2, `need >=2 candidates, got ${cands.length}`);

    // Make Alice busy over the EARLIEST candidate only.
    await seedBusy(a.id, [
      { start: cands[0].candidate_start, end: cands[0].candidate_end },
    ]);

    // Run as service role (auth.uid() null) — the cron/trigger path.
    const sched = await admin.rpc("run_smart_scheduling", {
      p_event_room_id: eventId,
    });
    assert(!sched.error, `scheduling error: ${sched.error?.message}`);
    assert(sched.data.success === true, `not successful: ${JSON.stringify(sched.data)}`);
    assert(
      sched.data.available_count === 3,
      `expected winner available=3, got ${sched.data.available_count}`
    );

    const { data: room } = await admin
      .from("event_rooms")
      .select("starts_at, scheduling_status")
      .eq("id", eventId)
      .single();
    assert(room.scheduling_status === "scheduled", `status ${room.scheduling_status}`);
    assert(
      room.starts_at !== cands[0].candidate_start,
      "picked the slot Alice was busy for"
    );

    // The "best time found" system message was inserted (the auth.uid() fix).
    const { data: msgs } = await admin
      .from("event_messages")
      .select("content")
      .eq("event_room_id", eventId)
      .ilike("content", "%best time%");
    assert(msgs.length >= 1, "no 'best time found' system message");
  });
}
