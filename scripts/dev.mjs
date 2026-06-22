// Dev helper: spin up persistent test users + events fast, with NO new emails
// or passwords to manage. Every user uses one shared password and a predictable
// email, so you just type them into the app's normal login.
//
//   bash scripts/dev.sh users alice bob cara     # create/ensure users
//   bash scripts/dev.sh event smart alice        # smart event owned by alice → share link
//   bash scripts/dev.sh event poll alice         # poll event → share link
//   bash scripts/dev.sh sync bob <eventId>       # fake-sync bob's calendar for an event (no Google)
//   bash scripts/dev.sh list                      # list test users + events
//   bash scripts/dev.sh clean                     # delete ALL @grapple.test test data
//
// (or `yarn sim <args>`)
import { admin, iso, daysFromNow } from "../tests/harness.mjs";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const WEB = process.env.WEB_APP_URL || "https://grappleapp.co.uk";
const PASSWORD = "Test123456!";
const emailFor = (name) => `${String(name).toLowerCase()}@grapple.test`;

async function ensureUser(name) {
  const email = emailFor(name);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: name[0].toUpperCase() + name.slice(1) },
  });
  let id, existed;
  if (error) {
    const { data: prof } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!prof?.id) throw new Error(`ensureUser ${email}: ${error.message}`);
    id = prof.id;
    existed = true;
  } else {
    id = data.user.id;
    existed = false;
  }

  // Sim/test users are "verified" so they get full app access (create events,
  // groups, etc.) without going through the email-verification flow.
  await admin
    .from("profiles")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", id)
    .is("email_verified_at", null);

  return { id, email, existed };
}

async function userClient(email) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function cmdUsers(names) {
  if (!names.length) names = ["alice", "bob", "cara"];
  console.log("\nTest users (password is the SAME for all):\n");
  for (const n of names) {
    const u = await ensureUser(n);
    console.log(`  ${u.email.padEnd(26)} ${PASSWORD}   ${u.existed ? "(existing)" : "(created)"}`);
  }
  console.log(`\nLog in at the app with any of those + password "${PASSWORD}".`);
}

async function cmdEvent(kind, ownerName) {
  const owner = await ensureUser(ownerName || "alice");
  const client = await userClient(owner.email);
  let res;
  if (kind === "poll") {
    const o1 = daysFromNow(3), o2 = daysFromNow(4);
    res = await client.rpc("create_poll_event", {
      p_title: "Dev poll event",
      p_description: null,
      p_scheduling_deadline: iso(daysFromNow(2)),
      p_min_votes: null,
      p_options: [
        { starts_at: iso(o1), ends_at: iso(new Date(o1.getTime() + 3600000)) },
        { starts_at: iso(o2), ends_at: iso(new Date(o2.getTime() + 3600000)) },
      ],
    });
  } else {
    res = await client.rpc("create_smart_event", {
      p_title: "Dev smart event",
      p_date_range_start: iso(daysFromNow(1)).slice(0, 10),
      p_date_range_end: iso(daysFromNow(11)).slice(0, 10),
      p_scheduling_deadline: iso(daysFromNow(2)),
      p_slots: [
        { day_of_week: 1, start_time: "18:00", duration_minutes: 60 },
        { day_of_week: 4, start_time: "18:00", duration_minutes: 60 },
      ],
      p_min_synced_users: null,
      p_timezone: "Europe/London",
    });
  }
  if (res.error) throw new Error(res.error.message);
  const id = res.data.event_room_id;
  console.log(`\n${kind} event created by ${owner.email}`);
  console.log(`  id:    ${id}`);
  console.log(`  link:  ${WEB}/event/${id}`);
  console.log(`\nShare that link, or open it in a browser to RSVP as a guest.`);
}

async function cmdSync(name, eventId) {
  if (!eventId) throw new Error("usage: sync <name> <eventId>");
  const u = await ensureUser(name);
  await admin
    .from("profiles")
    .update({ calendar_connected: true, calendar_provider: "google" })
    .eq("id", u.id);
  const start = daysFromNow(2); start.setHours(9, 0, 0, 0);
  const end = new Date(start); end.setHours(10, 0, 0, 0);
  await admin.from("calendar_busy_times").delete().eq("user_id", u.id);
  await admin.from("calendar_busy_times").insert([
    { user_id: u.id, start_time: start.toISOString(), end_time: end.toISOString(), fetched_at: new Date().toISOString() },
  ]);
  await admin.from("event_room_participants").upsert(
    { event_room_id: eventId, user_id: u.id },
    { onConflict: "event_room_id,user_id" }
  );
  await admin.from("scheduling_calendar_syncs").upsert(
    { event_room_id: eventId, user_id: u.id, calendar_provider: "google" },
    { onConflict: "event_room_id,user_id" }
  );
  console.log(`Fake-synced ${u.email} for event ${eventId} (no Google).`);
}

async function cmdList() {
  const { data: users } = await admin
    .from("profiles")
    .select("id, email, first_name")
    .like("email", "%@grapple.test")
    .order("email");
  console.log(`\n${(users || []).length} test users:`);
  for (const u of users || []) console.log(`  ${u.email}`);
  const ids = (users || []).map((u) => u.id);
  if (ids.length) {
    const { data: events } = await admin
      .from("event_rooms")
      .select("id, title, scheduling_mode, scheduling_status")
      .in("created_by", ids);
    console.log(`\n${(events || []).length} events they own:`);
    for (const e of events || [])
      console.log(`  ${e.id}  ${e.scheduling_mode}/${e.scheduling_status}  ${WEB}/event/${e.id}`);
  }
}

async function cmdClean() {
  const { data: users } = await admin
    .from("profiles")
    .select("id")
    .like("email", "%@grapple.test");
  const ids = (users || []).map((u) => u.id);
  if (ids.length) {
    await admin.from("event_rooms").delete().in("created_by", ids);
    for (const id of ids) {
      await admin.from("calendar_busy_times").delete().eq("user_id", id);
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  }
  console.log(`Removed ${ids.length} test users + their events.`);
}

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case "users": await cmdUsers(args); break;
    case "event": await cmdEvent(args[0], args[1]); break;
    case "sync": await cmdSync(args[0], args[1]); break;
    case "list": await cmdList(); break;
    case "clean": await cmdClean(); break;
    default:
      console.log("commands: users <names...> | event <smart|poll> <owner> | sync <name> <eventId> | list | clean");
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exit(1);
}
process.exit(0);
