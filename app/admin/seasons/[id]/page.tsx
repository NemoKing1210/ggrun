import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowPathIcon, CalendarIcon, HashtagIcon, LockClosedIcon, TagIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getActiveSeason, getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getLeaderboard } from "@/lib/modules/season/repository/players";
import { listAvailableProviders } from "@/lib/modules/catalog/providers/keys";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema } from "@/lib/engine";
import SeasonSettingsForm from "@/components/admin/SeasonSettingsForm";
import { SeasonTabs } from "@/components/admin/SeasonTabs";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/status";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { resetSeasonDirectAction } from "@/lib/modules/season/actions/seasons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const season = await getSeasonById(id);
  return { title: `${season ? season.title : `#${id.slice(0, 8)}`} — GGRun` };
}

export default async function SeasonSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();

  const { id } = await params;
  const season = await getSeasonById(id);
  if (!season) notFound();

  const parsed = SeasonConfigSchema.safeParse(season.config);
  const config = parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
  const availableProviders = await listAvailableProviders();
  const activeSeason = await getActiveSeason();
  const roster = await getLeaderboard(season.id);
  const resetBlocked = activeSeason !== null && activeSeason.id !== season.id && season.status !== "active";

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/seasons" label={t.admin.nav.seasons} />
      <SeasonTabs seasonId={season.id} active="settings" playerCount={roster.length} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
              {format(t.admin.settings.heading, { season: season.title })}
            </h1>
            <StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
            {t.admin.settings.configHeading} · {t.admin.settings.rulesPlaceholder.slice(0, 48)}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">{t.admin.settings.flexibleHint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="dim" size="sm" className="font-mono">
            <HashtagIcon className="mr-1 h-3 w-3" aria-hidden />
            {season.id.slice(0, 8)}
          </Badge>
          {resetBlocked ? (
            <span
              title={format(t.admin.overview.activeLockedHint, { title: activeSeason.title })}
              className="hud-btn hud-btn-danger !py-1.5 !px-3 text-xs opacity-45 cursor-not-allowed inline-flex items-center gap-1.5"
              aria-disabled="true"
            >
              <LockClosedIcon className="size-3.5" aria-hidden />
              {t.admin.overview.resetButton}
            </span>
          ) : season.status !== "draft" && season.status !== "archived" ? (
            <form action={resetSeasonDirectAction}>
              <input type="hidden" name="seasonId" value={season.id} />
              <ConfirmButton
                message={format(t.admin.overview.resetConfirm, { season: season.title })}
                className="hud-btn hud-btn-danger !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5"
              >
                <ArrowPathIcon className="size-3.5" aria-hidden />
                {t.admin.overview.resetButton}
              </ConfirmButton>
            </form>
          ) : null}
        </div>
      </header>

      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
            <TagIcon className="h-3.5 w-3.5" aria-hidden />
            {t.admin.createSeason.slugLabel}
          </span>
          <Badge variant="neutral" size="sm" className="font-mono">
            {season.slug}
          </Badge>
          <span className="mx-2 h-3 w-px bg-[#3d3d34]" aria-hidden />
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
            <WrenchScrewdriverIcon className="h-3.5 w-3.5" aria-hidden />
            {config.board.size} cells · {config.board.distribution}
          </span>
          <span className="mx-2 h-3 w-px bg-[#3d3d34]" aria-hidden />
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
            <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
            {season.createdAt ? new Date(season.createdAt).toLocaleDateString() : "—"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="dim" size="sm">
            {t.admin.settings.sourceLabel}: {config.gamePool.source}
          </Badge>
          <Badge variant="dim" size="sm">
            {t.admin.settings.providerLabel}: {config.gamePool.provider}
          </Badge>
          <Badge variant="dim" size="sm">
            d{config.dice.sides} · {config.dice.passDiceCount}/{config.dice.dropDiceCount}
          </Badge>
        </div>
      </section>

      <SeasonSettingsForm
        seasonId={season.id}
        initialConfig={config}
        initialRulesMd={season.rulesMd ?? ""}
        seasonTitle={season.title}
        seasonStatus={season.status}
        availableProviders={availableProviders}
      />
    </div>
  );
}
