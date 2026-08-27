import { FeedList } from "@/components/feed/feed-list";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/page-header";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getEventFeed } from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.feed.metaTitle };
}

export default async function FeedPage() {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const rows = await getEventFeed(season.id, 30);

  return (
    <PageContainer>
      <PageHeader
        kicker={format(t.core.common.seasonKicker, { season: season.title })}
        title={t.feed.pageTitle}
      />
      <div className="hud-card p-6">
        <FeedList rows={rows} />
      </div>
    </PageContainer>
  );
}
