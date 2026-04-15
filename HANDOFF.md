# Overnight Session Handoff

Summary of what was done overnight and the manual steps you need to take
before this branch (`claude/plan-app-website-split-2IRQs`) can ship.

## What was built

7 commits on top of the branch's previous state:

| Commit   | What                                                                |
| -------- | ------------------------------------------------------------------- |
| 3f63d19  | min-synced early-finalization path for smart scheduling (SQL + web UI + shared service) |
| 5d88cc6  | mobile `PollVotingBanner` wired into `EventDetailScreen` + `EventRoomScreen` |
| 286ab4b  | mobile `PollSetupScreen` + mutually-exclusive poll toggle in `ProposeScreen` |
| d2e0954  | mobile `NotificationsInboxScreen` + header `NotificationsBell`      |
| df480d4  | simplify-skill perf + cleanup pass (SQL perf migration, edge-function concurrency, reuse) |
| de4eaef  | fix: poll-perf trigger calls `finalize_poll_event` directly (was hitting a non-existent edge function) |
| 64daa57  | security-review fixes: guest-email impersonation, service-role leak, finalize/status auth, RPC bounds |

## Manual steps required before this ships

### 1. Apply the new migrations to Supabase

Three new migrations were added this session:

```
supabase/migrations/20260415000003_smart_min_synced.sql
supabase/migrations/20260415000004_poll_perf.sql
supabase/migrations/20260415000005_security_fixes.sql
```

You'll want to either run them via `supabase db push` against your project,
or apply them through the Supabase SQL editor in order (003, 004, 005).
They're all idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`) and touch
only scheduling/poll functions plus one partial index plus the REVOKE on
the credential-leaking helpers.

**Migration 005 is a security fix and should be applied ASAP** — see
section "Security review findings" below.

Migration 003 assumes `get_supabase_url()` and `get_service_role_key()`
already exist — they do, from `20260310000001_smart_scheduling_automation.sql`.
If `app.settings.service_role_key` isn't set on your project, the
`check_all_synced_and_schedule` trigger will fail silently when an event
has `min_synced_users` set. See section 3.

### 2. Deploy updated edge functions

Four edge functions were modified this session and need redeploying:

```
supabase functions deploy web-poll-vote         # perf + C1 security fix
supabase functions deploy web-rsvp              # C1 security fix
supabase functions deploy get-public-event      # perf
supabase functions deploy send-pending-notifications  # perf
```

No new edge functions were added. `send-pending-notifications` is the one
from the previous session (577c75c); I did not add a new function here.

**`web-rsvp` and `web-poll-vote` are the CRITICAL security redeploys** —
without them, the database migration alone doesn't close the guest-email
impersonation hole.

### 3. Secrets / env vars to set

Only one new env var is gated on this branch:

- **`RESEND_API_KEY`** on the `send-pending-notifications` function. If you
  want email delivery for finalized-event notifications to work. If unset,
  the function logs and marks notifications as "sent" without delivering —
  a safe no-op, but you'll get no emails.
  - Optional: `RESEND_FROM_ADDRESS` (default: `Grapple <notify@grapple.app>`).
    You'll need to verify the sending domain in Resend.
- Verify `app.settings.service_role_key` is set at the database level (for
  `get_service_role_key()`). Only needed if you use smart scheduling with
  `min_synced_users` set on an event_room — the trigger uses pg_net to call
  `run-smart-scheduling`.

### 4. Cron for `send-pending-notifications`

This function reads notifications with `email_sent_at IS NULL` and sends
them via Resend. It is **not** on a schedule yet. To actually deliver
finalized-event emails, add a Supabase cron job (Edge Functions → Cron):

- Every minute: `POST /functions/v1/send-pending-notifications` with body
  `{"limit": 50}`.
- The function is idempotent; duplicate invocations race-safely mark rows
  as sent. Concurrent invocations are not great (Resend duplicates are
  possible). One cron every 60s is fine.

### 5. Things I could NOT do (you need credentials)

- **Run the migrations against the real project.** Done locally via
  `supabase db push --local` if you want, but I did not touch your hosted
  DB.
- **Deploy edge functions.** Same — I don't have `supabase login` creds.
- **Verify the Resend domain** and create the API key.
- **Push this branch.** I committed but haven't pushed. When you're happy:
  `git push -u origin claude/plan-app-website-split-2IRQs`.

## Security review findings

