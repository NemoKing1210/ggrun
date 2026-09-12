import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CpuChipIcon } from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { listBotRunRoster, listBotRuns, listSeasonBotLogs } from "@/lib/modules/bots";
import { SeasonTabs } from "@/components/admin/SeasonTabs";
import { BotsConsole } from "@/components/admin/BotsConsole";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { BackLink } from "@/components/ui/BackLink";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getT();
  const season = await getSeasonById(id);
  const base = season ? season.title : t.admin.nav.seasons;
  return { title: `${base} · ${t.admin.seasonTabs.bots}` };
}

/** JSON-safe plain object for client serialization (jsonb arrives as unknown). */
function toJsonObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

 export default async function SeasonBotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = await getT();
  const actor = await getCurrentUser();
  if (!actor || !isStaff(actor)) redirect("/login");
  const { id: seasonId } = await params;
  const season = await getSeasonById(seasonId);
  if (!season) notFound();

  const [runs, logs] = await Promise.all([
    listBotRuns(seasonId),
    listSeasonBotLogs(seasonId),
  ]);
  const rosters = await Promise.all(runs.map((r) => listBotRunRoster(r.id, seasonId)));

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/seasons" label={t.admin.nav.seasons} />
      <SeasonTabs
        seasonId={seasonId}
        active="bots"
        botCount={rosters.reduce((n, r) => n + r.length, 0)}
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl uppercase tracking-widest text-amber">
            <CpuChipIcon className="h-7 w-7" aria-hidden />
            {format(t.admin.bots.heading, { season: season.title })}
          </h1>
          <p className="mt-1 max-w-3xl font-mono text-xs uppercase tracking-widest text-dim">
            {t.admin.bots.intro}
          </p>
        </div>
      </header>

      <BotsConsole
        seasonId={seasonId}
        seasonActive={season.status === "active"}
        runs={runs.map((r) => ({
          id: r.id,
          status: r.status,
          config: r.config,
          totalTicks: r.totalTicks,
          totalActions: r.totalActions,
          totalErrors: r.totalErrors,
          lastError: r.lastError,
          createdAt: r.createdAt.toISOString(),
        }))}
        logs={logs.map((l) => ({
          id: l.id,
          runId: l.runId,
          level: l.level,
          action: l.action,
          botUsername: l.botUsername,
          message: l.message,
          payload: toJsonObject(l.payload),
          createdAt: l.createdAt.toISOString(),
        }))}
        rosters={Object.fromEntries(runs.map((r, i) => [r.id, (rosters[i] ?? []).map((b) => ({ ...b }))]))}
        playerStatusLabels={{ ...t.core.playerStatuses }}
        t={t.admin.bots}
      />
    </div>
  );
}
