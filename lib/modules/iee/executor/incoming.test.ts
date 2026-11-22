/**
 * What arrives, and protection (docs/IEE_CONSTRUCTOR_SPEC.md §6.13, §7.8):
 * the executor puts every arrival to its holder's entries before it carries
 * it out — a rival's harmful action, an entry, an item handed over, a move
 * back — and carries out the answer.
 */
import { describe, expect, it } from "vitest";

import { IeeConfigSchema, type IeeIntent } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry } from "../registry";
import {
  MAX_CHAIN_DEPTH,
  answeringSources,
  grant,
  moveItems,
  runIntents,
  standingFor,
  swapItems,
  turnBack,
  type ExecContext,
} from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });
const held = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug,
  name: names(slug),
  character: "bonus",
  rarity: "common",
  tags: [],
  usage: { activation: "passive", charges: 1 },
  rules: [],
  ...over,
});
const effect = (slug: string, over: Partial<EntryDoc>): EntryDoc => ({
  dslVersion: 1,
  kind: "effect",
  slug,
  name: names(slug),
  character: "penalty",
  rarity: "common",
  tags: [],
  duration: { unit: "rolls", count: 1 },
  stacking: { mode: "refresh" },
  rules: [],
  ...over,
});
const answers = (incoming: Record<string, unknown> | null, action: Record<string, unknown>): EntryDoc["rules"] => [
  { when: "onIncoming", ...(incoming ? { if: [{ op: "incoming", ...incoming }] } : {}), do: [{ op: action.op as string, ...action }] },
];

const E = {
  shield: ID(1),
  steel: ID(2),
  mirror: ID(3),
  phoenix: ID(4),
  echo: ID(5),
  curse: ID(6),
  mark: ID(7),
  slow: ID(8),
  jolt: ID(9),
  boots: ID(10),
  bounty: ID(11),
  veil: ID(12),
  chain: ID(13),
  lone: ID(14),
};

function registry() {
  const docs: [string, EntryDoc][] = [
    [E.shield, held("shield", { rules: answers({ is: "harm" }, { op: "block" }) })],
    // Reinforced, and it stays: no charges.
    [E.steel, held("steel", { usage: { activation: "passive" }, protection: { tier: 2 }, rules: answers({ is: "harm" }, { op: "block" }) })],
    [E.mirror, held("mirror", { rules: answers({ is: "harm" }, { op: "reflect" }) })],
    [E.phoenix, held("phoenix", { rules: answers({ is: "moveBack" }, { op: "replace", with: 1 }) })],
    [E.echo, effect("echo", { duration: { unit: "triggers", count: 1 }, rules: answers({ is: "entry", kind: "effect", character: "penalty" }, { op: "amplify", factor: 2 }) })],
    [E.curse, effect("curse", { duration: { unit: "next_game" }, rules: answers({ is: "entry", kind: "item", character: "bonus" }, { op: "block" }) })],
    [E.mark, effect("mark", { rules: [{ when: "whileActive", do: [{ op: "pierce", value: 1 }] }] })],
    [E.slow, effect("slow", { duration: { unit: "rolls", count: 2 }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }] })],
    [E.jolt, effect("jolt", { duration: { unit: "instant" }, stacking: undefined, rules: [{ when: "onApply", do: [{ op: "move", by: -1 }] }] })],
    [E.boots, held("boots", { usage: { activation: "active", charges: 1, target: { who: "self" } }, rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }] })],
    [E.bounty, effect("bounty", { character: "bonus", duration: { unit: "triggers", count: 1 }, rules: answers({ is: "entry", kind: "item" }, { op: "amplify", factor: 2 }) })],
    [E.veil, effect("veil", { character: "bonus", rules: [{ when: "whileActive", do: [{ op: "untargetable" }] }] })],
    [E.chain, effect("chain", { rules: [{ when: "whileActive", do: [{ op: "forbidItems" }] }] })],
    [E.lone, held("lone", { usage: { activation: "active", charges: 1, unique: true, target: { who: "self" } }, rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }] })],
  ];
  return buildRegistry(compileSet(docs.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
}

function setup(over: Partial<ExecContext> = {}) {
  const mem = memoryStore({
    balances: { [ME]: 5, [RIVAL]: 5 },
    positions: { [ME]: 10, [RIVAL]: 12 },
    names: { [ME]: "me", [RIVAL]: "rival" },
  });
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registry(),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: () => 0,
    snapshot: async (id) => ({ seasonPlayerId: id, position: 0, balancePoints: 0, rollSeq: 5, moveCount: 5, rank: 1, status: "active" }),
    anchorFor: async () => ({ anchorRollSeq: 7 }),
    board: async () => ({ size: 40, loop: false, finishAt: null }),
    ...over,
  };
  const give = async (slug: string, to: string) => (await grant(ctx, { entry: slug, to, source: "scenario", reveal: false })).instanceId!;
  const holding = async (who: string) => (await mem.store.activeForHolder(who)).map((r) => ctx.registry.get(r.revisionId)!.key).sort();
  const position = async (who: string) => (await mem.store.places(SEASON)).find((p) => p.id === who)!.position;
  return { ctx, give, holding, position, ...mem };
}

