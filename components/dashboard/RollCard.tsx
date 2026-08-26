"use client";

import { useActionState, type MouseEvent } from "react";

import DiceRoller from "@/components/dice/DiceRoller";
import {
  resolveAction,
  rollAction,
  type PlayerActionState,
} from "@/lib/use-cases/player-actions";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

export interface OpenRollView {
  id: string;
  game: { title: string; platform: string | null; coverUrl: string | null } | null;
}

interface RollCardProps {
  seasonPlayerId: string;
  openRoll: OpenRollView | null;
  rerollsUsed: number;
  lastDice: number[] | null;
}

const initialState: PlayerActionState = {};

/** confirm() before a dangerous action; canceling does not submit. */
function confirmGuard(message: string) {
  return (event: MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

export default function RollCard({
  seasonPlayerId,
  openRoll,
  rerollsUsed,
  lastDice,
}: RollCardProps) {
  const { t } = useI18n();
  const d = t.core.dashboard;
  const [rollState, rollFormAction, rollPending] = useActionState(
    rollAction,
    initialState,
  );
  const [resolveState, resolveFormAction, resolvePending] = useActionState(
    resolveAction,
    initialState,
  );

  const busy = rollPending || resolvePending;
  const rerollLocked = rerollsUsed >= 1;
  const error = openRoll ? resolveState.error : rollState.error;

  return (
    <section className="hud-card p-5">
      <h2 className="font-display text-xl uppercase tracking-widest text-amber">
        {d.currentGame}
      </h2>

      {openRoll ? (
        <>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {openRoll.game?.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- covers from external sources
              <img
                src={openRoll.game.coverUrl}
                alt={format(d.coverAlt, { title: openRoll.game.title })}
                className="h-40 w-full max-w-[160px] border border-[#3d3d34] object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              {openRoll.game ? (
                <>
                  <p className="font-display text-2xl leading-tight break-words">
                    {openRoll.game.title}
                  </p>
                  {openRoll.game.platform && (
                    <span className="mt-2 inline-block border border-[#55554a] px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-dim">
                      {openRoll.game.platform}
                    </span>
                  )}
                </>
              ) : (
                <p className="text-dim">{d.missingCatalogEntry}</p>
              )}
            </div>
          </div>

          <form action={resolveFormAction} className="mt-5 flex flex-wrap gap-3">
            <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
            <input type="hidden" name="rollId" value={openRoll.id} />
            <button
              type="submit"
              name="outcome"
              value="passed"
              className="hud-btn hud-btn-primary"
              disabled={busy}
              onClick={confirmGuard(d.markPassedConfirm)}
            >
              {d.passedButton}
            </button>
            <button
              type="submit"
              name="outcome"
              value="dropped"
              className="hud-btn hud-btn-danger"
              disabled={busy}
              onClick={confirmGuard(d.dropConfirm)}
            >
              {d.dropButton}
            </button>
            <button
              type="submit"
              name="outcome"
              value="rerolled"
              className="hud-btn"
              disabled={busy || rerollLocked}
              title={rerollLocked ? d.rerollLockedTitle : d.rerollButton}
              onClick={confirmGuard(d.rerollConfirm)}
            >
              {d.rerollButton}
            </button>
          </form>
        </>
      ) : (
        <form action={rollFormAction} className="mt-4">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <button
            type="submit"
            className="hud-btn hud-btn-primary"
            disabled={busy}
          >
            {rollPending ? d.rolling : d.rollButton}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 border-l-2 border-danger pl-3 text-sm text-danger">
          {error}
        </p>
      )}

      {!openRoll && (lastDice?.length ?? 0) > 0 && (
        <div className="mt-5 border-t border-[#3d3d34] pt-4">
          <p className="text-xs uppercase tracking-widest text-dim">
            {d.lastRoll}
          </p>
          <div className="mt-2">
            <DiceRoller values={lastDice} />
          </div>
        </div>
      )}
    </section>
  );
}
