/**
 * Answering the questions a player's entries put to them
 * (docs/IEE_CONSTRUCTOR_SPEC.md §7.6): who may answer, what an answer does,
 * and what is announced once it has committed. The executor runs for real
 * over an in-memory store; the database, the session and the announcements
 * are the boundaries.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Season, SeasonPlayer, User } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type IeePlayerSnapshot, type SeasonConfig } from "@/lib/engine";
import { compileSet, type EntryDoc } from "@/lib/engine/iee/dsl";
import { grant, openGameChoice, type DecisionNote, type ExecContext } from "@/lib/modules/iee/executor";
import type { ContextInput } from "@/lib/modules/iee/executor/context";
import { memoryStore, type MemoryStore } from "@/lib/modules/iee/executor/memory-store.test-helpers";
import { buildRegistry, type SeasonRegistry } from "@/lib/modules/iee/registry";

import { answerDecision, answerWithDefault, judgeDecision, settleDecisionsBeforeRoll } from "./decisions";

/** The transaction runs its work; `committed` says whether it has returned yet. */
const dbFake = vi.hoisted(() => {
  const state = { committed: 0 };
  const db = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const result = await fn({ marker: "tx" });
      state.committed += 1;
      return result;
    },
  };
  return { db, state };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const session = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isStaff: (user: { role: string } | null) => user !== null && (user.role === "admin" || user.role === "judge"),
}));
vi.mock("@/lib/infrastructure/auth/session", () => session);

