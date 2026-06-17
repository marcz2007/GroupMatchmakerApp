#!/usr/bin/env bash
# Layer-2 web E2E runner. Seeds events into the dev Supabase (keys from the
# linked CLI) and runs Playwright against the deployed site (BASE_URL).
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-nqtycfrgzjiehatokmfn}"
KEYS="$(supabase projects api-keys --project-ref "$REF" -o env 2>/dev/null || true)"

export SUPABASE_URL="${SUPABASE_URL:-https://$REF.supabase.co}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(printf '%s' "$KEYS" | grep -i 'anon' | head -1 | sed 's/.*=//' | tr -d '"')}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(printf '%s' "$KEYS" | grep -i 'service_role' | head -1 | sed 's/.*=//' | tr -d '"')}"
export BASE_URL="${BASE_URL:-https://grappleapp.co.uk}"

npx playwright test --config "$(dirname "$0")/playwright.config.mjs" "$@"
