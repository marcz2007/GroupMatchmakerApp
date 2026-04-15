/**
 * Returns a display name from a user profile, falling back through available fields.
 */
export function getDisplayName(username?: string | null, firstName?: string | null): string {
  return username || firstName || "Unknown";
}

/**
 * Returns a simple pluralized string.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}

/**
 * Formats a date string as "MM/DD/YYYY at HH:MM".
 * If `dateOnly` is true, returns just the date portion.
 */
export function formatDate(dateString: string, dateOnly = false): string {
  const d = new Date(dateString);
  const datePart = d.toLocaleDateString();
  if (dateOnly) return datePart;
  const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

/**
 * Formats a duration in minutes as "X hours Y min" / "X hours" / "Y min".
 * Used by the scheduling UIs to label slot length.
 */
export function formatDuration(mins: number): string {
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours === 0) return `${rem} min`;
  if (rem === 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${hours} hour${hours > 1 ? "s" : ""} ${rem} min`;
}

/**
 * Formats an hour/minute pair as a 12-hour clock string like "9:30 AM".
 */
export function formatTime12(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute.toString().padStart(2, "0");
  return `${displayHour}:${displayMinute} ${period}`;
}

/**
 * Formats a poll option start as "Mon, Jan 5 · 7:00 PM".
 * Locale-aware, works in web + React Native + server environments.
 */
export function formatPollOptionTime(startsAt: string): string {
  try {
    const start = new Date(startsAt);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateStr} · ${timeStr}`;
  } catch {
    return startsAt;
  }
}
