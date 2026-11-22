/**
 * The player's choices (docs/IEE_CONSTRUCTOR_SPEC.md §6.14, §7.6): the
 * executor asks when an entry puts a choice to its holder — or acts at once
 * when there is none to make — and settles the answer: the player's, a
 * judge's, or the default.
 */
import { describe, expect, it } from "vitest";

import { IeeConfigSchema } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";

import { buildRegistry } from "../registry";
import {
  applyPendingDefaults,
  grant,
  moveItems,
  offeredGames,
  openGameChoice,
  resolveDecision,
  settleGameChoice,
  type DecisionNote,
  type ExecContext,
} from "./index";
import { memoryStore } from "./memory-store.test-helpers";

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });

const item = (slug: string, over: Partial<EntryDoc> = {}): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug,
  name: names(slug),
  character: "bonus",
  rarity: "common",
  tags: [],
  usage: { activation: "active", charges: 1, target: { who: "self" } },
  rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }],
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

const E = {
  tax: ID(1),
  overload: ID(2),
  greed: ID(3),
  common1: ID(10),
  common2: ID(11),
  rare: ID(12),
  epic: ID(13),
  passive: ID(14),
  cursed: ID(15),
};

function registry() {
  const docs: [string, EntryDoc][] = [
    // «Налог»: one bonus item of your choice; with none — a cell back.
    [
      E.tax,
      effect("tax", {
        duration: { unit: "instant" },
        stacking: undefined,
        rules: [
          { when: "onApply", if: [{ op: "itemCount", cmp: "gte", value: 1, character: "bonus" }], do: [{ op: "victimChoice" }] },
          { when: "onApply", if: [{ op: "itemCount", cmp: "eq", value: 0, character: "bonus" }], do: [{ op: "move", by: -1 }] },
        ],
      }),
    ],
    // «Перегруз»: two of your choice to be rid of it, or the cap.
    [
      E.overload,
      effect("overload", {
        rarity: "rare",
        rules: [
          { when: "onApply", do: [{ op: "victimChoice", count: 2, orKeep: true }] },
          { when: "afterDice", do: [{ op: "resultModify", cap: 3 }] },
        ],
      }),
    ],
    // «Проклятие жадности»: one bonus item at most.
    [E.greed, effect("greed", { rarity: "rare", duration: { unit: "next_game" }, rules: [{ when: "whileActive", do: [{ op: "holdLimit", max: 1 }] }] })],
    [E.common1, item("common1")],
    [E.common2, item("common2")],
    [E.rare, item("rare", { rarity: "rare" })],
    [E.epic, item("epic", { rarity: "epic" })],
    [E.passive, item("passive", { usage: { activation: "passive" }, rules: [{ when: "afterMovement", do: [{ op: "steps", delta: 1 }] }] })],
    [
      E.cursed,
      item("cursed", {
        character: "penalty",
        usage: { activation: "cursed", charges: 1 },
        rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -1 }] }],
      }),
    ],
  ];
  return buildRegistry(compileSet(docs.map(([entryId, doc], i) => ({ entryId, revisionId: ID(100 + i), doc }))));
}

function setup() {
  const mem = memoryStore({
    balances: { [ME]: 5, [RIVAL]: 5 },
    positions: { [ME]: 10, [RIVAL]: 12 },
    names: { [ME]: "me", [RIVAL]: "rival" },
  });
  const decisions: DecisionNote[] = [];
  const ctx: ExecContext = {
    store: mem.store,
    seasonId: SEASON,
    registry: registry(),
    config: IeeConfigSchema.parse({ enabled: true }),
    seasonRollSeq: 40,
    rng: () => 0,
    snapshot: async (id) => ({ seasonPlayerId: id, position: 10, balancePoints: 5, rollSeq: 5, moveCount: 5, rank: 1, status: "active" }),
    anchorFor: async () => ({ anchorRollSeq: 7 }),
    board: async () => ({ size: 40, loop: false, finishAt: null }),
    decisions,
  };
  const give = async (slug: string, to = ME, reveal = false) => (await grant(ctx, { entry: slug, to, source: "scenario", reveal })).instanceId!;
  const holding = async (who = ME) => (await mem.store.activeForHolder(who)).map((r) => ctx.registry.get(r.revisionId)!.key).sort();
  const pending = async (who = ME) => (await mem.store.pendingDecisions(who)).filter((d) => d.kind === "victim_choice");
  const position = async (who = ME) => (await mem.store.places(SEASON)).find((p) => p.id === who)!.position;
  return { ctx, mem, decisions, give, holding, pending, position };
}

