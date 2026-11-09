/**
 * The next game (docs/IEE_CONSTRUCTOR_SPEC.md §6.16, §7.12): what a use picks
 * is remembered by the effect it hands its user, the instances whose rules
 * shape the pick are found, and what shaped it is journaled.
 */
import { describe, expect, it } from "vitest";

import { IeeConfigSchema } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";
import { poolShapeOf } from "@/lib/engine/iee/resolve/pool";

import { buildRegistry } from "../registry";
import { chosenOf, grant, poolSources, recordPool, runIntents, type ExecContext } from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });
const effect = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug,
  name: names(slug),
  character: "bonus",
  rarity: "common",
  tags: [],
  duration: { unit: "next_game" },
  stacking: { mode: "refresh" },
  rules: [],
  ...over,
});
const item = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug,
  name: names(slug),
  character: "bonus",
  rarity: "common",
  tags: [],
  usage: { activation: "passive" },
  rules: [],
  ...over,
});

const E = { veto: ID(1), trial: ID(2), charm: ID(3), slow: ID(4), boots: ID(5) };

function registry() {
  const docs: [string, EntryDoc][] = [
    [E.veto, effect("veto", { rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "picked" }] }] })],
    [E.trial, effect("trial", { character: "penalty", rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", genres: "lastPassed" }] }] })],
    [E.charm, item("charm", { rules: [{ when: "beforeGameRoll", do: [{ op: "poolExclude", rating: { max: 2 } }] }] })],
    [E.slow, effect("slow", { character: "penalty", duration: { unit: "rolls", count: 2 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }] })],
    [E.boots, item("boots", { usage: { activation: "active", charges: 1, target: { who: "self" } }, rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }] })],
  ];
  return buildRegistry(compileSet(docs.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
}

function setup(anchor = 7) {
  const mem = memoryStore({ balances: { [ME]: 5 }, positions: { [ME]: 10 }, names: { [ME]: "me" } });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registry(),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: () => 0,
    snapshot: async (id) => ({ seasonPlayerId: id, position: 10, balancePoints: 5, rollSeq: 7, moveCount: 5, rank: 1, status: "active" }),
    anchorFor: async () => ({ anchorRollSeq: anchor }),
  };
  return { ctx, ...mem };
}

describe("an effect a use hands its user remembers the pick (spec §6.16)", () => {
  it("the instance keeps it, and its grant says so", async () => {
    const { ctx, store, journal } = setup();
    const result = await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "horror" } });
    const row = await store.getInstance(result.instanceId!);
    expect(row?.chosen).toEqual({ genre: "horror" });
    expect(chosenOf(row!)).toEqual({ genre: "horror" });
    expect(journal.find((j) => j.op === "grant")?.outcome).toMatchObject({ state: "granted", chosen: { genre: "horror" } });
  });

  it("a renewal that picked again remembers the new pick; the same pick changes nothing", async () => {
    const { ctx, store, journal } = setup();
    const first = await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "horror" } });
    await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "rpg" } });
    expect((await store.getInstance(first.instanceId!))?.chosen).toEqual({ genre: "rpg" });
    expect(journal.filter((j) => j.op === "grant").at(-1)?.outcome).toMatchObject({ state: "refreshed", chosen: { genre: "rpg" } });
    await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "rpg" } });
    expect(journal.filter((j) => j.op === "grant").at(-1)?.outcome).not.toHaveProperty("chosen");
  });

  it("a grant intent carries the pick to the executor; without one nothing is remembered", async () => {
    const { ctx, store } = setup();
    await runIntents(ctx, [{ kind: "grant", entryId: E.veto, key: "veto", entryKind: "effect", to: ME, chosen: { years: [1990, 1999] } }], {
      source: "item",
      reveal: false,
    });
    const [row] = await store.activeForHolder(ME);
    expect(chosenOf(row!)).toEqual({ years: [1990, 1999] });
    const plain = await grant(ctx, { entry: "trial", to: ME, source: "wheel", reveal: false });
    expect((await store.getInstance(plain.instanceId!))?.chosen).toBeNull();
  });

  it("what no longer reads as a pick is read as none", () => {
    expect(chosenOf({ chosen: null })).toBeNull();
    expect(chosenOf({ chosen: { genre: "Horror" } })).toBeNull();
    expect(chosenOf({ chosen: { gameId: ID(9), title: "Celeste" } })).toEqual({ gameId: ID(9), title: "Celeste" });
  });
});

