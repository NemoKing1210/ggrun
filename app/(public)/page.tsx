import Link from "next/link";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  TrophyIcon,
  UsersIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { FeedList } from "@/components/feed/feed-list";
import { SeasonUptime } from "@/components/landing/SeasonUptime";
import { StatusBadge } from "@/components/ui/status";
import { PageContainer } from "@/components/ui/PageContainer";
import { SeasonMissing } from "@/components/ui/season-missing";
import { AvatarWithPresence } from "@/components/ui/Presence";
import {
  getEventFeed,
  getLeaderboard,
  getSeasonStats,
  type LeaderboardRow,
} from "@/lib/modules/season/repository/players";
import {
  getActiveSeason,
  getBoardCells,
  getMainBoard,
  listArchivedSeasons,
} from "@/lib/modules/season/repository/seasons";
import { getT } from "@/lib/i18n/server";

type T = Awaited<ReturnType<typeof getT>>["t"];

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.landing.metaTitle };
}

function PlayerAvatar({
  username,
  displayName,
  avatarUrl,
  size = "sm",
}: {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "size-16" : size === "md" ? "size-12" : "size-8";
  const font = size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-xs";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${dim} shrink-0 border border-dim/30 object-cover`}
      />
    );
  }
  return (
    <span
      className={`inline-flex ${dim} shrink-0 items-center justify-center border border-dim/30 bg-raised font-display text-dim ${font}`}
    >
      {(displayName ?? username).slice(0, 2).toUpperCase()}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden border border-dim/20 bg-[#111110] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
      <div className="h-full bg-amber transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "amber",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  tone?: "amber" | "military" | "danger";
}) {
  const toneClass =
    tone === "military" ? "text-military" : tone === "danger" ? "text-danger" : "text-amber";
  return (
    <div className="border border-dim/20 bg-[#1a1a18] px-3 py-2.5">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div className={`ammo-counter mt-1 text-xl leading-none ${toneClass}`}>{value}</div>
    </div>
  );
}