describe("victimChoice — when there is no choice to make (spec §6.14)", () => {
  it("with no bonus item, «Налог» asks nothing: its other rule moves the holder a cell back", async () => {
    const { give, pending, position, holding } = setup();
    await give("cursed");
    await give("tax");
    expect(await pending()).toEqual([]);
    expect(await position()).toBe(9);
    // A cursed item is never offered — it stays.
    expect(await holding()).toEqual(["cursed"]);
  });

  it("with one bonus item, it goes at once: no question, an `end` row of its own", async () => {
    const { give, pending, holding, mem } = setup();
    const only = await give("rare");
    await give("tax");
    expect(await pending()).toEqual([]);
    expect(await holding()).toEqual([]);
    const ended = mem.instances.find((i) => i.id === only)!;
    expect(ended.endReason).toBe("discarded");
    expect(mem.journal.find((j) => j.op === "end" && j.instanceId === only)).toMatchObject({ outcome: { reason: "discarded" } });
  });

  it("the feed says why it went, where the arrival shows", async () => {
    const { ctx } = setup();
    await grant(ctx, { entry: "rare", to: ME, source: "scenario", reveal: false });
    const granted = await grant(ctx, { entry: "tax", to: ME, source: "cell_penalty", reveal: true });
    expect(granted.feed.find((f) => f.eventType === "decision_made")).toMatchObject({
      seasonPlayerId: ME,
      payload: { how: "forced", key: "tax", option: "discard", discarded: [names("rare")], kept: [] },
    });
  });

  it("with fewer than it takes and `orKeep`, nothing happens and what asked stays («Перегруз»: the cap)", async () => {
    const { give, pending, holding } = setup();
    await give("common1");
    await give("overload");
    expect(await pending()).toEqual([]);
    expect(await holding()).toEqual(["common1", "overload"]);
  });
});

