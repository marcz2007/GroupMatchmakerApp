// Poll (time-based voting) scenarios.
import {
  admin,
  createTestUser,
  addParticipant,
  test,
  assert,
  trackEvent,
  iso,
  daysFromNow,
} from "./harness.mjs";

async function createPoll(creator, minVotes) {
  const o1s = daysFromNow(3);
  const o1e = new Date(o1s.getTime() + 3600_000);
  const o2s = daysFromNow(4);
  const o2e = new Date(o2s.getTime() + 3600_000);
  const res = await creator.client.rpc("create_poll_event", {
    p_title: "Dinner poll",
    p_description: null,
    p_scheduling_deadline: iso(daysFromNow(1)),
    p_min_votes: minVotes,
    p_options: [
      { starts_at: iso(o1s), ends_at: iso(o1e) },
      { starts_at: iso(o2s), ends_at: iso(o2e) },
    ],
  });
  assert(!res.error, `create_poll_event error: ${res.error?.message}`);
  const eventId = res.data.event_room_id;
  trackEvent(eventId);
  const { data: cands } = await admin
    .from("scheduling_candidate_times")
    .select("id, candidate_start")
    .eq("event_room_id", eventId)
    .order("candidate_start");
  assert(cands.length === 2, `expected 2 options, got ${cands.length}`);
  return { eventId, cands };
}

const vote = (voter, eventId, candidateId, v) =>
  voter.client.rpc("cast_poll_vote", {
    p_event_room_id: eventId,
    p_candidate_time_id: candidateId,
    p_vote: v,
  });

export async function run() {
  console.log("\nPoll voting:");

  // The bug the harness caught: a NON-creator casting the deciding vote must
  // auto-finalize without "Only the event creator can finalize this poll".
  await test("non-creator's deciding vote auto-finalizes (min_votes=1)", async () => {
    const a = await createTestUser("Alice");
    const b = await createTestUser("Bob");
    const { eventId, cands } = await createPoll(a, 1);
    await addParticipant(eventId, b.id);

    const v = await vote(b, eventId, cands[0].id, "YES"); // Bob is not creator
    assert(!v.error, `deciding vote failed: ${v.error?.message}`);

    const { data: room } = await admin
      .from("event_rooms")
      .select("starts_at, scheduling_status")
      .eq("id", eventId)
      .single();
    assert(room.scheduling_status === "scheduled", `status ${room.scheduling_status}`);
    assert(room.starts_at === cands[0].candidate_start, "wrong winning slot");
  });

  // Manual finalize picks the option with the most YES votes.
  await test("finalize picks the most-YES option", async () => {
    const a = await createTestUser("Alice");
    const b = await createTestUser("Bob");
    const c = await createTestUser("Cara");
    const { eventId, cands } = await createPoll(a, null); // no auto-finalize
    await addParticipant(eventId, b.id);
    await addParticipant(eventId, c.id);

    // option1: Bob + Cara (2 YES); option2: Bob only (1 YES)
    assert(!(await vote(b, eventId, cands[0].id, "YES")).error, "b opt1");
    assert(!(await vote(c, eventId, cands[0].id, "YES")).error, "c opt1");
    assert(!(await vote(b, eventId, cands[1].id, "YES")).error, "b opt2");

    const fin = await a.client.rpc("finalize_poll_event", {
      p_event_room_id: eventId,
    });
    assert(!fin.error, `finalize error: ${fin.error?.message}`);

    const { data: room } = await admin
      .from("event_rooms")
      .select("starts_at, scheduling_status")
      .eq("id", eventId)
      .single();
    assert(room.scheduling_status === "scheduled", `status ${room.scheduling_status}`);
    assert(
      room.starts_at === cands[0].candidate_start,
      `expected option1 to win, got ${room.starts_at}`
    );
  });

  // A non-creator must NOT be able to force-finalize early via the public RPC.
  await test("non-creator cannot force-finalize early via public RPC", async () => {
    const a = await createTestUser("Alice");
    const b = await createTestUser("Bob");
    const { eventId } = await createPoll(a, null);
    await addParticipant(eventId, b.id);
    const fin = await b.client.rpc("finalize_poll_event", {
      p_event_room_id: eventId,
    });
    assert(
      fin.error && /creator/i.test(fin.error.message),
      `expected creator-only rejection, got ${JSON.stringify(fin.data ?? fin.error)}`
    );
  });
}