vi.mock("@/lib/infrastructure/logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const events = vi.hoisted(() => ({ logEvent: vi.fn(async () => {}), logAdminAction: vi.fn(async () => {}) }));
vi.mock("@/lib/infrastructure/events", () => events);

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const players = vi.hoisted(() => ({ getSeasonPlayerById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/players", () => players);

const context = vi.hoisted(() => ({ executionContext: vi.fn() }));
vi.mock("@/lib/modules/iee/executor/context", () => context);

// A reaction window is answered by the turn it holds (spec §7.4): the turn is a boundary here.
const turn = vi.hoisted(() => ({ answerReactionWindow: vi.fn() }));
vi.mock("./turn", () => turn);

// A game taken from a choice is a roll (wave C, spec §7.12): the rolls are a boundary here.
const rolls = vi.hoisted(() => ({ createRoll: vi.fn(), getOpenRollRow: vi.fn(async () => null as unknown) }));
vi.mock("@/lib/modules/catalog/repository", () => ({ createRoll: rolls.createRoll }));
vi.mock("./helpers", async (importOriginal) => ({ ...(await importOriginal<typeof import("./helpers")>()), getOpenRollRow: rolls.getOpenRollRow }));

const reg = vi.hoisted(() => ({ current: null as SeasonRegistry | null }));
vi.mock("@/lib/modules/iee/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/iee/registry")>();
  return { ...actual, getSeasonRegistry: async () => reg.current! };
});

/** The reads go to the memory store; the announcement is recorded with whether the transaction had committed. */
const store = vi.hoisted(() => ({ mem: null as MemoryStore | null, announced: [] as { notes: DecisionNote[]; afterCommits: number }[] }));
const decisions = vi.hoisted(() => ({
  getDecisionRow: vi.fn(async (id: string) => store.mem!.decisions.find((d) => d.id === id) ?? null),
  listPendingDecisions: vi.fn(async (playerId: string) => store.mem!.store.pendingDecisions(playerId)),
  announceDecisions: vi.fn(async (notes: readonly DecisionNote[]) => {
    store.announced.push({ notes: [...notes], afterCommits: dbFake.state.committed });
  }),
}));
vi.mock("@/lib/modules/iee/decisions", () => decisions);

const SEASON = "season-1";
const ME = "sp-me";
const RIVAL = "sp-rival";
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = (slug: string) => ({ ru: slug, en: slug, uk: slug });

const item = (slug: string, rarity: EntryDoc["rarity"]): EntryDoc => ({
  dslVersion: 1,
  kind: "item",
  slug,
  name: names(slug),
  character: "bonus",
  rarity,
  tags: [],
  usage: { activation: "active", charges: 1, target: { who: "self" } },
  rules: [{ when: "onUse", do: [{ op: "balance", amount: 1 }] }],
});

/** «Налог»: give up one bonus item of your choice. */
const TAX: EntryDoc = {
  dslVersion: 1,
  kind: "effect",
  slug: "tax",
  name: names("tax"),
  character: "penalty",
  rarity: "common",
  tags: [],
  duration: { unit: "instant" },
  rules: [{ when: "onApply", do: [{ op: "victimChoice" }] }],
};

/** A penalty effect that gives the holder's next game a completion condition (wave C, spec §6.17). */
const HARD: EntryDoc = {
  dslVersion: 1,
  kind: "effect",
  slug: "hard",
  name: { ru: "Сложный режим" },
  character: "penalty",
  rarity: "common",
  tags: ["game_condition"],
  duration: { unit: "next_game" },
  stacking: { mode: "refresh" },
  rules: [{ when: "onRollCreated", do: [{ op: "addCondition", text: { ru: "На высокой сложности" } }] }],
};

function registry(withConditions = false): SeasonRegistry {
  const docs: EntryDoc[] = [TAX, item("pebble", "common"), item("gem", "rare"), ...(withConditions ? [HARD] : [])];
  return buildRegistry(compileSet(docs.map((doc, i) => ({ entryId: ID(1 + i), revisionId: ID(100 + i), doc }))));
}

const user = (id: string, role: User["role"] = "player"): User => ({ id, role }) as unknown as User;
const PLAYER = user("user-me");
const OTHER = user("user-rival");
const JUDGE = user("user-judge", "judge");

function participant(id: string, userId: string): SeasonPlayer {
  return {
    id,
    seasonId: SEASON,
    playerId: userId,
    position: 10,
    balancePoints: 5,
    status: "active",
    streakPass: 0,
    streakDrop: 0,
    rerollsUsed: 0,
    rollSeq: 5,
    joinedAt: new Date(0),
    finishedAt: null,
  };
}

const CONFIG: SeasonConfig = { ...structuredClone(DEFAULT_SEASON_CONFIG), iee: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true } };

function season(over: Partial<Season> = {}): Season {
  return {
    id: SEASON,
    slug: "s1",
    title: "Season 1",
    status: "active",
    config: CONFIG,
    rulesMd: null,
    startedAt: null,
    finishedAt: null,
    createdBy: null,
    createdAt: new Date(0),
    ...over,
  } as Season;
}

function execFor(input: Pick<ContextInput, "seasonId" | "config"> & Partial<ContextInput>): ExecContext {
  return {
    store: store.mem!.store,
    seasonId: input.seasonId,
    registry: input.registry ?? reg.current!,
    config: input.config,
    seasonRollSeq: 40,
    actorPlayerId: input.actorPlayerId ?? null,
    actorUserId: input.actorUserId ?? null,
    rng: () => 0,
    snapshot: async (id): Promise<IeePlayerSnapshot> => ({
      seasonPlayerId: id,
      position: 10,
      balancePoints: 5,
      rollSeq: 5,
      moveCount: 5,
      rank: 1,
      status: "active",
    }),
    anchorFor: async () => ({ anchorRollSeq: 7 }),
    board: async () => ({ size: 40, loop: false, finishAt: null }),
    ...(input.decisions ? { decisions: input.decisions } : {}),
  };
}

let held: { pebble: string; gem: string };
let question: string;

/** The player holds a common and a rare bonus item, and «Налог» asks which one goes. */
async function asked(): Promise<void> {
  const ctx = execFor({ seasonId: SEASON, config: CONFIG.iee });
  const give = async (entry: string, reveal = false) => (await grant(ctx, { entry, to: ME, source: "scenario", reveal })).instanceId!;
  held = { pebble: await give("pebble"), gem: await give("gem") };
  await give("tax", true);
  const pending = await store.mem!.store.pendingDecisions(ME);
  expect(pending).toHaveLength(1);
  question = pending[0]!.id;
}

const holding = async () => (await store.mem!.store.activeForHolder(ME)).map((r) => r.id).sort();
const decision = () => store.mem!.decisions.find((d) => d.id === question)!;
const journalOps = () => store.mem!.journal.map((j) => j.op);

beforeEach(async () => {
  vi.clearAllMocks();
  dbFake.state.committed = 0;
  store.announced = [];
  store.mem = memoryStore({ balances: { [ME]: 5, [RIVAL]: 5 }, positions: { [ME]: 10, [RIVAL]: 12 }, names: { [ME]: "me", [RIVAL]: "rival" } });
  reg.current = registry();
  session.getCurrentUser.mockResolvedValue(PLAYER);
  seasons.getSeasonById.mockResolvedValue(season());
  players.getSeasonPlayerById.mockImplementation(async (id: string) =>
    id === ME ? participant(ME, "user-me") : id === RIVAL ? participant(RIVAL, "user-rival") : null,
  );
  context.executionContext.mockImplementation(async (input: ContextInput) => execFor(input));
  await asked();
});

describe("answerDecision — the player answers their own question (spec §7.6)", () => {
  it("refuses a guest, a question that does not exist and one already answered", async () => {
    session.getCurrentUser.mockResolvedValueOnce(null);
    await expect(answerDecision({ decisionId: question, option: "discard", picks: [held.gem] })).rejects.toMatchObject({ code: "gameLoginRequired" });
    await expect(answerDecision({ decisionId: ID(999), option: "discard", picks: [held.gem] })).rejects.toMatchObject({ code: "ieeDecisionNotFound" });
    await answerDecision({ decisionId: question, option: "discard", picks: [held.gem] });
    await expect(answerDecision({ decisionId: question, option: "discard", picks: [held.pebble] })).rejects.toMatchObject({ code: "ieeDecisionSettled" });
    // The second answer changed nothing.
    expect(await holding()).toEqual([held.pebble]);
  });

  it("refuses another player's answer, and an answer while the season is not running — the question still waits", async () => {
    session.getCurrentUser.mockResolvedValueOnce(OTHER);
    await expect(answerDecision({ decisionId: question, option: "discard", picks: [held.gem] })).rejects.toMatchObject({ code: "gameNotAllowed" });
    seasons.getSeasonById.mockResolvedValueOnce(season({ status: "paused" }));
    await expect(answerDecision({ decisionId: question, option: "discard", picks: [held.gem] })).rejects.toMatchObject({ code: "gameSeasonNotActive" });
    expect(decision().status).toBe("pending");
    expect(context.executionContext).not.toHaveBeenCalled();
  });

  it("gives up the item picked, journals the answer, and announces it once committed, with its feed line", async () => {
    await answerDecision({ decisionId: question, option: "discard", picks: [held.gem] });
    expect(await holding()).toEqual([held.pebble]);
    expect(decision()).toMatchObject({ status: "resolved", resolvedByUserId: "user-me" });
    expect(journalOps()).toContain("decision_resolve");
    expect(store.mem!.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ intent: { by: "player" }, outcome: { option: "discard", ending: [held.gem] } });
    expect(store.announced).toEqual([{ notes: [{ decisionId: question, playerId: ME, kind: "victim_choice", status: "resolved" }], afterCommits: 1 }]);
    expect(events.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: SEASON, seasonPlayerId: ME, eventType: "decision_made", payload: expect.objectContaining({ how: "chosen", option: "discard", discarded: [names("gem")] }) }),
    );
    expect(context.executionContext).toHaveBeenCalledWith(expect.objectContaining({ tx: { marker: "tx" }, seasonId: SEASON, actorPlayerId: ME, actorUserId: "user-me" }));
  });

  it("refuses an answer the holdings do not allow with its code, and nothing changes or is announced", async () => {
    await expect(answerDecision({ decisionId: question, option: "discard", picks: [ID(404)] })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    await expect(answerDecision({ decisionId: question, option: "endure" })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    expect(decision().status).toBe("pending");
    expect(await holding()).toEqual([held.gem, held.pebble].sort());
    expect(store.announced).toEqual([]);
    expect(events.logEvent).not.toHaveBeenCalled();
  });
});