describe("victimChoice — the question (spec §7.6)", () => {
  it("with a choice to make, a question waits: what it offers, its default — the commonest, the newest on a tie", async () => {
    const { give, pending, holding, decisions, mem } = setup();
    await give("rare");
    const older = await give("common1");
    const newer = await give("common2");
    await give("tax");
    const [question] = await pending();
    expect(question).toMatchObject({
      seasonId: SEASON,
      playerId: ME,
      kind: "victim_choice",
      status: "pending",
      options: [{ id: "discard", kind: "discard", params: { count: 1 } }],
      defaultChoice: { option: "discard", picks: [newer] },
      context: { key: "tax", then: "discard", count: 1, orKeep: false, rule: "commonest" },
    });
    expect((question!.options as { params: { among: string[] } }[])[0]!.params.among).toHaveLength(3);
    expect(older).not.toBe(newer);
    // Nothing goes yet.
    expect(await holding()).toEqual(["common1", "common2", "rare"]);
    expect(decisions).toEqual([{ decisionId: question!.id, playerId: ME, kind: "victim_choice", status: "pending" }]);
    expect(mem.journal.find((j) => j.op === "decision_open")).toMatchObject({ targetPlayerId: ME, visibility: "holder", outcome: { rule: "commonest" } });
  });

  it("the player's answer discards what they pick, and settles the question once", async () => {
    const { ctx, give, pending, holding, mem } = setup();
    const rare = await give("rare");
    await give("common1");
    await give("tax");
    const [question] = await pending();
    const answered = await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "discard", picks: [rare] }, by: "player", userId: "u-me" });
    expect(answered).toEqual({ ok: true, feed: [] });
    expect(await holding()).toEqual(["common1"]);
    expect(mem.instances.find((i) => i.id === rare)!.endReason).toBe("discarded");
    expect(mem.decisions[0]).toMatchObject({ status: "resolved", choice: { option: "discard", picks: [rare] }, resolvedByUserId: "u-me" });
    expect(mem.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ intent: { by: "player" }, outcome: { option: "discard", ending: [rare] } });
    expect(await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "discard", picks: [rare] }, by: "player" })).toEqual({
      ok: false,
      code: "ieeDecisionSettled",
    });
  });

  it("refuses an answer that does not fit — an item not theirs, a cursed one, too many — and keeps the question", async () => {
    const { ctx, give, pending } = setup();
    await give("rare");
    await give("common1");
    const cursed = await give("cursed");
    const theirs = await give("epic", RIVAL);
    await give("tax");
    const [question] = await pending();
    for (const picks of [[theirs], [cursed], [], undefined]) {
      expect(await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "discard", ...(picks ? { picks } : {}) }, by: "player" })).toEqual({
        ok: false,
        code: "ieeDecisionChoiceInvalid",
      });
    }
    expect(await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "endure" }, by: "player" })).toMatchObject({ ok: false });
    expect(await pending()).toHaveLength(1);
    expect(await resolveDecision(ctx, { decisionId: "nope", choice: null, by: "player" })).toEqual({ ok: false, code: "ieeDecisionNotFound" });
  });

  it("starting the next game applies the default over what the player holds then, journaled", async () => {
    const { ctx, give, pending, holding, mem, decisions } = setup();
    await give("rare");
    await give("common1");
    await give("tax");
    // A newer common item arrived since the question: the default takes it.
    const newest = await give("common2");
    decisions.length = 0;
    await applyPendingDefaults(ctx, ME);
    expect(await pending()).toEqual([]);
    expect(await holding()).toEqual(["common1", "rare"]);
    expect(mem.instances.find((i) => i.id === newest)!.endReason).toBe("discarded");
    expect(mem.decisions[0]).toMatchObject({ status: "defaulted", choice: { option: "discard", picks: [newest] }, resolvedByUserId: null });
    expect(mem.journal.find((j) => j.op === "decision_default")).toMatchObject({ intent: { by: "default", why: "next_game" } });
    expect(decisions).toEqual([expect.objectContaining({ status: "defaulted" })]);
  });

  it("a judge chooses for the player — or takes the default — and the journal says so", async () => {
    const { ctx, give, pending, mem } = setup();
    await give("rare");
    await give("common1");
    await give("tax");
    const [question] = await pending();
    expect(await resolveDecision(ctx, { decisionId: question!.id, choice: null, by: "judge", userId: "u-judge" })).toEqual({ ok: true, feed: [] });
    expect(mem.decisions[0]).toMatchObject({ status: "judged", resolvedByUserId: "u-judge" });
    expect(mem.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ actorUserId: "u-judge", intent: { by: "judge" } });
  });

  it("a new question first applies the default of the one waiting: one at a time", async () => {
    const { give, pending, mem } = setup();
    await give("rare");
    await give("epic");
    await give("common1");
    await give("tax");
    const [first] = await pending();
    await give("tax");
    const now = await pending();
    expect(now).toHaveLength(1);
    expect(now[0]!.id).not.toBe(first!.id);
    expect(mem.decisions.find((d) => d.id === first!.id)).toMatchObject({ status: "defaulted" });
    expect(mem.journal.find((j) => j.op === "decision_default")).toMatchObject({ intent: { why: "superseded" } });
  });

  it("shows in the feed where the arrival of what asked did: who chose, what went", async () => {
    const { ctx, pending } = setup();
    const rare = (await grant(ctx, { entry: "rare", to: ME, source: "scenario", reveal: false })).instanceId!;
    await grant(ctx, { entry: "common1", to: ME, source: "scenario", reveal: false });
    await grant(ctx, { entry: "tax", to: ME, source: "cell_penalty", reveal: true });
    const [question] = await pending();
    const answered = await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "discard", picks: [rare] }, by: "player" });
    expect(answered).toEqual({
      ok: true,
      feed: [
        {
          eventType: "decision_made",
          seasonPlayerId: ME,
          payload: { how: "chosen", key: "tax", name: names("tax"), option: "discard", discarded: [names("rare")], burned: [], kept: [] },
        },
      ],
    });
  });
});

