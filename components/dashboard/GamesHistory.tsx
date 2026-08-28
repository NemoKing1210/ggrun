"use client";

import { useState } from "react";
import { PhotoIcon, BookOpenIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import { GameDetailsModal, toGameDetails } from "@/components/game/GameDetailsModal";
import { GameMetaBadges } from "@/components/game/GameMetaBadges";
import { useI18n } from "@/lib/i18n/client";
import type { GameSummary } from "@/components/dashboard/RollCard";

export interface HistoryRoll {
  id: string;
  status: string;
  /** ISO for the dateTime attribute. */
  rolledAt: string;
  /** Pre-formatted display label, e.g. “03.03.24, 14:05 → 15:20”. */
  timeLabel: string;
  game: GameSummary | null;
  rating: number | null;
  notes: string | null;
}

export function GamesHistory({ rolls }: { rolls: HistoryRoll[] }) {
  const { t } = useI18n();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const current = rolls.find((r) => r.id === detailsId) ?? null;

  const statusTone =
    (s: string) =>
      s === "passed"
        ? "border-emerald-600/40 bg-emerald-950/30 text-emerald-300"
        : s === "dropped"
          ? "border-danger/40 bg-danger/10 text-red-300"
          : s === "rerolled"
            ? "border-violet-500/30 bg-violet-950/20 text-violet-300"
            : "border-amber/40 bg-amber/10 text-amber";

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rolls.map((roll) => (
          <li key={roll.id} className="hud-card group min-h-[96px] p-4 transition-all hover:border-amber/30 hover:brightness-[1.02]">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                {roll.game?.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={roll.game.coverUrl}
                    alt=""
                    className="h-14 w-11 shrink-0 border border-[#3d3d34] bg-zinc-800 object-cover [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  />
                ) : (
                  <span className="flex h-14 w-11 shrink-0 items-center justify-center border border-dashed border-dim/30 bg-raised text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                    <PhotoIcon className="size-4" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1 font-mono text-sm font-medium leading-snug">
                  {roll.game?.title ?? t.core.dashboard.missingCatalogEntry}
                </span>
              </span>
              <span className={`shrink-0 border px-2 py-1 font-mono text-[10px] uppercase tracking-widest [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)] ${statusTone(roll.status)}`}>
                {roll.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {roll.game?.platform ? (
                <span className="border border-dim/30 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                  {roll.game.platform}
                </span>
              ) : null}
              <GameMetaBadges game={roll.game} />
              {roll.rating ? (
                <span className="inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs font-semibold text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <StarSolid className="size-3.5" aria-hidden /> {roll.rating}/10
                </span>
              ) : null}
            </div>
            {roll.notes ? <p className="mt-3 line-clamp-3 border-l-2 border-amber/25 pl-3 text-sm leading-relaxed text-zinc-300">“{roll.notes}”</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <time dateTime={roll.rolledAt} className="font-mono text-[11px] tracking-wide text-dim">
                {roll.timeLabel}
              </time>
              {roll.game && (
                <button
                  type="button"
                  onClick={() => setDetailsId(roll.id)}
                  className="hud-btn !py-0.5 !px-2 text-[11px] inline-flex items-center gap-1"
                >
                  <BookOpenIcon className="size-3" aria-hidden />
                  {t.core.gameInfo.details}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <GameDetailsModal
        game={current?.game ? toGameDetails(current.game as unknown as Record<string, unknown>) : null}
        onClose={() => setDetailsId(null)}
      />
    </>
  );
}