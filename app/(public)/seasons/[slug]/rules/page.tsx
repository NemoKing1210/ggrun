import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/ui/BackLink";
import { Markdown } from "@/components/rules/markdown";
import { AutoRulesView } from "@/components/rules/AutoRulesView";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/PageContainer";
import { SeasonTabs } from "@/components/seasons/SeasonTabs";
import { StatusBadge } from "@/components/ui/status";
import { getSeasonBySlug } from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";

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

  const parsed = SeasonConfigSchema.safeParse(season.config);
  const config = parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
  const mode = (config as unknown as { rules?: { mode?: string } }).rules?.mode ?? "auto";
  const isAuto = mode === "auto";

  return (
    <PageContainer>
      <BackLink href="/seasons" label={t.seasons.detail.backToArchive} />
      <PageHeader
        kicker={`${t.rules.kicker} • ${format(t.core.common.seasonKicker, { season: season.title })}`}
        title={t.rules.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <SeasonTabs slug={season.slug} t={t} />
      <p className="mt-4 max-w-2xl font-mono text-xs uppercase tracking-widest text-dim">{t.rules.heroSubtitle}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={isAuto ? "amber" : "dim"}>{isAuto ? t.rules.autoBadge : t.rules.manualBadge}</Badge>
        <Badge variant="neutral">{season.title}</Badge>
        <Link href={`/seasons/${season.slug}/board`} className="border border-amber/30 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-amber hover:bg-amber hover:text-black">
          {t.rules.viewBoard}
        </Link>
        <Link href={`/seasons/${season.slug}/leaderboard`} className="border border-dim/20 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:text-amber">
          {t.rules.viewLeaderboard}
        </Link>
      </div>
      <div className="hazard-tape my-6" aria-hidden />

      {isAuto ? (
        <AutoRulesView season={season} config={config} t={t} />
      ) : season.rulesMd && season.rulesMd.trim().length > 0 ? (
        <div className="space-y-4">
          <div className="hud-card border-amber/20 bg-amber/5 px-4 py-2 font-mono text-xs text-dim">
            <Badge variant="dim" size="sm">{t.rules.manualBadge}</Badge> <span className="ml-2">{t.rules.manualHint}</span>
          </div>
          <div className="hud-card p-6 sm:p-8">
            <Markdown source={season.rulesMd} />
          </div>
        </div>
      ) : (
        <div className="hud-card p-10 text-center">
          <p className="font-display text-lg uppercase tracking-wide text-amber">{t.rules.empty}</p>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.rules.emptyHint}</p>
        </div>
      )}
    </PageContainer>
  );
}
