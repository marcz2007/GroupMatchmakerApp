# Grapple — Running & Dev Setup

Practical guide for picking this project back up: what the app is, how to get
it onto your phone, and the commands that actually work for Expo Go and the
dev client.

---

## What the app is

**Grapple** is a group event matchmaking / scheduling app. People form groups,
propose plans, and the app helps the group converge on a time and place that
works for everyone — through polls and "smart scheduling" that reads calendar
availability and finalizes once enough people are synced.

### Core features

- **Groups** — create groups, invite/add members (`GroupsScreen`,
  `CreateGroupScreen`, `GroupDetailsScreen`, `AddUserToGroupScreen`).
- **Proposals** — propose a plan to a group (`ProposeScreen`,
  `CreateProposalScreen`).
- **Polls** — vote on options; a live voting banner surfaces open polls
  (`PollSetupScreen`, `PollVotingBanner`).
- **Smart scheduling** — calendar-aware scheduling that can auto-finalize once
  a minimum number of members are "synced" (`SmartScheduleSetupScreen`,
  `CalendarLinkScreen`).
- **Events** — event detail, rooms, and in-event chat (`EventsListScreen`,
  `EventDetailScreen`, `EventRoomScreen`, `EventChatScreen`).
- **RSVP & public event pages** — shareable public event links that guests can
  open and RSVP to without an account (`GuestEntryScreen`, `PublicProfileScreen`,
  web `/event/...`).
- **Notifications** — in-app inbox and header bell
  (`NotificationsInboxScreen`, `NotificationsBell`).
- **Profiles** — editable user profiles with photos (`EditProfileScreen`).

### Tech stack

- **Mobile:** Expo SDK 54 / React Native 0.81 (new architecture enabled),
  React Navigation, TanStack Query, Supabase.
- **Web:** Next.js 15 in `packages/web` (`@grapple/web`).
- **Shared logic:** `packages/shared` (`@grapple/shared`) — used by both mobile
  and web.
- **Backend:** Supabase (auth, Postgres, edge functions, migrations under
  `supabase/`).
- **Builds:** EAS (`eas.json`), project id `876034cd-48d2-4305-8754-741f1efd638f`,
  EAS account `marcz2007`.

> This is an Expo **dev-client** project (it uses native modules: Google
> Sign-In, Reanimated worklets, keyboard-controller, image-picker). That means
> **Expo Go has limited support** — the proper way to test is a dev build.

---

## Getting it on your phone (Android) — pick-up checklist

You need the **dev-client app** installed on the phone, *not* Expo Go. Symptom
of not having it: scanning the QR opens a browser to `http://192.168.x.x` and
says "page can't be found" — that's iOS/Android falling back to the browser
because there's no dev client to open into.

### One-time: build & install the dev client

1. **Confirm you're logged into EAS:**
   ```bash
   npx eas whoami        # should print: marcz2007
   # if not: npx eas login
   ```
2. **Build the Android dev client (cloud build, ~10–15 min):**
   ```bash
   npx eas build --profile development --platform android
   ```
   - If asked **"Generate a new Android Keystore?"** → **Y**. EAS manages it.
   - Produces an **APK** (the `development` profile uses
     `:app:assembleDebug`, `developmentClient: true`, internal distribution).
3. **Install on the phone:** when the build finishes the CLI prints a **QR /
   link**. Open it **on the phone** → download the APK → tap to install →
   allow "install from this source" if prompted.
4. You'll now have a **GroupMatchmakerApp** icon on the home screen. That's the
   dev client.

### Every time after that

```bash
yarn start            # = expo start --dev-client  (Metro on :8081)
```

- Open the **GroupMatchmakerApp** app on the phone (not Expo Go).
- It connects to Metro automatically, or scan the QR from inside the app.
- Phone and Mac must be on the **same Wi-Fi**. Mac LAN IP shows in the Metro
  output (e.g. `192.168.1.225:8081`).
- Native features (Google Sign-In, etc.) work here. ✅

### When you change native deps / app config

OTA reloads cover JS changes. If you add/upgrade a **native module** or change
native config in `app.json`, rebuild the dev client (repeat the one-time steps).

---

## Expo Go — commands that actually work

Use Expo Go only for a quick JS-only look. Native features (especially
**Google Sign-In / login**) will likely break, because Expo Go can't include
this project's custom native modules.

