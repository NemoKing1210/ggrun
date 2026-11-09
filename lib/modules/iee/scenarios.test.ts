import { describe, expect, it } from "vitest";

import {
  applyMovementModifiers,
  checkItemUse,
  DEFAULT_SEASON_CONFIG,
  gateCandidate,
  IeeConfigSchema,
  pickWheelOutcome,
  SCENARIOS,
  type HookTurnContext,
  type IeeEntryConfig,
  type IeePlayerSnapshot,
  type MovementResult,
  type Scenario,
} from "@/lib/engine";
import { CORE_DOCS } from "@/lib/engine/iee/core-docs";
import { runLiveHook, type FiredRule, type LiveEffect, type TurnHook } from "@/lib/engine/iee/resolve/live";

import { fire, grant, runIntents, tick, type ExecContext } from "./executor";
import { memoryStore } from "./executor/memory-store.test-helpers";
import { coreRegistry } from "./registry";
import { catalogRegistry } from "./registry/catalog.test-helpers";

/**
 * The subsystem half of the behaviour catalogue (`lib/engine/iee/scenarios.ts`),
 * run against the compiled core entries and the executor over an in-memory
 * store — the same code the turn, the item path and the wheel run, without a
 * database. Each entry's own promises are scenarios in its document now
 * (spec §5.5), run by `sim/core-scenarios.test.ts`.
 *
 * Every `tier: "engine"` scenario of the table is implemented here under its
 * own id, and the last block asserts the two lists match — a scenario without
 * a test, or a test without a scenario, fails the suite. The `live` half needs
 * the turn transaction, the database and a browser, and runs in the
 * verification harness.
 */

const REGISTRY = coreRegistry();
const ME = "sp-me";
const THEM = "sp-them";

// --- fixtures ---------------------------------------------------------------

const player = (over: Partial<IeePlayerSnapshot> = {}): IeePlayerSnapshot => ({
  seasonPlayerId: ME,
  position: 10,
  balancePoints: 5,
  rollSeq: 4,
  moveCount: 4,
  rank: 2,
  status: "active",
  ...over,
});

const opponent = (over: Partial<IeePlayerSnapshot> = {}) =>
  player({ seasonPlayerId: THEM, moveCount: 9, ...over });

const hook = (name: TurnHook, effects: readonly LiveEffect[], turn: Partial<HookTurnContext> = {}) =>
  runLiveHook({
    hook: name,
    effects,
    turn: { rollSeq: 5, outcome: "passed", ...turn },
    base: { self: player(), target: null, selfEntries: [], targetEntries: [], rng: () => 0.5 },
  });

const landing = (landsOn: number, balance = 5): MovementResult =>
  ({
    diceResults: [landsOn],
    newPosition: landsOn,
    newBalancePoints: balance,
    newStreakPass: 0,
    newStreakDrop: 0,
  }) as MovementResult;

