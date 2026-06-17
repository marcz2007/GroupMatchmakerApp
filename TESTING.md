# Grapple — testing plan

Two goals:
1. **Manual test scenarios** — every event flow, step by step, with expected results.
2. **A testing system** — so we (and Claude) can run tests and *know* the code
   works, without the pain of creating users, emails, passwords, and emulators
   by hand.

The key insight: **~90% of the logic lives in the database (RPCs, triggers,
crons) and edge functions.** That layer needs no UI, no emulator, no real
email, and no Google consent screen — we can create synthetic users via the
admin API and *seed* calendar availability directly. So most testing is fast
and headless. Only the actual visual UI + the real Google OAuth handshake need
heavier tooling.

---

## Quick manual testing — `yarn sim`

Spin up users + events to poke at in the real app, with **no inboxes and no new
passwords**. Every test user shares one password (`Test123456!`) and a
predictable email (`name@grapple.test`), and they're pre-confirmed — so you just
type them into the app's normal login.

```bash
yarn sim users alice bob cara      # create them (all password Test123456!)
yarn sim event smart alice         # smart event owned by alice → prints share link
yarn sim event poll alice          # or a poll event
yarn sim sync bob <eventId>        # fake-sync bob's calendar (busy times) — no Google
yarn sim list                      # all test users + their events + links
yarn sim clean                     # delete ALL @grapple.test test data
```

**Log into the app:** email `alice@grapple.test`, password `Test123456!` (works
on web and the mobile dev build; email/password also works in Expo Go — only
Google sign-in needs the dev build).

**Common loops:**
- *Link → RSVP:* `yarn sim event smart alice` → open the printed link → RSVP as
  a guest, or open an **incognito window** logged in as `bob@grapple.test` to be
  a second person. Separate/incognito windows = multiple people at once.
- *"Find when everyone's free" without Google:* `yarn sim users alice bob cara`
  → `yarn sim event smart alice` → `yarn sim sync alice <id>` / `bob` / `cara`.
  Once enough sync, it auto-schedules and the picked time shows on the event.
- *Real in-app "Sync my calendar" button (no Google):* open the event link with
  `?test_calendar=1` appended, then tick the sync box — hits the TEST_MODE
  bypass (on for the dev project, off in prod).
- *Reset:* `yarn sim clean` wipes every `@grapple.test` user + their events.

---

## Part 1 — Manual test scenarios

Legend: **Setup → Steps → Expect**. "Organiser" = the person creating the
event; "Recipient" = someone opening a shared link.

### 1. Propose a group proposal (vote-window style)
- Setup: organiser is in a group with ≥2 members.
- Steps: Propose → enter idea → add date/time/location (optional) → pick
  group(s) → Launch.
- Expect: a proposal appears in each selected group; a shared event room is
  created; vote window + threshold (default 33% of group) set; confetti/success.

### 2. Direct event + share link
- Steps: Propose → create a direct event (no group) → Share invite link.
- Expect: link `https://grappleapp.co.uk/event/<id>`; opening it shows the
  public event page with title, organiser, participant count.

### 3. Smart-scheduling event (availability-based)
- Steps: Propose → toggle Smart scheduling → set date range, weekly slot(s)
  (day + time + duration), deadline, optional "min synced users" → Create.
- Expect: event in `collecting` status; candidate times generated for each
  slot occurrence in range; **stored at the correct UTC instant for the
  creator's timezone** (e.g. 6pm BST → 17:00Z).

### 4. Poll event (time-based voting)
- Steps: Propose → toggle Poll → add ≥2 datetime options, deadline, optional
  "min votes" → Create.
- Expect: event in `collecting`; one candidate per option; share link works.

### 5. Recipient — brand-new user, web link
- Setup: a smart or poll event link; recipient has never used Grapple.
- Steps: open link → enter name + email → (smart: tick "sync calendar";
  poll: submit then vote) → submit.
- Expect: a guest profile is created (is_guest=true, email on auth user);
  participant added; for smart with sync → redirected to Google consent, then
  back with `?calendar_connected=true` and counted; for poll → can vote.

### 6. Recipient — returning user, web link (same email)
- Setup: recipient RSVP'd to a past event with the same email (so a profile
  exists, calendar already connected).
- Steps: open a new event link → form is pre-filled → submit.
- Expect: existing profile reused; **no Google round-trip** ("already synced");
  availability auto-counted via the auto-enroll trigger.

### 7. Recipient — returning user, new device (reclaim)
- Steps: on a fresh browser, open login → "Email me a sign-in link" → click
  the emailed link.
