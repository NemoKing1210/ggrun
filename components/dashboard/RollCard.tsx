"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  StarIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import DiceRoller from "@/components/dice/DiceRoller";
import { Modal } from "@/components/ui/Modal";
import { DebugError } from "@/components/ui/DebugError";
import { resolveAction, rollAction, type PlayerActionState } from "@/lib/use-cases/player-actions";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

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

function ModalHeader({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div>
      <h3 className="font-display text-lg uppercase tracking-widest">{title}</h3>
      {subtitle ? <p className="mt-1 truncate font-mono text-xs tracking-wide text-amber">{subtitle}</p> : null}
      <div className="hazard-tape mt-3 opacity-60" aria-hidden />
    </div>
  );
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
  const [resolveState, resolveFormAction, resolvePending] = useActionState(resolveAction, initialState);
  const [modal, setModal] = useState<"drop" | "pass" | "reroll" | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const prevResolvePending = useRef(false);
  useEffect(() => {
    if (prevResolvePending.current && !resolvePending && !resolveState.error) setModal(null);
    prevResolvePending.current = resolvePending;
  }, [resolvePending, resolveState.error]);

  const busy = rollPending || resolvePending;
  const rerollLocked = rerollsUsed >= 1;
  const error = openRoll ? resolveState.error : rollState.error;
  const showPendingBanner = !!pendingReroll && !!openRoll;

  return (
    <section className="hud-card overflow-hidden p-0">
      {/* header bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#3d3d34] bg-raised/40 px-4 py-3">
        <span className="relative inline-flex size-2.5 items-center justify-center" aria-hidden>
          <span className="absolute inline-flex size-2.5 animate-ping bg-amber opacity-40 [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" />
          <span className="relative inline-block size-2 bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]" />
        </span>
        <h2 className="font-display text-sm uppercase tracking-widest text-amber">{d.currentGame}</h2>
        {openRoll && now ? (
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-dim">
            <ClockIcon className="size-3.5" aria-hidden />
            {format(d.rolledAt, { time: formatDuration(now - new Date(openRoll.rolledAt).getTime()) })}
          </span>
        ) : (
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">
            {"// ACTIVE ROLL"}
          </span>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {showPendingBanner ? (
          <div className="mb-4 border border-amber/50 bg-amber/10 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-amber">
              <ExclamationTriangleIcon className="size-4" aria-hidden />
              {d.rerollPending} · {d.awaitingModeration}
            </div>
            <p className="mt-2 border-l-2 border-amber/40 pl-2 text-sm leading-snug">{pendingReroll!.reason}</p>
            <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-dim">
              <ClockIcon className="size-3.5" aria-hidden />
              {now ? formatDuration(now - new Date(pendingReroll!.requestedAt).getTime()) + " ago" : ""}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-snug text-dim">{d.rerollPendingHint}</p>
          </div>
        ) : null}

        {openRoll ? (
          <>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="shrink-0">
                {openRoll.game?.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={openRoll.game.coverUrl}
                    alt={format(d.coverAlt, { title: openRoll.game.title })}
                    className="h-44 w-full max-w-[200px] border border-[#3d3d34] object-cover shadow-[0_4px_16px_rgba(0,0,0,0.4)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:h-52 sm:w-[200px]"
                  />
                ) : (
                  <div className="flex h-44 w-full max-w-[200px] flex-col items-center justify-center gap-2 border border-dashed border-dim/30 bg-background/40 p-4 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:h-52 sm:w-[200px]">
                    <PhotoIcon className="size-8 text-dim/40" aria-hidden />
                    <span className="font-mono text-xs uppercase tracking-widest text-dim">
                      {(openRoll.game?.title ?? "?").slice(0, 18).toUpperCase() || d.noCurrentGame}
                    </span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {openRoll.game ? (
                  <>
                    <p className="font-display text-2xl uppercase leading-tight tracking-wide sm:text-[1.7rem]">{openRoll.game.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {openRoll.game.platform ? (
                        <span className="border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                          {openRoll.game.platform}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1 border border-amber/30 bg-amber/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                        <BoltIcon className="size-3.5" aria-hidden /> IN RUN
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="border border-dashed border-dim/20 bg-background/30 p-3 font-mono text-sm text-dim">{d.missingCatalogEntry}</p>
                )}
                <p className="mt-3 max-w-prose font-mono text-xs leading-relaxed text-dim">{d.rollHint}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="hud-btn hud-btn-primary inline-flex items-center gap-1.5"
                disabled={busy || showPendingBanner}
                onClick={() => setModal("pass")}
              >
                <CheckCircleIcon className="size-4" aria-hidden />
                {d.passedButton}
              </button>
              <button
                type="button"
                className="hud-btn hud-btn-danger inline-flex items-center gap-1.5"
                disabled={busy || showPendingBanner}
                onClick={() => setModal("drop")}
              >
                <XCircleIcon className="size-4" aria-hidden />
                {d.dropButton}
              </button>
              <button
                type="button"
                className="hud-btn inline-flex items-center gap-1.5"
                disabled={busy || rerollLocked || showPendingBanner}
                title={rerollLocked ? d.rerollLockedTitle : showPendingBanner ? d.rerollPending : d.rerollButton}
                onClick={() => setModal("reroll")}
              >
                <ArrowPathIcon className="size-4" aria-hidden />
                {showPendingBanner ? d.rerollPending : d.rerollButton}
              </button>
            </div>
          </>
        ) : (
          <form action={rollFormAction} className="flex flex-col gap-3">
            <div className="border border-dashed border-amber/20 bg-amber/[0.04] p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:p-6">
              <p className="font-display text-lg uppercase tracking-wide">{"// READY TO ROLL"}</p>
              <p className="mt-1 max-w-prose font-mono text-xs leading-relaxed text-dim">{d.rollHint}</p>
              <p className="mt-3 font-mono text-sm text-amber">{d.noCurrentGame}</p>
            </div>
            <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
            <button type="submit" className="hud-btn hud-btn-primary inline-flex items-center justify-center gap-2 self-start px-6 py-2.5 text-sm" disabled={busy}>
              <BoltIcon className="size-4" aria-hidden />
              {rollPending ? d.rolling : d.rollButton}
            </button>
          </form>
        )}

        {error ? (
          <div role="alert" className="mt-4 border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-danger">
              <XCircleIcon className="size-4" aria-hidden /> Error
            </div>
            <p className="mt-1 text-sm text-danger">{error}</p>
            <DebugError debug={openRoll ? resolveState.debug : rollState.debug} title="game" />
          </div>
        ) : null}

        {!openRoll && (lastDice?.length ?? 0) > 0 ? (
          <div className="mt-5 border-t border-[#3d3d34] pt-4">
            <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-dim">
              <StarIcon className="size-3.5 text-amber" aria-hidden />
              {d.lastRoll}
            </p>
            <div className="mt-3 rounded-none border border-dim/20 bg-background/30 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
              <DiceRoller values={lastDice} />
            </div>
          </div>
        ) : null}
      </div>

      {/* Drop */}
      <Modal open={modal === "drop" && !!openRoll} onClose={() => setModal(null)}>
        <ModalHeader title={d.dropModalTitle} subtitle={openRoll?.game?.title ?? null} />
        <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <input type="hidden" name="rollId" value={openRoll?.id ?? ""} />
          <input type="hidden" name="outcome" value="dropped" />
          <label className="text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">{d.dropReasonLabel} *</span>
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
          <div className="flex gap-2 pt-2">
            <button type="submit" className="hud-btn hud-btn-danger inline-flex items-center gap-1.5" disabled={resolvePending}>
              <XCircleIcon className="size-4" aria-hidden /> {d.dropButton}
            </button>
            <button type="button" className="hud-btn" onClick={() => setModal(null)} disabled={resolvePending}>
              {d.cancel}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pass */}
      <Modal open={modal === "pass" && !!openRoll} onClose={() => setModal(null)}>
        <ModalHeader title={d.passModalTitle} subtitle={openRoll?.game?.title ?? null} />
        <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <input type="hidden" name="rollId" value={openRoll?.id ?? ""} />
          <input type="hidden" name="outcome" value="passed" />
          <label className="text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">{d.passCommentLabel}</span>
            <textarea name="comment" rows={3} placeholder={d.passCommentPlaceholder} className="mt-1" disabled={resolvePending} />
          </label>
          <label className="text-sm">
            <span className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-dim">
              <StarSolid className="size-3.5 text-amber" aria-hidden /> {d.ratingLabel}
            </span>
            <input name="rating" type="number" min={1} max={10} step={1} placeholder={d.ratingPlaceholder} className="mt-1" disabled={resolvePending} />
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="hud-btn hud-btn-primary inline-flex items-center gap-1.5" disabled={resolvePending}>
              <CheckCircleIcon className="size-4" aria-hidden /> {d.submit}
            </button>
            <button type="button" className="hud-btn" onClick={() => setModal(null)} disabled={resolvePending}>
              {d.cancel}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reroll */}
      <Modal open={modal === "reroll" && !!openRoll} onClose={() => setModal(null)}>
        <ModalHeader title={d.rerollModalTitle} subtitle={openRoll?.game?.title ?? null} />
        <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <input type="hidden" name="rollId" value={openRoll?.id ?? ""} />
          <input type="hidden" name="outcome" value="rerolled" />
          <label className="text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">{d.rerollReasonLabel} *</span>
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
          <p className="border border-dim/20 bg-background/40 px-2 py-2 font-mono text-xs leading-relaxed text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
            {d.rerollConfirm}
          </p>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="hud-btn inline-flex items-center gap-1.5" disabled={resolvePending}>
              <ArrowPathIcon className="size-4" aria-hidden /> {d.submit}
            </button>
            <button type="button" className="hud-btn" onClick={() => setModal(null)} disabled={resolvePending}>
              {d.cancel}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
