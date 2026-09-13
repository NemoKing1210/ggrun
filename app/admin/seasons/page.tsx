import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  Squares2X2Icon,
  TagIcon,
  TrophyIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { redirect } from "next/navigation";

import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import {
  getBoardCells,
  getMainBoard,
  listSeasons,
} from "@/lib/modules/season/repository/seasons";
import {
  getActiveRolls,
  getLeaderboard,
  getSeasonStats,
  type LeaderboardRow,
  type SeasonStats,
} from "@/lib/modules/season/repository/players";
import {
  changeStatusAction,
  resetSeasonDirectAction,
} from "@/lib/modules/season/actions/seasons";
import { FormShell } from "@/components/admin/FormShell";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SeasonCreateModal } from "@/components/admin/SeasonCreateModal";
import { PresenceAvatar } from "@/components/ui/Presence";
import { StatusBadge } from "@/components/ui/status";
import { format } from "@/lib/i18n/format";
import { getT } from "@/lib/i18n/server";
import type { Season } from "@/db/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const statusFlow: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["paused", "finished"],
  paused: ["active", "finished"],
  finished: ["archived"],
  archived: [],
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t.admin.nav.seasons} — GGRun` };
}

type SeasonOverview = {
  season: Season;
  roster: LeaderboardRow[];
  stats: SeasonStats;
  boardSize: number;
  liveRolls: number;
};

async function loadOverview(season: Season): Promise<SeasonOverview> {
  const [roster, stats, board, active] = await Promise.all([
    getLeaderboard(season.id),
    getSeasonStats(season.id),
    getMainBoard(season.id),
    getActiveRolls(season.id),
  ]);
  const cells = board ? await getBoardCells(board.id) : [];
  return {
    season,
    roster,
    stats,
    boardSize: cells.length,
    liveRolls: active.length,
  };
}

function fmtDate(value: Date | null, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="border border-[#2a2a22] bg-background px-2.5 py-2">
      <div className="font-display text-lg leading-none text-zinc-100">
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
        {label}
      </div>
    </div>
  );
}

function StatusControls({
  season,
  activeSeason,
  t,
}: {
  season: Season;
  activeSeason: Season | null;
  t: Dictionary;
}) {
  const next = statusFlow[season.status] ?? [];
  const canReset =
    season.status !== "draft" &&
    season.status !== "archived" &&
    (!activeSeason || activeSeason.id === season.id);
  const resetLocked =
    season.status !== "draft" &&
    season.status !== "archived" &&
    activeSeason &&
    activeSeason.id !== season.id;
  if (next.length === 0 && !canReset && !resetLocked) {
    return <span className="font-mono text-xs text-dim">—</span>;
  }
  return (
    <>
      {next.map((target) => {
        const locked =
          target === "active" && activeSeason && activeSeason.id !== season.id;
        if (locked) {
          return (
            <span
              key={target}
              title={format(t.admin.overview.activeLockedHint, {
                title: activeSeason.title,
              })}
              className="hud-btn inline-flex cursor-not-allowed items-center gap-1 !px-2.5 !py-1 text-[11px] leading-none opacity-50 line-through decoration-zinc-500"
              aria-disabled="true"
            >
              <LockClosedIcon className="size-3" aria-hidden />
              {
                t.core.seasonStatuses[
                  target as keyof typeof t.core.seasonStatuses
                ]
              }
            </span>
          );
        }
        return (
          <FormShell
            key={target}
            action={changeStatusAction}
            submitLabel={
              t.core.seasonStatuses[
                target as keyof typeof t.core.seasonStatuses
              ]
            }
            className="inline-flex items-center gap-2"
            submitClassName="hud-btn !py-1 !px-2.5 text-[11px] leading-none"
            confirmMessage={format(
              t.admin.overview.statusConfirm[
                target as keyof typeof t.admin.overview.statusConfirm
              ],
              { season: season.title },
            )}
            confirmDanger={target === "finished" || target === "archived"}
          >
            <input type="hidden" name="seasonId" value={season.id} />
            <input type="hidden" name="status" value={target} />
          </FormShell>
        );
      })}
      {resetLocked ? (
        <span
          title={format(t.admin.overview.activeLockedHint, {
            title: activeSeason.title,
          })}
          className="hud-btn hud-btn-danger inline-flex cursor-not-allowed items-center gap-1 !px-2.5 !py-1 text-[11px] leading-none opacity-50"
          aria-disabled="true"
        >
          <LockClosedIcon className="size-3" aria-hidden />
          {t.admin.overview.resetButton}
        </span>
      ) : null}
      {canReset ? (
        <form action={resetSeasonDirectAction} className="inline-flex">
          <input type="hidden" name="seasonId" value={season.id} />
          <ConfirmButton
            message={format(t.admin.overview.resetConfirm, {
              season: season.title,
            })}
            className="hud-btn hud-btn-danger inline-flex items-center gap-1 !px-2.5 !py-1 text-[11px] leading-none"
          >
            <ArrowPathIcon className="size-3" aria-hidden />
            {t.admin.overview.resetButton}
          </ConfirmButton>
        </form>
      ) : null}
    </>
  );
}

function SeasonCard({
  overview,
  activeSeason,
  t,
  locale,
}: {
  overview: SeasonOverview;
  activeSeason: Season | null;
  t: Dictionary;
  locale: string;
}) {
  const { season, roster, stats, boardSize, liveRolls } = overview;
  const o = t.admin.overview;
  const isActive = season.status === "active";
  const leader = roster[0] ?? null;
  const shown = roster.slice(0, 8);
  const progress =
    leader && boardSize > 0
      ? Math.min(100, Math.round((leader.position / boardSize) * 100))
      : 0;
  const dates = [
    season.startedAt
      ? format(o.startedOn, {
          date: fmtDate(season.startedAt, locale) ?? "",
        })
      : format(o.createdOn, {
          date: fmtDate(season.createdAt, locale) ?? "",
        }),
    season.finishedAt
      ? format(o.finishedOn, {
          date: fmtDate(season.finishedAt, locale) ?? "",
        })
      : null,
  ].filter(Boolean);

  return (
    <article className="hud-card overflow-hidden p-0">
      {/* Title band */}
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 ${
          isActive
            ? "border-amber/25 bg-amber/[0.06]"
            : "border-[#3d3d34] bg-raised/40"
        }`}
      >
        <StatusBadge
          kind="season"
          status={season.status}
          label={t.core.seasonStatuses[season.status]}
        />
        <h3 className="font-display text-lg uppercase leading-none tracking-widest text-zinc-100">
          {season.title}
        </h3>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-dim">
          <TagIcon className="size-3" aria-hidden />
          {season.slug}
        </span>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-dim">
          {dates.join(" · ")}
        </span>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* Roster */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-dim">
              {o.roster} · {roster.length}
            </span>
            {shown.length > 0 ? (
              <div className="flex -space-x-2">
                {shown.map((p) => (
                  <PresenceAvatar
                    key={p.id}
                    username={p.username}
                    userId={p.playerId}
                    displayName={p.displayName}
                    avatarUrl={p.avatarUrl}
                    lastSeenAt={p.lastSeenAt}
                    size="sm"
                    variant="admin"
                  />
                ))}
                {roster.length > shown.length ? (
                  <span className="inline-flex size-8 items-center justify-center border border-dim/30 bg-raised font-mono text-[10px] text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    +{roster.length - shown.length}
                  </span>
                ) : null}
              </div>
            ) : (
              <span className="font-sans text-xs text-dim">{o.noPlayers}</span>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat value={roster.length} label={o.statsPlayers} />
            <Stat value={boardSize} label={o.statsCells} />
            <Stat value={stats.totalMoves} label={o.statsMoves} />
            <Stat value={stats.passedRolls} label={o.statsPassed} />
            <Stat value={stats.droppedRolls} label={o.statsDropped} />
            <Stat value={liveRolls} label={o.statsLive} />
          </div>
        </div>

        {/* Leader */}
        <div className="flex min-w-0 flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-amber">
            <TrophyIcon className="size-3.5" aria-hidden />
            {o.leader}
          </span>
          {leader ? (
            <div className="border border-amber/25 bg-amber/[0.05] p-3">
              <div className="flex min-w-0 items-center gap-3">
                <PresenceAvatar
                  username={leader.username}
                  userId={leader.playerId}
                  displayName={leader.displayName}
                  avatarUrl={leader.avatarUrl}
                  lastSeenAt={leader.lastSeenAt}
                  size="md"
                  variant="admin"
                />
                <div className="min-w-0">
                  <div className="truncate font-display text-sm uppercase tracking-wide text-zinc-100">
                    {leader.displayName ?? leader.username}
                  </div>
                  <div className="truncate font-mono text-[11px] text-dim">
                    @{leader.username} · {t.leaderboard.cellLabel}{" "}
                    {leader.position} · {leader.balancePoints}{" "}
                    {t.leaderboard.abbrev.points}
                  </div>
                </div>
                <span className="ml-auto shrink-0 font-display text-xl leading-none text-amber">
                  {progress}%
                </span>
              </div>
              <div
                className="mt-2.5 h-1.5 w-full border border-[#2a2a22] bg-[#151514]"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-amber" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
                {t.leaderboard.progress} · {leader.position}/{boardSize}
              </div>
            </div>
          ) : (
            <div className="border border-[#2a2a22] bg-background p-3 font-sans text-xs text-dim">
              {o.noPlayers}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#2a2a22] px-4 py-3">
        <StatusControls season={season} activeSeason={activeSeason} t={t} />
        <span className="mx-1 hidden h-4 w-px bg-dim/20 sm:block" aria-hidden />
        <span className="flex flex-wrap gap-1.5 sm:ml-auto">
          <Link
            href={`/admin/seasons/${season.id}`}
            className="hud-btn inline-flex items-center gap-1 !px-2.5 !py-1 text-[11px]"
          >
            <Cog6ToothIcon className="size-3" aria-hidden />
            {o.linkSettings}
          </Link>
          <Link
            href={`/admin/seasons/${season.id}/board`}
            className="hud-btn inline-flex items-center gap-1 !px-2.5 !py-1 text-[11px]"
          >
            <Squares2X2Icon className="size-3" aria-hidden />
            {o.linkBoard}
          </Link>
          <Link
            href={`/admin/seasons/${season.id}/players`}
            className="hud-btn inline-flex items-center gap-1 !px-2.5 !py-1 text-[11px]"
          >
            <UsersIcon className="size-3" aria-hidden />
            {o.linkPlayers}
          </Link>
        </span>
      </div>
    </article>
  );
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) redirect("/login");
  const { t, locale } = await getT();

  const seasons = await listSeasons();
  const activeSeason = seasons.find((s) => s.status === "active") ?? null;
  const overviews = (
    await Promise.all(seasons.map((s) => loadOverview(s)))
  ).sort((a, b) => {
    if (a.season.status === "active" && b.season.status !== "active") return -1;
    if (b.season.status === "active" && a.season.status !== "active") return 1;
    return (
      new Date(b.season.createdAt).getTime() -
      new Date(a.season.createdAt).getTime()
    );
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center border border-amber/40 bg-amber/10 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <CalendarDaysIcon className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-3xl uppercase tracking-widest text-amber leading-none">
              {t.admin.nav.seasons}
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-widest text-dim">
              {seasons.length} {seasons.length === 1 ? "season" : "seasons"} ·
              HUD tactical console
            </p>
          </div>
          <span className="ml-auto hidden items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim sm:inline-flex">
            <span
              className="size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]"
              aria-hidden
            />
            {t.admin.nav.console}
          </span>
          <SeasonCreateModal seasons={seasons} />
        </div>
        <div className="hazard-tape my-4" aria-hidden />
      </section>

      {/* Seasons list */}
      <section className="hud-card p-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
          <span className="inline-flex size-7 items-center justify-center border border-dim/30 bg-background text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <Squares2X2Icon className="size-4" aria-hidden />
          </span>
          <h2 className="font-display text-sm uppercase tracking-widest">{t.admin.overview.seasons}</h2>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-widest text-dim">
            {seasons.length === 0 ? t.admin.overview.empty : `${seasons.length} total`}
          </span>
        </div>

        {activeSeason && (
          <div className="flex items-start gap-2.5 border-b border-amber/20 bg-amber/[0.06] px-4 py-3">
            <LockClosedIcon className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
            <p className="font-sans text-xs leading-snug text-amber/90">
              {format(t.admin.overview.activeSeasonBanner, { title: activeSeason.title })}
            </p>
          </div>
        )}

        {overviews.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-mono text-sm uppercase tracking-widest text-dim">{t.admin.overview.empty}</p>
            <p className="mt-2 text-xs text-dim">{t.admin.overview.emptyHint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {overviews.map((overview) => (
              <SeasonCard
                key={overview.season.id}
                overview={overview}
                activeSeason={activeSeason}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick links */}
      <section className="hud-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.admin.overview.navigateLabel}</span>
          <span className="h-3 w-px bg-dim/20" aria-hidden />
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/games" className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5">
              {t.admin.overview.catalogLink}
              <ArrowRightIcon className="h-3 w-3" aria-hidden />
            </Link>
            <Link href="/admin/audit" className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5">
              {t.admin.overview.auditLink}
              <ArrowRightIcon className="h-3 w-3" aria-hidden />
            </Link>
            <Link href="/admin/moderation" className="hud-btn !py-1.5 !px-3 text-xs inline-flex items-center gap-1.5">
              {t.admin.nav.moderation}
              <ArrowRightIcon className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
