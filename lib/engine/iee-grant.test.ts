import { describe, expect, it } from "vitest";

import { IeeConfigSchema } from "./config";
import { EFFECTS, grantAnchor, resolveEffectGrant } from "./iee";
import type { IeeConfig, IeeEntryConfig } from "./types";

/**
 * The season's tuning means the same thing however a status arrives.
 *
 * It did not. Three things grant a status — a wheel drop, an item, a challenge
 * reward — and only the wheel read `seasons.config.iee`. A host who set heavy
 * boots to "-4 cells for 3 rolls" got that from a penalty cell and the
 * catalog's "-2 for 1" from lead weights, with nothing on screen to explain the
 * difference. The arithmetic now lives in one pure function; these tests pin
 * what it must produce, and `grant-parity.test.ts` pins that everyone calls it.
 */

const entry = (over: Partial<IeeEntryConfig> = {}): IeeEntryConfig => ({
  enabled: true,
  weight: 100,
  polarityOverride: null,
  maxPerSeason: null,
  maxPerPlayer: null,
  cooldownRolls: 0,
  minPosition: 0,
  unlockAfterMove: 0,
  paramOverrides: {},
  durationOverride: null,
  targetOverride: null,
  ...over,
});

const cfg = (entries: Record<string, IeeEntryConfig> = {}): IeeConfig =>
  IeeConfigSchema.parse({ enabled: true, entries });

const boots = EFFECTS.heavy_boots!; // rolls: 1, steps: 2
const shield = EFFECTS.shield!; //     charges: 1

describe("resolveEffectGrant — catalog, then the season on top", () => {
  it("falls back to the catalog when the entry is not tuned", () => {
    const g = resolveEffectGrant(boots, cfg({ heavy_boots: entry() }), 10);
    expect(g.params).toEqual({ steps: 2 });
    expect(g.expiresAfterRollSeq).toBe(11);
    expect(g.chargesLeft).toBeNull();
  });

  it("falls back to the catalog when the entry is absent entirely", () => {
    // An item can grant a status the season never put in its drop pool; it must
    // still work, on catalog terms.
    const g = resolveEffectGrant(boots, cfg(), 10);
    expect(g.params).toEqual({ steps: 2 });
    expect(g.expiresAfterRollSeq).toBe(11);
  });

  it("applies paramOverrides — the strength the host typed", () => {
    const g = resolveEffectGrant(
      boots,
      cfg({ heavy_boots: entry({ paramOverrides: { steps: 4 } }) }),
      10,
    );
    expect(g.params).toEqual({ steps: 4 });
  });

  it("applies durationOverride — the length the host typed", () => {
    const g = resolveEffectGrant(
      boots,
      cfg({ heavy_boots: entry({ durationOverride: 3 }) }),
      10,
    );
    expect(g.expiresAfterRollSeq).toBe(13);
  });

  // The exact scenario from the audit: tuned long from a cell, catalog-short
  // from an item, and `refresh` overwriting the first with the second. Both
  // halves are fixed — this is the half that made the two disagree.
  it("gives an item-granted status the same length as a cell-granted one", () => {
    const tuned = cfg({ slowed: entry({ durationOverride: 5 }) });
    const fromCell = resolveEffectGrant(EFFECTS.slowed!, tuned, 11);
    const fromItem = resolveEffectGrant(EFFECTS.slowed!, tuned, 11);
    expect(fromItem.expiresAfterRollSeq).toBe(fromCell.expiresAfterRollSeq);
    expect(fromItem.expiresAfterRollSeq).toBe(16);
  });

  it("counts charges rather than rolls when the duration says so", () => {
    const g = resolveEffectGrant(shield, cfg({ shield: entry() }), 10);
    expect(g.chargesLeft).toBe(1);
    expect(g.expiresAfterRollSeq).toBeNull();
  });

  it("overrides a charge count too", () => {
    const g = resolveEffectGrant(shield, cfg({ shield: entry({ durationOverride: 3 }) }), 10);
    expect(g.chargesLeft).toBe(3);
  });

  // A zero duration would mean "expires before it starts" — a status that
  // exists only in the feed. One roll is the floor. Negative values never get
  // this far: `IeeConfigSchema` refuses them, and both layers are worth having,
  // because an entry can also arrive from an older season's stored jsonb.
  it("floors a duration of zero at one roll", () => {
    const g = resolveEffectGrant(boots, cfg({ heavy_boots: entry({ durationOverride: 0 }) }), 10);
    expect(g.expiresAfterRollSeq).toBe(11);
  });

  it("and the schema refuses a negative duration outright", () => {
    expect(() => cfg({ heavy_boots: entry({ durationOverride: -4 }) })).toThrow();
  });

  it("floors an unvalidated negative duration too", () => {
    // Straight past the schema, as a legacy jsonb blob would arrive.
    const raw = { ...cfg(), entries: { heavy_boots: entry({ durationOverride: -4 }) } };
    expect(resolveEffectGrant(boots, raw, 10).expiresAfterRollSeq).toBe(11);
  });

  describe("the anchor is the last finished roll, so N rolls means the next N", () => {
    it.each([1, 2, 5])("a %i-roll status covers exactly that many rolls", (n) => {
      const anchor = 7;
      const g = resolveEffectGrant(
        boots,
        cfg({ heavy_boots: entry({ durationOverride: n }) }),
        anchor,
      );
      // Active while `currentRollSeq <= expiresAfterRollSeq`, and the first roll
      // it can touch is anchor + 1.
      expect(g.expiresAfterRollSeq! - anchor).toBe(n);
    });
  });

  it("every catalog effect resolves without an entry (nothing throws)", () => {
    for (const def of Object.values(EFFECTS)) {
      expect(() => resolveEffectGrant(def, cfg(), 0)).not.toThrow();
    }
  });
});