/** What a rival's item does to the player it was aimed at, marked as harm as the compiler marks it. */
const hex = (to: string): IeeIntent => ({ kind: "grant", entryId: E.slow, key: "slow", entryKind: "effect", to, harmTo: to });
const hook = (who: string, by = -2): IeeIntent => ({ kind: "move", who, to: { by }, key: "hook", harmTo: who });
const used = { source: "item", reveal: false, nameMoves: true, ownerPlayerId: ME } as const;

describe("what arrives — a rival's harmful action (wave B, spec §6.13)", () => {
  it("one block answers everything harmful a use aims at the holder: journaled, fed, its charge spent", async () => {
    const { ctx, give, holding, position, journal } = setup();
    await give("shield", RIVAL);
    const feed = await runIntents(ctx, [hex(RIVAL), hook(RIVAL)], { ...used, causeId: 3 });
    expect(await holding(RIVAL)).toEqual([]);
    expect(await position(RIVAL)).toBe(12);
    const block = journal.find((j) => j.op === "block")!;
    expect(block).toMatchObject({
      targetPlayerId: RIVAL,
      actorPlayerId: ME,
      intent: { scope: "harm", intents: [hex(RIVAL), hook(RIVAL)] },
      outcome: { tier: 1, pierce: 0 },
      causeId: 3,
      visibility: "public",
    });
    expect(journal.filter((j) => j.op === "block")).toHaveLength(1);
    expect(feed[0]).toEqual({
      eventType: "intercepted",
      seasonPlayerId: RIVAL,
      payload: {
        how: "blocked",
        scope: "harm",
        instanceId: block.instanceId,
        key: "shield",
        name: names("shield"),
        kind: "item",
        fromSeasonPlayerId: ME,
        fromUsername: "me",
      },
    });
    // The charge it spent: the shield is gone, shaken off in the feed.
    expect(feed.map((f) => f.eventType)).toEqual(["intercepted", "item_expired"]);
  });

  it("only harm aimed at a rival is answered as harm: not the holder's own rule, not a gift", async () => {
    const { ctx, give, holding, position } = setup();
    await give("shield", RIVAL);
    // The rival's own rule hands them the effect: nobody aimed it.
    await runIntents(ctx, [{ kind: "grant", entryId: E.slow, key: "slow", entryKind: "effect", to: RIVAL }], { source: "rule", reveal: false, from: RIVAL });
    // A move forward harms nobody.
    await runIntents(ctx, [{ kind: "move", who: RIVAL, to: { by: 2 }, key: "gift" }], used);
    expect(await holding(RIVAL)).toEqual(["shield", "slow"]);
    expect(await position(RIVAL)).toBe(14);
  });

  it("a pierce lets a harmful action through ordinary protection, not a reinforced one", async () => {
    const pierced = setup();
    await pierced.give("shield", RIVAL);
    await pierced.give("mark", RIVAL);
    await runIntents(pierced.ctx, [hook(RIVAL)], used);
    expect(await pierced.position(RIVAL)).toBe(10);
    expect(await pierced.holding(RIVAL)).toEqual(["mark", "shield"]);

    const held = setup();
    await held.give("steel", RIVAL);
    await held.give("mark", RIVAL);
    await runIntents(held.ctx, [hook(RIVAL)], used);
    expect(await held.position(RIVAL)).toBe(12);
    // A protection without charges protects while it lasts.
    expect(await held.holding(RIVAL)).toEqual(["mark", "steel"]);
    expect(held.journal.find((j) => j.op === "block")).toMatchObject({ outcome: { tier: 2, pierce: 1 } });
  });

  it("a reflection turns it back on the sender — never again; the sender's own protection may block it", async () => {
    const { ctx, give, holding, journal } = setup();
    await give("mirror", RIVAL);
    await give("mirror", ME);
    await runIntents(ctx, [hex(RIVAL)], used);
    // It came back to me, and my mirror did not send it on.
    expect(await holding(ME)).toEqual(["mirror", "slow"]);
    expect(await holding(RIVAL)).toEqual([]);
    expect(journal.filter((j) => j.op === "reflect")).toHaveLength(1);

    const shielded = setup();
    await shielded.give("mirror", RIVAL);
    await shielded.give("shield", ME);
    const feed = await runIntents(shielded.ctx, [hex(RIVAL)], used);
    expect(await shielded.holding(ME)).toEqual([]);
    expect(await shielded.holding(RIVAL)).toEqual([]);
    expect(feed.filter((f) => f.eventType === "intercepted").map((f) => [f.seasonPlayerId, f.payload.how, f.payload.fromSeasonPlayerId])).toEqual([
      [RIVAL, "reflected", ME],
      [ME, "blocked", RIVAL],
    ]);
  });

  it("a swap turned back is the same swap: it is blocked instead", async () => {
    const { ctx, give, position, holding } = setup();
    await give("mirror", RIVAL);
    await runIntents(ctx, [{ kind: "move", who: ME, to: { swapWith: RIVAL }, key: "swap", harmTo: RIVAL }], used);
    expect([await position(ME), await position(RIVAL)]).toEqual([10, 12]);
    expect(await holding(RIVAL)).toEqual([]);
  });

  it("an answer that does not apply lets the next one answer: a reflection of what was reflected", async () => {
    const { ctx, give, holding, journal } = setup();
    await give("mirror", RIVAL);
    await give("shield", RIVAL);
    await runIntents(ctx, [hex(RIVAL)], { ...used, reflected: true });
    expect(await holding(RIVAL)).toEqual(["mirror"]);
    expect(journal.map((j) => j.op)).toContain("block");
    expect(journal.map((j) => j.op)).not.toContain("reflect");
  });

  it("nothing answers past the chain's depth", async () => {
    const { ctx, give, holding } = setup();
    await give("shield", RIVAL);
    await runIntents(ctx, [hex(RIVAL)], { ...used, reactions: MAX_CHAIN_DEPTH });
    expect(await holding(RIVAL)).toEqual(["shield", "slow"]);
  });

  it("turning back swaps the sender and the victim in what the intent names", () => {
    expect(turnBack(hex(RIVAL), ME, RIVAL)).toEqual([{ ...hex(RIVAL), to: ME, harmTo: ME }]);
    expect(turnBack({ kind: "balance", to: RIVAL, delta: -2, reason: "x", harmTo: RIVAL }, ME, RIVAL)).toEqual([
      { kind: "balance", to: ME, delta: -2, reason: "x", harmTo: ME },
    ]);
    expect(turnBack({ kind: "remove", from: RIVAL, what: "item", character: "bonus", entryId: null, pick: "random", count: 1, harmTo: RIVAL }, ME, RIVAL)).toMatchObject([
      { from: ME, harmTo: ME },
    ]);
    expect(turnBack({ kind: "move", who: ME, to: { player: RIVAL, at: "cell" }, key: "k", harmTo: RIVAL }, ME, RIVAL)).toEqual([
      { kind: "move", who: RIVAL, to: { player: ME, at: "cell" }, key: "k", harmTo: ME },
    ]);
    expect(turnBack({ kind: "move", who: { nearestBehind: ME }, to: { halfwayTo: RIVAL }, key: "k", harmTo: RIVAL }, ME, RIVAL)).toEqual([
      { kind: "move", who: { nearestBehind: ME }, to: { halfwayTo: ME }, key: "k", harmTo: ME },
    ]);
    expect(turnBack({ kind: "moveItems", from: RIVAL, to: ME, count: 1, rarity: null, how: "stolen", except: null, harmTo: RIVAL }, ME, RIVAL)).toMatchObject([
      { from: ME, to: RIVAL, harmTo: ME },
    ]);
    expect(turnBack({ kind: "copyItem", from: RIVAL, to: ME, rarity: null, except: null, harmTo: RIVAL }, ME, RIVAL)).toMatchObject([{ from: ME, to: RIVAL }]);
    expect(turnBack({ kind: "cleanse", from: RIVAL, character: null, tags: [], count: 1, harmTo: RIVAL }, ME, RIVAL)).toMatchObject([{ from: ME }]);
    expect(turnBack({ kind: "swapItems", a: ME, b: RIVAL, rarity: null, except: null, harmTo: RIVAL }, ME, RIVAL)).toEqual([]);
  });
});

