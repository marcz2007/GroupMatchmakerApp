// Remove the seeded event (+ its host) and the guest created by the flow.
// Usage: node maestro/cleanup.mjs <eventId> <guestEmail>
import { admin } from "../tests/harness.mjs";

const [eventId, email] = process.argv.slice(2);

async function deleteUser(id) {
  if (!id) return;
  await admin.from("calendar_busy_times").delete().eq("user_id", id);
  await admin.from("profiles").delete().eq("id", id);
  await admin.auth.admin.deleteUser(id).catch(() => {});
}

if (eventId) {
  const { data: ev } = await admin
    .from("event_rooms")
    .select("created_by")
    .eq("id", eventId)
    .maybeSingle();
  await admin.from("event_rooms").delete().eq("id", eventId); // cascades children
  await deleteUser(ev?.created_by);
}

if (email) {
  const { data: g } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  await deleteUser(g?.id);
}

console.error("Maestro cleanup done");
process.exit(0);
