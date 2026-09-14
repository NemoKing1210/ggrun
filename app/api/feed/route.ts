import { NextRequest, NextResponse } from "next/server";

import { getEventFeed } from "@/lib/modules/season/repository/players";
import { isFeedFilterKey, matchesFeedFilter } from "@/lib/engine/feed/filters";
import { serializeFeedRows } from "@/components/feed/feed-wire";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 100;

/**
 * Public live-log data for the feed explorer (React Query).
 * Same source and matcher as the server page — one table, one truth.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seasonId = searchParams.get("seasonId");
  if (!seasonId) return NextResponse.json({ error: "MISSING_SEASON" }, { status: 400 });

  const filterParam = searchParams.get("filter") ?? "all";
  if (!isFeedFilterKey(filterParam))
    return NextResponse.json({ error: "INVALID_FILTER" }, { status: 400 });

  const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const rows = await getEventFeed(seasonId, limit);
    const filtered =
      filterParam === "all"
        ? rows
        : rows.filter((r) => matchesFeedFilter(r.eventType, filterParam));
    return NextResponse.json(
      { rows: serializeFeedRows(filtered) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "FAILED" }, { status: 500 });
  }
}