describe("what arrives — entries, items handed over, moves back (wave B, spec §6.13)", () => {
  it("a replacement: an item or effect that would move the holder back moves them forward instead — a rival's or their own", async () => {
    const { ctx, give, holding, position, journal } = setup();
    await give("phoenix", RIVAL);
    await runIntents(ctx, [hook(RIVAL)], used);
    expect(await position(RIVAL)).toBe(13);
    expect(await holding(RIVAL)).toEqual([]);
    expect(journal.map((j) => j.op)).toEqual(expect.arrayContaining(["replace", "move_player"]));
    expect(journal.find((j) => j.op === "replace")).toMatchObject({ intent: { scope: "moveBack", key: "hook", from: 12, to: 10 }, outcome: { with: 1 } });

    // Their own effect, arriving from the wheel: its rule moves them back.
    const own = setup();
    await own.give("phoenix", ME);
    await grant(own.ctx, { entry: "jolt", to: ME, source: "cell_penalty", reveal: false, arrival: { from: null } });
    expect(await own.position(ME)).toBe(11);
  });

  it("an amplification: an instant effect acts twice, a lasting one lasts twice as long, and it spends its trigger", async () => {
    const { ctx, give, holding, position, instances } = setup();
    await give("echo", ME);
    await grant(ctx, { entry: "jolt", to: ME, source: "cell_penalty", reveal: false, arrival: { from: null } });
    expect(await position(ME)).toBe(8);
    expect(await holding(ME)).toEqual([]);

    await give("echo", ME);
    await grant(ctx, { entry: "slow", to: ME, source: "cell_penalty", reveal: false, arrival: { from: null } });
    expect(instances.find((i) => i.entryId === E.slow && i.status === "active")).toMatchObject({ remaining: 4 });
  });

  it("an item amplified comes as copies — a unique one once", async () => {
    const { ctx, give, holding } = setup();
    await give("bounty", ME);
    await grant(ctx, { entry: "boots", to: ME, source: "cell_bonus", reveal: false, arrival: { from: null } });
    expect(await holding(ME)).toEqual(["boots", "boots"]);
    await give("bounty", RIVAL);
    await grant(ctx, { entry: "lone", to: RIVAL, source: "cell_bonus", reveal: false, arrival: { from: null } });
    expect(await holding(RIVAL)).toEqual(["lone"]);
  });

  it("a block of an entry: a drop is answered — journaled with the draws that picked it — staff's grant is not", async () => {
    const { ctx, give, holding, journal } = setup();
    await give("curse", ME);
    const dropped = await grant(ctx, { entry: "boots", to: ME, source: "cell_bonus", reveal: true, arrival: { from: null }, draws: [0.25] });
    expect(dropped).toMatchObject({ state: "intercepted", instanceId: null });
    expect(dropped.feed).toEqual([
      expect.objectContaining({ eventType: "intercepted", seasonPlayerId: ME, payload: expect.objectContaining({ how: "blocked", scope: "entry", key: "curse", kind: "effect" }) }),
    ]);
    // Nobody aimed a drop: nobody is named.
    expect(dropped.feed[0]!.payload).not.toHaveProperty("fromSeasonPlayerId");
    expect(journal.find((j) => j.op === "block")).toMatchObject({ intent: { scope: "entry", entry: "boots", source: "cell_bonus" }, rng: [0.25] });
    // The curse lasts its game: it keeps answering.
    expect(await holding(ME)).toEqual(["curse"]);
    await grant(ctx, { entry: "boots", to: ME, source: "admin", reveal: false });
    expect(await holding(ME)).toEqual(["boots", "curse"]);
  });

  it("what a use hands over shows its answer, as the use shows its moves", async () => {
    const { ctx, give } = setup();
    await give("echo", RIVAL);
    const feed = await runIntents(ctx, [hex(RIVAL)], used);
    expect(feed.filter((f) => f.eventType === "intercepted").map((f) => [f.seasonPlayerId, f.payload.how, f.payload.factor])).toEqual([[RIVAL, "amplified", 2]]);
  });

  it("an answer hidden from the feed where the season hides drops is journaled for staff", async () => {
    const { ctx, give, journal } = setup();
    await give("curse", ME);
    const dropped = await grant(ctx, { entry: "boots", to: ME, source: "cell_bonus", reveal: false, arrival: { from: null } });
    expect(dropped.feed).toEqual([]);
    expect(journal.find((j) => j.op === "block")).toMatchObject({ visibility: "staff" });
  });

  it("items handed over are answered at the receiver: nothing moves; a trade, by either side", async () => {
    const { ctx, give, holding } = setup();
    await give("curse", ME);
    await give("boots", RIVAL);
    await moveItems(ctx, { kind: "moveItems", from: RIVAL, to: ME, count: 1, rarity: null, how: "stolen", except: null }, { source: "item", reveal: false, from: ME });
    expect(await holding(RIVAL)).toEqual(["boots"]);
    expect(await holding(ME)).toEqual(["curse"]);

    await give("lone", ME);
    await swapItems(ctx, { kind: "swapItems", a: ME, b: RIVAL, rarity: null, except: null }, { source: "item", reveal: false, from: ME });
    expect(await holding(ME)).toEqual(["curse", "lone"]);
    expect(await holding(RIVAL)).toEqual(["boots"]);
  });
});

