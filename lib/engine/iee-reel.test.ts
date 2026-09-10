import { describe, expect, it } from "vitest";
import {
  buildReelStrip,
  hashSeed,
  mulberry32,
  reelSeed,
  REEL_LANDING,
  REEL_TRAIL,
} from "./iee";
import type { WheelOutcome, WheelSlice } from "./types";

const slice = (
  kind: WheelSlice["kind"],
  key: string | null,
  weight: number,
  share = 0,
): WheelSlice => ({ kind, key, weight, share });

const outcome = (over: Partial<WheelOutcome> = {}): WheelOutcome => ({
  kind: "item",
  key: "hex_scroll",
  params: {},
  polarity: "positive",
  slices: [slice("item", "hex_scroll", 30), slice("nothing", null, 70)],
  ...over,
});

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays inside [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("reelSeed", () => {
  it("is stable across calls for one outcome", () => {
    expect(reelSeed(outcome())).toBe(reelSeed(outcome()));
  });

  it("differs when the outcome differs", () => {
    expect(reelSeed(outcome())).not.toBe(reelSeed(outcome({ key: "slowed" })));
  });

  it("hashSeed is a non-negative 32-bit integer", () => {
    for (const s of ["", "a", "hex_scroll:2", "слово"]) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe("buildReelStrip", () => {
  it("has the expected length", () => {
    const strip = buildReelStrip(outcome(), mulberry32(1));
    expect(strip).toHaveLength(REEL_LANDING + REEL_TRAIL + 1);
  });

  it("puts the server's outcome under the marker", () => {
    const strip = buildReelStrip(outcome(), mulberry32(1));
    expect(strip[REEL_LANDING]).toEqual({ kind: "item", key: "hex_scroll" });
  });

  it("keeps the marker cell the server's even when the sampler would never pick it", () => {
    // A pool that cannot produce the winner: the strip must still land on it.
    const odd = outcome({
      key: "hex_scroll",
      slices: [slice("nothing", null, 100)],
    });
    const strip = buildReelStrip(odd, mulberry32(3));
    expect(strip[REEL_LANDING]).toEqual({ kind: "item", key: "hex_scroll" });
    expect(strip.filter((c) => c.key === "hex_scroll")).toHaveLength(1);
  });

  it("renders a 'nothing' outcome as an empty cell", () => {
    const strip = buildReelStrip(
      outcome({ kind: "nothing", key: null }),
      mulberry32(1),
    );
    expect(strip[REEL_LANDING]).toEqual({ kind: "nothing", key: null });
  });

  it("degrades to empty cells when every slice has zero weight", () => {
    const strip = buildReelStrip(
      outcome({ kind: "nothing", key: null, slices: [slice("item", "x", 0)] }),
      mulberry32(1),
    );
    expect(strip.every((c) => c.kind === "nothing")).toBe(true);
  });

  it("survives an outcome with no slices at all", () => {
    const strip = buildReelStrip(outcome({ slices: [] }), mulberry32(1));
    expect(strip).toHaveLength(REEL_LANDING + REEL_TRAIL + 1);
    expect(strip[REEL_LANDING]).toEqual({ kind: "item", key: "hex_scroll" });
  });

  it("is stable for the same seed — a re-render cannot reshuffle it", () => {
    const a = buildReelStrip(outcome(), mulberry32(reelSeed(outcome())));
    const b = buildReelStrip(outcome(), mulberry32(reelSeed(outcome())));
    expect(a).toEqual(b);
  });

  /**
   * The honest-wheel claim: filler cells follow the real weights, so what a
   * player watches scroll past matches the odds they actually played.
   */
  it("samples filler cells in proportion to slice weight", () => {
    const rng = mulberry32(2024);
    let item = 0;
    let filler = 0;
    for (let run = 0; run < 400; run++) {
      const strip = buildReelStrip(outcome(), rng);
      strip.forEach((cell, i) => {
        if (i === REEL_LANDING) return; // forced, not sampled
        filler++;
        if (cell.key === "hex_scroll") item++;
      });
    }
    expect(item / filler).toBeCloseTo(0.3, 1);
  });

  it("never emits a key that is not on the wheel", () => {
    const rng = mulberry32(11);
    const allowed = new Set(["hex_scroll", null]);
    for (let run = 0; run < 50; run++) {
      for (const cell of buildReelStrip(outcome(), rng)) {
        expect(allowed.has(cell.key)).toBe(true);
      }
    }
  });
});