describe("answerWithDefault — the player takes the default (spec §7.6)", () => {
  it("gives up the commonest item, journaled as the player's answer", async () => {
    await answerWithDefault(question);
    expect(await holding()).toEqual([held.gem]);
    expect(decision().status).toBe("resolved");
    expect(store.mem!.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ intent: { by: "player" }, outcome: { option: "discard", ending: [held.pebble] } });
  });

  it("is the player's alone, and only while the season runs", async () => {
    session.getCurrentUser.mockResolvedValueOnce(null);
    await expect(answerWithDefault(question)).rejects.toMatchObject({ code: "gameLoginRequired" });
    session.getCurrentUser.mockResolvedValueOnce(JUDGE);
    await expect(answerWithDefault(question)).rejects.toMatchObject({ code: "gameNotAllowed" });
    seasons.getSeasonById.mockResolvedValueOnce(season({ status: "finished" }));
    await expect(answerWithDefault(question)).rejects.toMatchObject({ code: "gameSeasonNotActive" });
    expect(decision().status).toBe("pending");
  });
});

describe("judgeDecision — a judge chooses for the player (spec §7.6)", () => {
  it("is staff-only", async () => {
    await expect(judgeDecision({ decisionId: question, option: "discard", picks: [held.gem] }, { actor: PLAYER })).rejects.toMatchObject({ code: "adminStaffRequired" });
    session.getCurrentUser.mockResolvedValueOnce(null);
    await expect(judgeDecision({ decisionId: question })).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(decision().status).toBe("pending");
    expect(events.logAdminAction).not.toHaveBeenCalled();
  });

  it("applies the judge's pick as the judge's, and audits it", async () => {
    await judgeDecision({ decisionId: question, option: "discard", picks: [held.gem] }, { actor: JUDGE });
    expect(await holding()).toEqual([held.pebble]);
    expect(decision()).toMatchObject({ status: "judged", resolvedByUserId: "user-judge" });
    expect(store.mem!.journal.find((j) => j.op === "decision_resolve")).toMatchObject({ actorUserId: "user-judge", intent: { by: "judge" } });
    expect(events.logAdminAction).toHaveBeenCalledWith({
      actorId: "user-judge",
      actionType: "iee_decision_judged",
      targetType: "iee_decision",
      targetId: question,
      payload: { seasonPlayerId: ME, option: "discard", picks: [held.gem] },
    });
    expect(events.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "decision_made", payload: expect.objectContaining({ how: "judged" }) }));
  });

  it("with no option applies the default as it stands now", async () => {
    await judgeDecision({ decisionId: question, option: null }, { actor: JUDGE });
    expect(await holding()).toEqual([held.gem]);
    expect(decision().status).toBe("judged");
    expect(events.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ payload: { seasonPlayerId: ME, option: "default", picks: [] } }));
  });

  it("refuses a question already settled, without an audit row", async () => {
    await answerWithDefault(question);
    await expect(judgeDecision({ decisionId: question }, { actor: JUDGE })).rejects.toMatchObject({ code: "ieeDecisionSettled" });
    expect(events.logAdminAction).not.toHaveBeenCalled();
  });
});

