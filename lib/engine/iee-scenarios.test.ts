import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG, IeeConfigSchema } from "./config";
import { applyMovementModifiers, modifiedDice } from "./board/movement";
import {
  checkItemUse,
  EFFECTS,
  grantAnchor,
  resolveEffectGrant,
  gateCandidate,
  ITEMS,
  pickWheelOutcome,
  runHook,
  SCENARIOS,
  type Scenario,
} from "./iee";
import type {
  ActiveEffectLike,
  IeeEntryConfig,
  IeePlayerSnapshot,
  ItemUseResult,
  MovementResult,
  SeasonConfig,
} from "./types";

/**
 * The engine half of the behaviour catalogue (`lib/engine/iee/scenarios.ts`).
 *
 * Every `tier: "engine"` scenario is implemented here under its own id, and
 * the last block asserts the two lists match — a scenario without a test, or a
 * test without a scenario, fails the suite. The `live` half is
 * `probe/scenarios.mjs`.
 */

// --- fixtures ---------------------------------------------------------------

const player = (over: Partial<IeePlayerSnapshot> = {}): IeePlayerSnapshot => ({
  seasonPlayerId: "sp-me",
  position: 10,
  balancePoints: 5,
  rollSeq: 4,
  moveCount: 4,
  rank: 2,
  status: "active",
  ...over,
});

const effect = (
  effectKey: string,
  over: Partial<ActiveEffectLike> = {},
): ActiveEffectLike => ({
  id: `e-${effectKey}-${over.id ?? "1"}`,
  effectKey,
  params: EFFECTS[effectKey]?.defaults ?? {},
  chargesLeft: null,
  // Durations are counted in resolved rolls: applied at 4 with a two-roll
  // duration means "active through roll 6".
  expiresAfterRollSeq:
    EFFECTS[effectKey]?.duration.kind === "rolls"
      ? 4 + (EFFECTS[effectKey]!.duration.value ?? 0)
      : null,
  appliedAt: 1,
  ...over,
});

const turn = (over: Record<string, unknown> = {}) => ({
  rollSeq: 5,
  outcome: "passed" as const,
  ...over,
});

/** Applies `afterMovement` the way resolveGameRoll does. */
const move = (
  effects: ActiveEffectLike[],
  landsOn: number,
  board: SeasonConfig["board"] = DEFAULT_SEASON_CONFIG.board,
  rollSeq = 5,
  /** Where the turn started. Defaults to the start, which is where the old
   *  scenarios implicitly stood — and why a reversal past it went unseen. */
  from = 0,
): number => {
  const mods = runHook({
    hook: "afterMovement",
    effects,
    registry: EFFECTS,
    self: player(),
    turn: turn({ rollSeq }),
  });
  const base: MovementResult = {
    diceResults: [landsOn],
    newPosition: landsOn,
    newBalancePoints: 5,
    newStreakPass: 0,
    newStreakDrop: 0,
  } as MovementResult;
  return applyMovementModifiers(base, mods, board, from).newPosition;
};

const sides = (effects: ActiveEffectLike[], seasonSides = 6): number => {
  const mods = runHook({
    hook: "beforeMovement",
    effects,
    registry: EFFECTS,
    self: player(),
    turn: turn(),
  });
  return modifiedDice({ ...DEFAULT_SEASON_CONFIG.dice, sides: seasonSides }, "passed", mods).sides;
};

const balanceDelta = (
  effects: ActiveEffectLike[],
  hook: "afterCellEffect" | "onOutcome",
  over: Record<string, unknown> = {},
): number =>
  runHook({ hook, effects, registry: EFFECTS, self: player(), turn: turn(over) })
    .balanceDelta;

const applyItem = (
  key: string,
  opts: {
    target?: IeePlayerSnapshot | null;
    actor?: IeePlayerSnapshot;
  } = {},
): ItemUseResult => {
  const def = ITEMS[key]!;
  return def.apply({
    itemKey: def.key,
    params: def.defaults,
    actor: opts.actor ?? player(),
    target: opts.target ?? null,
  });
};

