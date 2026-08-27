"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate, type AnimationPlaybackControls } from "framer-motion";
import { BoltIcon, SparklesIcon } from "@heroicons/react/24/outline";

type PreviewGame = {
  title: string;
  coverUrl: string | null;
  platform: string | null;
};

const ITEM_W = 112; // card width
const GAP = 8;
const CELL = ITEM_W + GAP;

export function InlineGameCarousel({
  games,
  phase,
  targetIndex,
  onDecelerateEnd,
}: {
  games: PreviewGame[];
  phase: "idle" | "spinning" | "decelerating" | "revealed";
  targetIndex: number | null;
  onDecelerateEnd?: () => void;
}) {
  const pool = games.length >= 6 ? games.slice(0, 14) : [...games, ...games, ...games].slice(0, 14);
  const count = pool.length || 8;
  // 6 copies for smooth long scroll
  const extended = Array.from({ length: 6 }, () => pool).flat() as PreviewGame[];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [centerOffset, setCenterOffset] = useState(280);
  const x = useMotionValue(0);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const onEndRef = useRef(onDecelerateEnd);
  useEffect(() => {
    onEndRef.current = onDecelerateEnd;
  }, [onDecelerateEnd]);
  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const upd = () => setCenterOffset(el.clientWidth / 2);
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // spinning: infinite linear to the left
  useEffect(() => {
    if (phase === "spinning" && !prefersReduced) {
      if (animRef.current) animRef.current.stop();
      // one loop width = count*CELL
      const loop = count * CELL;
      // start from current x, animate to current - loop
      const current = x.get();
      animRef.current = animate(x, current - loop, {
        duration: 0.85,
        ease: "linear",
        repeat: Infinity,
        repeatType: "loop",
      });
      return () => {
        if (animRef.current) animRef.current.stop();
      };
    }
    if (phase === "decelerating" && targetIndex !== null && !prefersReduced) {
      if (animRef.current) animRef.current.stop();
      const current = x.get();
      // target in the 3rd copy (middle) to have room
      const baseCopy = 3; // 0-indexed copy
      const targetPosInTrack = (baseCopy * count + targetIndex) * CELL + ITEM_W / 2;
      // final x so that target center aligns to container center
      let finalX = centerOffset - targetPosInTrack;
      // ensure final is behind current (more negative) by at least 2 extra loops if needed
      while (finalX > current) finalX -= count * CELL;
      // add 2 extra loops for dramatic distance
      finalX -= count * CELL * 2;

      animRef.current = animate(x, finalX, {
        duration: 3.1,
        ease: [0.12, 0.85, 0.2, 1],
      });
      const t = setTimeout(() => onEndRef.current?.(), 3100);
      return () => {
        clearTimeout(t);
        if (animRef.current) animRef.current.stop();
      };
    }
    if (phase === "revealed" || phase === "idle" || prefersReduced) {
      if (animRef.current) animRef.current.stop();
      if (targetIndex !== null && phase === "revealed") {
        const baseCopy = 3;
        const targetPosInTrack = (baseCopy * count + targetIndex) * CELL + ITEM_W / 2;
        const finalX = centerOffset - targetPosInTrack - count * CELL * 2;
        x.set(finalX);
      } else if (phase === "idle") {
        x.set(0);
      }
      if (phase === "revealed" && targetIndex !== null && prefersReduced) {
        const id = setTimeout(() => onEndRef.current?.(), 0);
        return () => clearTimeout(id);
      }
    }
  }, [phase, targetIndex, count, centerOffset, prefersReduced, x]);

  if (games.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center border border-amber/20 bg-[#0e0e0d] p-4 text-center [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]">
        <span className="font-mono text-xs uppercase tracking-widest text-dim">Catalog empty — seeding…</span>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden border border-amber/30 bg-[#0e0e0d] shadow-[0_0_18px_rgba(242,169,0,0.08)] [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_62%,rgba(0,0,0,0.48)_100%)]" aria-hidden />

      <div className="relative flex items-center justify-between border-b border-amber/20 bg-amber/10 px-3 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-amber">
          <BoltIcon className="size-3.5" aria-hidden />
          {phase === "spinning" ? "ROLLING" : phase === "decelerating" ? "SLOWING" : phase === "revealed" ? "LOCKED" : "READY"}
          <span className="hidden sm:inline text-dim">· ROULETTE</span>
        </span>
        <span className="flex items-center gap-1 font-mono text-[10px] tracking-widest text-dim">
          <span className="size-1.5 bg-amber animate-pulse [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
          {pool.length} titles
        </span>
      </div>

      <div ref={containerRef} className="relative h-[156px] sm:h-[168px] overflow-hidden bg-[#121210] py-3">
        {/* center indicator */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[132px] w-[116px] -translate-x-1/2 -translate-y-1/2">
          <div className="absolute inset-0 border border-amber/70 bg-amber/[0.04] shadow-[0_0_22px_rgba(242,169,0,0.28),inset_0_0_14px_rgba(242,169,0,0.09)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]" aria-hidden />
          <span className="absolute -left-px -top-px size-2.5 border-l-2 border-t-2 border-amber" aria-hidden />
          <span className="absolute -bottom-px -right-px size-2.5 border-b-2 border-r-2 border-amber" aria-hidden />
          <span className="absolute left-1/2 top-0 h-px w-8 -translate-x-1/2 bg-amber/70" aria-hidden />
          <span className="absolute bottom-0 left-1/2 h-px w-8 -translate-x-1/2 bg-amber/70" aria-hidden />
          {/* vertical center line */}
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-amber/15" aria-hidden />
        </div>

        {/* top / bottom fade */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#121210] via-[#121210]/70 to-transparent" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#121210] via-[#121210]/70 to-transparent" aria-hidden />

        <motion.div className="flex h-full items-center gap-2 will-change-transform" style={{ x, width: "max-content" }}>
          {extended.map((g, i) => (
            <div key={`${g.title}-${i}`} className="shrink-0" style={{ width: ITEM_W }}>
              <div className="w-full overflow-hidden border border-[#3d3d34] bg-raised p-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.45)] [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)]">
                <div className="relative aspect-[3/4] w-full overflow-hidden border border-[#2a2a22] bg-background [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
                  {g.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.coverUrl} alt={g.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[#1a1a14] p-2 text-center">
                      <SparklesIcon className="size-5 text-dim/30" aria-hidden />
                      <span className="line-clamp-3 font-mono text-[8px] uppercase tracking-widest text-dim">{g.title.slice(0, 22)}</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-1 pt-5">
                    <span className="line-clamp-2 font-mono text-[8px] font-semibold uppercase leading-tight tracking-wide text-white">{g.title}</span>
                  </div>
                </div>
                {g.platform ? (
                  <span className="mt-1 block truncate border border-dim/30 bg-background/60 px-1 py-0.5 text-center font-mono text-[7px] uppercase tracking-widest text-dim [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
                    {g.platform}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </motion.div>

        {/* tick marks */}
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-20 flex -translate-x-1/2 gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className={`h-1 w-6 ${i === 3 ? "bg-amber" : "bg-dim/30"}`} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#3d3d34] bg-raised/40 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
          {phase === "spinning" ? "spinning fast…" : phase === "decelerating" ? "braking…" : phase === "revealed" ? "selection locked" : "awaiting roll"}
        </span>
        <motion.span
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-amber"
          animate={phase === "spinning" ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
          transition={phase === "spinning" ? { duration: 0.7, repeat: Infinity } : {}}
        >
          <span className="size-1.5 bg-amber [clip-path:polygon(1px_0,100%_0,100%_calc(100%-1px),calc(100%-1px)_100%,0_100%,0_1px)]" aria-hidden />
          {phase === "spinning" ? "RND · SYSTEM" : phase === "decelerating" ? "BRAKING" : phase === "revealed" ? "READY" : "IDLE"}
        </motion.span>
      </div>
      <div className="hazard-tape opacity-70" aria-hidden />
    </div>
  );
}

export function GameRollReveal({
  game,
}: {
  game: { title: string; coverUrl: string | null; platform: string | null };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="relative overflow-hidden border border-amber bg-amber/10 p-4 shadow-[0_0_20px_rgba(242,169,0,0.18)] [clip-path:polygon(8px_0,100%_0,100%_calc(100%-8px),calc(100%-8px)_100%,0_100%,0_8px)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(242,169,0,0.13),transparent_70%)]" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0_3px,rgba(0,0,0,0.08)_3px_4px)] opacity-40" aria-hidden />
      <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <motion.div
          initial={{ rotate: -4, scale: 0.92 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.12 }}
          className="relative h-28 w-20 shrink-0 overflow-hidden border border-amber/50 bg-background shadow-[0_6px_18px_rgba(0,0,0,0.45)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)] sm:h-32 sm:w-24"
        >
          {game.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.coverUrl} alt={game.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-raised p-2 text-center font-mono text-xs text-dim">{game.title.slice(0, 20)}</div>
          )}
          <div className="absolute inset-0 shadow-[inset_0_0_12px_rgba(242,169,0,0.22)]" aria-hidden />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 border border-amber bg-amber px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-black [clip-path:polygon(3px_0,100%_0,100%_calc(100%-3px),calc(100%-3px)_100%,0_100%,0_3px)]">
            <SparklesIcon className="size-3" aria-hidden /> SELECTED
          </div>
          <h3 className="mt-2 line-clamp-3 font-display text-xl uppercase leading-tight tracking-wide sm:text-2xl">{game.title}</h3>
          {game.platform ? (
            <span className="mt-2 inline-block border border-dim/30 bg-background/60 px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-dim [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              {game.platform}
            </span>
          ) : null}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-3 flex justify-center sm:justify-start">
            <span className="inline-flex items-center gap-1.5 bg-amber px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-black shadow-[0_0_10px_rgba(242,169,0,0.3)] [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]">
              <span aria-hidden>⚡</span> locked in run
            </span>
          </motion.div>
        </div>
      </div>
      <motion.div
        className="pointer-events-none absolute inset-0 border border-amber/0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, delay: 0.2, times: [0, 0.4, 1] }}
        style={{ boxShadow: "0 0 28px rgba(242,169,0,0.35), inset 0 0 18px rgba(242,169,0,0.15)" }}
        aria-hidden
      />
      <div className="hazard-tape mt-4 opacity-50" aria-hidden />
    </motion.div>
  );
}
