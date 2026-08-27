import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { seasonPlayers, users } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getSeasonById } from "@/lib/repositories/seasons.repo";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import {
  addPlayerToSeasonAction,
  adjustPlayerAction,
} from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";

const playerStatuses = ["active", "finished", "eliminated", "withdrawn"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { t } = await getT();
  const season = await getSeasonById(id);
  const base = season ? season.title : t.admin.nav.seasons;
  return { title: `${base} · ${t.core.breadcrumbs.players}` };
}

export default async function SeasonPlayersPage({
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

  const roster = await getLeaderboard(seasonId);
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      inSeason: seasonPlayers.id,
    })
    .from(users)
    .leftJoin(
      seasonPlayers,
      eq(seasonPlayers.playerId, users.id),
    );

  const candidates = allUsers.filter((u) => u.inSeason === null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-widest text-amber">
        {format(t.admin.players.heading, { season: season.title })}
      </h1>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          {t.admin.players.addHeading}
        </h2>
        <FormShell action={addPlayerToSeasonAction} submitLabel={t.core.common.add} className="flex gap-3 items-end">
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className="text-dim text-sm grow">
            {t.admin.players.userLabel}
            <select name="userId" required defaultValue="">
              <option value="" disabled>
                {t.admin.players.pickUserOption}
              </option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </label>
        </FormShell>
      </section>

      <section className="flex flex-col gap-4">
        {roster.map((p) => (
          <div key={p.id} className="hud-card p-4">
            <div className="flex flex-wrap items-baseline gap-x-4 mb-2">
              <span className="font-display text-lg">{p.displayName ?? p.username}</span>
              <span className="ammo-counter text-amber">
                {format(t.admin.players.statsFormat, {
                  position: p.position,
                  balance: p.balancePoints,
                })}
              </span>
              <span className="text-dim text-xs">
                {format(t.admin.players.metaFormat, {
                  pass: p.streakPass,
                  drop: p.streakDrop,
                  rerolls: p.rerollsUsed,
                  status: t.core.playerStatuses[p.status],
                })}
              </span>
            </div>
            <FormShell
              action={adjustPlayerAction}
              submitLabel={t.core.common.apply}
              submitClassName="hud-btn !py-1 !px-3 text-xs"
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
            >
              <input type="hidden" name="seasonPlayerId" value={p.id} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <label className="text-dim text-xs">
                {t.core.common.position}
                <input name="position" type="number" placeholder={String(p.position)} />
              </label>
              <label className="text-dim text-xs">
                {t.core.common.balance}
                <input name="balancePoints" type="number" placeholder={String(p.balancePoints)} />
              </label>
              <label className="text-dim text-xs">
                {t.core.common.status}
                <select name="status" defaultValue="">
                  <option value="">{t.admin.players.keepStatusOption}</option>
                  {playerStatuses.map((s) => (
                    <option key={s} value={s}>
                      {t.core.playerStatuses[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-dim text-xs sm:col-span-2">
                {t.admin.players.reasonLabel}
                <input name="reason" required placeholder={t.admin.players.reasonPlaceholder} />
              </label>
            </FormShell>
          </div>
        ))}
      </section>
    </div>
  );
}
