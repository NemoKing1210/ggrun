import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import {
  BanknotesIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TrashIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import { db } from "@/lib/infrastructure/db";
import { seasonPlayers, users } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getLeaderboard } from "@/lib/modules/season/repository/players";
import {
  adjustPlayerAction,
  removePlayerFromSeasonAction,
  submitAdjustPlayerAction,
} from "@/lib/modules/season/actions/players";
import { SeasonTabs } from "@/components/admin/SeasonTabs";
import { AddSeasonPlayer } from "@/components/admin/AddSeasonPlayer";
import { FormShell } from "@/components/admin/FormShell";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";

const playerStatuses = ["active", "finished", "eliminated", "withdrawn"] as const;

const statusVariant: Record<(typeof playerStatuses)[number], "military" | "amber" | "danger" | "dim"> = {
  active: "military",
  finished: "amber",
  eliminated: "danger",
  withdrawn: "dim",
};

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
  const isAdmin = actor.role === "admin";
  const { id: seasonId } = await params;
  const season = await getSeasonById(seasonId);
  if (!season) notFound();

  const roster = await getLeaderboard(seasonId);
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      inThisSeason: seasonPlayers.id,
    })
    .from(users)
    .leftJoin(
      seasonPlayers,
      and(eq(seasonPlayers.playerId, users.id), eq(seasonPlayers.seasonId, seasonId)),
    );

  const candidates = allUsers.filter((u) => u.inThisSeason === null);
  const statusCounts = roster.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/seasons" label={t.admin.nav.seasons} />
      <SeasonTabs seasonId={seasonId} active="players" playerCount={roster.length} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl uppercase tracking-widest text-amber">
            <UserGroupIcon className="h-7 w-7" aria-hidden />
            {format(t.admin.players.heading, { season: season.title })}
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">
            {roster.length} {t.admin.dashboard.statUsers.toLowerCase()} ·{" "}
            {format(t.admin.players.availableCount, { count: String(candidates.length) })}
          </p>
        </div>
        <Badge variant="dim" size="sm" className="font-mono">
          <TrophyIcon className="mr-1 h-3 w-3" aria-hidden />
          {season.status}
        </Badge>
      </header>

      <div className="hazard-tape" aria-hidden />

      {/* Add participant */}
      <section className="hud-card p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <AddSeasonPlayer seasonId={seasonId} candidates={candidates} t={t} />
      </section>

      {/* Roster */}
      <section className="hud-card overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-2.5">
          <h2 className="inline-flex items-center gap-2 font-display text-xs uppercase tracking-[0.14em] text-amber">
            <span className="inline-flex size-6 items-center justify-center bg-raised border border-[#3d3d34] text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <UserGroupIcon className="size-3.5" aria-hidden />
            </span>
            {t.admin.players.poolTitle} · {roster.length}
          </h2>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">
            {t.admin.players.sortedByPosition}
          </span>
        </div>

        {/* Status breakdown strip */}
        {roster.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#2a2a22] bg-[#0f0f0f]/60 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-dim">
            {playerStatuses.map((s) => {
              const n = statusCounts[s] ?? 0;
              return (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-1.5 [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)] ${
                      n > 0
                        ? s === "active"
                          ? "bg-military"
                          : s === "finished"
                            ? "bg-amber"
                            : s === "eliminated"
                              ? "bg-danger"
                              : "bg-dim/50"
                        : "bg-[#55554a]"
                    }`}
                    aria-hidden
                  />
                  {t.core.playerStatuses[s]} · {n}
                </span>
              );
            })}
          </div>
        )}

        {roster.length === 0 ? (
          <div className="m-4 border border-dashed border-dim/20 bg-background/20 p-8 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <UserGroupIcon className="mx-auto size-7 text-dim/50" aria-hidden />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-dim">{t.admin.players.noParticipants}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">{t.admin.players.addUsersHint}</p>
          </div>
        ) : (
          <>
            {/* Desktop table — one form per row via form="" association */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-raised text-left text-dim">
                  <tr className="border-b border-[#3d3d34] font-mono text-[11px] uppercase tracking-widest">
                    <th className="w-[240px] p-3 font-normal">{t.admin.players.colPlayer}</th>
                    <th className="w-24 p-2 font-normal">
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="size-3" aria-hidden /> {t.core.common.position}
                      </span>
                    </th>
                    <th className="w-24 p-2 font-normal">
                      <span className="inline-flex items-center gap-1">
                        <BanknotesIcon className="size-3" aria-hidden /> {t.core.common.balance}
                      </span>
                    </th>
                    <th className="w-40 p-2 font-normal">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheckIcon className="size-3" aria-hidden /> {t.core.common.status}
                      </span>
                    </th>
                    <th className="w-28 p-2 font-normal">{t.admin.players.colStreaks}</th>
                    <th className="p-2 font-normal min-w-[180px]">{t.admin.players.reasonLabel}</th>
                    <th className="p-2 text-right font-normal">{t.admin.players.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a22]">
                  {roster.map((p) => {
                    const fid = `adjust-${p.id}`;
                    const name = p.displayName ?? p.username;
                    return (
                      <tr key={p.id} className="group align-middle transition-colors hover:bg-amber/[0.04]">
                        <td className="p-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex size-9 shrink-0 items-center justify-center border border-dim/30 bg-raised font-display text-xs uppercase tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                              {name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-display text-sm uppercase tracking-wide transition-colors group-hover:text-amber">
                                {isAdmin ? (
                                  <Link href={`/admin/users/${p.playerId}`} className="hover:text-amber">
                                    {name}
                                  </Link>
                                ) : (
                                  name
                                )}
                              </div>
                              <div className="font-mono text-[11px] text-dim">@{p.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <input
                            form={fid}
                            type="number"
                            name="position"
                            defaultValue={p.position}
                            className="hud-input w-full !px-2 !py-1 text-center font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            form={fid}
                            type="number"
                            name="balancePoints"
                            defaultValue={p.balancePoints}
                            className="hud-input w-full !px-2 !py-1 text-center font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            form={fid}
                            name="status"
                            defaultValue={p.status}
                            className="hud-input w-full cursor-pointer appearance-none !px-2 !py-1 text-xs"
                          >
                            {playerStatuses.map((s) => (
                              <option key={s} value={s}>
                                {t.core.playerStatuses[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="whitespace-nowrap p-3 font-mono text-[11px] tracking-wide text-dim">
                          <span className="text-military">+{p.streakPass}</span>
                          <span className="text-danger">/{p.streakDrop}</span>
                          <span className="mx-1.5 text-[#55554a]">·</span>
                          <span>R {p.rerollsUsed}</span>
                        </td>
                        <td className="p-2">
                          <input
                            form={fid}
                            type="text"
                            name="reason"
                            required
                            placeholder={t.admin.players.reasonPlaceholder}
                            className="hud-input w-full !px-2 !py-1 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="submit"
                              form={fid}
                              className="hud-btn hud-btn-primary !px-3 !py-1 text-[11px]"
                            >
                              {t.core.common.apply}
                            </button>
                            <form action={removePlayerFromSeasonAction}>
                              <input type="hidden" name="seasonId" value={seasonId} />
                              <input type="hidden" name="playerId" value={p.playerId} />
                              <ConfirmButton
                                message={format(t.admin.players.removeConfirm, { name })}
                                className="hud-btn hud-btn-danger !px-2 !py-1"
                                aria-label={`${t.admin.players.removeButton} ${name}`}
                                title={t.admin.players.removeButton}
                              >
                                <TrashIcon className="size-3.5" aria-hidden />
                              </ConfirmButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Hidden per-row adjust forms (inputs reference them via form="") */}
              {roster.map((p) => (
                <form key={p.id} id={`adjust-${p.id}`} action={submitAdjustPlayerAction} className="hidden" aria-hidden="true" tabIndex={-1}>
                  <input type="hidden" name="seasonPlayerId" value={p.id} />
                  <input type="hidden" name="seasonId" value={seasonId} />
                </form>
              ))}
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 p-3 lg:hidden">
              {roster.map((p) => {
                const name = p.displayName ?? p.username;
                return (
                  <div key={p.id} className="hud-card flex flex-col gap-3 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center border border-dim/30 bg-raised font-display text-xs uppercase tracking-widest [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-display text-base uppercase leading-none tracking-wide">
                            {name}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-dim">@{p.username}</div>
                        </div>
                      </div>
                      <Badge variant={statusVariant[p.status]} size="sm">
                        {t.core.playerStatuses[p.status]}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-widest text-dim">
                      <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-0.5 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                        <MapPinIcon className="size-3" aria-hidden /> {p.position}
                      </span>
                      <span className="inline-flex items-center gap-1 border border-dim/30 bg-background/40 px-2 py-0.5 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                        <BanknotesIcon className="size-3" aria-hidden /> {p.balancePoints} pts
                      </span>
                      <span className="inline-flex items-center gap-1 px-1 py-0.5">
                        <span className="text-military">+{p.streakPass}</span>
                        <span className="text-danger">/{p.streakDrop}</span>
                        <span className="mx-0.5 text-[#55554a]">·</span>
                        R {p.rerollsUsed}
                      </span>
                    </div>

                    <FormShell
                      action={adjustPlayerAction}
                      submitLabel={t.core.common.apply}
                      submitClassName="hud-btn hud-btn-primary !py-1.5 !px-3 text-xs"
                      className="grid grid-cols-2 gap-3 border-t border-[#2a2a22] pt-3"
                    >
                      <input type="hidden" name="seasonPlayerId" value={p.id} />
                      <input type="hidden" name="seasonId" value={seasonId} />
                      <label className="flex flex-col gap-1 text-dim text-xs">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
                          <MapPinIcon className="size-3" aria-hidden />
                          {t.core.common.position}
                        </span>
                        <input name="position" type="number" placeholder={String(p.position)} />
                      </label>
                      <label className="flex flex-col gap-1 text-dim text-xs">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
                          <BanknotesIcon className="size-3" aria-hidden />
                          {t.core.common.balance}
                        </span>
                        <input name="balancePoints" type="number" placeholder={String(p.balancePoints)} />
                      </label>
                      <label className="flex flex-col gap-1 text-dim text-xs">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-dim">
                          <ShieldCheckIcon className="size-3" aria-hidden />
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
                      <label className="flex flex-col gap-1 text-dim text-xs col-span-2">
                        <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.players.reasonLabel}</span>
                        <input name="reason" required placeholder={t.admin.players.reasonPlaceholder} />
                      </label>
                    </FormShell>

                    <div className="flex justify-end border-t border-[#2a2a22] pt-2">
                      <form action={removePlayerFromSeasonAction}>
                        <input type="hidden" name="seasonId" value={seasonId} />
                        <input type="hidden" name="playerId" value={p.playerId} />
                        <ConfirmButton
                          message={format(t.admin.players.removeConfirm, { name })}
                          className="hud-btn hud-btn-danger !px-3 !py-1 text-xs inline-flex items-center gap-1.5"
                        >
                          <TrashIcon className="size-3.5" aria-hidden />
                          {t.admin.players.removeButton}
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}