/**
 * The wheel spun many times (docs/IEE_CONSTRUCTOR_SPEC.md §15) — what the
 * season wizard's 1000-spin simulator shows beside the drop table, and how
 * far the counts may stray from the table before chance no longer explains
 * them. The spins are the picker's own (`pickWheelOutcome`), so a gap beyond
 * the tolerance means the picker and the table disagree.
 */
import type { WheelSlice } from "../../types/iee";
import { pickWheelOutcome, type PickInput } from "./pick";

/** What came up, by slice: an entry's key, or `nothing` / `fallback`. */
export interface SpinTally {
  total: number;
  counts: Record<string, number>;
}

/** The slice a tally counts an outcome under. */
export const sliceKey = (slice: { key: string | null; kind: string }) => slice.key ?? slice.kind;

/** Spins the wheel `spins` times, each draw from `rng`. */
export function simulateSpins(input: Omit<PickInput, "rng">, spins: number, rng: () => number): SpinTally {
  const counts: Record<string, number> = {};
  for (let i = 0; i < spins; i++) {
    const out = pickWheelOutcome({ ...input, rng });
    const key = sliceKey(out);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { total: spins, counts };
}

export interface SliceGap {
  key: string;
  share: number;
  observed: number;
  /** Four standard deviations of the observed share, and a count's worth more. */
  tolerance: number;
}

export interface SpinGaps {
  slices: SliceGap[];
  /** The largest gap between a slice's share and how often it came up, as a share. */
  worst: number;
  /** Every slice within its tolerance. */
  within: boolean;
}

/** How far each slice's count strays from its share of the table. */
export function spinGaps(table: readonly WheelSlice[], tally: SpinTally): SpinGaps {
  const n = Math.max(1, tally.total);
  const slices = table.map((slice): SliceGap => {
    const key = sliceKey(slice);
    const observed = (tally.counts[key] ?? 0) / n;
    const tolerance = 4 * Math.sqrt((slice.share * (1 - slice.share)) / n) + 1 / n;
    return { key, share: slice.share, observed, tolerance };
  });
  // Something that came up but is not on the table is a gap of its whole share.
  const known = new Set(slices.map((s) => s.key));
  const stray = Object.entries(tally.counts).filter(([key]) => !known.has(key)).reduce((sum, [, count]) => sum + count / n, 0);
  const worst = Math.max(stray, ...slices.map((s) => Math.abs(s.observed - s.share)));
  return { slices, worst, within: stray === 0 && slices.every((s) => Math.abs(s.observed - s.share) <= s.tolerance) };
}
