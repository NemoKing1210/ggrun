import { notFound } from "next/navigation";

import { BackLink } from "@/components/ui/BackLink";
import { FeedList } from "@/components/feed/feed-list";
import { LiveBadge, LiveFlash, SeasonLiveRefresh } from "@/components/realtime/season-live";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { StatusBadge } from "@/components/ui/status";
import { getEventFeed } from "@/lib/modules/season/repository/players";
import { getSeasonBySlug } from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) return { title: t.seasons.detail.notFound };
  return { title: `${season.title} · ${t.feed.metaTitle}` };
}

export default async function SeasonFeedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) notFound();

  const rows = await getEventFeed(season.id, 50);

  return (
    <PageContainer>
      <SeasonLiveRefresh seasonId={season.id} labels={{ updated: t.feed.updated }} />
      <BackLink href="/seasons" label={t.seasons.detail.backToArchive} />
      <PageHeader
        kicker={format(t.core.common.seasonKicker, { season: season.title })}
        title={t.feed.pageTitle}
        right={
          <span className="inline-flex flex-wrap items-center gap-2">
            <LiveBadge
              seasonId={season.id}
              showCount={false}
              labels={{
                online: t.feed.live,
                offline: t.feed.offline,
                syncing: t.feed.updating,
                watching: t.feed.watching,
              }}
            />
            <StatusBadge
              kind="season"
              status={season.status}
              label={t.core.seasonStatuses[season.status]}
            />
          </span>
        }
      />
      <SeasonTabs slug={season.slug} t={t} />
      <LiveFlash seasonId={season.id} className="mt-6 hud-card p-6">
        <FeedList rows={rows} />
      </LiveFlash>
    </PageContainer>
  );
}
