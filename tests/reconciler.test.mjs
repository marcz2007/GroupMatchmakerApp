// Reconciler (find_ready_smart_events) + smart-scheduling edge cases.
import {
  admin,
  createTestUser,
  setConnected,
  enroll,
  test,
  assert,
  trackEvent,
  iso,
  daysFromNow,
} from "./harness.mjs";

async function smartEvent(creator, { minSynced = null } = {}) {
  const res = await creator.client.rpc("create_smart_event", {
    p_title: "Reconciler test",
    p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
    p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
    p_scheduling_deadline: iso(daysFromNow(1)),
    p_slots: [
      { day_of_week: 1, start_time: "18:00", duration_minutes: 60 },
      { day_of_week: 4, start_time: "18:00", duration_minutes: 60 },
    ],
    p_min_synced_users: minSynced,
    p_timezone: "UTC",
  });
  assert(!res.error, `create_smart_event: ${res.error?.message}`);
  trackEvent(res.data.event_room_id);
  return res.data.event_room_id;
}

export async function run() {
  console.log("\nReconciler & edge cases:");

  // No synced participants → pick the earliest candidate, don't crash.
  await test("run_smart_scheduling with nobody synced picks the earliest slot", async () => {
    const host = await createTestUser("Host");
    const eventId = await smartEvent(host);

    const { data: cands } = await admin
      .from("scheduling_candidate_times")
      .select("candidate_start")
      .eq("event_room_id", eventId)
      .order("candidate_start");
    assert(cands.length >= 1, "no candidates");

    const sched = await admin.rpc("run_smart_scheduling", { p_event_room_id: eventId });
    assert(!sched.error && sched.data.success, `sched: ${JSON.stringify(sched.error ?? sched.data)}`);

    const { data: room } = await admin
      .from("event_rooms")
      .select("starts_at, scheduling_status")
      .eq("id", eventId)
      .single();
    assert(room.scheduling_status === "scheduled", `status ${room.scheduling_status}`);
    assert(room.starts_at === cands[0].candidate_start, "did not pick the earliest candidate");
  });

  // Reconciler picks up a deadline-passed event (the cron backstop path).
  await test("find_ready_smart_events returns a deadline-passed event", async () => {
    const host = await createTestUser("Host");
    const eventId = await smartEvent(host);
    await admin
      .from("event_rooms")
      .update({ scheduling_deadline: iso(daysFromNow(-1)) })
      .eq("id", eventId);

    const { data: ready, error } = await admin.rpc("find_ready_smart_events");
    assert(!error, `rpc error: ${error?.message}`);
    assert(
      ready.some((r) => r.event_room_id === eventId),
      "deadline-passed event not returned by reconciler"
    );
  });

  // Min-synced reached → either the reconciler lists it, or the trigger has
  // already finalized it (the async pg_net path). Both are correct.
  await test("min_synced-reached event is recognised as ready (reconciler or trigger)", async () => {
    const host = await createTestUser("Host");
    const u = await createTestUser("Solo");
    const eventId = await smartEvent(host, { minSynced: 1 });
    await setConnected(u.id);
    await enroll(eventId, u.id); // 1 synced >= min_synced(1)

    const { data: ready } = await admin.rpc("find_ready_smart_events");
    const { data: room } = await admin
      .from("event_rooms")
      .select("scheduling_status")
      .eq("id", eventId)
      .single();
    assert(
      ready.some((r) => r.event_room_id === eventId) ||
        room.scheduling_status === "scheduled",
      `not recognised as ready (status ${room.scheduling_status})`
    );
  });

  // The auto-enroll trigger records a sync when a connected user joins.
  await test("auto-enroll trigger syncs a connected participant", async () => {
    const host = await createTestUser("Host");
    const u = await createTestUser("Joiner");
    const eventId = await smartEvent(host);
    await setConnected(u.id);

    // Raw participant insert (not the enroll helper) so we observe the trigger.
    const { error } = await admin
      .from("event_room_participants")
      .insert({ event_room_id: eventId, user_id: u.id });
    assert(!error, `participant insert: ${error?.message}`);

    const { data: sync } = await admin
      .from("scheduling_calendar_syncs")
      .select("user_id")
      .eq("event_room_id", eventId)
      .eq("user_id", u.id)
      .maybeSingle();
    assert(sync, "auto-enroll trigger did not create a sync row");
  });
}