The reason scanning fails in Expo Go normally: `yarn start` runs
`--dev-client`, whose QR uses the `groupmatchmakerapp://` scheme that Expo Go
can't open. You must start in **Go mode**:

```bash
# Android (then scan the QR with the Expo Go app):
npx expo start --go

# iOS (auto-opens simulator):
yarn go               # = expo start --go --ios
```

If a stale dev-client server is interfering, fully restart with a clean cache:

```bash
npx expo start --go -c     # -c clears the Metro cache
```

> Tip from this setup: pressing **`s`** in the running Metro terminal toggles
> between "development build" and "Expo Go" modes without restarting.

---

## All the commands (from `package.json`)

| Command            | What it does                                            |
| ------------------ | ------------------------------------------------------- |
| `yarn start`       | `expo start --dev-client` — normal dev (needs dev build)|
| `yarn go`          | `expo start --go --ios` — Expo Go on iOS sim            |
| `npx expo start --go` | Expo Go, scan QR on a physical phone                 |
| `yarn ios`         | `expo run:ios` — local native build + iOS sim           |
| `yarn android`     | `expo run:android` — local native build + Android       |
| `yarn web:mobile`  | `expo start --web` — the RN app via react-native-web    |
| `yarn web`         | `cd packages/web && npm run dev` — the Next.js web app  |
| `yarn web:build`   | build the Next.js web app                               |

---

## Web version

There are **two** "web" things — don't confuse them:

1. **`packages/web`** — the real, standalone **Next.js 15** web app
   (`@grapple/web`). This is the production website. Run it with `yarn web`
   (dev) / `yarn web:build` (build).
2. **`yarn web:mobile`** — the React Native app rendered in a browser via
   `react-native-web`. Mostly for quick checks, not the production site.

### Hosting & domain

- Hosted on **Vercel**. Canonical domain is now **`https://grappleapp.co.uk`**.
- The old **`group-matchmaker-app-web.vercel.app`** host is kept working (as a
  redirect + still a valid deep-link host) so links already shared keep
  resolving.
- The web URL is centralized:
  - **Mobile:** `src/config.ts` → `WEB_APP_URL` (and `LEGACY_WEB_APP_URL`).
    All screens + `App.tsx` import from there.
  - **Edge functions:** `WEB_APP_URL` env var (defaults to `grappleapp.co.uk`)
    in `google-calendar-callback` and `send-pending-notifications`.
  - **Supabase auth:** `supabase/config.toml` `site_url` +
    `additional_redirect_urls`.
  - **Share links in chat:** migration
    `20260616000000_share_url_custom_domain.sql`.
- iOS Universal Links are **parked** in `app.json` under
  `_iosUniversalLinksTemplate` (activate when there's an Apple Developer
  account); the new domain is already listed there.

### Custom domain — remaining steps (not code)

The code swap to `grappleapp.co.uk` is done. To finish going live:

1. **Vercel → Project → Settings → Domains:** add `grappleapp.co.uk` (and
   `www` if wanted). Set the **old** `group-matchmaker-app-web.vercel.app` to
   **redirect** to the new domain.
2. **DNS** at the registrar: add the records Vercel shows (apex `A`/`ALIAS` +
   `CNAME` for `www`). Wait for verification + SSL.
3. **Supabase Dashboard → Authentication → URL Configuration:** set Site URL to
   `https://grappleapp.co.uk` and add it to Redirect URLs (the `config.toml`
   change covers local; the hosted project is configured in the dashboard).
4. **Apply the migration** (`supabase db push` or run
   `20260616000000_share_url_custom_domain.sql` in the SQL editor).
5. **Redeploy edge functions** so the new default/links take effect:
   ```bash
   supabase functions deploy google-calendar-callback
   supabase functions deploy send-pending-notifications
   ```
   Optionally set the `WEB_APP_URL` secret on them
   (`supabase secrets set WEB_APP_URL=https://grappleapp.co.uk`).
6. **Google OAuth / Cloud Console:** add `https://grappleapp.co.uk` to
   Authorized JavaScript origins and the Supabase callback to redirect URIs.
7. **Rebuild the apps** (deep-link / `associatedDomains` are native config —
   an OTA update won't pick them up): `eas build --profile production` for
   each platform.

---

## See also

- `HANDOFF.md` — outstanding Supabase migrations, edge-function deploys, and
  env vars from the last work session.
- `eas.json` — build profiles (`development`, `preview`, `production`).
