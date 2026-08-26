import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listCatalogGames } from "@/lib/repositories/games.repo";
import { getT } from "@/lib/i18n/server";
import GamesCatalogManager from "@/components/admin/GamesCatalogManager";

export default async function GamesCatalogPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const games = await listCatalogGames();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">{t.admin.catalog.heading}</h1>
      <div className="hazard-tape" aria-hidden />
      <p className="text-sm text-zinc-400">Flexible pool: manual adds, external API search (RAWG/IGDB/Steam), and per-season filters. Imported games are enriched with metacritic, rating and cover.</p>
      <GamesCatalogManager games={games} />
    </div>
  );
}
