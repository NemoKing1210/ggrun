import { Markdown } from "@/components/rules/markdown";
import { PageContainer } from "@/components/ui/PageContainer";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getActiveSeason } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.rules.metaTitle };
}

export default async function RulesPage() {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  return (
    <PageContainer>
      <PageHeader
        kicker={format(t.core.common.seasonKicker, { season: season.title })}
        title={t.rules.pageTitle}
      />
      {season.rulesMd && season.rulesMd.trim().length > 0 ? (
        <div className="hud-card p-6 sm:p-8">
          <Markdown source={season.rulesMd} />
        </div>
      ) : (
        <EmptyState>{t.rules.empty}</EmptyState>
      )}
    </PageContainer>
  );
}
