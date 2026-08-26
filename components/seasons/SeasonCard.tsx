import Link from "next/link";

import { StatusBadge } from "@/components/ui/status";
import { format } from "@/lib/i18n/format";
import type { Season } from "@/db/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function formatDuration(startedAt: Date | null, finishedAt: Date | null) {
  if (!startedAt) return "—";
  const end = finishedAt ?? new Date();
  const ms = end.getTime() - startedAt.getTime();
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3600000);
  return `${hours}h`;
}

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
  stats?: { participants: number; cells: number };
  isCurrent?: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Link
      href={`/seasons/${season.slug}`}
      className="hud-card group flex flex-col p-5 transition hover:brightness-110"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl uppercase tracking-wide group-hover:text-amber">
            {season.title}
          </h3>
          <p className="font-mono text-xs text-dim">/{season.slug}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={season.status} label={t.core.seasonStatuses[season.status]} />
          {isCurrent ? (
            <span className="border border-amber bg-amber/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber">
              {t.seasons.detail.currentBadge}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t.seasons.card.startedAt}
          </div>
          <div className="font-mono text-xs">
            {season.startedAt ? dateFmt.format(season.startedAt) : "—"}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t.seasons.card.finishedAt}
          </div>
          <div className="font-mono text-xs">
            {season.finishedAt ? dateFmt.format(season.finishedAt) : season.status === "active" ? "—" : "—"}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t.seasons.card.duration}
          </div>
          <div className="font-mono text-xs">{formatDuration(season.startedAt, season.finishedAt)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {t.seasons.card.statusLabel}
          </div>
          <div className="font-mono text-xs capitalize">{t.core.seasonStatuses[season.status]}</div>
        </div>
      </div>

      {stats ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="border border-dim/40 bg-raised px-2 py-1 font-mono text-xs text-dim">
            {format(t.seasons.card.participants, { count: stats.participants })}
          </span>
          <span className="border border-dim/40 bg-raised px-2 py-1 font-mono text-xs text-dim">
            {format(t.seasons.card.cells, { count: stats.cells })}
          </span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="border border-amber/40 px-2 py-1 font-mono uppercase tracking-widest text-amber group-hover:bg-amber group-hover:text-background">
          {t.seasons.overview.viewBoard}
        </span>
        <span className="border border-dim/30 px-2 py-1 font-mono uppercase tracking-widest text-dim">
          {t.seasons.tabs.leaderboard}
        </span>
        <span className="border border-dim/30 px-2 py-1 font-mono uppercase tracking-widest text-dim">
          {t.seasons.tabs.feed}
        </span>
      </div>
    </Link>
  );
}
