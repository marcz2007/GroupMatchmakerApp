#!/usr/bin/env bash
# Dev helper runner — pulls the dev project's keys from the linked Supabase CLI
# and runs scripts/dev.mjs. See dev.mjs for commands. Usage: yarn sim <args>.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-nqtycfrgzjiehatokmfn}"
KEYS="$(supabase projects api-keys --project-ref "$REF" -o env 2>/dev/null || true)"
export SUPABASE_URL="${SUPABASE_URL:-https://$REF.supabase.co}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(printf '%s' "$KEYS" | grep -i 'anon' | head -1 | sed 's/.*=//' | tr -d '"')}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(printf '%s' "$KEYS" | grep -i 'service_role' | head -1 | sed 's/.*=//' | tr -d '"')}"

node "$(dirname "$0")/dev.mjs" "$@"
