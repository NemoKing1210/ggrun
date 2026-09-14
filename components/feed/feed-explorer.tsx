"use client";

import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";
import { MotionConfig, motion } from "framer-motion";

import { useI18n } from "@/lib/i18n/client";
import { FEED_FILTERS, matchesFeedFilter, type FeedFilterKey } from "@/lib/engine/feed/filters";
import { FadeSwitch } from "@/components/ui/motion";
import { FeedTimelineView } from "./feed-timeline-view";
import { isSerializedFeedRows, type SerializedFeedRow } from "./feed-wire";

const FEED_LIMIT = 80;

async function fetchFeed(seasonId: string, filter: FeedFilterKey): Promise<SerializedFeedRow[]> {
  const params = new URLSearchParams({
    seasonId,
    filter,
    limit: String(FEED_LIMIT),
  });
  const res = await fetch(`/api/feed?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const body: unknown = await res.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("rows" in body) ||
    !isSerializedFeedRows(body.rows)
  ) {
    throw new Error("feed shape");
  }
  return body.rows;
}

function localFilter(rows: SerializedFeedRow[], filter: FeedFilterKey): SerializedFeedRow[] {
  if (filter === "all") return rows;
  return rows.filter((r) => matchesFeedFilter(r.eventType, filter));
}

function FilterTabs({
  filter,
  onChange,
}: {
  filter: FeedFilterKey;
  onChange: (next: FeedFilterKey) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="hud-card mb-6 flex flex-wrap gap-2 p-3">
      {FEED_FILTERS.map((key) => {
        const isActive = filter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={`relative border px-3 py-1.5 font-display text-xs uppercase tracking-widest transition [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
              isActive
                ? "border-amber text-black"
                : "border-dim/20 bg-raised text-dim hover:border-amber/40 hover:text-amber"
            }`}
          >
            {isActive ? (
              <motion.span
                layoutId="feed-filter-pill"
                className="absolute inset-0 bg-amber shadow-[0_0_8px_rgba(242,169,0,0.35)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                transition={{ duration: 0.18, ease: "easeOut" }}
                aria-hidden
              />
            ) : null}
            <span className="relative z-10">{t.feed.filters[key]}</span>
          </button>
        );
      })}
      {filter !== "all" ? (
        <button
          type="button"
          onClick={() => onChange("all")}
          className="ml-auto inline-flex items-center border border-dim/20 bg-raised px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:text-amber"
        >
          {t.feed.clearFilter} ×
        </button>
      ) : null}
    </div>
  );
}

function ExplorerInner({
  seasonId,
  initialRows,
  initialFilter,
}: {
  seasonId: string;
  initialRows: SerializedFeedRow[];
  initialFilter: FeedFilterKey;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FeedFilterKey>(initialFilter);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["feed", seasonId, filter],
    queryFn: () => fetchFeed(seasonId, filter),
    // First paint reuses the server rows — no loading flash, no double fetch.
    // Scoped to the initial tab: a static value would seed every filter key
    // and, while fresh, suppress its fetch entirely.
    initialData:
      filter === initialFilter ? localFilter(initialRows, initialFilter) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const rows = data ?? [];
  const hasAny = initialRows.length > 0;

  return (
    <MotionConfig reducedMotion="user">
      <FilterTabs filter={filter} onChange={setFilter} />

      {/* sync rail: visible only while a background (re)fetch is in flight */}
      <div className="mb-3 flex h-4 items-center gap-2" aria-live="polite">
        {isFetching ? (
          <>
            <span
              className="inline-block size-1.5 animate-pulse bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]"
              aria-hidden
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
              {"// "}
              {t.feed.syncing}
            </span>
            <span className="hud-loader-progress h-1 flex-1" aria-hidden />
          </>
        ) : null}
        {!isFetching && isError ? (
          <span
            role="alert"
            className="font-mono text-[10px] uppercase tracking-widest text-danger"
          >
            {"// "}
            {t.feed.syncFailed}
          </span>
        ) : null}
      </div>

      <FadeSwitch viewKey={filter}>
        <FeedTimelineView rows={rows} hasAny={hasAny} onClearFilter={() => setFilter("all")} />
      </FadeSwitch>
    </MotionConfig>
  );
}

/**
 * Live feed explorer: instant client-side tab switching with animated
 * transitions, backed by React Query (per-filter cache, 30s live refresh).
 * The server still renders the first paint — `initialRows` doubles as the
 * query's initial data, so mounting never refetches.
 */
export function FeedExplorer({
  seasonId,
  initialRows,
  initialFilter,
}: {
  seasonId: string;
  initialRows: SerializedFeedRow[];
  initialFilter: FeedFilterKey;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ExplorerInner seasonId={seasonId} initialRows={initialRows} initialFilter={initialFilter} />
    </QueryClientProvider>
  );
}