/** A season's IEE state with the executor over an in-memory store. */
function season(anchor = { anchorRollSeq: 4 }) {
  const mem = memoryStore({ balances: { [ME]: 5, [THEM]: 5 } });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: "season-1",
    registry: REGISTRY,
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 10,
    rng: () => 0.5,
    snapshot: async (id) => player({ seasonPlayerId: id }),
    anchorFor: async () => anchor,
  };

  const give = (key: string, to = ME) => grant(ctx, { entry: key, to, source: "cell_penalty", reveal: false });

  /** A holder's statuses as the turn loads them. */
  const statuses = async (holder = ME): Promise<LiveEffect[]> =>
    (await mem.store.activeForHolder(holder)).flatMap((row): LiveEffect[] => {
      const entry = row.kind === "effect" ? REGISTRY.effect(row.revisionId) : null;
      if (!entry) return [];
      return [
        {
          instanceId: row.id,
          entry,
          params: row.params as LiveEffect["params"],
          grantedAt: row.grantedAt.getTime(),
          anchorRollSeq: row.anchorRollSeq,
        },
      ];
    });

  /** The end of a turn: journal the firings, spend the triggers, count the roll down. */
  const settle = async (
    rollSeq: number,
    fired: readonly FiredRule[],
    consumed: readonly string[],
    turn: { outcome?: "passed" | "dropped"; moved?: boolean } = {},
  ) => {
    await fire(ctx, { fired, consumed, rollSeq, reveal: false });
    const ticks = { roll: true as const, moved: turn.moved ?? true, passed: (turn.outcome ?? "passed") === "passed" };
    await tick(ctx, { holder: ME, rollSeq, ticks, reveal: false });
  };

  /** A whole turn of mine: where a roll landing on `landsOn` really ends. */
  const turnMove = async (rollSeq: number, landsOn: number) => {
    const { mods, fired } = hook("afterMovement", await statuses(), { rollSeq });
    const to = applyMovementModifiers(landing(landsOn), mods, DEFAULT_SEASON_CONFIG.board, 0).newPosition;
    await settle(rollSeq, fired, mods.consumed);
    return to;
  };

  return { ctx, mem, give, statuses, settle, turnMove };
}

/** What an item would do — pure; the service carries the intents out. */
const activate = (key: string) => {
  const item = REGISTRY.item(key)!;
  return item.use({ params: item.defaults, actor: player(), target: null, actorEntries: [], targetEntries: [], rng: () => 0.5 });
};

const guard = (key: string, over: Partial<Parameters<typeof checkItemUse>[0]> = {}) => {
  const usage = REGISTRY.item(key)!.usage;
  return checkItemUse({
    usage: { mode: usage.activation, window: usage.window, target: usage.target },
    hasOpenRoll: false,
    actor: player(),
    target: null,
    targetInSameSeason: true,
    allowTargetingOthers: true,
    pvpProtectionMoves: 0,
    ...over,
  });
};

// --- implementations, keyed by scenario id ----------------------------------