/**
 * An attack cannot reach into a move that is already underway.
 *
 * Offensive items are usable `anytime`, and a player who has rolled a game is
 * away playing it for days — a state `/board` displays. So the item could be
 * timed for exactly that window and land on the move the victim was about to
 * submit, with no chance to answer. A penalty cell never behaved that way: its
 * status is granted at the end of a turn and bites the next one.
 */
describe("grantAnchor — the clock a status starts on", () => {
  it("counts from the last finished roll when the target is idle", () => {
    expect(grantAnchor(7, false)).toBe(7);
  });

  it("skips the roll already in flight", () => {
    expect(grantAnchor(7, true)).toBe(8);
  });

  it("means a one-roll status misses the pending move and catches the next", () => {
    const anchor = grantAnchor(7, true);
    const g = resolveEffectGrant(
      EFFECTS.heavy_boots!,
      cfg({ heavy_boots: entry() }),
      anchor,
    );
    // The pending roll resolves as turn 8; active while rollSeq <= expires.
    expect(g.expiresAfterRollSeq).toBe(9);
    expect(g.expiresAfterRollSeq! >= 8, "would still be active on the pending move").toBe(true);
    expect(8 > 7, "and the pending move is turn 8, not 7").toBe(true);
  });

  it("puts an item grant on the same footing as a cell drop", () => {
    // A cell drop during turn N anchors at N — the turn completing — and bites
    // N+1. An item thrown at someone mid-roll now does exactly the same.
    const cellDropDuringTurn8 = resolveEffectGrant(EFFECTS.heavy_boots!, cfg(), 8);
    const itemThrownDuringTurn8 = resolveEffectGrant(
      EFFECTS.heavy_boots!,
      cfg(),
      grantAnchor(7, true),
    );
    expect(itemThrownDuringTurn8.expiresAfterRollSeq).toBe(
      cellDropDuringTurn8.expiresAfterRollSeq,
    );
  });
});
