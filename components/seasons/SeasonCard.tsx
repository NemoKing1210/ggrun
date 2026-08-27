import Link from "next/link";
import {
  UsersIcon,
  MapIcon,
  ClockIcon,
  FlagIcon,
  TrophyIcon,
  ArrowRightIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";

import { StatusBadge } from "@/components/ui/status";
import type { Season, BoardCell } from "@/db/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function formatDuration(startedAt: Date | null, finishedAt: Date | null) {
  if (!startedAt) return "—";
  const end = finishedAt ?? new Date();
  const ms = end.getTime() - startedAt.getTime();
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d ${Math.floor((ms % 86400000) / 3600000)}h`;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h`;
  const mins = Math.floor(ms / 60000);
  return `${mins}m`;
}

function CellDistributionBar({ cells }: { cells: BoardCell[] }) {
  if (cells.length === 0) return null;
  const counts = cells.reduce<Record<string, number>>((acc, c) => {
    acc[c.cellType] = (acc[c.cellType] ?? 0) + 1;
    return acc;
  }, {});
  const total = cells.length;
  const order: Array<{ type: string; color: string }> = [
    { type: "start", color: "bg-zinc-500" },
    { type: "bonus", color: "bg-emerald-500" },
    { type: "penalty", color: "bg-danger" },
    { type: "teleport", color: "bg-violet-500" },
    { type: "event", color: "bg-sky-500" },
    { type: "normal", color: "bg-[#3d3d34]" },
    { type: "finish", color: "bg-amber" },
  ];
  return (
    <div className="flex h-1.5 w-full overflow-hidden border border-[#2a2a22] bg-[#151514] [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" aria-hidden>
      {order.map((o) => {
        const cnt = counts[o.type] ?? 0;
        if (!cnt) return null;
        return <div key={o.type} className={`${o.color} h-full`} style={{ width: `${(cnt / total) * 100}%` }} title={`${o.type}: ${cnt}`} />;
      })}
    </div>
  );
}

export type SeasonCardStats = {
  participants: number;
  cells: number;
  moves?: number;
  topPlayerName?: string | null;
  boardCells?: BoardCell[];
};

export function SeasonCard({
  season,
  t,
  locale,
  stats,
  isCurrent,
}: {
  season: Season;
  t: Dictionary;
  locale: string;
  stats?: SeasonCardStats;
  isCurrent?: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  });

  const duration = formatDuration(season.startedAt, season.finishedAt);
  const started = season.startedAt ? dateFmt.format(season.startedAt) : "—";
  const finished = season.finishedAt ? dateFmt.format(season.finishedAt) : season.status === "active" ? "—" : "—";
  const isActive = season.status === "active";
  const isPaused = season.status === "paused";

  return (
    <Link
      href={`/seasons/${season.slug}`}
      className={`hud-card hud-lift group flex flex-col overflow-hidden p-0 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] ${
        isCurrent ? "border-amber/40 shadow-[0_0_18px_rgba(242,169,0,0.12)]" : ""
      }`}
    >
      {isCurrent && <div className="h-1 w-full bg-amber" aria-hidden />}
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center bg-raised border border-[#3d3d34] text-dim group-hover:text-amber group-hover:border-amber/30 transition-colors [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                <FlagIcon className="size-3.5" aria-hidden />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-dim">/{season.slug}</span>
              {isCurrent && (
                <span className="inline-flex items-center gap-1 border border-amber bg-amber/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber">
                  <span className="size-1 bg-amber animate-pulse [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                  {t.seasons.detail.currentBadge}
                </span>
              )}
            </div>
            <h3 className="mt-2 line-clamp-1 font-display text-xl uppercase tracking-wide leading-none group-hover:text-amber transition-colors">
              {season.title}
            </h3>
          </div>
          <StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />
        </div>

        {/* Dates row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="border border-[#2a2a22] bg-[#1a1a18] p-2.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <div className="flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-widest text-dim">
              <ClockIcon className="size-3" aria-hidden /> {t.seasons.card.startedAt}
            </div>
            <div className="mt-1 font-mono text-xs leading-none">{started}</div>
          </div>
          <div className="border border-[#2a2a22] bg-[#1a1a18] p-2.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.card.finishedAt}</div>
            <div className="mt-1 font-mono text-xs leading-none">{finished}</div>
          </div>
          <div className={`border p-2.5 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${isActive ? "border-amber/30 bg-amber/10" : isPaused ? "border-dim/30 bg-raised" : "border-[#2a2a22] bg-[#1a1a18]"}`}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.card.duration}</div>
            <div className="mt-1 font-mono text-xs leading-none text-amber">{duration}</div>
          </div>
        </div>

        {/* Stats pills */}
        {stats && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2 border border-dim/20 bg-raised/40 px-2.5 py-2 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <UsersIcon className="size-3.5 text-dim shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="ammo-counter text-sm leading-none text-foreground">{stats.participants}</div>
                <div className="font-mono text-[10px] uppercase leading-none tracking-widest text-dim truncate">{t.seasons.overview.statPlayers}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 border border-dim/20 bg-raised/40 px-2.5 py-2 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <MapIcon className="size-3.5 text-dim shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="ammo-counter text-sm leading-none text-foreground">{stats.cells}</div>
                <div className="font-mono text-[10px] uppercase leading-none tracking-widest text-dim truncate">{t.seasons.card.cells.replace("{count}", "").trim()}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 border border-dim/20 bg-raised/40 px-2.5 py-2 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
              <SignalIcon className="size-3.5 text-dim shrink-0" aria-hidden />
              <div className="min-w-0">
                <div className="ammo-counter text-sm leading-none text-foreground">{stats.moves ?? 0}</div>
                <div className="font-mono text-[10px] uppercase leading-none tracking-widest text-dim truncate">{t.seasons.overview.statMoves}</div>
              </div>
            </div>
          </div>
        )}

        {/* Top player + board bar */}
        {stats?.topPlayerName ? (
          <div className="mt-3 flex items-center gap-2 border border-amber/20 bg-amber/5 px-2.5 py-2 [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <TrophyIcon className="size-3.5 text-amber shrink-0" aria-hidden />
            <span className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.card.topPlayer}</span>
            <span className="ml-auto truncate font-mono text-xs text-amber">{stats.topPlayerName}</span>
          </div>
        ) : stats ? (
          <div className="mt-3 border border-dashed border-dim/20 bg-background/20 px-2.5 py-2 text-center font-mono text-xs text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            {t.seasons.overview.noPlayers}
          </div>
        ) : null}

        {stats?.boardCells && stats.boardCells.length > 0 && (
          <div className="mt-3">
            <CellDistributionBar cells={stats.boardCells} />
            <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-dim">
              <span>{timeFmt.format(season.startedAt ?? new Date())}</span>
              <span>{stats.cells} cells</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-auto flex gap-1.5 border-t border-[#2a2a22] bg-[#151514]/60 p-2.5">
        <span className="hud-btn hud-btn-primary flex-1 justify-center !py-1.5 !text-xs inline-flex items-center gap-1">
          {t.seasons.card.viewSeason} <ArrowRightIcon className="size-3" aria-hidden />
        </span>
        <span className="hud-btn flex-1 justify-center !py-1.5 !text-xs hidden sm:inline-flex">
          {t.seasons.tabs.board}
        </span>
        <span className="hud-btn flex-1 justify-center !py-1.5 !text-xs hidden sm:inline-flex">
          {t.seasons.tabs.leaderboard}
        </span>
      </div>
    </Link>
  );
}
