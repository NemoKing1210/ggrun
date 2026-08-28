"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CalendarDaysIcon,
  FlagIcon,
  TrophyIcon,
  UsersIcon,
  SignalIcon,
  FunnelIcon,
  SparklesIcon,
  ArrowRightIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

import { SeasonCard, type SeasonCardStats } from "./SeasonCard";
import { Badge } from "@/components/ui/Badge";
import type { Season } from "@/db/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

type SeasonWithStats = {
  season: Season;
  stats: SeasonCardStats;
  topPlayer?: string | null;
};

export function SeasonsArchiveClient({
  seasons,
  activeSeason,
  totalPlayers,
  t,
  locale,
}: {
  seasons: SeasonWithStats[];
  activeSeason: Season | null;
  totalPlayers: number;
  t: Dictionary;
  locale: string;
}) {
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "finished" | "archived">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: seasons.length, active: 0, paused: 0, finished: 0, archived: 0 };
    for (const s of seasons) c[s.season.status] = (c[s.season.status] ?? 0) + 1;
    return c;
  }, [seasons]);

  const filtered = useMemo(() => {
    if (filter === "all") return seasons;
    return seasons.filter((s) => s.season.status === filter);
  }, [seasons, filter]);

  const total = seasons.length;
  const finished = counts.finished ?? 0;
  const archived = counts.archived ?? 0;
  const active = counts.active ?? 0;

  // Find active spotlight data
  const spotlight = activeSeason ? seasons.find((s) => s.season.id === activeSeason.id) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-dim">{"// "}{format(t.seasons.archiveKicker, { count: String(total) })}</p>
            <h1 className="font-display text-3xl uppercase tracking-widest text-amber leading-none">{t.seasons.archiveTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{t.seasons.archiveDescription}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-dim">
            <CalendarDaysIcon className="size-3.5" aria-hidden /> {t.seasons.tabs.overview}
          </div>
        </div>
        <div className="hazard-tape mt-4" aria-hidden />
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="hud-card p-3 flex items-center gap-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="size-8 shrink-0 inline-flex items-center justify-center border border-[#3d3d34] bg-raised text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <FlagIcon className="size-4" aria-hidden />
          </span>
          <div>
            <div className="ammo-counter text-xl leading-none text-amber">{total}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.statsBar.total}</div>
          </div>
        </div>
        <div className="hud-card p-3 flex items-center gap-3 border-amber/20 bg-amber/5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="size-8 shrink-0 inline-flex items-center justify-center border border-amber/30 bg-amber/15 text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <SignalIcon className="size-4" aria-hidden />
          </span>
          <div>
            <div className="ammo-counter text-xl leading-none text-amber">{active}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.statsBar.active}</div>
          </div>
        </div>
        <div className="hud-card p-3 flex items-center gap-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="size-8 shrink-0 inline-flex items-center justify-center border border-military/30 bg-military/10 text-military [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <TrophyIcon className="size-4" aria-hidden />
          </span>
          <div>
            <div className="ammo-counter text-xl leading-none text-military">{finished + archived}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.statsBar.finished}</div>
          </div>
        </div>
        <div className="hud-card p-3 flex items-center gap-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <span className="size-8 shrink-0 inline-flex items-center justify-center border border-sky-800/50 bg-sky-950/20 text-sky-400 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            <UsersIcon className="size-4" aria-hidden />
          </span>
          <div>
            <div className="ammo-counter text-xl leading-none text-sky-400">{totalPlayers}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.statsBar.players}</div>
          </div>
        </div>
      </div>

      {/* Hero spotlight */}
      {spotlight ? (
        <Link href={`/seasons/${spotlight.season.slug}`} className="hud-card group relative overflow-hidden p-0 border-amber/30 bg-gradient-to-br from-amber/10 via-raised to-raised hover:brightness-110 transition-[filter] [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-amber" aria-hidden />
          <div className="absolute -right-8 -top-8 size-32 opacity-10 rotate-12 pointer-events-none">
            <FlagIcon className="size-full text-amber" aria-hidden />
          </div>
          <div className="p-5 sm:p-6 flex flex-col lg:flex-row gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="amber" size="sm" className="gap-1">
                  <span className="size-1.5 bg-amber animate-pulse [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden /> {t.seasons.hero.live}
                </Badge>
                <span className="font-mono text-xs uppercase tracking-widest text-dim">{t.seasons.hero.currentSeason}</span>
                <Badge variant="military" size="sm">{t.core.seasonStatuses[spotlight.season.status]}</Badge>
              </div>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl uppercase tracking-wide leading-none group-hover:text-amber transition-colors">
                {spotlight.season.title}
                <span className="ml-2 font-mono text-sm normal-case tracking-normal text-dim">/{spotlight.season.slug}</span>
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2 max-w-md">
                <div className="border border-amber/20 bg-amber/5 p-2 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <div className="ammo-counter text-lg leading-none text-amber">{spotlight.stats.participants}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.overview.statPlayers}</div>
                </div>
                <div className="border border-dim/20 bg-raised p-2 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <div className="ammo-counter text-lg leading-none">{spotlight.stats.cells}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.card.cells.replace("{count}", "").trim()}</div>
                </div>
                <div className="border border-dim/20 bg-raised p-2 text-center [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <div className="ammo-counter text-lg leading-none text-military">{spotlight.stats.moves ?? 0}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{t.seasons.overview.statMoves}</div>
                </div>
              </div>
              {spotlight.stats.topPlayerName && (
                <p className="mt-3 inline-flex items-center gap-1.5 border border-amber/20 bg-amber/10 px-2 py-1 font-mono text-xs text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <TrophyIcon className="size-3.5" aria-hidden /> {t.seasons.card.topPlayer}: {spotlight.stats.topPlayerName}
                </p>
              )}
            </div>
            <div className="flex lg:flex-col gap-2 lg:w-44 shrink-0">
              <span className="hud-btn hud-btn-primary flex-1 lg:flex-none justify-center gap-1.5 !py-2.5">
                {t.seasons.hero.openSeason} <ArrowRightIcon className="size-4" aria-hidden />
              </span>
              <div className="hidden lg:grid grid-cols-2 gap-1.5">
                <span className="hud-btn !py-1.5 !text-xs justify-center hidden lg:inline-flex">{t.seasons.hero.viewBoard}</span>
                <span className="hud-btn !py-1.5 !text-xs justify-center hidden lg:inline-flex">{t.seasons.hero.viewLeaderboard}</span>
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <div className="hud-card border-dashed p-6 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <SparklesIcon className="mx-auto size-6 text-dim" aria-hidden />
          <h2 className="mt-2 font-display text-lg uppercase tracking-wide text-dim">{t.seasons.hero.noActiveTitle}</h2>
          <p className="mt-1 text-sm text-zinc-500 max-w-lg mx-auto">{t.seasons.hero.noActiveText}</p>
        </div>
      )}

      {/* Filter bar */}
      <div className="hud-card p-3 flex flex-col sm:flex-row gap-3 sm:items-center justify-between [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
        <div className="flex items-center gap-2">
          <FunnelIcon className="size-4 text-dim" aria-hidden />
          <span className="font-mono text-xs uppercase tracking-widest text-dim">{t.seasons.filter.title}</span>
          <div className="flex flex-wrap gap-1">
            {(["all", "active", "paused", "finished", "archived"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-2.5 py-1 font-mono text-xs uppercase tracking-widest border transition-colors [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${
                  filter === key ? "bg-amber text-black border-amber" : "bg-raised border-[#3d3d34] text-dim hover:border-amber/40 hover:text-amber"
                }`}
              >
                {t.seasons.filter[key]} <span className={filter === key ? "opacity-60" : "opacity-40"}>·{counts[key] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-dim">
          <ClockIcon className="size-3.5" aria-hidden />
          <span>{filtered.length} / {total}</span>
          <Badge variant="dim" size="sm" className="hidden sm:inline-flex">{t.seasons.archiveKicker.replace("{count}", String(total))}</Badge>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="hud-card border-dashed p-8 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          <FlagIcon className="mx-auto size-6 text-dim" aria-hidden />
          <p className="mt-2 font-display uppercase tracking-wide text-dim">{t.seasons.archiveEmpty}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(({ season, stats }) => (
            <SeasonCard key={season.id} season={season} t={t} locale={locale} stats={stats} isCurrent={activeSeason?.id === season.id} />
          ))}
        </div>
      )}
    </div>
  );
}
