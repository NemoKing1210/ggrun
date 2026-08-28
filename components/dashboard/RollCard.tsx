"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowPathIcon,
  BoltIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  StarIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";

import { DiceCube } from "@/components/dice/Dice3D";
import { InlineGameCarousel, GameRollReveal } from "@/components/dashboard/GameRollCarousel";
import { GameDetailsModal, toGameDetails } from "@/components/game/GameDetailsModal";
import { GameMetaBadges } from "@/components/game/GameMetaBadges";
import { Modal } from "@/components/ui/Modal";
import { DebugError } from "@/components/ui/DebugError";
import { resolveAction, rollAction, type PlayerActionState } from "@/lib/modules/player/actions/game";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";

/** Compact serializable game fields shown on the roll card. */
export interface GameSummary {
  title: string;
  platform: string | null;
  coverUrl: string | null;
  genres: string[];
  tags: string[];
  metacritic: number | null;
  rating: number | null;
  releasedAt: string | null;
  esrb: string | null;
  description: string | null;
  playtimeHours: number | null;
  stores: Array<{ store: string; url: string }> | null;
  website: string | null;
  externalSource: string | null;
}

export interface OpenRollView {
  id: string;
  game: GameSummary | null;
  rolledAt: string;
}

export interface PendingRerollView {
  id: string;
  reason: string;
  requestedAt: string;
}
export interface PendingCompletionView {
  id: string;
  outcome: "passed" | "dropped";
  reason: string | null;
  rating: number | null;
  requestedAt: string;
}

type PreviewGame = { title: string; coverUrl: string | null; platform: string | null };

interface RollCardProps {
  seasonPlayerId: string;
  openRoll: OpenRollView | null;
  pendingReroll: PendingRerollView | null;
  pendingCompletion: PendingCompletionView | null;
  rerollsUsed: number;
  lastDice: number[] | null;
  catalogGames?: PreviewGame[];
}

const initialState: PlayerActionState = {};
const MIN_DICE_MS = 2800;


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

type CarouselPhase = "idle" | "spinning" | "decelerating" | "revealed";

