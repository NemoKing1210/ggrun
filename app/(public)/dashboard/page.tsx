import { redirect } from "next/navigation";

import RollCard from "@/components/dashboard/RollCard";
import Link from "next/link";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
import { CELL_THEME } from "@/components/board/cell-theme";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status";
import { getCurrentUser } from "@/lib/auth/session";
import { getOpenRoll, getRecentRolls, getPendingRerollForPlayer } from "@/lib/repositories/games.repo";
import { getPlayerMoves, getSeasonPlayerForUser } from "@/lib/repositories/players.repo";
import { getActiveSeason, getBoardCells, getMainBoard } from "@/lib/repositories/seasons.repo";
import { getT } from "@/lib/i18n/server";
import { format } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

const dateLocales: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  uk: "uk-UA",
};

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="hud-card px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{label}</div>
      <div className={`ammo-counter mt-1 truncate text-xl ${accent ? "text-amber" : ""}`} title={value}>
        {value}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { locale, t } = await getT();

  const season = await getActiveSeason();
  if (!season) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader title={t.core.dashboard.heading} />
        <EmptyState>{t.core.dashboard.noActiveSeason}</EmptyState>
      </main>
    );
  }

  const seasonPlayer = await getSeasonPlayerForUser(season.id, user.id);
  if (!seasonPlayer) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          kicker={format(t.core.common.seasonKicker, { season: season.title })}
          title={t.core.dashboard.heading}
          right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
        />
        <EmptyState>{t.core.dashboard.notInSeason}</EmptyState>
      </main>
    );
  }

  const [openRoll, pendingReroll, lastMoves, recentRolls, board] = await Promise.all([
    getOpenRoll(seasonPlayer.id),
    getPendingRerollForPlayer(seasonPlayer.id),
    getPlayerMoves(seasonPlayer.id, 12),
    getRecentRolls(seasonPlayer.id, 12),
    getMainBoard(season.id),
  ]);

  const cells = board ? await getBoardCells(board.id) : [];
  const totalCells = cells.length || 1;
  const progressPct = Math.round((seasonPlayer.position / Math.max(1, totalCells - 1)) * 100);

  const dateFormatter = new Intl.DateTimeFormat(dateLocales[locale], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  const kicker = format(t.core.dashboard.seasonLine, {
    season: season.title,
    player: user.displayName ?? user.username,
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <Link
        href={"/players/" + user.username}
        className="flex no-underline items-center gap-3 self-start transition hover:text-amber"
        title={user.displayName ?? user.username}
      >
        <AvatarBadge name={user.displayName ?? user.username} src={user.avatarUrl ?? null} size="md" />
        <span className="font-display text-lg uppercase tracking-wide text-current">
          {user.displayName ?? user.username}
        </span>
      </Link>
      <PageHeader
        kicker={kicker}
        title={t.core.dashboard.heading}
        right={<StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />}
      />

      {/* --- Stats --- */}
      <section aria-label={t.core.dashboard.statsTitle}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label={t.core.dashboard.statPosition} value={`${seasonPlayer.position} / ${Math.max(0, totalCells - 1)}`} accent />
          <StatTile label={t.core.dashboard.statBalance} value={String(seasonPlayer.balancePoints)} accent />
          <StatTile label={t.core.dashboard.statStreakPass} value={String(seasonPlayer.streakPass)} />
          <StatTile label={t.core.dashboard.statStreakDrop} value={String(seasonPlayer.streakDrop)} />
          <StatTile label={t.core.dashboard.statRerolls} value={String(seasonPlayer.rerollsUsed)} />
          <StatTile label={t.core.dashboard.statProgress} value={`${progressPct}%`} accent />
        </div>
        <div className="mt-3 h-2 w-full bg-[#151514] border border-[#3d3d34]">
          <div className="h-full bg-amber transition-all" style={{ width: `${Math.min(100, progressPct)}%` }} />
        </div>
      </section>

      {/* --- Board progress mini --- */}
      {cells.length > 0 ? (
        <section aria-label={t.core.dashboard.boardProgressTitle} className="hud-card p-4">
          <h2 className="font-display text-sm uppercase tracking-widest text-dim">
            {t.core.dashboard.boardProgressTitle}
          </h2>
          <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10 lg:grid-cols-12">
            {cells.map((cell) => {
              const theme = CELL_THEME[cell.cellType];
              const isHere = cell.position === seasonPlayer.position;
              return (
                <div
                  key={cell.id}
                  className={`relative flex aspect-square flex-col items-center justify-center border p-1 text-center ${theme.box} ${isHere ? "ring-2 ring-amber ring-offset-1 ring-offset-raised" : ""}`}
                  title={cell.label ? `${t.core.cellTypes[cell.cellType]}: ${cell.label}` : t.core.cellTypes[cell.cellType]}
                >
                  <span className="ammo-counter text-xs leading-none">{cell.position}</span>
                  {isHere ? (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-amber px-1 font-mono text-[8px] leading-none text-background">{t.core.dashboard.youHere}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {(Object.keys(CELL_THEME) as Array<keyof typeof CELL_THEME>)
              .filter((k) => k !== "normal")
              .map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                  <span className={`inline-block size-2 ${CELL_THEME[k].dot}`} aria-hidden />
                  {t.core.cellTypes[k]}
                </span>
              ))}
          </div>
        </section>
      ) : null}

      {/* --- Current game --- */}
      <RollCard
        seasonPlayerId={seasonPlayer.id}
        openRoll={
          openRoll
            ? {
                id: openRoll.id,
                game: openRoll.game
                  ? { title: openRoll.game.title, platform: openRoll.game.platform, coverUrl: openRoll.game.coverUrl }
                  : null,
                rolledAt: openRoll.rolledAt.toISOString(),
              }
            : null
        }
        pendingReroll={
          pendingReroll
            ? { id: pendingReroll.id, reason: pendingReroll.reason, requestedAt: pendingReroll.requestedAt.toISOString() }
            : null
        }
        rerollsUsed={seasonPlayer.rerollsUsed}
        lastDice={lastMoves[0]?.diceResults ?? null}
      />

      {/* --- Game history (with ratings) --- */}
      <section aria-label={t.core.dashboard.history} className="grid gap-6 lg:grid-cols-2">
        <div className="hud-card p-5">
          <h2 className="font-display text-lg uppercase tracking-widest">{t.core.dashboard.history}</h2>
          {lastMoves.length === 0 ? (
            <p className="mt-3 text-sm text-dim">{t.core.dashboard.historyEmpty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#3d3d34]">
              {lastMoves.map((move) => (
                <li key={move.id} className="flex items-center gap-3 py-2.5">
                  <span className="ammo-counter shrink-0 text-sm text-amber w-16">{move.diceResults.join("+")}</span>
                  <span className="font-mono text-sm">{format(t.core.dashboard.moveFormat, { from: move.fromPosition, to: move.toPosition })}</span>
                  <span className="hidden items-center gap-1.5 sm:inline-flex">
                    {move.cellLandedType ? (
                      <>
                        <span className={`inline-block size-2 ${CELL_THEME[move.cellLandedType].dot}`} aria-hidden />
                        <span className="font-mono text-xs uppercase tracking-widest text-dim">{t.core.cellTypes[move.cellLandedType]}</span>
                      </>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </span>
                  <time dateTime={move.createdAt.toISOString()} className="ml-auto hidden shrink-0 font-mono text-xs text-dim sm:block">
                    {dateFormatter.format(move.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hud-card p-5">
          <h2 className="font-display text-lg uppercase tracking-widest">{t.core.dashboard.games}</h2>
          {recentRolls.length === 0 ? (
            <p className="mt-3 text-sm text-dim">{t.core.dashboard.historyEmpty}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {recentRolls.slice(0, 8).map((roll) => (
                <li key={roll.id} className="border border-[#3d3d34] bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm leading-tight">{roll.game?.title ?? t.core.dashboard.missingCatalogEntry}</span>
                    <span
                      className={`shrink-0 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                        roll.status === "passed"
                          ? "border-military bg-military/20 text-military"
                          : roll.status === "dropped"
                            ? "border-danger bg-danger/15 text-danger"
                            : roll.status === "rerolled"
                              ? "border-dim/40 bg-raised text-dim"
                              : "border-amber/60 bg-amber/15 text-amber"
                      }`}
                    >
                      {roll.status}
                    </span>
                  </div>
                  {roll.game?.platform ? (
                    <span className="mt-1 inline-block border border-dim/40 px-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                      {roll.game.platform}
                    </span>
                  ) : null}
                  {roll.rating ? (
                    <div className="mt-2 font-mono text-xs text-amber">★ {roll.rating}/10</div>
                  ) : null}
                  {roll.notes ? (
                    <p className="mt-1 line-clamp-2 text-sm text-dim">“{roll.notes}”</p>
                  ) : null}
                  <time dateTime={roll.rolledAt.toISOString()} className="mt-2 block font-mono text-xs text-dim">
                    {dateFormatter.format(roll.rolledAt)}
                    {roll.resolvedAt ? ` → ${dateFormatter.format(roll.resolvedAt)}` : ""}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
