import type { WheelOutcome, WheelSlice, WheelOutcomeKind } from "../types/iee";

/** One cell of the wheel's reel strip. */
export interface ReelCell {
  kind: WheelOutcomeKind;
  key: string | null;
}

/** Index of the winning cell, and how many trail after it. */
export const REEL_LANDING = 34;
export const REEL_TRAIL = 6;

/**
 * Deterministic PRNG (mulberry32) so a re-render never reshuffles a strip
 * mid-spin. Exported because the reel seeds it from the outcome.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, for turning an outcome into a stable seed. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const EMPTY: ReelCell = { kind: "nothing", key: null };

/**
 * Builds the strip the wheel scrolls past.
 *
 * Filler cells are sampled from the real slice weights, so a rare entry really
 * does scroll past rarely — the odds a player watches are the odds they
 * played. The cell under the marker is then overwritten with the server's
 * outcome, because the client never decides anything.
 */
export function buildReelStrip(
  outcome: Pick<WheelOutcome, "kind" | "key" | "slices">,
  rng: () => number,
  landing: number = REEL_LANDING,
  trail: number = REEL_TRAIL,
): ReelCell[] {
  const pool: WheelSlice[] = outcome.slices.filter((s) => s.weight > 0);
  const total = pool.reduce((acc, s) => acc + s.weight, 0);
  const cells: ReelCell[] = [];

  for (let i = 0; i < landing + trail + 1; i++) {
    if (total <= 0 || pool.length === 0) {
      cells.push(EMPTY);
      continue;
    }
    let roll = rng() * total;
    let chosen = pool[pool.length - 1]!;
    for (const slice of pool) {
      roll -= slice.weight;
      if (roll < 0) {
        chosen = slice;
        break;
      }
    }
    cells.push({ kind: chosen.kind, key: chosen.key });
  }

  cells[landing] =
    outcome.kind === "nothing" || outcome.key === null
      ? EMPTY
      : { kind: outcome.kind, key: outcome.key };
  return cells;
}

/** Stable seed for one outcome, so the strip survives a re-render unchanged. */
export function reelSeed(outcome: Pick<WheelOutcome, "key" | "slices">): number {
  return hashSeed(`${outcome.key ?? "nothing"}:${outcome.slices.length}`);
}