After the simplify-skill pass I ran the `security-review` skill over the
full session diff. Everything CRITICAL / HIGH is fixed on this branch;
MEDIUM/LOW items are listed as follow-ups.

### Fixed in commit 64daa57

- **C1 (CRITICAL) — guest-email impersonation.** `web-rsvp` and
  `web-poll-vote` looked up profiles by plaintext email with no guest
  check, so anyone who knew a real account's email could RSVP and vote
  as that user via the public event page. Both now only reuse profiles
  flagged `is_guest=true`. `web-rsvp` returns `409` when the email
  belongs to a real account; `web-poll-vote` refuses to resolve the id.
- **C2 (CRITICAL) — service role key exfiltration via PostgREST.**
  `get_service_role_key()` and `get_supabase_url()` are SECURITY DEFINER
  wrappers around vault secrets. Postgres grants EXECUTE to PUBLIC by
  default on new functions, so any authenticated user (and anon, via
  PostgREST's `/rpc/`) could just call them and read the service role
  key. Migration 005 revokes EXECUTE from PUBLIC/anon/authenticated.
  Only the definer context (pg_net triggers) can still call them.
- **H2 (HIGH) — `finalize_poll_event` had no authorization.** Any
  authenticated user could finalize any event by calling the RPC,
  skipping the min-votes check. Now asserts
  `auth.uid() = created_by` (or NULL, for trigger contexts).
- **H2b (HIGH) — non-atomic finalize race.** The min-votes trigger could
  fire twice in rapid succession and both invocations would re-pick a
  winner and re-post the system message. Now uses an atomic
  `collecting->scheduled` UPDATE with a ROW_COUNT guard.
- **H3 (HIGH) — `get_poll_status` leaked to any authenticated user.**
  Returned every event's candidate list and vote tallies. Now requires
  `auth.uid()` and participant membership. Public guest reads still go
  via the `get-public-event` edge function which runs with service role.
- **M3 (MEDIUM) — `create_smart_event` / `create_poll_event` bounds.**
  Added defence-in-depth input validation: title ≤200 chars, date range
  ≤90 days, slot duration 15–1440 min, `min_synced_users` / `min_votes`
  ≥ 1, deadline in the future, ≤20 poll options, each option in the
  future with `end > start` and ≤24h duration.

### Open security follow-ups (flagged but not fixed)

- **M1 — `send-pending-notifications` has no auth on its HTTP endpoint.**
  Anyone can POST to it and trigger Resend sends (rate-limited by
  Resend, but potentially expensive). Before putting it on cron, either
  (a) set it to `--no-verify-jwt=false` and have the cron use the
  service role JWT, or (b) require a shared-secret header checked
  against a Supabase secret.
- **M2 — `get-public-event` returns participant display_names to
  anonymous callers.** Intentional (the public event page shows "5
  people are in"), but confirm you're OK with display names leaking to
  anyone with the event URL. If not, either return `participant_count`
  only, or gate the names behind "you're also a participant".
- **L1 — Guest profiles get a real `email` column value.** If the same
  email is reused across events, the same guest profile is reused
  (intentional for UX), which means the account is pseudo-persistent
  without the email-owner's consent. Consider a `guest_sessions` table
  keyed on a random cookie instead of trusting email-as-identity.
- **L2 — Mobile `NotificationsBell` + web banner both poll a SECURITY
  DEFINER RPC.** Not a security bug, but worth noting: both paths call
  `get_poll_status` frequently. With the new participant check the call
  is cheap for non-participants (short-circuits) but does a table scan.
  The partial index from 004 covers the hot path.
- **L3 — `_shared/cors.ts` allows `*` origin.** Standard for public
  edge functions but worth a second look if any of them start returning
  sensitive data.
- **L4 — `poll_votes` UNIQUE is on `(candidate_time_id, user_id)`** —
  correct, but if the schema ever adds a "change your mind" flow,
  remember that upsert silently overwrites the previous vote (desired).
- **L5 — No rate limiting on `web-rsvp` or `web-poll-vote`.** An
  attacker could mass-create guest accounts or spam votes. Consider
  Supabase edge rate limits or a simple IP-based check in the function.
- **L6 — `get-public-event` accepts either `event_id` or a
  `share_token` query param.** The share token doesn't expire. If that
  becomes a concern, add an `expires_at` to `event_shares` and check it.

## Notable design decisions / things to double-check

### `scheduling_mode` union now includes `"poll"`
`packages/shared/src/services/eventRoomService.ts` widened the
`EventRoom.scheduling_mode` union to `"fixed" | "smart" | "poll"`. Any
consumer that `switch`'d on this field may now need a default case. I
grepped and fixed the ones I found.

### `check_poll_min_votes_reached` now hot-path-scoped
Before, the trigger ran a full-event `COUNT(*) GROUP BY candidate_time_id`
for every single vote and picked the max. Now it counts only the single
candidate that was voted on, and short-circuits on NO votes and unchanged
UPDATEs. I also added a partial index
`idx_poll_votes_yes_by_event (event_room_id, candidate_time_id) WHERE vote='YES'`
that covers the scan. Should be a meaningful reduction in vote-path latency
once you have any real volume.

### Mobile `NotificationsBell` is realtime-only
I removed the 60s polling fallback that was fighting the realtime
subscription. If you find realtime drops a message on real devices, add
back an `AppState.addEventListener('change', ...)` that refetches on
foreground — that's the correct fix, not blind polling.

### `PollVotingBanner` still polls every 30s while `collecting`
Unlike the bell, the banner polls because (a) the realtime channel for
`poll_votes` isn't subscribed here — the banner just reads the status RPC,
and (b) it needs to pick up other participants' votes. A deep-equal guard
prevents re-render storms when the server returns the same status.

### `PollSetupScreen` is a partial fork of `SmartScheduleSetupScreen`
The code-reuse review (simplify skill) flagged this. The two screens share
~500 lines of picker-modal / success-state / StyleSheet / share-button
logic. I did not refactor — that's a multi-hour job and it would have
eaten into time on the functional work you actually asked for. Flagged as
follow-up: extract `components/propose/EventSetupScaffold.tsx`.

### Shared utilities added
`packages/shared/src/utils.ts` gained `formatDuration`, `formatTime12`,
`formatPollOptionTime`. Only `formatPollOptionTime` is used so far
(PollVotingBanner); the other two are there for the PollSetup/SmartSetup
refactor above. Feel free to delete if that refactor doesn't happen.

## Known issues / follow-ups the review agents flagged

In rough priority order (details in commit message of `df480d4`):

1. **[done]** Mobile `NotificationsBell` 60s polling vs realtime
2. **[done]** `PollVotingBanner` no-op re-renders
3. **[done]** `web-poll-vote` sequential Supabase calls
4. **[done]** `send-pending-notifications` sequential Resend sends
5. **[done]** `get-public-event` sequential Supabase calls
6. **[done]** Hot-path poll SQL (trigger / RPC / index)
7. **[done]** Web `NotificationsBell` hand-rolled relative-time formatter
8. **[follow-up]** `PollSetupScreen` / `SmartScheduleSetupScreen` share a ton of code
9. **[follow-up]** `create_poll_event` / `create_smart_event` duplicate the
   event-room insert + participant-add logic; extract a `_create_scheduling_event_room(...)` helper
10. **[follow-up]** Three different UTC date formats across finalize
    triggers/RPCs — extract a `format_event_time_utc(t)` SQL helper
11. **[follow-up]** `get_poll_status` requires auth.uid() to be a
    participant. `get-public-event` therefore hand-rolls the poll option
    aggregation in TS. A `get_public_poll_status(event_room_id)` RPC would
    collapse ~40 lines of edge-function TS into one RPC call.

## Files touched this session

```
packages/shared/src/index.ts
packages/shared/src/services/eventRoomService.ts
packages/shared/src/services/schedulingService.ts
packages/shared/src/utils.ts
packages/web/src/app/(dashboard)/events/new/page.tsx
packages/web/src/components/NotificationsBell.tsx
src/components/NotificationsBell.tsx                    (new)
src/components/PollVotingBanner.tsx                     (new)
src/navigation/AppNavigator.tsx
src/screens/EventDetailScreen.tsx
src/screens/EventRoomScreen.tsx
src/screens/EventsListScreen.tsx
src/screens/NotificationsInboxScreen.tsx                (new)
src/screens/PollSetupScreen.tsx                         (new)
src/screens/ProposeScreen.tsx
supabase/functions/get-public-event/index.ts
supabase/functions/send-pending-notifications/index.ts
supabase/functions/web-poll-vote/index.ts
supabase/functions/web-rsvp/index.ts
supabase/migrations/20260415000003_smart_min_synced.sql (new)
supabase/migrations/20260415000004_poll_perf.sql        (new)
supabase/migrations/20260415000005_security_fixes.sql  (new)
```
