import { Markdown } from "@/components/rules/markdown";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";

export const metadata = {
  title: "Правила — GGRun",
};

export default async function RulesPage() {
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker={`сезон «${season.title}»`} title="Правила" />
      {season.rulesMd && season.rulesMd.trim().length > 0 ? (
        <div className="hud-card p-6 sm:p-8">
          <Markdown source={season.rulesMd} />
        </div>
      ) : (
        <EmptyState>Правила сезона ещё не опубликованы.</EmptyState>
      )}
    </div>
  );
}