const IMPL: Record<string, () => void | Promise<void>> = {
  // ---- swamp
  "SC-SWAMP-6": async () => {
    const s = season();
    await s.give("swamp");
    // Roll 5 resolves with its move cancelled — nothing moved, nothing counts.
    await s.settle(5, [], [], { moved: false });
    expect(await s.statuses()).toHaveLength(1);
    expect(await s.turnMove(6, 5)).toBe(4);
    expect(await s.turnMove(7, 5)).toBe(4);
    expect(await s.turnMove(8, 5)).toBe(5);
  },

  // ---- cross-cutting
  "SC-PVP-1": () => {
    expect(guard("hex_scroll", { target: opponent(), allowTargetingOthers: false })).toEqual({
      ok: false,
      code: "ieeTargetingDisabled",
    });
  },
  "SC-PVP-2": () => {
    expect(guard("hex_scroll", { target: opponent({ moveCount: 2 }), pvpProtectionMoves: 3 })).toEqual({
      ok: false,
      code: "ieeTargetProtected",
    });
  },
  "SC-PVP-3": () => {
    expect(guard("hex_scroll", { target: opponent(), targetInSameSeason: false })).toEqual({
      ok: false,
      code: "ieeTargetNotActive",
    });
  },
  "SC-POOL-1": () => {
    const entry: IeeEntryConfig = {
      enabled: true,
      weight: 100,
      polarityOverride: null,
      maxPerSeason: null,
      maxPerPlayer: 1,
      cooldownRolls: 0,
      minPosition: 0,
      unlockAfterMove: 0,
      paramOverrides: {},
      durationOverride: null,
      targetOverride: null,
    };
    const candidate = REGISTRY.candidates().find((c) => c.key === "hex_scroll")!;
    const reason = gateCandidate(
      {
        candidate,
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
    // Every entry attached, none of them switched on.
    const off = catalogRegistry(Object.fromEntries(REGISTRY.set.entries.map((e) => [e.key, { enabled: false }])));
    const out = pickWheelOutcome({
      polarity: "negative",
      config: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true, nothingWeight: 0 },
      catalog: off.candidates(),
      entries: off.entryConfigs(),
      catalogDefaults: off.defaults(),
      player: player(),
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      activeEffectKeys: [],
      heldItemCount: 0,
      seasonRollSeq: 10,
      playerCount: 4,
      rng: () => 0,
    });
    expect(out.kind).toBe("fallback");
  },
  "SC-POOL-6": async () => {
    const s = season();
    const ctx: ExecContext = { ...s.ctx, config: IeeConfigSchema.parse({ enabled: true, maxActiveEffectsPerPlayer: 1 }) };
    expect((await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false })).state).toBe("granted");
    // The spare die hands out `lucky`: the cap holds for an item as for the wheel.
    await runIntents(ctx, activate("spare_die").intents, { source: "item", reveal: false });
    expect((await s.statuses()).map((e) => e.entry.key)).toEqual(["swamp"]);
    expect(s.mem.journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "max_active_effects" } });
    // Refreshing a status already held adds no instance, so the cap allows it.
    expect((await grant(ctx, { entry: "swamp", to: ME, source: "cell_penalty", reveal: false })).state).toBe("refreshed");
  },
  "SC-POOL-7": async () => {
    const config = IeeConfigSchema.parse({ enabled: true, disabledTags: ["dice"], nothingWeight: 0 });
    const wheel = pickWheelOutcome({
      polarity: "positive",
      config,
      catalog: REGISTRY.candidates(),
      entries: REGISTRY.entryConfigs(),
      catalogDefaults: REGISTRY.defaults(),
      player: player(),
      counters: { perSeason: {}, perPlayer: {}, lastDropRollSeq: {} },
      activeEffectKeys: [],
      heldItemCount: 0,
      seasonRollSeq: 10,
      playerCount: 4,
      rng: () => 0,
    });
    const onWheel = wheel.slices.map((slice) => slice.key);
    expect(onWheel).not.toContain("lucky");
    expect(onWheel).not.toContain("spare_die");
    expect(onWheel).toContain("ward");

    const s = season();
    const ctx: ExecContext = { ...s.ctx, config };
    expect((await grant(ctx, { entry: "lucky", to: ME, source: "event_reward", reveal: false })).state).toBe("blocked_limit");
    expect(s.mem.journal.at(-1)).toMatchObject({ op: "noop", outcome: { reason: "disabled_tag:dice" } });
    expect(await s.statuses()).toEqual([]);
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
      it(`${scenario.id} — ${scenario.title}`, async () => {
        if (!impl) throw new Error(`no implementation for ${scenario.id}`);
        await impl();
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

  it("every entry the season plays has at least one scenario — in its document or here", () => {
    const covered = new Set([
      ...SCENARIOS.map((s) => s.entry),
      ...CORE_DOCS.filter((r) => (r.doc.scenarios ?? []).length > 0).map((r) => r.doc.slug),
    ]);
    const uncovered = REGISTRY.set.entries.map((e) => e.key).filter((key) => !covered.has(key));
    expect(uncovered).toEqual([]);
  });

  it("every scenario names an entry that exists, or the whole subsystem", () => {
    for (const s of SCENARIOS) {
      expect(`${s.id}:${s.entry === "*" || REGISTRY.get(s.entry) !== null}`).toBe(`${s.id}:true`);
    }
  });

  it("every scenario is written as an observable consequence", () => {
    // The two bugs that reached a playthrough both passed a test that checked
    // a declaration. A "then" that talks about the catalog rather than the
    // result is the smell.
    for (const s of SCENARIOS) {
      expect(`${s.id}:${s.then.length > 10}`).toBe(`${s.id}:true`);
      expect(`${s.id}:${/declares|is registered|exists in the catalog/i.test(s.then)}`).toBe(`${s.id}:false`);
    }
  });
});
