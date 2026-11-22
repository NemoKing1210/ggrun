import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "../../config/defaults";
import type { IeePlayerSnapshot, Polarity } from "../../types/iee";
import { catalogPickInputs, defaultCatalogEntry } from "../catalog";
import { CORE_DOCS } from "../core-docs";
import { compileSet, isEffect } from "../dsl";
import { dropTable, type PickInput } from "./pick";
import { simulateSpins, spinGaps } from "./simulate";

/** A repeatable stream (mulberry32): the same seed spins the same wheel. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYER: IeePlayerSnapshot = { seasonPlayerId: "p", position: 10, balancePoints: 0, rollSeq: 10, moveCount: 10, rank: 2, status: "active" };

/** A season with every core entry attached at its rarity's weight. */
function coreWheel(polarity: Polarity, nothingWeight = 0): Omit<PickInput, "rng"> {
  const set = compileSet(CORE_DOCS);
  const { candidates, entries } = catalogPickInputs(
    set.entries.map((e) => {
      const subject = {
        entryId: e.entryId,
        revisionId: e.revisionId,
        kind: e.kind,
        key: e.key,
        character: e.character,
        rarity: e.rarity,
        tags: e.tags,
        stacking: isEffect(e) ? e.stacking.mode : null,
      };
      return { subject, row: defaultCatalogEntry(subject) };
    }),
  );
  return {
    polarity,
    config: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true, nothingWeight },
    catalog: candidates,
    entries,
    catalogDefaults: {},
    player: PLAYER,
    counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
    activeEffectKeys: [],
    heldItemCount: 0,
    seasonRollSeq: 10,
    playerCount: 4,
  };
}

describe("simulateSpins — the wizard's 1000 spins against the drop table (spec §15)", () => {
  it.each(["positive", "negative"] as const)("the %s wheel comes up as the table says, within chance", (polarity) => {
    const wheel = coreWheel(polarity, 40);
    const table = dropTable({ ...wheel, rng: () => 0 });
    expect(table.length).toBeGreaterThan(2);
    for (const seed of [1, 2, 3]) {
      const gaps = spinGaps(table, simulateSpins(wheel, 1000, stream(seed)));
      expect(gaps.within).toBe(true);
      expect(gaps.worst).toBeLessThan(0.06);
    }
  });

  it("counts every spin under its slice", () => {
    const wheel = coreWheel("positive", 100);
    const tally = simulateSpins(wheel, 500, stream(9));
    expect(Object.values(tally.counts).reduce((a, b) => a + b, 0)).toBe(500);
    expect(tally.counts.nothing).toBeGreaterThan(0);
  });

  it("a table the picker does not follow is caught", () => {
    const wheel = coreWheel("positive");
    const table = dropTable({ ...wheel, rng: () => 0 });
    // Everything on the first slice: far outside what chance explains.
    const first = table[0]!;
    const skewed = { total: 1000, counts: { [first.key ?? first.kind]: 1000 } };
    expect(spinGaps(table, skewed).within).toBe(false);
    // An outcome that is not on the table at all.
    expect(spinGaps(table, { total: 10, counts: { ghost: 10 } })).toMatchObject({ within: false, worst: 1 });
  });
});
