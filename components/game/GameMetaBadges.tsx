"use client";

import { CalendarDaysIcon, ClockIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

/** Year / Metacritic / rating / playtime badges used on compact game cards. */
export function GameMetaBadges({ game }: { game: { releasedAt?: string | null; metacritic?: number | null; rating?: number | null; playtimeHours?: number | null } | null | undefined }) {
  const { t } = useI18n();
  if (!game) return null;
  const year = game.releasedAt ? new Date(game.releasedAt).getUTCFullYear() : null;
  const hasAny = year != null || (game.metacritic != null && !Number.isNaN(game.metacritic)) || game.rating != null || (game.playtimeHours != null && game.playtimeHours > 0);
  if (!hasAny) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {year != null && (
        <span className="border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          <CalendarDaysIcon className="mr-1 inline size-3 align-text-bottom" aria-hidden />
          {year}
        </span>
      )}
      {game.metacritic != null && !Number.isNaN(game.metacritic) && (
        <span className="border border-amber/40 bg-amber/15 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          {t.core.gameInfo.metaLabel} {game.metacritic}
        </span>
      )}
      {game.rating != null && (
        <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-0.5 font-mono text-xs text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          <StarSolid className="size-3" aria-hidden /> {game.rating.toFixed(1)}
        </span>
      )}
      {game.playtimeHours != null && game.playtimeHours > 0 && (
        <span className="inline-flex items-center gap-1 border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
          <ClockIcon className="size-3" aria-hidden /> {format(t.core.gameInfo.playtime, { hours: game.playtimeHours })}
        </span>
      )}
    </div>
  );
}