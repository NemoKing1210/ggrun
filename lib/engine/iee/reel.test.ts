import { describe, expect, it } from "vitest";
import type { WheelOutcome, WheelSlice } from "../types/iee";
import {
  buildReelStrip,
  hashSeed,
  mulberry32,
  reelSeed,
  REEL_LANDING,
  REEL_TRAIL,
} from "./reel";

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
  it("replays exactly the same sequence for the same seed", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    expect([a(), a(), a(), a()]).toEqual([b(), b(), b(), b()]);
  });

  it("stays inside [0, 1)", () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 2000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashSeed", () => {
  it("is deterministic and returns a 32-bit unsigned integer", () => {
    for (const text of ["", "hex_scroll", "slowed:3", "привет"]) {
      const h = hashSeed(text);
      expect(h).toBe(hashSeed(text));
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it("distinguishes different inputs", () => {
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("reelSeed", () => {
  it("is stable for one outcome", () => {
    expect(reelSeed(outcome())).toBe(reelSeed(outcome()));
  });

  it("changes when the landed key changes", () => {
    expect(reelSeed(outcome())).not.toBe(reelSeed(outcome({ key: "slowed" })));
  });

  it("changes when the slice count changes", () => {
    const one = reelSeed({ key: "hex_scroll", slices: [slice("item", "hex_scroll", 1)] });
    const two = reelSeed({
      key: "hex_scroll",
      slices: [slice("item", "hex_scroll", 1), slice("nothing", null, 1)],
    });
    expect(one).not.toBe(two);
  });
});

describe("buildReelStrip", () => {
  it("builds landing + trail + 1 cells", () => {
    expect(buildReelStrip(outcome(), mulberry32(1))).toHaveLength(REEL_LANDING + REEL_TRAIL + 1);
  });

  it("honours a custom landing and trail length", () => {
    const strip = buildReelStrip(outcome(), mulberry32(1), 2, 1);
    expect(strip).toHaveLength(4);
    expect(strip[2]).toEqual({ kind: "item", key: "hex_scroll" });
  });

  it("puts the server's outcome under the marker even when the sampler cannot produce it", () => {
    const impossible = outcome({ key: "hex_scroll", slices: [slice("nothing", null, 100)] });
    const strip = buildReelStrip(impossible, mulberry32(3));
    expect(strip[REEL_LANDING]).toEqual({ kind: "item", key: "hex_scroll" });
    expect(strip.filter((c) => c.key === "hex_scroll")).toHaveLength(1);
  });

  it("renders a 'nothing' landing and a null-key landing as the empty cell", () => {
    const nothing = buildReelStrip(outcome({ kind: "nothing", key: null }), mulberry32(1));
    expect(nothing[REEL_LANDING]).toEqual({ kind: "nothing", key: null });

    const nullKey = buildReelStrip(outcome({ kind: "effect", key: null }), mulberry32(1));
    expect(nullKey[REEL_LANDING]).toEqual({ kind: "nothing", key: null });
  });

  it("fills with empty cells when the pool carries no weight", () => {
    const strip = buildReelStrip(
      outcome({ kind: "nothing", key: null, slices: [slice("item", "x", 0)] }),
      mulberry32(1),
    );
    expect(strip.every((c) => c.kind === "nothing")).toBe(true);
  });

  it("survives an outcome with no slices, still landing on the server's cell", () => {
    const strip = buildReelStrip(outcome({ slices: [] }), mulberry32(1));
    expect(strip).toHaveLength(REEL_LANDING + REEL_TRAIL + 1);
    expect(strip[REEL_LANDING]).toEqual({ kind: "item", key: "hex_scroll" });
  });

  it("never samples a zero-weight slice into the filler", () => {
    const withZero = outcome({
      kind: "nothing",
      key: null,
      slices: [slice("item", "ghost", 0), slice("nothing", null, 10)],
    });
    const strip = buildReelStrip(withZero, mulberry32(7));
    const fillers = strip.filter((_, i) => i !== REEL_LANDING);
    expect(fillers.every((c) => c.key !== "ghost")).toBe(true);
    expect(fillers.every((c) => c.kind === "nothing")).toBe(true);
  });

  it("samples only from the surviving slice when just one has weight", () => {
    const single = outcome({
      kind: "effect",
      key: "slowed",
      slices: [slice("effect", "slowed", 1)],
    });
    const strip = buildReelStrip(single, mulberry32(5));
    expect(strip.filter((_, i) => i !== REEL_LANDING).every((c) => c.key === "slowed")).toBe(true);
  });

  it("is byte-for-byte stable for one seed — a re-render cannot reshuffle the strip", () => {
    const a = buildReelStrip(outcome(), mulberry32(reelSeed(outcome())));
    const b = buildReelStrip(outcome(), mulberry32(reelSeed(outcome())));
    expect(a).toEqual(b);
  });
});
