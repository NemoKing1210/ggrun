/**
 * Completion conditions (docs/IEE_CONSTRUCTOR_SPEC.md §6.17): the holder's
 * rules at `onRollCreated` give a roll its conditions — instances held by the
 * roll — unless an immunity holds; the conditions end with the roll.
 */
import { describe, expect, it } from "vitest";

import { IeeConfigSchema } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry } from "../registry";
import {
  addRollConditions,
  conditionTextOf,
  endRollConditions,
  givesConditions,
  grant,
  rollCreatedSources,
  type ExecContext,
} from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";
const ROLL = "roll-8";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });
const effect = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug,
  name: names(slug),
  character: "penalty",
  rarity: "common",
  tags: ["game_condition"],
  duration: { unit: "next_game" },
  stacking: { mode: "refresh" },
  rules: [],
  ...over,
});

const HARD = { ru: "Пройти на высокой сложности", en: "Beat it on hard" };
const E = { hard: ID(1), coin: ID(2), free: ID(3), slow: ID(4), curse: ID(5), once: ID(6), charm: ID(7) };

function registry(withConditions = true) {
  const docs: [string, EntryDoc][] = [
    [E.hard, effect("hard", { rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: HARD }] }] })],
    [
      E.coin,
      effect("coin", {
        rules: [
          {
            when: "onRollCreated",
            if: [{ op: "chance", percent: 50 }],
            do: [
              { op: "addCondition", text: { ru: "Без смертей" } },
              { op: "addCondition", text: { ru: "Без сохранений", uk: "Без збережень" } },
            ],
          },
        ],
      }),
    ],
    [E.free, effect("free", { character: "bonus", tags: [], duration: { unit: "rolls", count: 3 }, rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] })],
    [E.slow, effect("slow", { tags: [], duration: { unit: "rolls", count: 2 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }] })],
    [
      E.curse,
      {
        dslVersion: 1,
        kind: "item",
        slug: "curse",
        name: names("curse"),
        character: "penalty",
        rarity: "common",
        tags: ["game_condition"],
        usage: { activation: "cursed", charges: 1 },
        rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "Только мышью" } }] }],
      },
    ],
    // Immunities that wait (the owner's call at the wave C gate): an effect of `triggers`, a passive item with a charge.
    [E.once, effect("once", { character: "bonus", tags: [], duration: { unit: "triggers", count: 1 }, rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }] })],
    [
      E.charm,
      {
        dslVersion: 1,
        kind: "item",
        slug: "charm",
        name: names("charm"),
        character: "bonus",
        rarity: "common",
        tags: [],
        usage: { activation: "passive", charges: 1 },
        rules: [{ when: "whileActive", do: [{ op: "conditionImmunity" }] }],
      },
    ],
  ];
  const kept = withConditions ? docs : docs.filter(([id]) => id === E.slow || id === E.free);
  return buildRegistry(compileSet(kept.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
}

function setup(options: { anchor?: number; rng?: () => number; withConditions?: boolean } = {}) {
  const mem = memoryStore({ balances: { [ME]: 5, [RIVAL]: 5 }, positions: { [ME]: 10, [RIVAL]: 12 } });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registry(options.withConditions ?? true),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: options.rng ?? (() => 0),
    snapshot: async (id) => ({ seasonPlayerId: id, position: 10, balancePoints: 5, rollSeq: 7, moveCount: 5, rank: 1, status: "active" }),
    anchorFor: async () => ({ anchorRollSeq: options.anchor ?? 7 }),
  };
  return { ctx, ...mem };
}

