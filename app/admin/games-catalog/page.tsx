import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PuzzlePieceIcon, CircleStackIcon, ShieldCheckIcon, NoSymbolIcon } from "@heroicons/react/24/outline";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listCatalogGames } from "@/lib/repositories/games.repo";
import { getT } from "@/lib/i18n/server";
import GamesCatalogManager from "@/components/admin/GamesCatalogManager";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.catalog} — GGRun` };
}

export default async function GamesCatalogPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const games = await listCatalogGames();
  const total = games.length;
  const blacklisted = games.filter((g) => g.isBlacklisted).length;
  const active = total - blacklisted;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="inline-flex items-center gap-3 font-display text-3xl uppercase tracking-widest text-amber">
            <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <PuzzlePieceIcon className="size-5" aria-hidden />
            </span>
            {t.admin.catalog.heading}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{t.admin.catalog.intro}</p>
        </div>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">{"// CATALOG"}</span>
      </section>
      <div className="hazard-tape" aria-hidden />

      <section className="grid grid-cols-3 gap-3">
        <div className="hud-card flex items-center gap-3 p-3">
          <span className="inline-flex size-8 items-center justify-center bg-raised border border-[#3d3d34] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <CircleStackIcon className="size-4 text-amber" aria-hidden />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">Total</div>
            <div className="ammo-counter text-xl leading-none text-amber">{total}</div>
          </div>
        </div>
        <div className="hud-card flex items-center gap-3 p-3">
          <span className="inline-flex size-8 items-center justify-center bg-emerald-950/30 border border-emerald-800 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <ShieldCheckIcon className="size-4 text-emerald-400" aria-hidden />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">Active</div>
            <div className="ammo-counter text-xl leading-none text-emerald-400">{active}</div>
          </div>
        </div>
        <div className="hud-card flex items-center gap-3 p-3">
          <span className="inline-flex size-8 items-center justify-center bg-red-950/30 border border-red-900 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <NoSymbolIcon className="size-4 text-red-400" aria-hidden />
          </span>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">Blacklisted</div>
            <div className="ammo-counter text-xl leading-none text-red-400">{blacklisted}</div>
          </div>
        </div>
      </section>

      <GamesCatalogManager games={games} />
    </div>
  );
}
