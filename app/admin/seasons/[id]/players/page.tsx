import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  BanknotesIcon,
  MapPinIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  UserPlusIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";

import { db } from "@/lib/db";
import { seasonPlayers, users } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { getSeasonById } from "@/lib/repositories/seasons.repo";
import { getLeaderboard } from "@/lib/repositories/players.repo";
import { addPlayerToSeasonAction, adjustPlayerAction } from "@/lib/use-cases/admin-actions";
import { FormShell } from "@/components/admin/FormShell";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";

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
    .leftJoin(seasonPlayers, eq(seasonPlayers.playerId, users.id));

  const candidates = allUsers.filter((u) => u.inSeason === null);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/admin/seasons/${seasonId}`} label={season.title} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl uppercase tracking-widest text-amber">
            <UserGroupIcon className="h-7 w-7" aria-hidden />
            {format(t.admin.players.heading, { season: season.title })}
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">
            {roster.length} {t.admin.dashboard.statUsers.toLowerCase()} · {candidates.length} candidates
          </p>
        </div>
        <Badge variant="dim" size="sm" className="font-mono">
          <TrophyIcon className="mr-1 h-3 w-3" aria-hidden />
          {season.status}
        </Badge>
      </header>

      <div className="hazard-tape" aria-hidden />

      <section className="hud-card p-4">
        <h2 className="flex items-center gap-2 font-display text-lg uppercase tracking-wider">
          <UserPlusIcon className="h-5 w-5 text-amber" aria-hidden />
          {t.admin.players.addHeading}
        </h2>
        <p className="mt-1 font-mono text-xs text-dim">{candidates.length} users available to add</p>
        <div className="mt-3">
          <FormShell
            action={addPlayerToSeasonAction}
            submitLabel={t.core.common.add}
            submitClassName="hud-btn hud-btn-primary inline-flex items-center gap-1.5 !py-2 !px-4 text-xs"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="seasonId" value={seasonId} />
            <label className="flex flex-col gap-1 text-dim text-sm grow">
              <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.players.userLabel}</span>
              <select name="userId" required defaultValue="" className="w-full">
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
            <button type="submit" className="hud-btn hud-btn-primary inline-flex items-center gap-1.5 self-start sm:self-auto !py-2 !px-4 text-xs">
              <UserPlusIcon className="h-4 w-4" aria-hidden />
              {t.core.common.add}
            </button>
          </FormShell>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-widest text-dim">Roster · {roster.length}</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.admin.players.sortedByPosition}</span>
        </div>

        {roster.length === 0 ? (
          <div className="hud-card p-8 text-center">
            <UserGroupIcon className="mx-auto h-8 w-8 text-dim/40" aria-hidden />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.admin.players.noParticipants}</p>
            <p className="mt-1 text-sm text-dim">{t.admin.players.addUsersHint}</p>
          </div>
        ) : (
          roster.map((p) => (
            <div key={p.id} className="hud-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 items-center justify-center border border-dim/30 bg-raised font-display text-xs uppercase tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    {(p.displayName ?? p.username).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-display text-lg leading-none">{p.displayName ?? p.username}</div>
                    <div className="mt-1 font-mono text-xs text-dim">@{p.username}</div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs tracking-wide text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <MapPinIcon className="h-3.5 w-3.5" aria-hidden />
                    {p.position}
                  </span>
                  <span className="inline-flex items-center gap-1 border border-dim/30 bg-background/40 px-2 py-1 font-mono text-xs tracking-wide text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <BanknotesIcon className="h-3.5 w-3.5" aria-hidden />
                    {p.balancePoints}
                  </span>
                  <Badge variant={p.status === "active" ? "military" : p.status === "finished" ? "amber" : p.status === "eliminated" ? "danger" : "dim"} size="sm">
                    <ShieldCheckIcon className="mr-1 h-3 w-3" aria-hidden />
                    {t.core.playerStatuses[p.status]}
                  </Badge>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
                <span>
                  {format(t.admin.players.metaFormat, {
                    pass: p.streakPass,
                    drop: p.streakDrop,
                    rerolls: p.rerollsUsed,
                    status: t.core.playerStatuses[p.status],
                  })}
                </span>
                <span className="ammo-counter text-amber">
                  {format(t.admin.players.statsFormat, { position: p.position, balance: p.balancePoints })}
                </span>
              </div>

              <div className="mt-4 border-t border-[#2a2a22] pt-3">
                <FormShell
                  action={adjustPlayerAction}
                  submitLabel={t.core.common.apply}
                  submitClassName="hud-btn hud-btn-primary !py-1.5 !px-3 text-xs"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-5"
                >
                  <input type="hidden" name="seasonPlayerId" value={p.id} />
                  <input type="hidden" name="seasonId" value={seasonId} />
                  <label className="flex flex-col gap-1 text-dim text-xs">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
                      <MapPinIcon className="h-3 w-3" aria-hidden />
                      {t.core.common.position}
                    </span>
                    <input name="position" type="number" placeholder={String(p.position)} />
                  </label>
                  <label className="flex flex-col gap-1 text-dim text-xs">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
                      <BanknotesIcon className="h-3 w-3" aria-hidden />
                      {t.core.common.balance}
                    </span>
                    <input name="balancePoints" type="number" placeholder={String(p.balancePoints)} />
                  </label>
                  <label className="flex flex-col gap-1 text-dim text-xs">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
                      <ShieldCheckIcon className="h-3 w-3" aria-hidden />
                      {t.core.common.status}
                    </span>
                    <select name="status" defaultValue="">
                      <option value="">{t.admin.players.keepStatusOption}</option>
                      {playerStatuses.map((s) => (
                        <option key={s} value={s}>
                          {t.core.playerStatuses[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-dim text-xs sm:col-span-2">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.players.reasonLabel}</span>
                    <input name="reason" required placeholder={t.admin.players.reasonPlaceholder} />
                  </label>
                </FormShell>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