describe("completion conditions — added as a game is assigned (spec §6.17)", () => {
  it("each condition a rule gives is an instance held by the roll: the entry that added it and its text, journaled to the holder", async () => {
    const { ctx, journal, instances } = setup();
    await grant(ctx, { entry: "hard", to: ME, source: "rival_item", ownerPlayerId: RIVAL, reveal: false });
    const added = await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      kind: "roll_condition",
      holderKind: "roll",
      holderPlayerId: null,
      holderRollId: ROLL,
      entryId: E.hard,
      revisionId: ID(100),
      // Whoever cast the entry that added it.
      ownerPlayerId: RIVAL,
      params: HARD,
      status: "active",
    });
    expect(conditionTextOf(added[0]!)).toEqual(HARD);
    const row = journal.find((j) => j.op === "grant" && j.instanceId === added[0]!.id);
    expect(row).toMatchObject({
      targetPlayerId: ME,
      ruleIndex: 0,
      intent: { entry: "hard", rollId: ROLL, text: HARD },
      outcome: { state: "granted", kind: "roll_condition", rollId: ROLL },
      visibility: "staff",
    });
    // The holder's own instances are untouched — a condition is the roll's.
    expect((await ctx.store.activeForHolder(ME)).map((r) => r.kind)).toEqual(["effect"]);
    expect(instances.filter((i) => i.kind === "roll_condition")).toHaveLength(1);
    expect(await ctx.store.activeForRoll(ROLL)).toHaveLength(1);
  });

  it("a rule may give several, as its conditions hold — the draws journaled with its first; a held cursed item gives them too", async () => {
    const lucky = setup({ rng: () => 0.25 });
    await grant(lucky.ctx, { entry: "coin", to: ME, source: "admin", reveal: false });
    await grant(lucky.ctx, { entry: "curse", to: ME, source: "admin", reveal: false });
    const added = await addRollConditions(lucky.ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 });
    expect(added.map((r) => conditionTextOf(r))).toEqual([{ ru: "Без смертей" }, { ru: "Без сохранений", uk: "Без збережень" }, { ru: "Только мышью" }]);
    const grants = lucky.journal.filter((j) => j.op === "grant" && (j.outcome as { kind?: string }).kind === "roll_condition");
    expect(grants.map((j) => j.rng)).toEqual([[0.25], null, null]);
    const unlucky = setup({ rng: () => 0.75 });
    await grant(unlucky.ctx, { entry: "coin", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(unlucky.ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
  });

  it("what was granted while the game it replaces was in flight sits the roll out", async () => {
    const { ctx } = setup({ anchor: 8 });
    await grant(ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    const rows = await ctx.store.activeForHolder(ME);
    expect(rollCreatedSources(ctx.registry, rows, 8)).toEqual([]);
    expect(await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
    expect(rollCreatedSources(ctx.registry, rows, 9).map((s) => s.entry.key)).toEqual(["hard"]);
  });

  it("an immunity keeps them all off: nothing is held, a noop says why", async () => {
    const { ctx, journal } = setup();
    await grant(ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    await grant(ctx, { entry: "free", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
    expect(journal.filter((j) => j.op === "noop")).toEqual([
      expect.objectContaining({ targetPlayerId: ME, revisionId: ID(100), intent: expect.objectContaining({ entry: "hard", rollId: ROLL, text: HARD }), outcome: { reason: "immune" } }),
    ]);
    expect(await ctx.store.activeForRoll(ROLL)).toEqual([]);
  });

  it("an immunity that waits spends a firing on the game it kept conditions off — not on one that got none; one that lasts spends nothing", async () => {
    const { ctx, journal } = setup();
    await grant(ctx, { entry: "once", to: ME, source: "admin", reveal: false });
    // Nothing to keep off: it waits.
    expect(await addRollConditions(ctx, { playerId: ME, rollId: "roll-7", rollSeq: 8 })).toEqual([]);
    expect((await ctx.store.activeForHolder(ME)).map((r) => r.entryId)).toEqual([E.once]);
    await grant(ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
    // Spent on the game it kept the condition off: its one trigger counted down, and it is over.
    expect((await ctx.store.activeForHolder(ME)).map((r) => r.entryId)).toEqual([E.hard]);
    expect(journal.filter((j) => j.op === "tick")).toEqual([expect.objectContaining({ intent: { unit: "triggers", by: "fired" }, outcome: { before: 1, after: 0 } })]);
    // Spent, the next game gets the condition.
    expect(await addRollConditions(ctx, { playerId: ME, rollId: "roll-9", rollSeq: 9 })).toHaveLength(1);

    const held = setup();
    await grant(held.ctx, { entry: "charm", to: ME, source: "admin", reveal: false });
    await grant(held.ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(held.ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
    expect((await held.ctx.store.activeForHolder(ME)).map((r) => r.entryId)).toEqual([E.hard]);

    const lasting = setup();
    await grant(lasting.ctx, { entry: "free", to: ME, source: "admin", reveal: false });
    await grant(lasting.ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(lasting.ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
    expect(lasting.journal.filter((j) => j.op === "tick")).toEqual([]);
    expect((await lasting.ctx.store.activeForHolder(ME)).map((r) => r.entryId).sort()).toEqual([E.hard, E.free].sort());
  });

  it("the oldest immunity that holds answers: a lasting one first spares a waiting one", async () => {
    const { ctx } = setup();
    await grant(ctx, { entry: "free", to: ME, source: "admin", reveal: false });
    await grant(ctx, { entry: "once", to: ME, source: "admin", reveal: false });
    await grant(ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
    expect((await ctx.store.activeForHolder(ME)).map((r) => r.entryId).sort()).toEqual([E.hard, E.free, E.once].sort());
  });

  it("a season without an entry that gives them asks nothing", async () => {
    expect(givesConditions(setup().ctx.registry)).toBe(true);
    const { ctx } = setup({ withConditions: false });
    expect(givesConditions(ctx.registry)).toBe(false);
    await grant(ctx, { entry: "slow", to: ME, source: "admin", reveal: false });
    expect(await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 })).toEqual([]);
  });
});

describe("completion conditions — ended with the roll (spec §6.17)", () => {
  it("every condition the roll holds ends, journaled; another roll's are left alone; a second end ends nothing", async () => {
    const { ctx, journal } = setup();
    await grant(ctx, { entry: "hard", to: ME, source: "admin", reveal: false });
    await addRollConditions(ctx, { playerId: ME, rollId: ROLL, rollSeq: 8 });
    await addRollConditions(ctx, { playerId: ME, rollId: "roll-other", rollSeq: 8 });
    expect(await endRollConditions(ctx, { rollId: ROLL, playerId: ME })).toBe(1);
    expect(await ctx.store.activeForRoll(ROLL)).toEqual([]);
    expect(await ctx.store.activeForRoll("roll-other")).toHaveLength(1);
    expect(journal.filter((j) => j.op === "expire")).toEqual([
      expect.objectContaining({ targetPlayerId: ME, revisionId: ID(100), outcome: { reason: "roll_ended", rollId: ROLL } }),
    ]);
    expect(await endRollConditions(ctx, { rollId: ROLL, playerId: ME })).toBe(0);
  });

  it("an instance that is not a condition has no condition text", () => {
    expect(conditionTextOf({ kind: "effect", params: { ru: "x" } })).toBeNull();
    expect(conditionTextOf({ kind: "roll_condition", params: {} })).toBeNull();
  });
});