const guard = (
  key: string,
  over: Partial<Parameters<typeof checkItemUse>[0]> = {},
) =>
  checkItemUse({
    usage: ITEMS[key]!.usage,
    hasOpenRoll: false,
    actor: player(),
    target: null,
    targetInSameSeason: true,
    allowTargetingOthers: true,
    pvpProtectionMoves: 0,
    ...over,
  });

const opponent = (over: Partial<IeePlayerSnapshot> = {}) =>
  player({ seasonPlayerId: "sp-them", moveCount: 9, ...over });

// --- implementations, keyed by scenario id ----------------------------------

const IMPL: Record<string, () => void> = {
  // ---- slowed
  "SC-SLOWED-1": () => {
    expect(move([effect("slowed")], 5)).toBe(4);
  },
  "SC-SLOWED-2": () => {
    expect(move([effect("slowed")], 5, undefined, 5)).toBe(4);
    expect(move([effect("slowed")], 5, undefined, 6)).toBe(4);
    expect(move([effect("slowed")], 5, undefined, 7)).toBe(5);
  },
  "SC-SLOWED-3": () => {
    // Refresh means the service keeps one active row; two rows would double it.
    const rows = [effect("slowed", { id: "a" })];
    expect(move(rows, 5)).toBe(4);
    expect(EFFECTS.slowed!.stacking).toBe("refresh");
  },
  "SC-SLOWED-4": () => {
    const loop = { ...DEFAULT_SEASON_CONFIG.board, size: 40, loop: true };
    expect(move([effect("slowed")], 1, loop)).toBe(0);
  },

  // ---- heavy_boots
  "SC-BOOTS-1": () => {
    expect(move([effect("heavy_boots")], 5)).toBe(3);
  },
  "SC-BOOTS-2": () => {
    expect(move([effect("heavy_boots")], 5, undefined, 5)).toBe(3);
    expect(move([effect("heavy_boots")], 5, undefined, 6)).toBe(5);
  },
  "SC-BOOTS-3": () => {
    const loop = { ...DEFAULT_SEASON_CONFIG.board, size: 40, loop: true };
    expect(move([effect("heavy_boots")], 1, loop)).toBe(0);
  },
  "SC-BOOTS-5": () => {
    // Away from the start, where the cell-0 clamp never reached: a one-cell
    // roll from 18 lands on 19, the -2 would put it at 17, and the move must
    // instead be cancelled at 18.
    expect(move([effect("heavy_boots")], 19, DEFAULT_SEASON_CONFIG.board, 5, 18)).toBe(18);
    // The same on a looping board, and for a longer roll it still shortens.
    const loop = { ...DEFAULT_SEASON_CONFIG.board, size: 40, loop: true };
    expect(move([effect("heavy_boots")], 19, loop, 5, 18)).toBe(18);
    expect(move([effect("heavy_boots")], 25, DEFAULT_SEASON_CONFIG.board, 5, 18)).toBe(23);
  },
  "SC-BOOTS-6": () => {
    // Granted during roll 4 ⇒ expiresAfterRollSeq = 4 + 1. The roll being
    // resolved is the number both the activity filter and the expiry sweep
    // must use; they used to differ by one.
    const boots = effect("heavy_boots");
    expect(boots.expiresAfterRollSeq).toBe(5);
    expect(move([boots], 5, DEFAULT_SEASON_CONFIG.board, 5)).toBe(3);
    expect(move([boots], 5, DEFAULT_SEASON_CONFIG.board, 6)).toBe(5);
  },

  // ---- unlucky
  "SC-UNLUCKY-1": () => {
    expect(sides([effect("unlucky")])).toBe(4);
  },
  "SC-UNLUCKY-2": () => {
    expect(sides([effect("unlucky")], 3)).toBe(2);
  },
  "SC-UNLUCKY-3": () => {
    expect(EFFECTS.unlucky!.stacking).toBe("unique");
    expect(sides([effect("unlucky")])).toBe(4);
  },
  "SC-UNLUCKY-4": () => {
    expect(sides([effect("unlucky"), effect("lucky")])).toBe(6);
  },

  // ---- taxed
  "SC-TAXED-1": () => {
    expect(balanceDelta([effect("taxed")], "afterCellEffect")).toBe(-1);
  },
  "SC-TAXED-2": () => {
    const mods = runHook({
      hook: "afterCellEffect",
      effects: [effect("taxed")],
      registry: EFFECTS,
      self: player({ balancePoints: 0 }),
      turn: turn(),
    });
    const base = { newPosition: 5, newBalancePoints: 0 } as MovementResult;
    expect(applyMovementModifiers(base, mods, DEFAULT_SEASON_CONFIG.board, 5).newBalancePoints).toBe(0);
  },
  "SC-TAXED-3": () => {
    expect(EFFECTS.taxed!.stacking).toBe("unique");
    expect(balanceDelta([effect("taxed")], "afterCellEffect")).toBe(-1);
  },

  // ---- tailwind
  "SC-TAILWIND-1": () => {
    expect(move([effect("tailwind")], 5)).toBe(7);
  },
  "SC-TAILWIND-2": () => {
    expect(move([effect("tailwind"), effect("slowed")], 5)).toBe(6);
  },
  "SC-TAILWIND-3": () => {
    expect(EFFECTS.tailwind!.stacking).toBe("refresh");
    expect(move([effect("tailwind")], 5)).toBe(7);
  },

  // ---- lucky
  "SC-LUCKY-1": () => {
    expect(sides([effect("lucky")])).toBe(8);
  },
  "SC-LUCKY-2": () => {
    const mods = runHook({
      hook: "beforeMovement",
      effects: [effect("lucky")],
      registry: EFFECTS,
      self: player(),
      turn: turn({ rollSeq: 7 }),
    });
    expect(modifiedDice(DEFAULT_SEASON_CONFIG.dice, "passed", mods).sides).toBe(6);
  },
  "SC-LUCKY-3": () => {
    expect(EFFECTS.lucky!.stacking).toBe("unique");
    expect(sides([effect("lucky")])).toBe(8);
  },

  // ---- momentum
  "SC-MOMENTUM-1": () => {
    expect(balanceDelta([effect("momentum")], "onOutcome", { outcome: "passed" })).toBe(1);
  },
  "SC-MOMENTUM-2": () => {
    expect(balanceDelta([effect("momentum")], "onOutcome", { outcome: "dropped" })).toBe(0);
  },

  // ---- shield
  "SC-SHIELD-1": () => {
    const mods = runHook({
      hook: "beforeCellEffect",
      effects: [effect("shield", { chargesLeft: 1, expiresAfterRollSeq: null })],
      registry: EFFECTS,
      self: player(),
      turn: turn({ cellType: "penalty" }),
    });
    expect(mods.skipCellEffect).toBe(true);
    expect(mods.consumed.length).toBe(1);
  },
  "SC-SHIELD-2": () => {
    for (const cellType of ["bonus", "event", "normal", "teleport"]) {
      const mods = runHook({
        hook: "beforeCellEffect",
        effects: [effect("shield", { chargesLeft: 1, expiresAfterRollSeq: null })],
        registry: EFFECTS,
        self: player(),
        turn: turn({ cellType }),
      });
      expect(`${cellType}:${mods.skipCellEffect}`).toBe(`${cellType}:false`);
      expect(`${cellType}:${mods.consumed.length}`).toBe(`${cellType}:0`);
    }
  },
  "SC-SHIELD-3": () => {
    expect(EFFECTS.shield!.stacking).toBe("stack");
    const mods = runHook({
      hook: "beforeCellEffect",
      effects: [
        effect("shield", { id: "a", chargesLeft: 1, expiresAfterRollSeq: null }),
        effect("shield", { id: "b", chargesLeft: 1, expiresAfterRollSeq: null }),
      ],
      registry: EFFECTS,
      self: player(),
      turn: turn({ cellType: "penalty" }),
    });
    expect(mods.skipCellEffect).toBe(true);
    // One landing, one charge. Both shields offer the veto; only the one whose
    // veto actually took effect pays for it, so the second is still there for
    // the next landing — which is what this scenario has always *said*, while
    // the assertion under it pinned the opposite.
    expect(mods.consumed).toEqual(["a"]);
  },

  // ---- hex_scroll
  "SC-HEXSCROLL-1": () => {
    const intent = applyItem("hex_scroll", { target: opponent() });
    expect(intent.grantEffects).toEqual([{ effectKey: "slowed", to: "sp-them" }]);
  },
  "SC-HEXSCROLL-2": () => {
    expect(applyItem("hex_scroll", { target: null }).rejected).toBe("ieeTargetRequired");
  },
  "SC-HEXSCROLL-3": () => {
    expect(applyItem("hex_scroll", { target: player() }).rejected).toBe("ieeTargetSelfNotAllowed");
  },
  "SC-HEXSCROLL-4": () => {
    expect(applyItem("hex_scroll", { target: opponent({ status: "finished" }) }).rejected)
      .toBe("ieeTargetNotActive");
  },
  "SC-HEXSCROLL-7": () => {
    const idle = grantAnchor(7, false);
    const inFlight = grantAnchor(7, true);
    expect(idle).toBe(7);
    // The pending roll resolves as turn 8, and a status anchored at 8 is not
    // active until 9 — so the move being reported right now is untouched.
    expect(inFlight).toBe(8);
    const g = resolveEffectGrant(EFFECTS.slowed!, IeeConfigSchema.parse({ enabled: true }), inFlight);
    expect(g.expiresAfterRollSeq).toBeGreaterThan(8);
  },

  // ---- cleansing_salve
  "SC-SALVE-1": () => {
    const intent = applyItem("cleansing_salve");
    expect(intent.cleanse).toEqual([
      { from: "sp-me", effectKeys: "all", polarity: "negative" },
    ]);
  },
  "SC-SALVE-2": () => {
    const [rule] = applyItem("cleansing_salve").cleanse ?? [];
    expect(rule?.polarity).toBe("negative");
  },

  // ---- lodestone
  "SC-LODESTONE-1": () => {
    expect(applyItem("lodestone").grantEffects).toEqual([
      { effectKey: "tailwind", to: "sp-me" },
    ]);
  },
  "SC-LODESTONE-2": () => {
    expect(guard("lodestone", { hasOpenRoll: true })).toEqual({
      ok: false,
      code: "ieeItemWrongWindow",
    });
  },

  // ---- spare_die
  "SC-SPAREDIE-1": () => {
    expect(applyItem("spare_die").grantEffects).toEqual([
      { effectKey: "lucky", to: "sp-me" },
    ]);
  },
  "SC-SPAREDIE-2": () => {
    expect(guard("spare_die", { hasOpenRoll: true })).toEqual({
      ok: false,
      code: "ieeItemWrongWindow",
    });
  },

  // ---- lead_weights
  "SC-WEIGHTS-1": () => {
    expect(applyItem("lead_weights", { target: opponent() }).grantEffects).toEqual([
      { effectKey: "heavy_boots", to: "sp-them" },
    ]);
  },
  "SC-WEIGHTS-2": () => {
    expect(applyItem("lead_weights", { target: player() }).rejected)
      .toBe("ieeTargetSelfNotAllowed");
  },

  // ---- jinx
  "SC-JINX-1": () => {
    expect(applyItem("jinx", { target: opponent() }).grantEffects).toEqual([
      { effectKey: "unlucky", to: "sp-them" },
    ]);
  },
  "SC-JINX-2": () => {
    expect(applyItem("jinx", { target: opponent({ status: "eliminated" }) }).rejected)
      .toBe("ieeTargetNotActive");
  },

  // ---- cross-cutting
  "SC-PVP-1": () => {
    expect(guard("hex_scroll", { target: opponent(), allowTargetingOthers: false }))
      .toEqual({ ok: false, code: "ieeTargetingDisabled" });
  },
  "SC-PVP-2": () => {
    expect(guard("hex_scroll", { target: opponent({ moveCount: 2 }), pvpProtectionMoves: 3 }))
      .toEqual({ ok: false, code: "ieeTargetProtected" });
  },
  "SC-PVP-3": () => {
    expect(guard("hex_scroll", { target: opponent(), targetInSameSeason: false }))
      .toEqual({ ok: false, code: "ieeTargetNotActive" });
  },
  "SC-POOL-1": () => {
    const entry: IeeEntryConfig = {
      ...DEFAULT_SEASON_CONFIG.iee.entries.__none__ ?? {
        enabled: true, weight: 100, polarityOverride: null, maxPerSeason: null,
        maxPerPlayer: null, cooldownRolls: 0, minPosition: 0, unlockAfterMove: 0,
        paramOverrides: {}, durationOverride: null, targetOverride: null,
      },
      maxPerPlayer: 1,
    };
    const reason = gateCandidate(
      {
        candidate: { kind: "item", key: "hex_scroll", polarity: "positive", tier: 0 },
        entry,
        config: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true },
        player: player(),
        counters: { perSeason: {}, perPlayer: { hex_scroll: 1 }, lastDropRollSeq: {} },
        activeEffectKeys: [],
        heldItemCount: 0,
        seasonRollSeq: 10,
      },
      "positive",
    );
    expect(reason).toBe("max_per_player");
  },
  "SC-POOL-2": () => {
    const out = pickWheelOutcome({
      polarity: "negative",
      config: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true, nothingWeight: 0, entries: {} },
      catalog: [],
      catalogDefaults: {},
      player: player(),
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      activeEffectKeys: [],
      heldItemCount: 0,
      seasonRollSeq: 10,
      playerCount: 4,
      rng: () => 0,
    } as Parameters<typeof pickWheelOutcome>[0]);
    expect(out.kind).toBe("fallback");
  },
};

