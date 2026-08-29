"use client";

import { useMemo, useState } from "react";
import {
  ArrowPathIcon,
  BoltIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  TrophyIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import { GameDetailsModal, toGameDetails } from "@/components/game/GameDetailsModal";
import { GameMetaBadges } from "@/components/game/GameMetaBadges";
import { EmptyState } from "@/components/ui/page-header";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { GameSummary } from "@/components/dashboard/RollCard";

export interface PlayerGameRow {
  id: string;
  status: string;
  rolledAt: string;
  resolvedAt: string | null;
  rating: number | null;
  notes: string | null;
  seasonTitle: string;
  game: GameSummary | null;
}

const STATUS_FILTERS = ["passed", "dropped", "rerolled", "in_progress", "rolled"] as const;
type StatusFilter = "all" | (typeof STATUS_FILTERS)[number];
type SortOption = "newest" | "oldest" | "title" | "rating";

function statusTone(status: string): string {
  switch (status) {
    case "passed":
      return "border-emerald-600/40 bg-emerald-950/30 text-emerald-300";
    case "dropped":
      return "border-danger/40 bg-danger/10 text-red-300";
    case "rerolled":
      return "border-violet-500/30 bg-violet-950/20 text-violet-300";
    case "in_progress":
      return "border-sky-500/30 bg-sky-950/20 text-sky-300";
    default:
      return "border-amber/40 bg-amber/10 text-amber";
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "passed") return <CheckCircleIcon className="size-3" aria-hidden />;
  if (status === "dropped") return <XCircleIcon className="size-3" aria-hidden />;
  if (status === "rerolled") return <ArrowPathIcon className="size-3" aria-hidden />;
  if (status === "in_progress") return <ClockIcon className="size-3" aria-hidden />;
  return <BoltIcon className="size-3" aria-hidden />;
}

export function PlayerGames({ games }: { games: PlayerGameRow[] }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "uk" ? "uk-UA" : "ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = games;
    if (filter !== "all") rows = rows.filter((g) => g.status === filter);
    if (q) {
      rows = rows.filter((g) => {
        const title = g.game?.title?.toLowerCase() ?? "";
        const platform = g.game?.platform?.toLowerCase() ?? "";
        const season = g.seasonTitle.toLowerCase();
        return title.includes(q) || platform.includes(q) || season.includes(q);
      });
    }
    const sorted = [...rows];
    switch (sort) {
      case "oldest":
        sorted.sort((a, b) => new Date(a.rolledAt).getTime() - new Date(b.rolledAt).getTime());
        break;
      case "title":
        sorted.sort((a, b) => (a.game?.title ?? "").localeCompare(b.game?.title ?? ""));
        break;
      case "rating":
        sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
        break;
      default:
        sorted.sort((a, b) => new Date(b.rolledAt).getTime() - new Date(a.rolledAt).getTime());
    }
    return sorted;
  }, [games, query, filter, sort]);

  const current = games.find((g) => g.id === detailsId) ?? null;

  const timeLabel = (roll: PlayerGameRow) => {
    const from = dateFmt.format(new Date(roll.rolledAt));
    const to = roll.resolvedAt ? dateFmt.format(new Date(roll.resolvedAt)) : null;
    return to ? `${from} → ${to}` : from;
  };

  return (
    <section>
      {/* toolbar */}
      <div className="hud-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1.5 block font-display text-[11px] uppercase tracking-widest text-zinc-400">
            {t.profile.games.searchLabel}
          </span>
          <span className="relative block">
            <MagnifyingGlassIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.profile.games.searchPlaceholder}
              className="!pl-9"
              autoComplete="off"
            />
          </span>
        </label>

        <label className="w-full sm:w-52">
          <span className="mb-1.5 block font-display text-[11px] uppercase tracking-widest text-zinc-400">
            {t.profile.games.sortLabel}
          </span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)} className="w-full">
            <option value="newest">{t.profile.games.sortNewest}</option>
            <option value="oldest">{t.profile.games.sortOldest}</option>
            <option value="title">{t.profile.games.sortTitle}</option>
            <option value="rating">{t.profile.games.sortRating}</option>
          </select>
        </label>

        <div className="flex items-center gap-2 font-mono text-xs text-dim sm:pb-2">
          <span className="ammo-counter text-amber">{format(t.profile.games.count, { count: filtered.length })}</span>
        </div>
      </div>

      {/* status filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(["all", ...STATUS_FILTERS] as StatusFilter[]).map((f) => {
          const active = filter === f;
          const label =
            f === "all" ? t.profile.games.filterAll : t.profile.rollStats[f as keyof typeof t.profile.rollStats] ?? f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                active
                  ? "border border-amber bg-amber px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-black [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  : "border border-dim/30 bg-raised px-3 py-1.5 font-display text-[11px] uppercase tracking-widest text-dim hover:border-amber/50 hover:text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          <span className="block">{t.profile.games.empty}</span>
          <span className="mt-1 block font-mono text-xs normal-case tracking-normal text-dim">
            {t.profile.games.emptyHint}
          </span>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((roll) => (
            <li key={roll.id} className="hud-card hud-lift group flex h-full flex-col p-4">
              <div className="flex gap-3">
                {roll.game?.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={roll.game.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-16 shrink-0 border border-[#3d3d34] bg-zinc-800 object-cover [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  />
                ) : (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center border border-dashed border-dim/30 bg-raised text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <PhotoIcon className="size-5" aria-hidden />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-base uppercase leading-tight tracking-wide group-hover:text-amber">
                    {roll.game?.title ?? t.core.dashboard.missingCatalogEntry}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${statusTone(roll.status)}`}
                    >
                      <StatusIcon status={roll.status} />
                      {t.profile.rollStats[roll.status as keyof typeof t.profile.rollStats] ?? roll.status}
                    </span>
                    {roll.game?.platform ? (
                      <span className="border border-dim/30 bg-background/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                        {roll.game.platform}
                      </span>
                    ) : null}
                  </div>
                  <GameMetaBadges game={roll.game} />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 border border-dim/20 bg-background/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  <TrophyIcon className="size-3 text-amber" aria-hidden />
                  {roll.seasonTitle}
                </span>
                {roll.rating ? (
                  <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    <StarSolid className="size-3" aria-hidden /> {roll.rating}/10
                  </span>
                ) : null}
              </div>

              {roll.notes ? (
                <p className="mt-3 line-clamp-2 border-l-2 border-amber/25 pl-3 text-sm leading-relaxed text-zinc-300">
                  “{roll.notes}”
                </p>
              ) : null}

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-dim/15 pt-3">
                <time dateTime={roll.rolledAt} className="font-mono text-[11px] tracking-wide text-dim">
                  {timeLabel(roll)}
                </time>
                {roll.game ? (
                  <button
                    type="button"
                    onClick={() => setDetailsId(roll.id)}
                    className="hud-btn inline-flex items-center gap-1 !px-2 !py-0.5 text-[11px]"
                  >
                    <BookOpenIcon className="size-3" aria-hidden />
                    {t.core.gameInfo.details}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <GameDetailsModal
        game={current?.game ? toGameDetails(current.game as unknown as Record<string, unknown>) : null}
        onClose={() => setDetailsId(null)}
      />
    </section>
  );
}
