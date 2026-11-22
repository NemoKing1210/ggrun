"use client";

import { useActionState } from "react";
import { CubeIcon, PhotoIcon } from "@heroicons/react/24/outline";

import { GameCategoryChips } from "@/components/game/GameCategoryChips";
import { GameMetaBadges } from "@/components/game/GameMetaBadges";
import { DebugError } from "@/components/ui/DebugError";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { IeeLocaleText } from "@/lib/engine";
import { answerDecisionAction } from "@/lib/modules/iee/actions";

/** A game a choice offers, as it was when offered. */
export interface OfferedGame {
  gameId: string;
  title: string;
  coverUrl: string | null;
  genres: string[];
  year: number | null;
  rating: number | null;
  platform: string | null;
}

/**
 * A choice of games waiting for the player (docs/IEE_CONSTRUCTOR_SPEC.md
 * §7.12): the games the draw offered, and how it came about — a roll, a game
 * rerolled or set aside by an item.
 */
export interface GameChoiceCard {
  id: string;
  games: OfferedGame[];
  origin: "roll" | "reroll" | "postpone";
  /** The item that rerolled the game or set it aside, as it was named. */
  itemName: IeeLocaleText | null;
}

const CLIP = "[clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]";

/**
 * The games a player's entries let them choose among (spec §7.12). Taking one
 * makes it their roll; until they do, they neither roll nor use items. No
 * default and no judge: it is their game. The server checks the game taken is
 * one offered.
 */
export function GameChoicePanel({ choice }: { choice: GameChoiceCard | null }) {
  const { t, locale } = useI18n();
  const c = t.iee.gameChoice;
  const [state, formAction, pending] = useActionState(answerDecisionAction, {});
  if (!choice || choice.games.length === 0) return null;
  const why =
    choice.origin === "roll"
      ? null
      : format(choice.origin === "postpone" ? c.originPostpone : c.originReroll, { item: choice.itemName?.[locale] ?? "—" });

  return (
    <section className="hud-card animate-hud-rise p-4" aria-label={c.heading}>
      <div className="mb-1 flex items-center gap-2">
        <CubeIcon className="size-4 text-amber" aria-hidden />
        <h2 className="font-display text-sm uppercase tracking-widest text-amber">{c.heading}</h2>
        <span className="ammo-counter ml-auto text-xs text-dim">{choice.games.length}</span>
      </div>
      {why ? <p className="text-sm text-zinc-300">{why}</p> : null}
      <p className="mb-3 text-xs text-dim">{format(c.hint, { count: String(choice.games.length) })}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {choice.games.map((game) => (
          <li key={game.gameId} className={`flex flex-col overflow-hidden border border-[#3d3d34] bg-[#151514] ${CLIP}`}>
            {game.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={game.coverUrl} alt={format(t.core.dashboard.coverAlt, { title: game.title })} className="h-32 w-full object-cover" />
            ) : (
              <div className="flex h-32 w-full items-center justify-center bg-black/30" aria-hidden>
                <PhotoIcon className="size-8 text-dim/50" />
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="font-display text-base uppercase leading-tight tracking-wide">{game.title}</p>
              {game.platform ? <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{game.platform}</p> : null}
              <GameMetaBadges game={{ releasedAt: game.year !== null ? `${game.year}-07-01T00:00:00.000Z` : null, rating: game.rating }} />
              <GameCategoryChips genres={game.genres} tags={[]} className="mt-1" />
              <form action={formAction} className="mt-auto pt-2">
                <input type="hidden" name="decisionId" value={choice.id} />
                <input type="hidden" name="option" value="take" />
                <input type="hidden" name="picks" value={game.gameId} />
                <button type="submit" className="hud-btn hud-btn-primary w-full !py-1.5 text-xs" disabled={pending}>
                  {c.take}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      {state.error ? (
        <p role="alert" className="mt-3 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      <DebugError debug={state.debug} />
    </section>
  );
}
