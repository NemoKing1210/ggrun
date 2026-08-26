import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { listCatalogGames } from "@/lib/repositories/games.repo";
import {
  addCatalogGameAction,
  deleteGameAction,
  toggleBlacklistAction,
} from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

export default async function GamesCatalogPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t } = await getT();
  const games = await listCatalogGames();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {t.admin.catalog.heading}
      </h1>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          {t.admin.catalog.addHeading}
        </h2>
        <FormShell action={addCatalogGameAction} submitLabel={t.core.common.add} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="text-dim text-sm">
            {t.admin.catalog.titleLabel}
            <input name="title" required />
          </label>
          <label className="text-dim text-sm">
            {t.admin.catalog.platformLabel}
            <input name="platform" placeholder="steam / nes / custom" />
          </label>
          <label className="text-dim text-sm">
            {t.admin.catalog.coverLabel}
            <input name="coverUrl" type="url" />
          </label>
          <label className="text-dim text-sm">
            {t.admin.catalog.genresLabel}
            <input name="genres" placeholder="rpg, indie" />
          </label>
        </FormShell>
      </section>

      <section className="hud-card p-4 overflow-x-auto">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          {format(t.admin.catalog.poolHeading, { count: games.length })}
        </h2>
        <table className="w-full text-sm">
          <thead className="text-dim text-left border-b border-[#3d3d34]">
            <tr>
              <th className="p-2">{t.core.common.title}</th>
              <th className="p-2">{t.admin.catalog.colPlatform}</th>
              <th className="p-2">{t.admin.catalog.colGenres}</th>
              <th className="p-2">{t.core.common.status}</th>
              <th className="p-2">{t.core.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id} className="border-b border-[#2a2a22]">
                <td className="p-2">{g.title}</td>
                <td className="p-2 font-mono text-xs">{g.platform ?? "—"}</td>
                <td className="p-2 text-xs text-dim">{g.genres.join(", ") || "—"}</td>
                <td className="p-2">
                  {g.isBlacklisted ? (
                    <span className="text-danger">{t.admin.catalog.blacklisted}</span>
                  ) : (
                    <span className="text-military">{t.admin.catalog.active}</span>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <form action={toggleBlacklistAction}>
                      <input type="hidden" name="gameId" value={g.id} />
                      <input
                        type="hidden"
                        name="blacklisted"
                        value={String(!g.isBlacklisted)}
                      />
                      <button type="submit" className="hud-btn !py-1 !px-3 text-xs">
                        {g.isBlacklisted
                          ? t.admin.catalog.unblockButton
                          : t.admin.catalog.blockButton}
                      </button>
                    </form>
                    <form action={deleteGameAction}>
                      <input type="hidden" name="gameId" value={g.id} />
                      <button
                        type="submit"
                        className="hud-btn hud-btn-danger !py-1 !px-3 text-xs"
                      >
                        {t.core.common.delete}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
