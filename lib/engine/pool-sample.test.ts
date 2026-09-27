import { describe, expect, it } from "vitest";
import { sampleUniform } from "./pool";

/** Deterministic PRNG (mulberry32) so every assertion here is reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("sampleUniform", () => {
  it("returns the requested number of distinct items from the input", () => {
    const items = range(400);
    const out = sampleUniform(items, 20, seeded(1));
    expect(out).toHaveLength(20);
    expect(new Set(out).size).toBe(20);
    for (const x of out) expect(items).toContain(x);
  });

  it("returns everything when asked for more than there is, and nothing for zero", () => {
    expect(sampleUniform(range(5), 20, seeded(2)).sort((a, b) => a - b)).toEqual(range(5));
    expect(sampleUniform(range(5), 0, seeded(2))).toEqual([]);
    expect(sampleUniform([], 20, seeded(2))).toEqual([]);
  });

  it("does not mutate its input", () => {
    const items = range(50);
    sampleUniform(items, 10, seeded(3));
    expect(items).toEqual(range(50));
  });

  it("survives an rng that returns exactly 1", () => {
    const out = sampleUniform(range(10), 10, () => 1);
    expect(new Set(out).size).toBe(10);
  });

  /**
   * The regression this exists for. FreeToGame returns its whole list sorted by
   * popularity and the provider took `slice(0, 20)`, so every roll of an API
   * season saw the same twenty titles. Across many rolls the sample must reach
   * well past the head of the list.
   */
  it("reaches the whole list across repeated draws, not just its head", () => {
    const items = range(400);
    const rng = seeded(4);
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) for (const x of sampleUniform(items, 20, rng)) seen.add(x);
    expect(Math.max(...seen), "draws never left the first page").toBeGreaterThan(19);
    expect(seen.size).toBeGreaterThan(350);
  });

  it("gives every item a fair chance of the first slot", () => {
    const rng = seeded(5);
    const counts = new Array<number>(10).fill(0);
    const draws = 20_000;
    for (let i = 0; i < draws; i++) counts[sampleUniform(range(10), 3, rng)[0]!]!++;
    for (const c of counts) expect(Math.abs(c / draws - 0.1)).toBeLessThan(0.015);
  });
});