describe("victimChoice with `orKeep` — give, or keep what asked («Перегруз»)", () => {
  it("asks to discard two or endure; the default endures", async () => {
    const { give, pending } = setup();
    await give("common1");
    await give("rare");
    await give("overload");
    const [question] = await pending();
    expect(question).toMatchObject({
      options: [
        { id: "discard", kind: "discard", params: { count: 2 } },
        { id: "endure", kind: "endure", params: {} },
      ],
      defaultChoice: { option: "endure" },
      context: { orKeep: true, rule: "endure" },
    });
  });

  it("giving two ends what asked — paid off; enduring keeps it and the items", async () => {
    const paid = setup();
    const a = await paid.give("common1");
    const b = await paid.give("rare");
    const overload = await paid.give("overload");
    const [question] = await paid.pending();
    // A discard is paid in full or not at all.
    expect(await resolveDecision(paid.ctx, { decisionId: question!.id, choice: { option: "discard", picks: [a] }, by: "player" })).toMatchObject({ ok: false });
    expect(await resolveDecision(paid.ctx, { decisionId: question!.id, choice: { option: "discard", picks: [a, b] }, by: "player" })).toMatchObject({ ok: true });
    expect(await paid.holding()).toEqual([]);
    expect(paid.mem.instances.find((i) => i.id === overload)!.endReason).toBe("triggered");
    expect(paid.mem.journal.find((j) => j.op === "end" && j.instanceId === overload)).toMatchObject({ outcome: { reason: "triggered", paidOff: true } });

    const kept = setup();
    await kept.give("common1");
    await kept.give("rare");
    await kept.give("overload");
    const [again] = await kept.pending();
    expect(await resolveDecision(kept.ctx, { decisionId: again!.id, choice: { option: "endure" }, by: "player" })).toMatchObject({ ok: true });
    expect(await kept.holding()).toEqual(["common1", "overload", "rare"]);
  });

  it("with what asked gone before the answer, a discard would pay for nothing: the player endures", async () => {
    const { ctx, give, pending, holding, mem } = setup();
    const a = await give("common1");
    const b = await give("rare");
    const overload = await give("overload");
    await mem.store.end(overload, "cleansed");
    const [question] = await pending();
    expect(await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "discard", picks: [a, b] }, by: "player" })).toMatchObject({ ok: true });
    expect(await holding()).toEqual(["common1", "rare"]);
    expect(mem.decisions[0]).toMatchObject({ choice: { option: "endure" } });
  });
});

describe("holdLimit — at most so many bonus items (spec §6.14, «Проклятие жадности»)", () => {
  it("asks as it starts which to keep — the rarest, the newest on a tie, by default — and the rest burn", async () => {
    const { ctx, give, pending, holding, mem } = setup();
    await give("common1");
    const epic = await give("epic");
    await give("passive");
    await give("cursed");
    await give("greed");
    const [question] = await pending();
    expect(question).toMatchObject({
      options: [{ id: "retain", kind: "retain", params: { count: 1 } }],
      defaultChoice: { option: "retain", picks: [epic] },
      context: { key: "greed", then: "retain", rule: "rarest" },
    });
    // Passive bonus items count; a cursed one does not.
    expect((question!.options as { params: { among: string[] } }[])[0]!.params.among).toHaveLength(3);
    const common = (await mem.store.activeForHolder(ME)).find((r) => ctx.registry.get(r.revisionId)!.key === "common1")!.id;
    await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "retain", picks: [common] }, by: "player" });
    expect(await holding()).toEqual(["common1", "cursed", "greed"]);
    expect(mem.instances.find((i) => i.id === epic)!.endReason).toBe("burned");
  });

  it("a bonus item arriving asks again: the question waiting is updated, not doubled", async () => {
    const { give, pending, mem } = setup();
    await give("common1");
    await give("rare");
    await give("greed");
    const [question] = await pending();
    await give("epic");
    const now = await pending();
    expect(now).toHaveLength(1);
    expect(now[0]!.id).toBe(question!.id);
    expect((now[0]!.options as { params: { among: string[] } }[])[0]!.params.among).toHaveLength(3);
    expect(mem.journal.filter((j) => j.op === "decision_open")).toHaveLength(2);
    expect(mem.journal.at(-1)).toMatchObject({ op: "decision_open", outcome: { reasked: question!.id } });
  });

  it("answered, and one more arrives — handed over by a rival too — a new question opens", async () => {
    const { ctx, give, pending, holding } = setup();
    const keep = await give("rare");
    await give("common1");
    await give("greed");
    const [question] = await pending();
    await resolveDecision(ctx, { decisionId: question!.id, choice: { option: "retain", picks: [keep] }, by: "player" });
    expect(await holding()).toEqual(["greed", "rare"]);
    await give("epic", RIVAL);
    await moveItems(ctx, { kind: "moveItems", from: RIVAL, to: ME, count: 1, rarity: null, how: "given", except: null }, { source: "rule", reveal: false });
    const [again] = await pending();
    expect(again!.id).not.toBe(question!.id);
    expect(again).toMatchObject({ status: "pending", context: { then: "retain" } });
  });

  it("asks nothing while the holder holds no more than it allows", async () => {
    const { give, pending } = setup();
    await give("rare");
    await give("cursed");
    await give("greed");
    await give("cursed", RIVAL);
    expect(await pending()).toEqual([]);
  });
});

