import type { FeedRow } from "@/lib/modules/season/repository/players";

/**
 * Feed rows cross the server→client boundary (page → explorer, API → query),
 * so Dates travel as ISO strings. `payload` is already plain JSON from jsonb.
 */
export type SerializedFeedRow = Omit<FeedRow, "createdAt" | "lastSeenAt"> & {
  createdAt: string;
  lastSeenAt: string | null;
};

export function serializeFeedRows(rows: FeedRow[]): SerializedFeedRow[] {
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
  }));
}

export function isSerializedFeedRows(v: unknown): v is SerializedFeedRow[] {
  if (!Array.isArray(v)) return false;
  return v.every((r) => {
    if (typeof r !== "object" || r === null) return false;
    if (!("id" in r) || typeof r.id !== "string") return false;
    if (!("createdAt" in r) || typeof r.createdAt !== "string") return false;
    return true;
  });
}
