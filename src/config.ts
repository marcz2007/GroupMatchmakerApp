// Central app configuration.

// Canonical public web app URL. This is the single source of truth — update
// it here (and the Supabase / edge-function env vars) when the domain changes.
export const WEB_APP_URL = "https://grappleapp.co.uk";

// Legacy host kept for backwards compatibility: already-shared links and
// deep-link intent filters still resolve. Vercel redirects this to WEB_APP_URL.
export const LEGACY_WEB_APP_URL = "https://group-matchmaker-app-web.vercel.app";