describe("settleDecisionsBeforeRoll — the default as the next game starts (spec §7.6)", () => {
  it("reads nothing while items and effects are off", async () => {
    await settleDecisionsBeforeRoll(participant(ME, "user-me"), { ...CONFIG, iee: { ...CONFIG.iee, enabled: false } });
    expect(decisions.listPendingDecisions).not.toHaveBeenCalled();
    expect(decision().status).toBe("pending");
  });

  it("opens no transaction when nothing waits", async () => {
    await settleDecisionsBeforeRoll(participant(RIVAL, "user-rival"), CONFIG);
    expect(decisions.listPendingDecisions).toHaveBeenCalledWith(RIVAL);
    expect(context.executionContext).not.toHaveBeenCalled();
    expect(dbFake.state.committed).toBe(0);
  });

  it("settles a question still waiting by its default, journaled as the next game's, and announces it", async () => {
    await settleDecisionsBeforeRoll(participant(ME, "user-me"), CONFIG);
    expect(await holding()).toEqual([held.gem]);
    expect(decision()).toMatchObject({ status: "defaulted", resolvedByUserId: null });
    expect(store.mem!.journal.find((j) => j.op === "decision_default")).toMatchObject({ intent: { by: "default", why: "next_game" } });
    expect(store.announced).toEqual([{ notes: [{ decisionId: question, playerId: ME, kind: "victim_choice", status: "defaulted" }], afterCommits: 1 }]);
    expect(events.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "decision_made", payload: expect.objectContaining({ how: "defaulted" }) }));
    expect(context.executionContext).toHaveBeenCalledWith(expect.objectContaining({ actorPlayerId: ME, actorUserId: null }));
  });
});

