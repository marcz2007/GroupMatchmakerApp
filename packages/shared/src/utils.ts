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
