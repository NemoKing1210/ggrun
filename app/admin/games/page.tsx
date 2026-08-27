import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PuzzlePieceIcon, CircleStackIcon, ShieldCheckIcon, NoSymbolIcon } from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listCatalogGames } from "@/lib/repositories/games.repo";
import { getT } from "@/lib/i18n/server";
import { listAvailableProviders } from "@/lib/game-providers/keys";
import GamesCatalogManager from "@/components/admin/GamesCatalogManager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.catalog} — GGRun` };
}

export default async function GamesPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const games = await listCatalogGames();
  const availableProviders = await listAvailableProviders();
  const total = games.length;
  const blacklisted = games.filter((g) => g.isBlacklisted).length;
  const active = total - blacklisted;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="hidden size-10 items-center justify-center border border-amber/40 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] sm:inline-flex">
              <PuzzlePieceIcon className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-3xl uppercase tracking-widest text-amber leading-none">
                {t.admin.catalog.heading}
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">{t.admin.catalog.intro}</p>
            </div>
          </div>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">{t.admin.catalog.catalogKicker}</span>
        </div>
        <div className="hazard-tape mt-4" aria-hidden />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="hud-card flex items-center gap-3 p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="inline-flex size-9 items-center justify-center bg-raised border border-[#3d3d34] text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <CircleStackIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.catalog.statsTotalLabel}</div>
            <div className="ammo-counter text-2xl leading-none text-amber">{total}</div>
          </div>
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-widest text-dim/60 sm:inline">{t.admin.catalog.poolLabel}</span>
        </div>
        <div className="hud-card flex items-center gap-3 p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="inline-flex size-9 items-center justify-center bg-emerald-950/30 border border-emerald-800 text-emerald-400 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.catalog.statsActiveLabel}</div>
            <div className="ammo-counter text-2xl leading-none text-emerald-400">{active}</div>
          </div>
          <div className="ml-auto h-1.5 w-16 overflow-hidden border border-emerald-800 bg-emerald-950/40 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" aria-hidden>
            <div className="h-full bg-emerald-500" style={{ width: `${total ? (active / total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="hud-card flex items-center gap-3 p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="inline-flex size-9 items-center justify-center bg-red-950/30 border border-red-900 text-red-400 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <NoSymbolIcon className="size-5" aria-hidden />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.catalog.statsBlacklistedLabel}</div>
            <div className="ammo-counter text-2xl leading-none text-red-400">{blacklisted}</div>
          </div>
          <div className="ml-auto h-1.5 w-16 overflow-hidden border border-red-900 bg-red-950/40 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]" aria-hidden>
            <div className="h-full bg-red-500" style={{ width: `${total ? (blacklisted / total) * 100 : 0}%` }} />
          </div>
        </div>
      </section>

      <GamesCatalogManager games={games} availableProviders={availableProviders} />
    </div>
  );
}