describe("a reaction window is answered by the turn it holds (spec §7.4)", () => {
  const WHEEL = { kind: "item", key: "pebble" } as const;
  let windowId: string;

  beforeEach(async () => {
    const row = await store.mem!.store.insertDecision({
      id: ID(500),
      seasonId: SEASON,
      playerId: ME,
      kind: "reaction_window",
      instanceId: null,
      revisionId: null,
      ruleIndex: null,
      options: [{ id: "accept", kind: "accept", params: {} }, { id: "react", kind: "react", params: { among: ["inst-coin"] } }],
      defaultChoice: { option: "accept" },
      context: { rollId: "roll-1" },
      causeJournalId: null,
    });
    windowId = row.id;
    turn.answerReactionWindow.mockResolvedValue({ diceResults: [6], fromPosition: 3, toPosition: 9, newBalancePoints: 5, wheel: WHEEL });
  });

  it("the player's answer plays the turn, and the wheel it spun comes back", async () => {
    await expect(answerDecision({ decisionId: windowId, option: "react", picks: ["inst-coin"] })).resolves.toEqual({ wheel: WHEEL });
    expect(turn.answerReactionWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: expect.objectContaining({ id: windowId }),
        sp: expect.objectContaining({ id: ME }),
        choice: { option: "react", picks: ["inst-coin"] },
        by: "player",
        userId: "user-me",
      }),
    );
    expect(context.executionContext).not.toHaveBeenCalled();
  });

  it("is the player's alone: another player is refused before anything plays", async () => {
    session.getCurrentUser.mockResolvedValueOnce(OTHER);
    await expect(answerDecision({ decisionId: windowId, option: "accept" })).rejects.toMatchObject({ code: "gameNotAllowed" });
    expect(turn.answerReactionWindow).not.toHaveBeenCalled();
  });

  it("the default accepts the dice", async () => {
    turn.answerReactionWindow.mockResolvedValueOnce({ diceResults: [1], fromPosition: 3, toPosition: 4, newBalancePoints: 5 });
    await expect(answerWithDefault(windowId)).resolves.toEqual({});
    expect(turn.answerReactionWindow).toHaveBeenCalledWith(expect.objectContaining({ choice: null, by: "player" }));
  });

  it("a judge accepts for the player, audited", async () => {
    await judgeDecision({ decisionId: windowId }, { actor: JUDGE });
    expect(turn.answerReactionWindow).toHaveBeenCalledWith(expect.objectContaining({ choice: null, by: "judge", userId: "user-judge" }));
    expect(events.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: "iee_decision_judged", targetId: windowId, payload: expect.objectContaining({ option: "default" }) }));
  });
});