- Expect: signed into the *existing* profile (incl. guest accounts created via
  web RSVP), lands on /groups.

### 8. Recipient — phone with app installed (deep link)
- Steps: open the link on a phone that has the dev/prod build installed.
- Expect (once App Links / Universal Links are switched on): the app opens
  directly to the event. Until then: the web page shows an "Open in the Grapple
  app" banner; tapping it opens the app.

### 9. Poll voting + finalization
- Steps: ≥2 recipients RSVP and vote YES/NO on options; reach `min_votes` OR
  let the deadline pass.
- Expect: `finalize_poll_event` picks the option with most YES (ties → earliest);
  `starts_at` set; "poll closed" system message; status `scheduled`.

### 10. Smart finalization
- Steps: enough participants sync to hit `min_synced_users` (or all synced, or
  deadline passes).
- Expect: `run_smart_scheduling` picks the slot with the **most synced users
  free** (interval intersection), ranked most-available → fewest-conflicts →
  earliest; `starts_at`/`ends_at` set; "best time found — X of Y free" message;
  status `scheduled`.

### 11. Reschedule
- Steps: organiser picks a different candidate from a scheduled smart event.
- Expect: `starts_at` updates; system message; only the organiser/participant
  can do it.

### Negative / edge cases (the ones that have bitten us)
- **Private calendar events count as busy** — seed a user with a "private"
  event over a slot; that slot must NOT be chosen.
- **Timezone** — a BST creator's 6pm slot must surface as 6pm locally, 17:00Z
  stored.
- **Duplicate RSVP** — same email twice → reused, not duplicated.
- **Returning user, different typed email** — Google identity should still
  re-point to the canonical profile.
- **No one synced before deadline** — picks earliest conflict-free candidate;
  doesn't crash.
- **Finalization under cron/trigger** — runs as service role with `auth.uid()`
  null and must NOT crash (the bug we fixed).

---

## Part 2 — The testing system

Three layers, cheapest/fastest first.

### Layer 0 — Test environment (decide this first)
Tests must NOT run against production data. Options:
- **A dedicated test Supabase project** (free tier) — apply migrations with
  `supabase db push`, deploy functions, run tests, wipe freely. Most realistic;
  recommended.
- **`supabase start` (local)** — fully isolated, instant reset, free; needs
  Docker (not currently installed on this machine).
- Prod with strict create-then-delete discipline — fastest to start, riskiest;
  only for read-only or self-cleaning checks.

### Layer 1 — Headless integration tests (the workhorse)
A Node/TS script using `@supabase/supabase-js` with the **service-role key**.
This is what lets Claude "run a test and know it works." No UI, no emails, no
OAuth.

**Test-user factory** (kills the "creating users is slow" pain):
```
createTestUser()   → supabase.auth.admin.createUser({
                       email: `t+${uuid}@grapple.test`,   // no real inbox
                       email_confirm: true,               // skip confirmation
                       password, user_metadata: { first_name }})
asUser(user)       → a client signed in as that user (for RLS-respecting calls)
createTestGroup(owner, members)
seedAvailability(userId, busyIntervals)  → flip calendar_connected=true,
                       insert scheduling_calendar_syncs + calendar_busy_times
                       — bypasses Google OAuth entirely
trackForCleanup(id); cleanupAll() → admin.deleteUser(id) (cascades)
```

**What it tests** (the scenarios above, as code): create_smart_event /
create_poll_event, web-rsvp guest creation + reuse, cast_poll_vote,
finalize_poll_event, run_smart_scheduling (incl. the private-event-busy and
timezone assertions), link_google_identity re-point, find_ready_smart_events.

**Example (smart scheduling, fully deterministic):**
```
3 users; seed user A busy over slot1, user B free, user C free.
create_smart_event with slot1 + slot2; enroll all three.
run_smart_scheduling → assert it picks slot2 (where 3/3 free), not slot1.
```
Runs in seconds, no emulator, repeatable. `npm run test:integration`.

> Email/magic-link tests don't need a real inbox either:
> `auth.admin.generateLink({ type: 'magiclink', email })` returns the link
> programmatically; assert/redeem it directly. (Locally, Supabase's Inbucket /
> Mailpit catches all mail.)

### Layer 2 — Web E2E (what a real user faces)
**Playwright** driving the actual Next.js site: open an event link → guest RSVP
form → vote → see the scheduled result → magic-link login. Runs headless in CI,
one command, no manual clicking.

