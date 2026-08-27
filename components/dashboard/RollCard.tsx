"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import DiceRoller from "@/components/dice/DiceRoller";
import {
  resolveAction,
  rollAction,
  type PlayerActionState,
} from "@/lib/use-cases/player-actions";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { DebugError } from "@/components/ui/DebugError";

export interface OpenRollView {
  id: string;
  game: { title: string; platform: string | null; coverUrl: string | null } | null;
  rolledAt: string;
}

export interface PendingRerollView {
  id: string;
  reason: string;
  requestedAt: string;
}

interface RollCardProps {
  seasonPlayerId: string;
  openRoll: OpenRollView | null;
  pendingReroll: PendingRerollView | null;
  rerollsUsed: number;
  lastDice: number[] | null;
}

const initialState: PlayerActionState = {};

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function RollCard({
  seasonPlayerId,
  openRoll,
  pendingReroll,
  rerollsUsed,
  lastDice,
}: RollCardProps) {
  const { t } = useI18n();
  const d = t.core.dashboard;
  const [rollState, rollFormAction, rollPending] = useActionState(rollAction, initialState);
  const [resolveState, resolveFormAction, resolvePending] = useActionState(
    resolveAction,
    initialState,
  );
  const [modal, setModal] = useState<"drop" | "pass" | "reroll" | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close modal only after a submission transitions from pending -> idle without error
  const prevResolvePending = useRef(false);
  useEffect(() => {
    if (prevResolvePending.current && !resolvePending && !resolveState.error) {
      setModal(null);
    }
    prevResolvePending.current = resolvePending;
  }, [resolvePending, resolveState.error]);

  const busy = rollPending || resolvePending;
  const rerollLocked = rerollsUsed >= 1;
  const error = openRoll ? resolveState.error : rollState.error;

  // Pending banner has priority over action buttons
  const showPendingBanner = !!pendingReroll && !!openRoll;

  return (
    <section className="hud-card p-5">
      <div className="flex items-center gap-2">
        <span className="hud-loader-blink inline-block size-2 bg-amber" aria-hidden />
        <h2 className="font-display text-xl uppercase tracking-widest text-amber">
          {d.currentGame}
        </h2>
        {openRoll && now ? (
          <span className="ml-auto font-mono text-xs text-dim">
            {format(d.rolledAt, { time: formatDuration(now - new Date(openRoll.rolledAt).getTime()) })}
          </span>
        ) : null}
      </div>

      {showPendingBanner ? (
        <div className="mt-4 border border-amber/60 bg-amber/10 p-3">
          <div className="font-mono text-xs uppercase tracking-widest text-amber">
            {d.rerollPending} · {d.awaitingModeration}
          </div>
          <p className="mt-1 text-sm">{pendingReroll!.reason}</p>
          <p className="mt-1 font-mono text-xs text-dim">
            {now ? formatDuration(now - new Date(pendingReroll!.requestedAt).getTime()) + " ago" : ""}
          </p>
          <p className="mt-2 text-xs text-dim">{d.rerollPendingHint}</p>
        </div>
      ) : null}

      {openRoll ? (
        <>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            {openRoll.game?.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={openRoll.game.coverUrl}
                alt={format(d.coverAlt, { title: openRoll.game.title })}
                className="h-44 w-full max-w-[180px] border border-[#3d3d34] object-cover sm:h-48"
              />
            ) : (
              <div
                className="flex h-44 w-full max-w-[180px] items-center justify-center border border-dashed border-dim/40 bg-background font-mono text-2xl text-dim sm:h-48"
                title={openRoll.game?.title ?? d.noCurrentGame}
              >
                {(openRoll.game?.title ?? "?").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {openRoll.game ? (
                <>
                  <p className="font-display text-2xl leading-tight break-words">
                    {openRoll.game.title}
                  </p>
                  {openRoll.game.platform ? (
                    <span className="mt-2 inline-block border border-[#55554a] px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-dim">
                      {openRoll.game.platform}
                    </span>
                  ) : null}
                </>
              ) : (
                <p className="text-dim">{d.missingCatalogEntry}</p>
              )}
              <p className="mt-3 text-xs text-dim">{d.rollHint}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="hud-btn hud-btn-primary"
              disabled={busy || showPendingBanner}
              onClick={() => setModal("pass")}
            >
              {d.passedButton}
            </button>
            <button
              type="button"
              className="hud-btn hud-btn-danger"
              disabled={busy || showPendingBanner}
              onClick={() => setModal("drop")}
            >
              {d.dropButton}
            </button>
            <button
              type="button"
              className="hud-btn"
              disabled={busy || rerollLocked || showPendingBanner}
              title={rerollLocked ? d.rerollLockedTitle : showPendingBanner ? d.rerollPending : d.rerollButton}
              onClick={() => setModal("reroll")}
            >
              {showPendingBanner ? d.rerollPending : d.rerollButton}
            </button>
          </div>
        </>
      ) : (
        <form action={rollFormAction} className="mt-4">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <button type="submit" className="hud-btn hud-btn-primary" disabled={busy}>
            {rollPending ? d.rolling : d.rollButton}
          </button>
          <p className="mt-2 text-xs text-dim">{d.rollHint}</p>
        </form>
      )}

      {error ? (
        <div role="alert">
          <p className="mt-3 border-l-2 border-danger pl-3 text-sm text-danger">{error}</p>
          <DebugError debug={openRoll ? resolveState.debug : rollState.debug} title="game" />
        </div>
      ) : null}

      {!openRoll && (lastDice?.length ?? 0) > 0 ? (
        <div className="mt-5 border-t border-[#3d3d34] pt-4">
          <p className="text-xs uppercase tracking-widest text-dim">{d.lastRoll}</p>
          <div className="mt-2">
            <DiceRoller values={lastDice} />
          </div>
        </div>
      ) : null}

      {/* --- Drop modal --- */}
      {modal === "drop" && openRoll ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div className="hud-card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg uppercase tracking-widest">{d.dropModalTitle}</h3>
            <p className="mt-1 text-sm text-dim">{openRoll.game?.title}</p>
            <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
              <input type="hidden" name="rollId" value={openRoll.id} />
              <input type="hidden" name="outcome" value="dropped" />
              <label className="text-sm">
                <span className="font-mono text-xs uppercase tracking-widest text-dim">
                  {d.dropReasonLabel} *
                </span>
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  rows={3}
                  placeholder={d.dropReasonPlaceholder}
                  className="mt-1"
                  disabled={resolvePending}
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="hud-btn hud-btn-danger" disabled={resolvePending}>
                  {d.dropButton}
                </button>
                <button type="button" className="hud-btn" onClick={() => setModal(null)} disabled={resolvePending}>
                  {d.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* --- Pass modal --- */}
      {modal === "pass" && openRoll ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div className="hud-card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg uppercase tracking-widest">{d.passModalTitle}</h3>
            <p className="mt-1 text-sm text-dim">{openRoll.game?.title}</p>
            <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
              <input type="hidden" name="rollId" value={openRoll.id} />
              <input type="hidden" name="outcome" value="passed" />
              <label className="text-sm">
                <span className="font-mono text-xs uppercase tracking-widest text-dim">
                  {d.passCommentLabel}
                </span>
                <textarea
                  name="comment"
                  rows={3}
                  placeholder={d.passCommentPlaceholder}
                  className="mt-1"
                  disabled={resolvePending}
                />
              </label>
              <label className="text-sm">
                <span className="font-mono text-xs uppercase tracking-widest text-dim">
                  {d.ratingLabel}
                </span>
                <input
                  name="rating"
                  type="number"
                  min={1}
                  max={10}
                  step={1}
                  placeholder={d.ratingPlaceholder}
                  className="mt-1"
                  disabled={resolvePending}
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="hud-btn hud-btn-primary" disabled={resolvePending}>
                  {d.submit}
                </button>
                <button type="button" className="hud-btn" onClick={() => setModal(null)} disabled={resolvePending}>
                  {d.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* --- Reroll modal --- */}
      {modal === "reroll" && openRoll ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div className="hud-card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg uppercase tracking-widest">{d.rerollModalTitle}</h3>
            <p className="mt-1 text-sm text-dim">{openRoll.game?.title}</p>
            <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
              <input type="hidden" name="rollId" value={openRoll.id} />
              <input type="hidden" name="outcome" value="rerolled" />
              <label className="text-sm">
                <span className="font-mono text-xs uppercase tracking-widest text-dim">
                  {d.rerollReasonLabel} *
                </span>
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  rows={3}
                  placeholder={d.rerollReasonPlaceholder}
                  className="mt-1"
                  disabled={resolvePending}
                />
              </label>
              <p className="text-xs text-dim">{d.rerollConfirm}</p>
              <div className="flex gap-2">
                <button type="submit" className="hud-btn" disabled={resolvePending}>
                  {d.submit}
                </button>
                <button type="button" className="hud-btn" onClick={() => setModal(null)} disabled={resolvePending}>
                  {d.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
