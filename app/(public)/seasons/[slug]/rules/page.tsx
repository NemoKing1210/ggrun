import { notFound } from "next/navigation";

import { BackLink } from "@/components/ui/BackLink";
import { Markdown } from "@/components/rules/markdown";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { StatusBadge } from "@/components/ui/status";
import { getSeasonBySlug } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { t } = await getT();
  const season = await getSeasonBySlug(slug);
  if (!season) return { title: t.seasons.detail.notFound };
  return { title: `${season.title} · ${t.rules.metaTitle}` };
}

export default async function SeasonRulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { t } = await getT();
  const { slug } = await params;
  const season = await getSeasonBySlug(slug);
  if (!season) notFound();

  return (
    <PageContainer>
      <BackLink href="/seasons" label={t.seasons.detail.backToArchive} />
      <PageHeader
        kicker={format(t.core.common.seasonKicker, { season: season.title })}
        title={t.rules.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <SeasonTabs slug={season.slug} t={t} />
      <div className="mt-6">
        {season.rulesMd && season.rulesMd.trim().length > 0 ? (
          <div className="hud-card p-6 sm:p-8">
            <Markdown source={season.rulesMd} />
          </div>
        ) : (
          <EmptyState>{t.rules.empty}</EmptyState>
        )}
      </div>
    </PageContainer>
  );
}
