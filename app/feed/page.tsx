import { FeedList } from "@/components/feed/feed-list";
import { PageHeader } from "@/components/ui/page-header";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getEventFeed } from "@/lib/repositories/players.repo";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";

export const metadata = {
  title: "Лента — GGRun",
};

export default async function FeedPage() {
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const rows = await getEventFeed(season.id, 30);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker={`сезон «${season.title}»`} title="Лента событий" />
      <div className="hud-card p-6">
        <FeedList rows={rows} />
      </div>
    </div>
  );
}