The one hard part is **Google Calendar OAuth** (Google blocks automated consent).
Handle it one of three ways, in order of preference:
1. **Seed the synced state** — the E2E sets up the user as already-connected
   (Layer-1 `seedAvailability`) and asserts the post-sync UX, skipping the
   Google screen.
2. **A `TEST_MODE` calendar bypass** — an env-gated path in
   `google-calendar-auth` that, in test, marks the user synced + seeds dummy
   busy-times instead of redirecting to Google. Lets E2E click the real "sync"
   button end-to-end.
3. Real Google test accounts (fragile) — reserve for occasional manual checks.

### Layer 3 — Mobile E2E (lightest touch)
Mobile UI is the most painful to automate, so lean on it least — Layers 1–2
already cover the logic and the web flow. For the mobile-specific bits
(deep-link → GuestEntry → RSVP/vote, safe-area, navigation), use **Maestro**
(simpler YAML flows than Detox) on **one** emulator. The deep link can be fired
with `adb shell am start -a android.intent.action.VIEW -d "grappleapp.co.uk/event/<id>"`.

### How this kills the stated pains
| Pain | Solution |
|---|---|
| Creating new users is slow | `admin.createUser` factory — instant, in code |
| Opening many emulators | Backend + web layers need zero; mobile uses one emulator |
| New emails/passwords | Synthetic `@grapple.test` + `email_confirm:true`; shared password |
| Real inboxes for magic links | `admin.generateLink` / Inbucket — no inbox needed |
| Google consent screen | Seed availability or `TEST_MODE` bypass |
| Knowing it actually works | Layer 1 asserts DB/RPC state; Layer 2 asserts real UX |

---

## Part 3 — Status & how to run

**Layer 1 is built** (`tests/`), running against the dev project, self-cleaning:
```
yarn test:integration
```
(pulls the dev project's keys from the linked Supabase CLI; override
`SUPABASE_PROJECT_REF` / `SUPABASE_*` env vars to point at another project.)

Files:
- `tests/harness.mjs` — user factory (`createTestUser`), `setConnected`,
  `enroll`, `seedBusy`, tiny test/assert runner, `cleanup`.
- `tests/smart.test.mjs` — timezone anchoring; "most people free" pick;
  finalization via the service-role (cron) path; system-message insert.
- `tests/poll.test.mjs` — non-creator deciding vote auto-finalizes; most-YES
  wins; non-creator can't force-finalize early.
- `tests/run.mjs` / `tests/run.sh` — runner.

> This suite already caught a real bug: a non-creator's deciding poll vote
> threw "Only the event creator can finalize this poll" (the min-votes trigger
> ran finalize in the voter's auth context). Fixed in
> `20260617000001_poll_finalize_auth_fix.sql` (internal finalize for the
> trigger/cron; creator guard kept on the public RPC).

**Layer 2 is built** (`e2e/`) — Playwright against the **deployed site**:
```
yarn test:e2e          # default BASE_URL=https://grappleapp.co.uk
BASE_URL=http://localhost:3000 yarn test:e2e   # against a local `yarn web`
```
Events are seeded into the same Supabase via the integration harness, then
driven through a real browser; browser-created guests are cleaned up.
`e2e/public-event.spec.mjs` covers: new guest RSVP to a smart event (calendar
sync unchecked, so no Google redirect); new guest RSVP + poll vote → "Thanks
for voting!"; mobile visitor sees the "Open in the Grapple app" banner.

> Calendar-sync-through-the-browser still needs the Google step handled — add
> an env-gated `TEST_MODE` bypass in `google-calendar-auth` (mark synced + seed
> dummy busy-times instead of redirecting) to E2E the real "sync" button.

**Layer 3 is set up** (`maestro/`) — mobile deep-link guest flow:
```
yarn test:mobile        # seeds an event, runs the flow, cleans up
```
Files: `guest-rsvp.yaml` (deep link → guest form → sync off → submit → left the
screen), `smoke.yaml` (boots + screenshots), `seed-event.mjs` / `cleanup.mjs`,
`run.sh`. GuestEntry inputs got `testID`s (`guest-first-name`, `guest-email`)
for reliable selection.

> Running it needs **your** device: a booted Android emulator
> (`emulator -avd Pixel_7_API_34`) or a phone on adb, **with the Grapple
> dev/prod build installed**, and `maestro` on PATH (`~/.maestro/bin`). The
> seed/cleanup scripts are verified; the Maestro flow can't run headless here.

**Remaining:**
- Point the web E2E at a Vercel **preview deploy** (or local `yarn web`) so
  page-code tests don't lag the production deploy.
- Move tests to a dedicated test project once there's real data
  (`SUPABASE_PROJECT_REF`).
