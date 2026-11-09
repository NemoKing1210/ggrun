/**
 * Objects on the board (docs/IEE_CONSTRUCTOR_SPEC.md §6.18): an item used
 * stands on the cell its use picked — an instance held by the cell — and acts
 * once on the first regular move that enters it, then ends.
 */
import { describe, expect, it } from "vitest";

import { IeeConfigSchema, type HookTurnContext, type PlaceIntent } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry } from "../registry";
import { boardObjects, grant, placeObject, triggerObjects, type ExecContext } from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const E = { mine: ID(1), spring: ID(2), lucky: ID(3), idle: ID(4) };

const item = (slug: string, entered: EntryDoc["rules"]): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug,
  name: { ru: slug, en: slug, uk: slug },
  character: "bonus",
  rarity: "common",
  tags: [],
  usage: { activation: "active", window: "anytime", target: { who: "self" }, charges: 1, pick: "cell" },
  params: { back: { type: "int", default: -2, min: -6, max: -1 } },
  rules: [{ when: "onUse", do: [{ op: "placeObject" }] }, ...entered],
});

function registry() {
  const docs: [string, EntryDoc][] = [
    [E.mine, item("mine", [{ when: "onObjectEntered", do: [{ op: "stopMove" }, { op: "push", delta: { param: "back" } }] }])],
    [E.spring, item("spring", [{ when: "onObjectEntered", do: [{ op: "extend", delta: { random: [1, 3] } }] }])],
    // Acts only on a dropped game's move, and spins the penalty wheel then.
    [E.lucky, item("lucky", [{ when: "onObjectEntered", if: [{ op: "outcome", is: "dropped" }], do: [{ op: "stopMove" }, { op: "spinInstead", pool: "penalty" }] }])],
    [E.idle, item("idle", [])],
  ];
  return buildRegistry(compileSet(docs.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
}

function setup(rng: () => number = () => 0) {
  const mem = memoryStore({ balances: { [ME]: 5, [RIVAL]: 5 }, positions: { [ME]: 10, [RIVAL]: 12 }, names: { [ME]: "anna", [RIVAL]: "boris" } });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registry(),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng,
    snapshot: async (id) => ({ seasonPlayerId: id, position: id === ME ? 10 : 12, balancePoints: 5, rollSeq: 7, moveCount: 5, rank: 1, status: "active" }),
    anchorFor: async () => ({ anchorRollSeq: 7 }),
    board: async () => ({ size: 40, loop: false, finishAt: 39 }),
  };
  return { ctx, ...mem };
}

/** Hands `entry` to `to` and places it on `cell`, as its use would. */
async function placed(ctx: ExecContext, entry: string, to: string, cell: number) {
  const given = await grant(ctx, { entry, to, source: "test", reveal: false });
  if (given.state !== "granted" || !given.instanceId) throw new Error("not granted");
  const using = (await ctx.store.getInstance(given.instanceId))!;
  const intent: PlaceIntent = { kind: "place", by: to, cell, key: ctx.registry.get(entry)!.key };
  return placeObject(ctx, intent, { using, causeId: null });
}

const turn = (outcome: "passed" | "dropped" = "passed"): HookTurnContext => ({ rollSeq: 7, outcome, diceResults: [4], diceCount: 1, diceSides: 6, fromPosition: 10, toPosition: 14 });

describe("placeObject — the item stands on the cell its use picked (spec §6.18)", () => {
  it("an instance held by the cell: the item's revision and parameters, its user the owner, public in the journal and the feed", async () => {
    const { ctx, journal } = setup();
    const feed = await placed(ctx, E.mine, ME, 14);
    const [object] = await ctx.store.activeObjects(SEASON);
    expect(object).toMatchObject({
      kind: "board_object",
      holderKind: "cell",
      holderPlayerId: null,
      holderCellIndex: 14,
      ownerPlayerId: ME,
      entryId: E.mine,
      revisionId: ID(100),
      params: { back: -2 },
      chargesLeft: null,
      status: "active",
    });
    expect(object!.source).toMatch(/^item:/);
    const place = journal.find((j) => j.op === "place")!;
    expect(place).toMatchObject({ instanceId: object!.id, actorPlayerId: ME, intent: { key: "mine", cell: 14 }, outcome: { cell: 14 }, visibility: "public" });
    expect(feed).toEqual([{ eventType: "object_placed", seasonPlayerId: ME, payload: { itemKey: "mine", name: { ru: "mine", en: "mine", uk: "mine" }, instanceId: object!.id, cell: 14 } }]);
  });

  it("a cell taken meanwhile places nothing, and says why", async () => {
    const { ctx, journal } = setup();
    await placed(ctx, E.mine, RIVAL, 14);
    expect(await placed(ctx, E.spring, ME, 14)).toEqual([]);
    expect(await ctx.store.activeObjects(SEASON)).toHaveLength(1);
    expect(journal.at(-1)).toMatchObject({ op: "noop", actorPlayerId: ME, intent: { place: 14 }, outcome: { reason: "cell_taken" } });
  });

  it("without the item being used there is nothing to place", async () => {
    const { ctx } = setup();
    expect(await placeObject(ctx, { kind: "place", by: ME, cell: 3, key: "mine" }, { using: null, causeId: null })).toEqual([]);
    expect(await ctx.store.activeObjects(SEASON)).toEqual([]);
  });
});

describe("boardObjects — what the walk meets (spec §7.7)", () => {
  it("asks the object standing on a cell what it does to the mover, by its parameters", async () => {
    const { ctx } = setup();
    await placed(ctx, E.mine, RIVAL, 14);
    const board = boardObjects(ctx, await ctx.store.activeObjects(SEASON), { self: await ctx.snapshot(ME), selfEntries: [] });
    expect(board.objectAt(13)).toBeNull();
    const object = board.objectAt(14)!;
    expect(object.enter(turn())).toEqual({ stop: true, push: -2, extend: 0, spin: null });
  });

  it("an object whose rules do not hold does nothing; one without rules, or whose item the season does not play, is not there", async () => {
    const { ctx } = setup();
    await placed(ctx, E.lucky, RIVAL, 14);
    await placed(ctx, E.idle, RIVAL, 15);
    const rows = await ctx.store.activeObjects(SEASON);
    const board = boardObjects(ctx, [...rows, { ...rows[0]!, id: "ghost", holderCellIndex: 16, revisionId: "gone" }], { self: await ctx.snapshot(ME), selfEntries: [] });
    expect(board.objectAt(14)!.enter(turn("passed"))).toEqual({ stop: false, push: 0, extend: 0, spin: null });
    expect(board.objectAt(14)!.enter(turn("dropped"))).toEqual({ stop: true, push: 0, extend: 0, spin: "negative" });
    expect(board.objectAt(15)).toBeNull();
    expect(board.objectAt(16)).toBeNull();
  });

  it("keeps what an object drew, for its journal row", async () => {
    const { ctx } = setup(() => 0.99);
    await placed(ctx, E.spring, RIVAL, 14);
    const [row] = await ctx.store.activeObjects(SEASON);
    const board = boardObjects(ctx, [row!], { self: await ctx.snapshot(ME), selfEntries: [] });
    expect(board.objectAt(14)!.enter(turn())).toMatchObject({ extend: 3 });
    expect(board.draws(row!.id)).toEqual([0.99]);
    expect(board.draws("other")).toEqual([]);
  });
});

describe("triggerObjects — an object acts once, and is gone (spec §6.18)", () => {
  it("journals what it did to the mover, ends it, and tells the feed whose it was", async () => {
    const { ctx, journal } = setup();
    await placed(ctx, E.mine, RIVAL, 14);
    const [row] = await ctx.store.activeObjects(SEASON);
    const feed = await triggerObjects(ctx, { mover: ME, fired: [{ instanceId: row!.id, position: 14, answer: { stop: true, push: -2, extend: 0, spin: null } }], draws: () => [0.25], causeId: 9 });
    expect(await ctx.store.activeObjects(SEASON)).toEqual([]);
    expect((await ctx.store.getInstance(row!.id))!).toMatchObject({ status: "ended", endReason: "triggered" });
    const fired = journal.find((j) => j.op === "trigger_object")!;
    expect(fired).toMatchObject({
      instanceId: row!.id,
      actorPlayerId: RIVAL,
      targetPlayerId: ME,
      intent: { cell: 14 },
      outcome: { stopped: true, pushed: -2, to: 12, extended: 0, spun: null },
      causeId: 9,
      visibility: "public",
      rng: [0.25],
    });
    expect(journal.at(-1)).toMatchObject({ op: "end", instanceId: row!.id, outcome: { reason: "triggered" }, causeId: fired.id });
    expect(feed).toEqual([
      {
        eventType: "object_triggered",
        seasonPlayerId: ME,
        payload: {
          itemKey: "mine",
          name: { ru: "mine", en: "mine", uk: "mine" },
          instanceId: row!.id,
          cell: 14,
          ownerSeasonPlayerId: RIVAL,
          ownerUsername: "boris",
          stopped: true,
          pushed: -2,
          to: 12,
          extended: 0,
          spun: null,
        },
      },
    ]);
  });

  it("each in the order the walk met them; one already gone acts no more", async () => {
    const { ctx, journal } = setup();
    await placed(ctx, E.spring, RIVAL, 12);
    await placed(ctx, E.mine, ME, 16);
    const [spring, mine] = await ctx.store.activeObjects(SEASON);
    const fired = [
      { instanceId: spring!.id, position: 12, answer: { stop: false, push: 0, extend: 2, spin: null } },
      { instanceId: mine!.id, position: 16, answer: { stop: true, push: 0, extend: 0, spin: null } },
    ];
    const feed = await triggerObjects(ctx, { mover: ME, fired });
    expect(feed.map((f) => [f.payload.cell, f.payload.extended, f.payload.stopped])).toEqual([
      [12, 2, false],
      [16, 0, true],
    ]);
    // A stop without a push says no landing cell.
    expect(feed[1]!.payload).not.toHaveProperty("to");
    expect(await triggerObjects(ctx, { mover: ME, fired })).toEqual([]);
    expect(journal.filter((j) => j.op === "trigger_object")).toHaveLength(2);
  });
});
