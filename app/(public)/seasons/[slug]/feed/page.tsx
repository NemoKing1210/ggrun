import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedList } from "@/components/feed/feed-list";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { StatusBadge } from "@/components/ui/status";
import { getEventFeed } from "@/lib/repositories/players.repo";
import { getSeasonBySlug } from "@/lib/repositories/seasons.repo";
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
      <Link href="/seasons" className="mb-4 inline-block font-mono text-xs uppercase tracking-widest text-dim hover:text-amber">
        {t.seasons.detail.backToArchive}
      </Link>
      <PageHeader
        kicker={format(t.core.common.seasonKicker, { season: season.title })}
        title={t.feed.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <SeasonTabs slug={season.slug} t={t} />
      <div className="mt-6 hud-card p-6">
        <FeedList rows={rows} />
      </div>
    </PageContainer>
  );
}
