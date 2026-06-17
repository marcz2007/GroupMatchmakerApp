#!/usr/bin/env bash
# Layer-3 mobile E2E. Seeds an event in the dev Supabase, runs the Maestro
# guest-RSVP flow against a booted device/emulator with the Grapple build
# installed, then cleans up.
#
# Prereqs (you provide these — Maestro drives a real device):
#   - Android emulator booted (e.g. `emulator -avd Pixel_7_API_34`) or a phone
#     connected via adb, with the Grapple dev/prod build installed.
#   - maestro on PATH (installer adds ~/.maestro/bin).
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-nqtycfrgzjiehatokmfn}"
KEYS="$(supabase projects api-keys --project-ref "$REF" -o env 2>/dev/null || true)"
export SUPABASE_URL="${SUPABASE_URL:-https://$REF.supabase.co}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(printf '%s' "$KEYS" | grep -i 'anon' | head -1 | sed 's/.*=//' | tr -d '"')}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(printf '%s' "$KEYS" | grep -i 'service_role' | head -1 | sed 's/.*=//' | tr -d '"')}"

DIR="$(dirname "$0")"
EVENT_ID="$(node "$DIR/seed-event.mjs")"
GUEST_EMAIL="maestro-$(date +%s)@grapple.test"
echo "Seeded EVENT_ID=$EVENT_ID, GUEST_EMAIL=$GUEST_EMAIL"

set +e
maestro test -e EVENT_ID="$EVENT_ID" -e GUEST_EMAIL="$GUEST_EMAIL" "$DIR/guest-rsvp.yaml"
STATUS=$?
set -e

node "$DIR/cleanup.mjs" "$EVENT_ID" "$GUEST_EMAIL"
exit $STATUS