describe("poolSources — whose rules shape the pick (spec §7.12)", () => {
  it("effects and passive items with rules at beforeGameRoll, oldest first, each with its pick", async () => {
    const { ctx, store } = setup();
    await grant(ctx, { entry: "trial", to: ME, source: "wheel", reveal: false });
    await grant(ctx, { entry: "charm", to: ME, source: "wheel", reveal: false });
    await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "horror" } });
    await grant(ctx, { entry: "slow", to: ME, source: "wheel", reveal: false });
    await grant(ctx, { entry: "boots", to: ME, source: "wheel", reveal: false });
    const sources = poolSources(ctx.registry, await store.activeForHolder(ME), 8);
    expect(sources.map((s) => s.entry.key)).toEqual(["trial", "charm", "veto"]);
    expect(sources.map((s) => s.chosen)).toEqual([null, null, { genre: "horror" }]);
  });

  it("a status granted while the game it would replace was in flight sits that pick out (§7.9)", async () => {
    const { ctx, store } = setup(8);
    await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "horror" } });
    const rows = await store.activeForHolder(ME);
    // Anchored at the game in flight (roll 8): a reroll of it is drawn without it, the next game with it.
    expect(poolSources(ctx.registry, rows, 8)).toEqual([]);
    expect(poolSources(ctx.registry, rows, 9).map((s) => s.entry.key)).toEqual(["veto"]);
  });
});

describe("recordPool — what shaped the pick, journaled (spec §9.2)", () => {
  it("one `pool` row per rule that spoke, with what came of it", async () => {
    const { ctx, store, journal } = setup();
    await grant(ctx, { entry: "veto", to: ME, source: "item", reveal: false, chosen: { genre: "horror" } });
    await grant(ctx, { entry: "charm", to: ME, source: "wheel", reveal: false });
    const sources = poolSources(ctx.registry, await store.activeForHolder(ME), 8);
    const shape = poolShapeOf(sources, {
      self: await ctx.snapshot(ME),
      selfEntries: [],
      games: { lastPassed: null, passed: [] },
      rng: () => 0,
    });
    const ids = await recordPool(ctx, { playerId: ME, shape, to: { rollId: "roll-1", gameId: "game-1", favoured: false }, relaxed: true });
    expect(ids).toHaveLength(2);
    const rows = journal.filter((j) => j.op === "pool");
    expect(rows.map((r) => [r.revisionId, r.ruleIndex, r.targetPlayerId])).toEqual([
      [ctx.registry.get("veto")!.revisionId, 0, ME],
      [ctx.registry.get("charm")!.revisionId, 0, ME],
    ]);
    expect(rows[0]).toMatchObject({
      intent: { entry: "veto", contributions: [{ kind: "exclude", match: { genres: ["horror"] } }] },
      outcome: { rollId: "roll-1", gameId: "game-1", relaxed: true, favoured: false },
      visibility: "staff",
    });
  });

  it("a pick that offered a choice names the decision and the games it offered (§7.12)", async () => {
    const { ctx, store, journal } = setup();
    await grant(ctx, { entry: "charm", to: ME, source: "wheel", reveal: false });
    const shape = poolShapeOf(poolSources(ctx.registry, await store.activeForHolder(ME), 8), {
      self: await ctx.snapshot(ME),
      selfEntries: [],
      games: { lastPassed: null, passed: [] },
      rng: () => 0,
    });
    await recordPool(ctx, { playerId: ME, shape, to: { decisionId: "d-1", offered: ["g-1", "g-2"] }, relaxed: false });
    expect(journal.find((j) => j.op === "pool")?.outcome).toEqual({ decisionId: "d-1", offered: ["g-1", "g-2"], relaxed: false });
  });
});
