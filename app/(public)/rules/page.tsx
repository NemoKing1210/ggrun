import Link from "next/link";
import { Markdown } from "@/components/rules/markdown";
import { AutoRulesView } from "@/components/rules/AutoRulesView";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/status";
import { SeasonMissing } from "@/components/ui/season-missing";
import { getActiveSeason } from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.rules.metaTitle };
}

export default async function RulesPage() {
  const { t } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const parsed = SeasonConfigSchema.safeParse(season.config);
  const config = parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
  const mode = (config as unknown as { rules?: { mode?: string } }).rules?.mode ?? "auto";
  const isAuto = mode === "auto";

  return (
    <PageContainer>
      <PageHeader
        kicker={`${t.rules.kicker} • ${format(t.core.common.seasonKicker, { season: season.title })}`}
        title={t.rules.pageTitle}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />
      <p className="mb-3 max-w-2xl font-mono text-xs uppercase tracking-widest text-dim">{t.rules.heroSubtitle}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant={isAuto ? "amber" : "dim"}>{isAuto ? t.rules.autoBadge : t.rules.manualBadge}</Badge>
        <Badge variant="neutral">{season.title}</Badge>
        <Link href="/board" className="border border-amber/30 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-amber hover:bg-amber hover:text-black">
          {t.rules.viewBoard}
        </Link>
        <Link href="/leaderboard" className="border border-dim/20 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim hover:text-amber">
          {t.rules.viewLeaderboard}
        </Link>
      </div>
      <div className="hazard-tape mb-6" aria-hidden />

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
