import type { FeedRow } from "@/lib/modules/season/repository/players";
import { serializeFeedRows } from "./feed-wire";
import { FeedTimelineView } from "./feed-timeline-view";

// kept for compatibility with older page
export function FeedList({ rows }: { rows: FeedRow[] }) {
  return <FeedTimeline rows={rows} allRows={rows} />;
}

/**
 * Server entry: serializes DB rows across the boundary and renders the
 * shared client timeline (SSR on first paint, no duplicated markup).
 * The main /feed page uses FeedExplorer instead (tabs + live refetch).
 */
export function FeedTimeline({
  rows,
  allRows,
}: {
  rows: FeedRow[];
  activeFilter?: string;
  allRows: FeedRow[];
}) {
  return <FeedTimelineView rows={serializeFeedRows(rows)} hasAny={allRows.length > 0} />;
}
