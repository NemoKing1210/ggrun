import type { Metadata } from "next";
import { redirect } from "next/navigation";

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{t.admin.catalog.heading}</h1>
      <div className="hazard-tape" aria-hidden />
      <p className="text-sm text-zinc-400">{t.admin.catalog.intro}</p>
      <GamesCatalogManager games={games} />
    </div>
  );
}