describe("what holds — standing states (wave B, spec §6.13)", () => {
  it("reads what a participant's effects and held items say — a pierce adds up", async () => {
    const { ctx, give, store } = setup();
    await give("veil", RIVAL);
    await give("chain", ME);
    await give("mark", ME);
    await grant(ctx, { entry: "mark", to: ME, source: "scenario", reveal: false });
    const self = { seasonPlayerId: ME, position: 10, balancePoints: 5, rollSeq: 5, moveCount: 5, rank: 1, status: "active" as const };
    expect(standingFor(ctx.registry, await store.activeForHolder(RIVAL), { ...self, seasonPlayerId: RIVAL }, () => 0)).toEqual({
      untargetable: true,
      forbidItems: false,
      pierce: 0,
      holdLimit: null,
      holdLimitBy: null,
      conditionImmunity: false,
    });
    // A refreshed mark is one instance: one pierce.
    expect(standingFor(ctx.registry, await store.activeForHolder(ME), self, () => 0)).toEqual({
      untargetable: false,
      forbidItems: true,
      pierce: 1,
      holdLimit: null,
      holdLimitBy: null,
      conditionImmunity: false,
    });
  });

  it("asks effects and held items oldest first, never an active item", async () => {
    const { ctx, give, store } = setup();
    await give("boots", ME);
    await give("shield", ME);
    await give("curse", ME);
    const rows = await store.activeForHolder(ME);
    expect(answeringSources(ctx.registry, rows).map((s) => s.entry.key)).toEqual(["shield", "curse"]);
  });
});
