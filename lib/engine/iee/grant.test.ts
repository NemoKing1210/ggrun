import { describe, expect, it } from "vitest";
import { heavyBoots } from "./effects/catalog-effects";
import { slowed } from "./effects/slowed";
import { shield } from "./effects/shield";
import type { EffectDef, IeeConfig, IeeEntryConfig } from "../types/iee";
import { grantAnchor, resolveEffectGrant } from "./grant";

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

const cfg = (entries: Record<string, IeeEntryConfig> = {}): IeeConfig => ({
  enabled: true,
  inventorySize: 0,
  allowTargetingOthers: true,
  pvpProtectionMoves: 0,
  revealDropsInFeed: true,
  nothingWeight: 0,
  catchUp: { enabled: false, maxMultiplier: 2 },
  entries,
  events: [],
});

const permanent: EffectDef = {
  key: "eternal",
  polarity: "positive",
  rarity: "legendary",
  heroIcon: "BeakerIcon",
  i18n: { name: "iee.effects.eternal.name", description: "iee.effects.eternal.description" },
  stacking: "unique",
  duration: { kind: "permanent" },
  priority: 100,
  defaults: {},
  hooks: {},
};

describe("resolveEffectGrant — what the season's tuning produces", () => {
  it("turns a `rolls` duration into an expiry counted from the anchor", () => {
    const g = resolveEffectGrant(heavyBoots, cfg({ heavy_boots: entry() }), 10);
    expect(g.params).toEqual({ steps: 2 });
    expect(g.expiresAfterRollSeq).toBe(11);
    expect(g.chargesLeft).toBeNull();
  });

  it("uses the catalog duration when the entry does not override it", () => {
    const g = resolveEffectGrant(slowed, cfg({ slowed: entry() }), 10);
    expect(g.expiresAfterRollSeq).toBe(12);
    expect(g.params).toEqual({ steps: 1 });
  });

  it("applies the season's duration and strength overrides", () => {
    const g = resolveEffectGrant(
      heavyBoots,
      cfg({ heavy_boots: entry({ durationOverride: 3, paramOverrides: { steps: 4 } }) }),
      10,
    );
    expect(g.expiresAfterRollSeq).toBe(13);
    expect(g.params).toEqual({ steps: 4 });
  });

  it("falls back to the catalog when the status is not in the season's pool", () => {
    const g = resolveEffectGrant(heavyBoots, cfg(), 10);
    expect(g.params).toEqual({ steps: 2 });
    expect(g.expiresAfterRollSeq).toBe(11);
  });

  it("floors a zero duration at one roll rather than expiring on arrival", () => {
    const g = resolveEffectGrant(
      heavyBoots,
      cfg({ heavy_boots: entry({ durationOverride: 0 }) }),
      10,
    );
    expect(g.expiresAfterRollSeq).toBe(11);
  });

  it("floors an unvalidated negative duration too — legacy jsonb bypasses the schema", () => {
    const raw = { ...cfg(), entries: { heavy_boots: entry({ durationOverride: -4 }) } };
    expect(resolveEffectGrant(heavyBoots, raw, 10).expiresAfterRollSeq).toBe(11);
  });

  it("counts charges instead of rolls for a charge-based status", () => {
    const g = resolveEffectGrant(shield, cfg({ shield: entry() }), 10);
    expect(g.chargesLeft).toBe(1);
    expect(g.expiresAfterRollSeq).toBeNull();
  });

  it("overrides a charge count with the season's duration", () => {
    const g = resolveEffectGrant(shield, cfg({ shield: entry({ durationOverride: 3 }) }), 10);
    expect(g.chargesLeft).toBe(3);
    expect(g.expiresAfterRollSeq).toBeNull();
  });

  it("leaves a permanent status with neither clock nor charges", () => {
    const g = resolveEffectGrant(permanent, cfg({ eternal: entry({ paramOverrides: { a: 1 } }) }), 10);
    expect(g.expiresAfterRollSeq).toBeNull();
    expect(g.chargesLeft).toBeNull();
    expect(g.params).toEqual({ a: 1 });
  });
});

describe("grantAnchor — the roll a grant counts from", () => {
  it("counts from the last finished roll when the recipient is idle", () => {
    expect(grantAnchor(7, false)).toBe(7);
  });

  it("pushes the clock past a roll already in flight", () => {
    expect(grantAnchor(7, true)).toBe(8);
    expect(grantAnchor(0, true)).toBe(1);
  });
});
