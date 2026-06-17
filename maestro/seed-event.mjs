// Seed a smart event for the Maestro flow and print its id to stdout.
// (Logs go to stderr so stdout is just the id.)
import { admin, createTestUser, iso, daysFromNow } from "../tests/harness.mjs";

const host = await createTestUser("MaestroHost");
const res = await host.client.rpc("create_smart_event", {
  p_title: "Maestro test event",
  p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
  p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
  p_scheduling_deadline: iso(daysFromNow(1)),
  p_slots: [{ day_of_week: 1, start_time: "18:00", duration_minutes: 60 }],
  p_min_synced_users: null,
  p_timezone: "UTC",
});
if (res.error) {
  console.error("seed-event failed:", res.error.message);
  process.exit(1);
}
console.error(`Seeded event ${res.data.event_room_id} (host ${host.id})`);
process.stdout.write(res.data.event_room_id);
// don't hang on open handles
process.exit(0);