// --- the suite --------------------------------------------------------------

const engineScenarios = SCENARIOS.filter((s) => s.tier === "engine");
const byEntry = new Map<string, Scenario[]>();
for (const s of engineScenarios) {
  byEntry.set(s.entry, [...(byEntry.get(s.entry) ?? []), s]);
}

for (const [entry, list] of byEntry) {
  describe(`scenarios — ${entry}`, () => {
    for (const scenario of list) {
      const impl = IMPL[scenario.id];
      it(`${scenario.id} — ${scenario.title}`, () => {
        if (!impl) throw new Error(`no implementation for ${scenario.id}`);
        impl();
      });
    }
  });
}

describe("scenarios — the catalogue itself", () => {
  it("every engine scenario has an implementation", () => {
    const missing = engineScenarios.filter((s) => !IMPL[s.id]).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it("every implementation belongs to a scenario", () => {
    const known = new Set(SCENARIOS.map((s) => s.id));
    expect(Object.keys(IMPL).filter((id) => !known.has(id))).toEqual([]);
  });

  it("ids are unique and well formed", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^SC-[A-Z]+-\d+$/);
  });

  it("every catalog entry has at least one scenario", () => {
    const covered = new Set(SCENARIOS.map((s) => s.entry));
    const uncovered = [...Object.keys(ITEMS), ...Object.keys(EFFECTS)].filter(
      (key) => !covered.has(key),
    );
    expect(uncovered).toEqual([]);
  });

  it("every scenario is written as an observable consequence", () => {
    // The two bugs that reached a playthrough both passed a test that checked
    // a declaration. A "then" that talks about the catalog rather than the
    // result is the smell.
    for (const s of SCENARIOS) {
      expect(`${s.id}:${s.then.length > 10}`).toBe(`${s.id}:true`);
      expect(`${s.id}:${/declares|is registered|exists in the catalog/i.test(s.then)}`)
        .toBe(`${s.id}:false`);
    }
  });
});
