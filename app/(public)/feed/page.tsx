import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getEventFeed } from "@/lib/modules/season/repository/players";
import { getActiveSeason } from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { FeedExplorer } from "@/components/feed/feed-explorer";
import { serializeFeedRows } from "@/components/feed/feed-wire";
import { isFeedFilterKey, type FeedFilterKey } from "@/lib/engine/feed/filters";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.feed.metaTitle };
}

type SearchParams = Promise<{ filter?: string }>;

export default async function FeedPage({ searchParams }: { searchParams: SearchParams }) {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const { filter } = await searchParams;
  // Deep-link only: the explorer owns switching from here (no navigation).
  const initialFilter: FeedFilterKey = isFeedFilterKey(filter) ? filter : "all";

  const rows = await getEventFeed(season.id, 80);

  const kicker = `${t.feed.kicker} • ${format(t.core.common.seasonKicker, { season: season.title })}`;
  const uniquePlayers = new Set(rows.map((r) => r.username).filter(Boolean)).size;

  return (
    <PageContainer>
      <PageHeader
        kicker={kicker}
        title={t.feed.pageTitle}
        right={
          <StatusBadge
            kind="season"
            status={season.status}
            label={t.core.seasonStatuses[season.status]}
          />
        }
      />

      {/* stats bar + hazard */}
      <div className="mb-6 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-widest">
        <span className="inline-flex items-center gap-2 border border-amber/30 bg-amber/10 px-2.5 py-1 text-amber">
          <span
            className="h-2 w-2 animate-pulse bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]"
            aria-hidden
          />
          {t.feed.live}
        </span>
        <span className="border border-dim/20 bg-raised px-2.5 py-1 text-dim">
          {rows.length} {t.feed.stats.events}
        </span>
        <span className="border border-dim/20 bg-raised px-2.5 py-1 text-dim">
          {uniquePlayers} {t.feed.stats.players}
        </span>
      </div>
      <div className="hazard-tape mb-6" aria-hidden />

      <FeedExplorer
        seasonId={season.id}
        initialRows={serializeFeedRows(rows)}
        initialFilter={initialFilter}
      />
    </PageContainer>
  );
}
