# Deep links (web → app auto-open)

When someone opens a Grapple link (`https://grappleapp.co.uk/event/<id>`,
`/group/invite/<id>`, `/reset-password`) on a phone **with the app installed**,
the OS should open the app directly instead of the website.

## Status: code complete, waiting on env/accounts

Everything in the repo is already wired and verified-ready:

- `app.json` → Android `intentFilters` with `autoVerify: true` for
  `grappleapp.co.uk` (+ the legacy vercel host). iOS `associatedDomains` is
  **parked** under `_iosUniversalLinksTemplate` (activate when you have an
  Apple Developer account — see below).
- `App.tsx` → `linking.config.screens` maps `event/:eventRoomId`,
  `group/invite/:groupId`, `reset-password`.
- `packages/web/next.config.ts` → rewrites `/.well-known/*` to route handlers.
- Route handlers serve `assetlinks.json` (Android) and
  `apple-app-site-association` (iOS), **gated on env vars** — they return 404
  until configured (verified live: both currently 404).
- The web public event page also shows a manual "Open in the Grapple app"
  banner as a fallback for any case the OS auto-open doesn't cover.

So switching this on is just env vars + (for iOS) the Apple account.

---

## Android App Links (zero-tap, when app installed)

1. **Get the app-signing SHA-256 fingerprint** (the *app signing* key, not the
   upload key):
   ```bash
   eas credentials --platform android      # → Production → Keystore → read SHA-256
   ```
   or Play Console → Setup → App integrity → App signing.
2. **Set it on Vercel** (Project → Settings → Environment Variables):
   - `ANDROID_APP_LINK_SHA256` = `AA:BB:CC:…` (comma-separate if you rotate keys)
   - (optional) `ANDROID_APP_LINK_PACKAGE` — defaults to
     `com.marcz2007.GroupMatchmakerApp`
3. **Redeploy** the web app so the env var takes effect.
4. **Verify** the file now serves:
   ```bash
   curl https://grappleapp.co.uk/.well-known/assetlinks.json   # expect the JSON, not 404
   ```
5. **Install a build** of the app and tap a `grappleapp.co.uk/event/...` link —
   Android verifies the link against `assetlinks.json` and opens the app.
   (App Links verify on install; reinstall after step 4 if you installed earlier.)

---

## iOS Universal Links (needs Apple Developer account)

1. **Set on Vercel:** `APPLE_TEAM_ID` = your 10-char Team ID (and
   `APPLE_BUNDLE_ID` only if it differs from `com.marcz2007.GroupMatchmakerApp`).
2. **Un-park the entitlement** in `app.json`: move the `associatedDomains` array
   from `_iosUniversalLinksTemplate` into `expo.ios` (sibling of
   `bundleIdentifier`). It already lists `applinks:grappleapp.co.uk` (+ legacy).
3. **Redeploy** web, then verify:
   ```bash
   curl https://grappleapp.co.uk/.well-known/apple-app-site-association  # expect JSON
   ```
4. **Native rebuild** — `associatedDomains` is a native entitlement, so an OTA
   update won't pick it up:
   ```bash
   eas build --platform ios --profile production
   ```
   Install the build; iOS fetches the AASA file asynchronously on first launch
   (give it a few minutes), then `grappleapp.co.uk` links open the app.

---

## Notes
- The `paths` in the AASA route + the Android `pathPrefix`es must stay in sync
  with `App.tsx`'s `linking.config.screens`. If you add a deep-link target,
  update all three.
- Until these are on, mobile-web visitors still get the in-page "Open in app"
  banner, so nothing is broken in the meantime.
