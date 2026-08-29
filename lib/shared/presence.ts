/** Online presence helpers — shared between server and client. */

export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
export const LAST_SEEN_THROTTLE_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ONLINE_THRESHOLD_MS;
}

/** Returns diff in ms or null if no date. Positive = time since last seen. */
export function diffSince(lastSeenAt: Date | string | null | undefined): number | null {
  if (!lastSeenAt) return null;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export type LastSeenBucket = "justNow" | "minutes" | "hours" | "days" | "date";

export function bucketForDiff(diffMs: number | null): { bucket: LastSeenBucket; value: number } | null {
  if (diffMs === null) return null;
  if (diffMs < 60_000) return { bucket: "justNow", value: 0 };
  if (diffMs < 60 * 60_000) return { bucket: "minutes", value: Math.floor(diffMs / 60_000) };
  if (diffMs < 24 * 60 * 60_000) return { bucket: "hours", value: Math.floor(diffMs / 3_600_000) };
  if (diffMs < 7 * 24 * 60 * 60_000) return { bucket: "days", value: Math.floor(diffMs / 86_400_000) };
  return { bucket: "date", value: diffMs };
}