describe("a choice of games (wave C, spec §7.12)", () => {
  const offer = (gameId: string, title: string) => ({ gameId, title, coverUrl: null, genres: ["rpg"], year: 2005, rating: 4, platform: null });
  const context = {
    origin: "roll" as const,
    replacedRollId: null,
    itemKey: null,
    names: null,
    games: [offer("g-1", "Celeste"), offer("g-2", "Hades"), offer("g-3", "Inside")],
  };

  it("opens for the player with the games offered, waiting — no default is ever taken", async () => {
    const { ctx, mem, decisions } = setup();
    const row = await openGameChoice(ctx, { playerId: ME, context });
    expect(row).toMatchObject({
      kind: "game_choice",
      status: "pending",
      options: [{ id: "take", kind: "take", params: { among: ["g-1", "g-2", "g-3"] } }],
      defaultChoice: { option: "take", picks: [] },
      context,
    });
    expect(offeredGames(row).map((g) => g.title)).toEqual(["Celeste", "Hades", "Inside"]);
    expect(decisions).toEqual([{ decisionId: row.id, playerId: ME, kind: "game_choice", status: "pending" }]);
    expect(mem.journal.find((j) => j.op === "decision_open")).toMatchObject({
      intent: { kind: "game_choice", origin: "roll" },
      outcome: { offered: ["g-1", "g-2", "g-3"] },
      visibility: "holder",
    });
    // The next game's start answers victim choices with their default — never this one.
    expect(await applyPendingDefaults(ctx, ME)).toEqual([]);
    expect((await mem.store.pendingDecisions(ME)).map((d) => d.kind)).toEqual(["game_choice"]);
    // Nor does a judge or a default answer it: it is the player's game.
    expect(await resolveDecision(ctx, { decisionId: row.id, choice: null, by: "default" })).toEqual({ ok: false, code: "ieeDecisionKind" });
  });

  it("is settled with a game it offered and the roll created with it — once", async () => {
    const { ctx, mem, decisions } = setup();
    const row = await openGameChoice(ctx, { playerId: ME, context });
    expect(await settleGameChoice(ctx, { decisionId: row.id, gameId: "g-9", rollId: "roll-1", userId: "u-1" })).toEqual({
      ok: false,
      code: "ieeDecisionChoiceInvalid",
    });
    const taken = await settleGameChoice(ctx, { decisionId: row.id, gameId: "g-2", rollId: "roll-1", userId: "u-1" });
    expect(taken).toMatchObject({ ok: true, game: { gameId: "g-2", title: "Hades" } });
    expect(mem.decisions[0]).toMatchObject({ status: "resolved", choice: { option: "take", picks: ["g-2"] }, resolvedByUserId: "u-1" });
    expect(mem.journal.find((j) => j.op === "decision_resolve")).toMatchObject({
      outcome: { option: "take", gameId: "g-2", rollId: "roll-1" },
      visibility: "holder",
    });
    expect(decisions.map((d) => d.status)).toEqual(["pending", "resolved"]);
    expect(await settleGameChoice(ctx, { decisionId: row.id, gameId: "g-1", rollId: "roll-2", userId: "u-1" })).toEqual({ ok: false, code: "ieeDecisionSettled" });
  });

  it("refuses what is not a game choice of this season", async () => {
    const { ctx, give, pending } = setup();
    expect(await settleGameChoice(ctx, { decisionId: "nope", gameId: "g-1", rollId: "r", userId: null })).toEqual({ ok: false, code: "ieeDecisionNotFound" });
    await give("rare");
    await give("common1");
    await give("tax");
    const [victim] = await pending();
    expect(await settleGameChoice(ctx, { decisionId: victim!.id, gameId: "g-1", rollId: "r", userId: null })).toEqual({ ok: false, code: "ieeDecisionKind" });
    expect(offeredGames(victim!)).toEqual([]);
  });
});
