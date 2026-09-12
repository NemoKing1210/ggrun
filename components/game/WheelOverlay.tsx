"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BoltIcon, GiftIcon, MinusCircleIcon } from "@heroicons/react/24/outline";

import { Badge } from "@/components/ui/Badge";
import { EntryDescription } from "@/components/iee/EntryDescription";
import { IeeArtTile } from "@/components/iee/IeeArtTile";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import {
  buildReelStrip,
  getEffect,
  getItem,
  mulberry32,
  reelSeed,
  REEL_LANDING,
  type ReelCell,
  type WheelOutcome,
  type WheelOutcomeKind,
} from "@/lib/engine";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { dictText } from "@/lib/i18n/dict-text";

/** One reel cell is 96px wide with an 8px gutter. */
const CELL = 96;
const GAP = 8;
const STEP = CELL + GAP;
const LANDING = REEL_LANDING;
const SPIN_MS = 2200;

type CellView = ReelCell & { name: string };

function describe(t: Dictionary, kind: WheelOutcomeKind, key: string | null): CellView {
  if (kind === "nothing" || kind === "fallback" || !key) {
    return { key: null, kind: "nothing", name: t.iee.wheel.nothing };
  }
  const def = kind === "item" ? getItem(key) : getEffect(key);
  return { key, kind, name: def ? dictText(t, def.i18n.name) : key };
}

/**
 * The wheel.
 *
 * It never decides anything: the outcome arrives already persisted by the
 * server, and this only animates a strip that stops on it. The strip's
 * composition is sampled from the real slice weights, so a rare entry really
 * does appear rarely as it scrolls past — the odds a player sees are the odds
 * they played.
 *
 * A reel rather than a disc: `DESIGN.md` §1 is square, cut and stamped, and a
 * spinning circle would be the one round thing in the whole interface.
 */
export function WheelOverlay({
  outcome,
  onClose,
}: {
  outcome: WheelOutcome | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const w = t.iee.wheel;
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<number | null>(null);

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * A pool with a single possible outcome has nothing to reveal: spinning it
   * would be two seconds of the same word scrolling past at 100%. Show the
   * result immediately instead — the animation is there to build suspense
   * about a real choice, not to perform one that never happened.
   */
  const trivial =
    !outcome ||
    new Set(outcome.slices.filter((s) => s.weight > 0).map((s) => s.key)).size <= 1;

  const instant = reduced || trivial;

  const strip = useMemo<CellView[]>(() => {
    if (!outcome) return [];
    return buildReelStrip(outcome, mulberry32(reelSeed(outcome))).map((cell) =>
      describe(t, cell.kind, cell.key),
    );
  }, [outcome, t]);

  useEffect(() => {
    if (!outcome) {
      setOffset(0);
      setRevealed(false);
      return;
    }
    if (instant) {
      setOffset(-(LANDING * STEP));
      setRevealed(true);
      return;
    }
    setOffset(0);
    setRevealed(false);
    // Two frames: the first paints the strip at rest, the second starts the
    // transition. Setting both in one frame would skip the animation entirely.
    const raf = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => setOffset(-(LANDING * STEP))),
    );
    timer.current = window.setTimeout(() => setRevealed(true), SPIN_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [outcome, instant]);

  if (!outcome) return null;

  const won = describe(t, outcome.kind, outcome.key);
  const negative = outcome.polarity === "negative";
  const share = outcome.slices.find((s) => s.key === outcome.key)?.share ?? null;
  // The entry's own glyph when there is one — this is the first time a player
  // sees the thing they just won, so a generic gift box wastes the moment.
  const Fallback = outcome.kind === "item" ? GiftIcon : outcome.kind === "effect" ? BoltIcon : MinusCircleIcon;
  const def =
    outcome.kind === "item"
      ? getItem(outcome.key ?? "")
      : outcome.kind === "effect"
        ? getEffect(outcome.key ?? "")
        : null;

  return (
    <Modal open onClose={revealed ? onClose : () => {}}>
      <div>
        <h3 className="font-display text-lg uppercase tracking-widest">
          {negative ? w.titleNegative : w.title}
        </h3>
        <div className="hazard-tape mt-3 opacity-60" aria-hidden />
      </div>

      {/* Reel */}
      <div
        className="relative mt-4 overflow-hidden border border-[#3d3d34] bg-[#131312] py-3 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
        role="img"
        aria-label={revealed ? won.name : w.spinning}
      >
        <div
          className="flex will-change-transform"
          style={{
            gap: `${GAP}px`,
            // The strip is centred on the marker: half the viewport minus half a cell.
            transform: `translateX(calc(50% - ${CELL / 2}px + ${offset}px))`,
            transition: instant ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.11,0.78,0.18,1)`,
          }}
        >
          {strip.map((cell, i) => (
            <div
              key={`${cell.key ?? "nothing"}-${i}`}
              style={{ width: CELL }}
              className={`flex h-20 shrink-0 flex-col items-center justify-center gap-1 border px-1 text-center [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)] ${
                cell.kind === "nothing"
                  ? "border-[#2a2a22] bg-[#1a1a1a] text-dim"
                  : cell.kind === "item"
                    ? "border-military/40 bg-military/10 text-military"
                    : "border-violet-400/40 bg-violet-500/10 text-violet-300"
              }`}
            >
              <span className="line-clamp-3 font-display text-[10px] uppercase leading-tight tracking-wider">
                {cell.name}
              </span>
            </div>
          ))}
        </div>

        {/* Centre marker */}
        <span
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-amber shadow-[0_0_8px_rgb(var(--hud-amber-glow)/0.6)]"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute left-1/2 top-0 size-2 -translate-x-1/2 bg-amber [clip-path:polygon(0_0,100%_0,50%_100%)]"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute bottom-0 left-1/2 size-2 -translate-x-1/2 bg-amber [clip-path:polygon(50%_0,100%_100%,0_100%)]"
          aria-hidden
        />
      </div>

      {/* Result */}
      <div className="mt-4 min-h-[5.5rem]" aria-live="polite">
        {revealed ? (
          <div className="flex items-start gap-3">
            {def ? (
              <IeeArtTile
                entryKey={outcome.key}
                kind={outcome.kind === "item" ? "item" : "effect"}
                heroIcon={def.heroIcon}
                polarity={negative ? "negative" : "positive"}
                size="lg"
              />
            ) : (
              <Fallback
                className={`mt-0.5 size-6 shrink-0 ${
                  outcome.kind === "nothing" ? "text-dim" : negative ? "text-danger" : "text-amber"
                }`}
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-xl uppercase tracking-wider text-zinc-100">
                  {won.name}
                </span>
                {outcome.kind !== "nothing" && (
                  <Badge variant={negative ? "danger" : "military"}>
                    {negative ? t.iee.polarity.negative : t.iee.polarity.positive}
                  </Badge>
                )}
                {share !== null && (
                  <span className="ammo-counter text-[11px] text-dim">
                    {format(w.odds, { percent: (share * 100).toFixed(1) })}
                  </span>
                )}
              </div>
              <EntryDescription>
                {outcome.kind === "nothing"
                  ? w.gotNothing
                  : def
                    ? dictText(t, def.i18n.description)
                    : ""}
              </EntryDescription>
              {outcome.kind !== "nothing" && (
                <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-amber">
                  {outcome.kind === "item" ? w.gotItem : w.gotEffect}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="font-mono text-xs uppercase tracking-widest text-dim">{w.spinning}</p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="hud-btn hud-btn-primary"
          onClick={onClose}
          disabled={!revealed}
        >
          {w.close}
        </button>
      </div>
    </Modal>
  );
}