function ChampionRow({
  row,
  rank,
  boardSize,
  t,
}: {
  row: LeaderboardRow;
  rank: number;
  boardSize: number;
  t: T;
}) {
  const progress =
    boardSize > 1 ? Math.round((row.position / (boardSize - 1)) * 100) : row.position ? 100 : 0;
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <Link
      href={`/players/${row.username}`}
      className="hud-lift group block overflow-hidden border border-amber/40 bg-[#1a1a18]"
    >
      <div className="relative h-24 overflow-hidden border-b border-amber/20 bg-raised">
        {row.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.bannerUrl}
            alt=""
            className="size-full object-cover opacity-80 transition duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,#1a1a18_0_14px,#22221e_14px_28px)]">
            <div className="absolute inset-0 bg-gradient-to-br from-amber/15 via-transparent to-military/15" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 border border-amber bg-amber px-2 py-0.5 font-display text-[11px] uppercase tracking-widest text-black">
          <TrophyIcon className="h-3.5 w-3.5" aria-hidden />
          #{rank} {t.leaderboard.champion}
        </div>
        <div className="absolute right-3 top-3">
          <StatusBadge status={row.status} label={t.core.playerStatuses[row.status]} />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-end gap-3">
          <div className="-mt-10 shrink-0">
            <AvatarWithPresence lastSeenAt={row.lastSeenAt} size="md">
              <div className="border-2 border-amber bg-raised p-0.5">
                <PlayerAvatar
                  username={row.username}
                  displayName={row.displayName}
                  avatarUrl={row.avatarUrl}
                  size="md"
                />
              </div>
            </AvatarWithPresence>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg uppercase leading-tight tracking-wide group-hover:text-amber">
              {row.displayName ?? row.username}
            </p>
            <p className="truncate font-mono text-xs text-dim">@{row.username}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="ammo-counter text-2xl leading-none text-amber">{row.balancePoints}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-dim">
              {t.leaderboard.abbrev.points}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <ProgressBar value={clamped} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="border border-dim/15 bg-raised/40 px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
              {t.leaderboard.columns.cell}
            </div>
            <div className="ammo-counter text-sm text-amber">
              {row.position}
              <span className="font-mono text-[10px] text-dim"> / {boardSize - 1}</span>
            </div>
          </div>
          <div className="border border-dim/15 bg-raised/40 px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
              {t.leaderboard.abbrev.passDrop}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-2 font-mono text-sm">
              <span className="inline-flex items-center gap-0.5 text-military">
                <ChevronUpIcon className="h-3 w-3" aria-hidden />
                {row.streakPass}
              </span>
              <span className="inline-flex items-center gap-0.5 text-danger">
                <ChevronDownIcon className="h-3 w-3" aria-hidden />
                {row.streakDrop}
              </span>
            </div>
          </div>
          <div className="border border-dim/15 bg-raised/40 px-2 py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
              {t.leaderboard.progress}
            </div>
            <div className="ammo-counter text-sm text-amber">{clamped}%</div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TopRow({ row, rank, t }: { row: LeaderboardRow; rank: number; t: T }) {
  const rankClass =
    rank === 2
      ? "border-zinc-400 bg-zinc-300 text-black"
      : rank === 3
        ? "border-[#c98f00] bg-[#8a5f00] text-white"
        : "border-dim/20 bg-raised text-dim";
  return (
    <li>
      <Link
        href={`/players/${row.username}`}
        className="group flex items-center gap-3 border border-dim/20 bg-[#1a1a18] p-2.5 transition-colors hover:border-amber/30"
      >
        <span
          className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center border px-1.5 font-mono text-xs tracking-widest ${rankClass}`}
        >
          {rank}
        </span>
        <AvatarWithPresence lastSeenAt={row.lastSeenAt} size="sm">
          <PlayerAvatar
            username={row.username}
            displayName={row.displayName}
            avatarUrl={row.avatarUrl}
            size="sm"
          />
        </AvatarWithPresence>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm uppercase leading-tight tracking-wide group-hover:text-amber">
            {row.displayName ?? row.username}
          </p>
          <p className="truncate font-mono text-[11px] text-dim">@{row.username}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-right sm:flex">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
              {t.leaderboard.columns.cell}
            </div>
            <div className="ammo-counter text-sm text-amber">{row.position}</div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
              {t.leaderboard.abbrev.points}
            </div>
            <div className="ammo-counter text-sm text-amber">{row.balancePoints}</div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="inline-flex items-center gap-0.5 text-military">
              <ChevronUpIcon className="h-3 w-3" aria-hidden />
              {row.streakPass}
            </span>
            <span className="inline-flex items-center gap-0.5 text-danger">
              <ChevronDownIcon className="h-3 w-3" aria-hidden />
              {row.streakDrop}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-right sm:hidden">
          <span className="ammo-counter text-sm text-amber">{row.position}</span>
          <span className="ammo-counter text-sm text-amber">{row.balancePoints}</span>
        </div>
      </Link>
    </li>
  );
}

export default async function HomePage() {
  const { t, locale } = await getT();
  const season = await getActiveSeason();
  if (!season) return <SeasonMissing />;

  const [top, feed, archived, board, stats] = await Promise.all([
    getLeaderboard(season.id),
    getEventFeed(season.id, 5),
    listArchivedSeasons(),
    getMainBoard(season.id),
    getSeasonStats(season.id),
  ]);
  const cells = board ? await getBoardCells(board.id) : [];
  const boardSize = cells.length || Math.max(40, ...top.map((r) => r.position + 1), 1);

  const sections = [
    { href: "/board", ...t.landing.sections.board },
    { href: "/leaderboard", ...t.landing.sections.leaderboard },
    { href: "/feed", ...t.landing.sections.feed },
    { href: "/rules", ...t.landing.sections.rules },
  ];

  const startedAtText = season.startedAt
    ? new Intl.DateTimeFormat(
        locale === "en" ? "en-US" : locale === "uk" ? "uk-UA" : "ru-RU",
        { day: "numeric", month: "long", year: "numeric" },
      ).format(season.startedAt)
    : null;

  const champion = top[0] ?? null;
  const rest = top.slice(1, 5);

  return (
    <PageContainer className="flex flex-col gap-8">
      <section className="hud-card overflow-hidden">
        <div className="hazard-tape h-2 w-full" />
        <div
          className="p-6 sm:p-8"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(242,169,0,0.07) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-dim">
              {t.landing.currentSeason}
            </p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-widest text-dim">
                /{season.slug}
              </span>
              <StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-4xl uppercase tracking-wide text-amber sm:text-5xl">
              {season.title}
            </h1>
            <Link href="/board" className="hud-btn hud-btn-primary inline-flex items-center gap-2">
              {t.landing.toBoard}
              <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          {season.startedAt ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-sm text-dim">
              <span className="inline-flex items-baseline gap-2">
                {t.landing.startedAt}
                <span className="text-zinc-300">{startedAtText}</span>
              </span>
              <SeasonUptime
                label={t.landing.uptime}
                startedAtIso={season.startedAt.toISOString()}
                initialSeconds={Math.max(
                  0,
                  Math.floor((Date.now() - season.startedAt.getTime()) / 1000),
                )}
              />
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-dim/20 pt-5 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile icon={UsersIcon} label={t.landing.statParticipants} value={top.length} />
            <StatTile icon={ArrowsRightLeftIcon} label={t.landing.statMoves} value={stats.totalMoves} />
            <StatTile
              icon={CheckCircleIcon}
              label={t.landing.statPassed}
              value={stats.passedRolls}
              tone="military"
            />
            <StatTile
              icon={XCircleIcon}
              label={t.landing.statDropped}
              value={stats.droppedRolls}
              tone="danger"
            />
            <StatTile icon={ArrowPathIcon} label={t.landing.statRerolls} value={stats.rerolls} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="hud-card p-6">
          <header className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl uppercase tracking-wide text-amber">
              {t.landing.topHeading}
            </h2>
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim hover:text-amber"
            >
              {t.landing.fullTableLink}
              <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </header>
          {top.length === 0 ? (
            <p className="font-mono text-sm uppercase tracking-widest text-dim">{t.landing.emptyTop}</p>
          ) : (
            <div className="space-y-2.5">
              {champion ? <ChampionRow row={champion} rank={1} boardSize={boardSize} t={t} /> : null}
              {rest.length > 0 ? (
                <ol className="space-y-2">
                  {rest.map((row, i) => (
                    <TopRow key={row.id} row={row} rank={i + 2} t={t} />
                  ))}
                </ol>
              ) : null}
            </div>
          )}
        </section>

        <section className="hud-card p-6">
          <header className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl uppercase tracking-wide text-amber">
              {t.landing.latestHeading}
            </h2>
            <Link
              href="/feed"
              className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim hover:text-amber"
            >
              {t.landing.fullFeedLink}
              <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </header>
          <FeedList rows={feed} />
        </section>
      </div>

      <nav className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="hud-btn justify-start">
            <span>
              {s.label}
              <br />
              <span className="font-mono text-xs font-normal normal-case tracking-normal text-dim">
                {s.hint}
              </span>
            </span>
          </Link>
        ))}
      </nav>

      <section className="hud-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl uppercase tracking-wide text-amber">
              {t.seasons.archiveTitle}
            </h2>
            <p className="mt-1 font-mono text-xs text-dim">{t.seasons.archiveDescription}</p>
          </div>
          <Link href="/seasons" className="hud-btn hud-btn-primary inline-flex items-center gap-1.5">
            {t.core.nav.seasons}
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {archived.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {archived.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/seasons/${s.slug}`}
                className="border border-dim/40 bg-raised px-3 py-1 font-mono text-xs hover:border-amber hover:text-amber"
              >
                {s.title} <span className="text-dim">/{s.slug}</span>
              </Link>
            ))}
            {archived.length > 6 ? (
              <span className="px-2 py-1 font-mono text-xs text-dim">+{archived.length - 6}</span>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 font-mono text-xs text-dim">{t.seasons.archiveEmpty}</p>
        )}
      </section>
    </PageContainer>
  );
}