describe("a choice of games is answered with the game taken (wave C, spec §7.12)", () => {
  const offer = (gameId: string, title: string) => ({ gameId, title, coverUrl: null, genres: ["rpg"], year: 2005, rating: 4, platform: null });
  let choiceId: string;

  beforeEach(async () => {
    const row = await openGameChoice(execFor({ seasonId: SEASON, config: CONFIG.iee }), {
      playerId: ME,
      context: { origin: "roll", replacedRollId: null, itemKey: null, names: null, games: [offer("g-1", "Celeste"), offer("g-2", "Hades"), offer("g-3", "Inside")] },
    });
    choiceId = row.id;
    rolls.getOpenRollRow.mockResolvedValue(null);
    rolls.createRoll.mockImplementation(async (_sp: string, gameId: string) => ({ id: `roll-of-${gameId}`, gameId }));
  });
  const choice = () => store.mem!.decisions.find((d) => d.id === choiceId)!;

  it("the roll is created with the game taken and the choice settled in one transaction; the feed says it was chosen", async () => {
    await expect(answerDecision({ decisionId: choiceId, option: "take", picks: ["g-2"] })).resolves.toEqual({});
    expect(rolls.createRoll).toHaveBeenCalledWith(ME, "g-2", { marker: "tx" });
    expect(choice()).toMatchObject({ status: "resolved", choice: { option: "take", picks: ["g-2"] }, resolvedByUserId: "user-me" });
    expect(store.mem!.journal.at(-1)).toMatchObject({ op: "decision_resolve", outcome: { option: "take", gameId: "g-2", rollId: "roll-of-g-2" } });
    expect(events.logEvent).toHaveBeenCalledWith({
      seasonId: SEASON,
      seasonPlayerId: ME,
      eventType: "game_rolled",
      payload: { gameId: "g-2", title: "Hades", chosen: true, offered: 3 },
    });
    expect(store.announced).toEqual([{ notes: [{ decisionId: choiceId, playerId: ME, kind: "game_choice", status: "resolved" }], afterCommits: 1 }]);
  });

  it("the game taken gets the completion conditions its holder's rules give (spec §6.17)", async () => {
    reg.current = registry(true);
    // Granted at the end of their last roll (5): it takes part in the game taken now.
    await grant(execFor({ seasonId: SEASON, config: CONFIG.iee }), { entry: "hard", to: ME, source: "scenario", reveal: false, anchor: { anchorRollSeq: 5 } });
    await answerDecision({ decisionId: choiceId, option: "take", picks: ["g-1"] });
    expect(await store.mem!.store.activeForRoll("roll-of-g-1")).toEqual([
      expect.objectContaining({ kind: "roll_condition", holderRollId: "roll-of-g-1", params: { ru: "На высокой сложности" } }),
    ]);
  });

  it("refuses an answer that takes no game, two, or one it did not offer — nothing is written", async () => {
    await expect(answerDecision({ decisionId: choiceId, option: "discard", picks: ["g-1"] })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    await expect(answerDecision({ decisionId: choiceId, option: "take", picks: ["g-1", "g-2"] })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    await expect(answerDecision({ decisionId: choiceId, option: "take", picks: ["g-9"] })).rejects.toMatchObject({ code: "ieeDecisionChoiceInvalid" });
    expect(choice().status).toBe("pending");
    expect(events.logEvent).not.toHaveBeenCalled();
  });

  it("refuses a take while a roll is open — somebody else's doing", async () => {
    rolls.getOpenRollRow.mockResolvedValue({ id: "roll-x" });
    await expect(answerDecision({ decisionId: choiceId, option: "take", picks: ["g-1"] })).rejects.toMatchObject({ code: "gameAlreadyHaveRoll" });
    expect(rolls.createRoll).not.toHaveBeenCalled();
  });

  it("is the player's game: no default, and no judge takes one for them", async () => {
    await expect(answerWithDefault(choiceId)).rejects.toMatchObject({ code: "ieeDecisionKind" });
    await expect(judgeDecision({ decisionId: choiceId, option: "take", picks: ["g-1"] }, { actor: JUDGE })).rejects.toMatchObject({ code: "ieeDecisionKind" });
    // Nor does starting the next game settle it: it is answered before any next game.
    await settleDecisionsBeforeRoll(participant(ME, "user-me"), CONFIG);
    expect(choice().status).toBe("pending");
  });
});