export default function RollCard({
  seasonPlayerId,
  openRoll,
  pendingReroll,
  pendingCompletion,
  rerollsUsed,
  lastDice,
  catalogGames = [],
}: RollCardProps) {
  const { t } = useI18n();
  const d = t.core.dashboard;
  const [rollState, rollFormAction, rollPending] = useActionState(rollAction, initialState);
  const [resolveState, resolveFormAction, resolvePending] = useActionState(resolveAction, initialState);
  const [modal, setModal] = useState<"drop" | "pass" | "reroll" | "details" | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const [carouselPhase, setCarouselPhase] = useState<CarouselPhase>("idle");
  const [targetIdx, setTargetIdx] = useState<number | null>(null);
  const [carouselGames, setCarouselGames] = useState<PreviewGame[]>(catalogGames);
  const prevOpenRollId = useRef<string | null>(openRoll?.id ?? null);
  const hasMounted = useRef(false);

  const [diceOverlayOpen, setDiceOverlayOpen] = useState(false);
  const [dicePhase, setDicePhase] = useState<"spinning" | "result">("spinning");
  const diceStartRef = useRef<number | null>(null);
  const diceHideTimer = useRef<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // keep carouselGames in sync when not rolling
  useEffect(() => {
    if (carouselPhase === "idle") setCarouselGames(catalogGames);
  }, [catalogGames, carouselPhase]);

  const handleDecelerateEnd = useCallback(() => setCarouselPhase("revealed"), []);

  // start spinning when rollPending becomes true
  useEffect(() => {
    if (rollPending && carouselPhase === "idle") {
      setCarouselGames(catalogGames.length ? catalogGames : []);
      setTargetIdx(null);
      setCarouselPhase("spinning");
    }
  }, [rollPending, carouselPhase, catalogGames]);

  // when a new openRoll appears while spinning, find target and decelerate
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      prevOpenRollId.current = openRoll?.id ?? null;
      return;
    }
    const prevId = prevOpenRollId.current;
    const newId = openRoll?.id ?? null;
    // new roll created
    if (newId && newId !== prevId && carouselPhase === "spinning") {
      let pool = catalogGames.length ? [...catalogGames] : [];
      let idx = -1;
      if (openRoll?.game) {
        idx = pool.findIndex((g) => g.title === openRoll.game!.title);
        if (idx === -1) {
          const poolLen = pool.length;
          const insertAt = poolLen === 0 ? 0 : Math.floor(Math.random() * Math.min(poolLen, 8));
          pool.splice(insertAt, 0, {
            title: openRoll.game.title,
            coverUrl: openRoll.game.coverUrl,
            platform: openRoll.game.platform,
          });
          idx = insertAt;
          if (pool.length > 14) pool = pool.slice(0, 14);
        }
      } else {
        idx = 0;
      }
      setCarouselGames(pool);
      setTargetIdx(idx >= 0 ? idx : 0);
      setCarouselPhase("decelerating");
    }
    prevOpenRollId.current = newId;

    // if roll was resolved (openRoll cleared) reset carousel after reveal
    if (!newId && prevId && carouselPhase === "revealed") {
      const timer = setTimeout(() => setCarouselPhase("idle"), 600);
      return () => clearTimeout(timer);
    }
    if (!newId && carouselPhase !== "idle" && carouselPhase !== "spinning" && carouselPhase !== "decelerating") {
      if (carouselPhase === "revealed" && !newId) {
        const t = setTimeout(() => {
          setCarouselPhase("idle");
          setTargetIdx(null);
        }, 500);
        return () => clearTimeout(t);
      }
    }
  }, [openRoll, carouselPhase, catalogGames]);

  // if rollPending finished but no openRoll appeared (error), reset to idle after longer grace
  useEffect(() => {
    const currentId = (openRoll as OpenRollView | null)?.id ?? null;
    if (!rollPending && carouselPhase === "spinning" && !openRoll) {
      const capturedPrev = prevOpenRollId.current;
      const capturedNewId = currentId;
      const t = setTimeout(() => {
        if (!capturedPrev || capturedPrev === capturedNewId) {
          setCarouselPhase("idle");
        }
      }, 3500);
      return () => clearTimeout(t);
    }
  }, [rollPending, carouselPhase, openRoll]);

  // dice inline result lifecycle — persistent result, not auto-hidden
  useEffect(() => {
    if (resolvePending) {
      if (diceHideTimer.current) window.clearTimeout(diceHideTimer.current);
      diceStartRef.current = Date.now();
      setDicePhase("spinning");
      setDiceOverlayOpen(true);
      return;
    }
    if (diceOverlayOpen && dicePhase === "spinning") {
      const elapsed = diceStartRef.current ? Date.now() - diceStartRef.current : MIN_DICE_MS;
      const remain = Math.max(0, MIN_DICE_MS - elapsed);
      const t = window.setTimeout(() => setDicePhase("result"), remain);
      return () => window.clearTimeout(t);
    }
  }, [resolvePending, diceOverlayOpen, dicePhase]);

  const prevResolvePending = useRef(false);
  useEffect(() => {
    if (prevResolvePending.current && !resolvePending && !resolveState.error) setModal(null);
    prevResolvePending.current = resolvePending;
  }, [resolvePending, resolveState.error]);

  const busy = rollPending || resolvePending;
  const rerollLocked = rerollsUsed >= 1;
  const error = openRoll ? resolveState.error : rollState.error;
  const showPendingBanner = !!pendingReroll && !!openRoll;
  const showCompletionPending = !!pendingCompletion && !!openRoll;

  const showCarousel = carouselPhase === "spinning" || carouselPhase === "decelerating";
  const showReveal = carouselPhase === "revealed" && !!openRoll?.game;
  const showIdle = !openRoll && carouselPhase === "idle";

  return (
    <section className="hud-card overflow-hidden p-0">
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
          <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-widest text-dim sm:inline">{"// ACTIVE ROLL"}</span>
        )}
      </div>

      <AnimatePresence>
        {diceOverlayOpen ? (
          <motion.div
            key="dice-inline"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-b border-amber/20 bg-[#0f0f0e]/60"
          >
            <div className="p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <motion.span
                  className="size-2 bg-amber [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]"
                  animate={{ opacity: dicePhase === "spinning" ? [1, 0.35, 1] : 1 }}
                  transition={dicePhase === "spinning" ? { duration: 0.7, repeat: Infinity } : {}}
                  aria-hidden
                />
                <h3 className="font-display text-xs uppercase tracking-[0.16em] text-amber">
                  {dicePhase === "spinning" ? "Throwing dice" : "Dice result"}
                </h3>
                <span className="ml-auto hidden font-mono text-[10px] tracking-widest text-dim sm:inline">
                  {dicePhase === "spinning" ? "RNG · 3D PHYSICS" : `TOTAL ${lastDice ? lastDice.reduce((a, b) => a + b, 0) : "—"}`}
                </span>
                <button
                  type="button"
                  onClick={() => setDiceOverlayOpen(false)}
                  className="ml-2 inline-flex size-6 items-center justify-center border border-dim/30 bg-background/40 text-dim hover:border-amber/40 hover:text-amber [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
                  aria-label="Close dice result"
                >
                  <XCircleIcon className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="relative overflow-hidden border border-amber/20 bg-[#0a0a09] p-5 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0_3px,rgba(0,0,0,0.16)_3px_4px)] opacity-50" aria-hidden />
                <div className="relative flex flex-col items-center gap-4">
                  {dicePhase === "spinning" ? (
                    <>
                      <div className="flex items-center justify-center gap-6 py-1">
                        <DiceCube value={3} size={56} spinning index={0} />
                        <DiceCube value={5} size={56} spinning index={1} />
                      </div>
                      <p className="font-mono text-xs uppercase tracking-[0.18em] text-amber animate-pulse">casting…</p>
                      <div className="h-1.5 w-full max-w-[280px] overflow-hidden border border-[#2a2a22] bg-[#1a1a14] [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                        <motion.div
                          className="h-full w-[55%] bg-amber shadow-[0_0_8px_rgba(242,169,0,0.6)]"
                          animate={{ x: ["-110%", "115%"] }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-center gap-3 py-1">
                        {lastDice && lastDice.length > 0 ? (
                          <>
                            {lastDice.map((v, i) => (
                              <span
                                key={`result-${i}-${v}`}
                                className="ammo-counter flex h-11 w-11 items-center justify-center border border-amber bg-amber/10 text-lg text-amber shadow-[0_0_8px_rgba(242,169,0,0.25)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                              >
                                {v}
                              </span>
                            ))}
                            <span className="ml-1 inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                              = {lastDice.reduce((a, b) => a + b, 0)}
                            </span>
                          </>
                        ) : (
                          <div className="flex items-center gap-3">
                            <DiceCube value={4} size={56} spinning={false} index={0} />
                            <DiceCube value={2} size={56} spinning={false} index={1} />
                          </div>
                        )}
                      </div>
                      <p className="font-mono text-xs uppercase tracking-widest text-dim">
                        {lastDice && lastDice.length > 0 ? `rolled ${lastDice.join(" + ")} = ${lastDice.reduce((a, b) => a + b, 0)}` : "movement applied"}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 text-center font-mono text-xs leading-relaxed text-dim">
                {dicePhase === "spinning"
                  ? "The destiny engine is rolling — movement and cell effects will be applied after the throw."
                  : "Result locked — check your position on the board and the progress bar."}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
        {showCompletionPending ? (
          <div className="mb-4 border border-emerald-500/50 bg-emerald-500/10 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-emerald-400">
              <ClockIcon className="size-4" aria-hidden />
              {pendingCompletion!.outcome === "passed" ? "Completion pending" : "Drop pending"} · {d.awaitingModeration}
            </div>
            {pendingCompletion!.reason ? <p className="mt-2 border-l-2 border-emerald-500/40 pl-2 text-sm leading-snug">{pendingCompletion!.reason}</p> : null}
            {pendingCompletion!.rating ? <p className="mt-1 font-mono text-xs text-amber">Rating: {pendingCompletion!.rating}/10</p> : null}
            <p className="mt-2 flex items-center gap-1.5 font-mono text-xs text-dim">
              <ClockIcon className="size-3.5" aria-hidden />
              {now ? formatDuration(now - new Date(pendingCompletion!.requestedAt).getTime()) + " ago" : ""}
            </p>
            <p className="mt-1 font-mono text-[11px] leading-snug text-dim">Awaiting admin approval — movement will be applied after review.</p>
          </div>
        ) : null}

        {/* carousel states */}
        {showCarousel ? (
          <div className="flex flex-col gap-4">
            <InlineGameCarousel
              games={carouselGames}
              phase={carouselPhase === "spinning" ? "spinning" : "decelerating"}
              targetIndex={targetIdx}
              onDecelerateEnd={handleDecelerateEnd}
            />
            <p className="text-center font-mono text-xs tracking-wide text-dim">
              {carouselPhase === "spinning" ? "Shuffling the catalog at high speed…" : "Braking — locking target…"}
            </p>
          </div>
        ) : showReveal && openRoll?.game ? (
          <div className="flex flex-col gap-4">
            <GameRollReveal game={openRoll.game} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="hud-btn inline-flex items-center gap-1.5" onClick={() => setModal("details")}>
                <BookOpenIcon className="size-4" aria-hidden /> {t.core.gameInfo.details}
              </button>
              <button type="button" className="hud-btn hud-btn-primary inline-flex items-center gap-1.5" disabled={busy || showPendingBanner || showCompletionPending} onClick={() => setModal("pass")}>
                <CheckCircleIcon className="size-4" aria-hidden />
                {d.passedButton}
              </button>
              <button type="button" className="hud-btn hud-btn-danger inline-flex items-center gap-1.5" disabled={busy || showPendingBanner || showCompletionPending} onClick={() => setModal("drop")}>
                <XCircleIcon className="size-4" aria-hidden />
                {d.dropButton}
              </button>
              <button
                type="button"
                className="hud-btn inline-flex items-center gap-1.5"
                disabled={busy || rerollLocked || showPendingBanner || showCompletionPending}
                title={rerollLocked ? d.rerollLockedTitle : showPendingBanner ? d.rerollPending : showCompletionPending ? "Completion pending" : d.rerollButton}
                onClick={() => setModal("reroll")}
              >
                <ArrowPathIcon className="size-4" aria-hidden />
                {showPendingBanner ? d.rerollPending : showCompletionPending ? "Pending" : d.rerollButton}
              </button>
            </div>
          </div>
        ) : openRoll ? (
          <>
            <motion.div
              key={openRoll.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-5 sm:flex-row sm:items-start"
            >
              <div className="shrink-0">
                {openRoll.game?.coverUrl ? (
                  <motion.img
                    initial={{ scale: 0.96, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    src={openRoll.game.coverUrl}
                    alt={format(d.coverAlt, { title: openRoll.game.title })}
                    className="h-44 w-full max-w-[200px] border border-[#3d3d34] object-cover shadow-[0_4px_16px_rgba(0,0,0,0.4)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:h-52 sm:w-[200px]"
                  />
                ) : (
                  <div className="flex h-44 w-full max-w-[200px] flex-col items-center justify-center gap-2 border border-dashed border-danger/30 bg-danger/5 p-4 text-center [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:h-52 sm:w-[200px]">
                    <ExclamationTriangleIcon className="size-8 text-danger/60" aria-hidden />
                    <span className="font-mono text-xs uppercase tracking-widest text-danger">NO ENTRY</span>
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
                    <GameMetaBadges game={openRoll.game} />
                    {openRoll.game.genres.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {openRoll.game.genres.slice(0, 4).map((g) => (
                          <span
                            key={g}
                            className="border border-dim/25 bg-background/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                    {openRoll.game.description ? (
                      <p className="mt-3 line-clamp-3 max-w-prose text-sm leading-relaxed text-zinc-300">
                        {openRoll.game.description}
                      </p>
                    ) : (
                      <p className="mt-3 max-w-prose font-mono text-xs leading-relaxed text-dim">{d.rollHint}</p>
                    )}
                  </>
                ) : (
                  <div className="border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                    <p className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-danger">
                      <ExclamationTriangleIcon className="size-4" aria-hidden /> {d.missingCatalogEntry}
                    </p>
                    <p className="mt-2 font-mono text-xs leading-relaxed text-dim">
                      Каталог пуст или все игры уже сыграны. Обратитесь к администратору или сбросьте этот бросок.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>

            {openRoll.game ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="hud-btn inline-flex items-center gap-1.5" onClick={() => setModal("details")}>
                  <BookOpenIcon className="size-4" aria-hidden /> {t.core.gameInfo.details}
                </button>
                <button type="button" className="hud-btn hud-btn-primary inline-flex items-center gap-1.5" disabled={busy || showPendingBanner || showCompletionPending} onClick={() => setModal("pass")}>
                  <CheckCircleIcon className="size-4" aria-hidden />
                  {d.passedButton}
                </button>
                <button type="button" className="hud-btn hud-btn-danger inline-flex items-center gap-1.5" disabled={busy || showPendingBanner || showCompletionPending} onClick={() => setModal("drop")}>
                  <XCircleIcon className="size-4" aria-hidden />
                  {d.dropButton}
                </button>
                <button
                  type="button"
                  className="hud-btn inline-flex items-center gap-1.5"
                  disabled={busy || rerollLocked || showPendingBanner || showCompletionPending}
                  title={rerollLocked ? d.rerollLockedTitle : showPendingBanner ? d.rerollPending : showCompletionPending ? "Completion pending" : d.rerollButton}
                  onClick={() => setModal("reroll")}
                >
                  <ArrowPathIcon className="size-4" aria-hidden />
                  {showPendingBanner ? d.rerollPending : showCompletionPending ? "Pending" : d.rerollButton}
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="hud-btn hud-btn-danger inline-flex items-center gap-1.5" disabled={busy} onClick={() => setModal("drop")}>
                  <XCircleIcon className="size-4" aria-hidden /> Сбросить бросок
                </button>
              </div>
            )}
          </>
        ) : showIdle ? (
          <div className="flex flex-col gap-4">
            <div className="border border-dashed border-amber/20 bg-amber/[0.04] p-4 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:p-5">
              <p className="flex items-center gap-2 font-display text-lg uppercase tracking-wide">
                <BoltIcon className="size-4 text-amber" aria-hidden /> {"// READY TO ROLL"}
              </p>
              <p className="mt-1 max-w-prose font-mono text-xs leading-relaxed text-dim">{d.rollHint}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-2 py-1 font-mono text-xs tracking-wide text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                <span className="size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
                {d.noCurrentGame}
              </p>
            </div>

            <form action={rollFormAction} className="flex flex-col gap-3">
              <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
              <motion.button
                type="submit"
                className="hud-btn hud-btn-primary inline-flex items-center justify-center gap-2 self-start px-7 py-3 text-sm"
                disabled={busy}
                whileHover={{ scale: busy ? 1 : 1.015 }}
                whileTap={{ scale: 0.98 }}
              >
                <motion.span animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { duration: 0.9, repeat: Infinity, ease: "linear" } : {}}>
                  <BoltIcon className="size-4" aria-hidden />
                </motion.span>
                {rollPending ? d.rolling : d.rollButton}
              </motion.button>
              <span className="font-mono text-[11px] tracking-wide text-dim">Catalog shuffle will lock on your next game after Roll</span>
            </form>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="mt-4 border border-danger/30 bg-danger/10 p-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-danger">
              <XCircleIcon className="size-4" aria-hidden /> Error
            </div>
            <p className="mt-1 text-sm text-danger">{error}</p>
            <DebugError debug={openRoll ? resolveState.debug : rollState.debug} title="game" />
          </div>
        ) : null}

        {(lastDice?.length ?? 0) > 0 ? (
          <div className="mt-5 overflow-hidden border border-amber/20 bg-[#0f0f0e] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
            <div className="flex items-center justify-between gap-2 border-b border-amber/20 bg-amber/10 px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-amber">
                <StarIcon className="size-3.5 text-amber" aria-hidden />
                {d.lastRoll}
              </span>
              <span className="font-mono text-[10px] tracking-widest text-dim">
                {lastDice!.join(" + ")} = {lastDice!.reduce((a, b) => a + b, 0)}
              </span>
            </div>
            <div className="relative p-4">
              <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0_3px,rgba(0,0,0,0.12)_3px_4px)] opacity-40" aria-hidden />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.35)_100%)]" aria-hidden />
              <div className="relative flex flex-wrap items-center gap-3">
                {lastDice!.map((v, i) => (
                  <span
                    key={`${i}-${v}`}
                    className="ammo-counter flex h-11 w-11 items-center justify-center border border-amber bg-amber/10 text-lg text-amber shadow-[0_0_8px_rgba(242,169,0,0.25)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
                  >
                    {v}
                  </span>
                ))}
                <span className="ml-1 inline-flex items-center gap-1.5 border border-amber/30 bg-amber/10 px-2.5 py-1.5 font-mono text-xs text-amber [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  <span className="text-[10px] uppercase tracking-widest text-dim">total</span>
                  <span className="ammo-counter text-base leading-none">{lastDice!.reduce((a, b) => a + b, 0)}</span>
                </span>
              </div>
              <p className="sr-only">Результат кубика: {lastDice!.join(" + ")}</p>
            </div>
            <div className="hazard-tape opacity-40" aria-hidden />
          </div>
        ) : null}
      </div>

      <Modal open={modal === "drop" && !!openRoll} onClose={() => setModal(null)}>
        <ModalHeader title={d.dropModalTitle} subtitle={openRoll?.game?.title ?? null} />
        <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <input type="hidden" name="rollId" value={openRoll?.id ?? ""} />
          <input type="hidden" name="outcome" value="dropped" />
          <label className="text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">{d.dropReasonLabel} *</span>
            <textarea name="reason" required minLength={5} rows={3} placeholder={d.dropReasonPlaceholder} className="mt-1" disabled={resolvePending} />
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

      <Modal open={modal === "reroll" && !!openRoll} onClose={() => setModal(null)}>
        <ModalHeader title={d.rerollModalTitle} subtitle={openRoll?.game?.title ?? null} />
        <form action={resolveFormAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="seasonPlayerId" value={seasonPlayerId} />
          <input type="hidden" name="rollId" value={openRoll?.id ?? ""} />
          <input type="hidden" name="outcome" value="rerolled" />
          <label className="text-sm">
            <span className="font-mono text-xs uppercase tracking-widest text-dim">{d.rerollReasonLabel} *</span>
            <textarea name="reason" required minLength={5} rows={3} placeholder={d.rerollReasonPlaceholder} className="mt-1" disabled={resolvePending} />
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

      <GameDetailsModal
        game={modal === "details" && openRoll && openRoll.game ? toGameDetails(openRoll.game as unknown as Record<string, unknown>) : null}
        onClose={() => setModal(null)}
      />
    </section>
  );
}
