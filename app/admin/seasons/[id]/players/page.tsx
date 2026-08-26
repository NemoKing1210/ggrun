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

const playerStatuses = ["active", "finished", "eliminated", "withdrawn"] as const;

export default async function SeasonPlayersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
        Игроки · {season.title}
      </h1>
      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="font-display text-xl uppercase tracking-wider mb-3">
          Добавить участника
        </h2>
        <FormShell action={addPlayerToSeasonAction} submitLabel="Добавить" className="flex gap-3 items-end">
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className="text-dim text-sm grow">
            Пользователь
            <select name="userId" required defaultValue="">
              <option value="" disabled>
                — выберите —
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
                поз. {p.position} · бал. {p.balancePoints}
              </span>
              <span className="text-dim text-xs">
                стрики +{p.streakPass}/-{p.streakDrop} · рероллы {p.rerollsUsed} · {p.status}
              </span>
            </div>
            <FormShell
              action={adjustPlayerAction}
              submitLabel="Применить"
              submitClassName="hud-btn !py-1 !px-3 text-xs"
              className="grid grid-cols-2 gap-2 sm:grid-cols-5"
            >
              <input type="hidden" name="seasonPlayerId" value={p.id} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <label className="text-dim text-xs">
                Позиция
                <input name="position" type="number" placeholder={String(p.position)} />
              </label>
              <label className="text-dim text-xs">
                Баланс
                <input name="balancePoints" type="number" placeholder={String(p.balancePoints)} />
              </label>
              <label className="text-dim text-xs">
                Статус
                <select name="status" defaultValue="">
                  <option value="">— не менять —</option>
                  {playerStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-dim text-xs sm:col-span-2">
                Причина (обязательно, попадает в аудит и ленту)
                <input name="reason" required placeholder="Ручная корректировка судьи" />
              </label>
            </FormShell>
          </div>
        ))}
      </section>
    </div>
  );
}
