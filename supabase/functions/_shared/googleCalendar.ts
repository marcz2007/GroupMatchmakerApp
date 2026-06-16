// Shared Google Calendar helpers: OAuth token refresh + FreeBusy availability
// fetch + per-user busy-time store maintenance.
//
// Used by refresh-all-calendars (the persistent-availability cron). The legacy
// per-request functions (google-calendar-callback, refresh-calendar-busy-times)
// still inline equivalent logic and can be migrated onto this later.
//
// FreeBusy is used deliberately: it returns busy intervals regardless of an
// event's visibility (private/confidential events still count as busy),
// auto-excludes "Show as Free" events, returns no event details (we never see
// titles), and has no maxResults cap.

export interface CalendarProfile {
  id: string;
  calendar_provider: string | null;
  calendar_connected: boolean | null;
  calendar_access_token: string | null;
  calendar_refresh_token: string | null;
  calendar_token_expires_at: string | null;
}

export interface BusyInterval {
  start: string;
  end: string;
}

// Exchange a refresh token for a fresh access token. Returns null on failure.
export async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    return null;
  }

  const data = await res.json();
  return data.access_token ?? null;
}

// Query the FreeBusy API for the user's primary calendar over [timeMin, timeMax].
export async function fetchFreeBusy(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyInterval[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    }),
  });

  if (!res.ok) {
    console.error("FreeBusy request failed:", await res.text());
    return [];
  }

  const data = await res.json();
  const primary = data.calendars?.primary;
  if (primary?.errors?.length) {
    console.error("FreeBusy returned errors:", JSON.stringify(primary.errors));
  }
  const busy: Array<{ start?: string; end?: string }> = primary?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({ start: b.start as string, end: b.end as string }));
}

// Refresh one user's busy-time store over a rolling horizon (replacing the
// existing rows). Also stamps the per-user refresh-tracking columns. Returns
// the number of busy blocks written, or null if the user couldn't be refreshed.
export async function refreshUserBusyTimes(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  profile: CalendarProfile,
  horizonDays: number
): Promise<number | null> {
  if (!profile.calendar_connected || !profile.calendar_refresh_token) {
    return null;
  }

  let accessToken = profile.calendar_access_token;
  const expiry = profile.calendar_token_expires_at
    ? new Date(profile.calendar_token_expires_at)
    : new Date(0);

  if (!accessToken || expiry <= new Date()) {
    accessToken = await refreshAccessToken(profile.calendar_refresh_token);
    if (!accessToken) return null;
    await supabase
      .from("profiles")
      .update({
        calendar_access_token: accessToken,
        calendar_token_expires_at: new Date(
          Date.now() + 3600 * 1000
        ).toISOString(),
      })
      .eq("id", profile.id);
  }

  const now = new Date();
  const horizonEnd = new Date();
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  const busy = await fetchFreeBusy(accessToken, now, horizonEnd);

  // Replace the user's store for the rolling window.
  await supabase.from("calendar_busy_times").delete().eq("user_id", profile.id);

  if (busy.length > 0) {
    const rows = busy.map((b) => ({
      user_id: profile.id,
      start_time: b.start,
      end_time: b.end,
      fetched_at: now.toISOString(),
    }));
    const { error } = await supabase.from("calendar_busy_times").insert(rows);
    if (error) {
      console.error(`Insert busy times failed for ${profile.id}:`, error);
      return null;
    }
  }

  await supabase
    .from("profiles")
    .update({
      calendar_last_refreshed_at: now.toISOString(),
      calendar_synced_through: horizonEnd.toISOString(),
    })
    .eq("id", profile.id);

  return busy.length;
}
