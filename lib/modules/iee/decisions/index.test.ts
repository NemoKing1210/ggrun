/**
 * Reading the questions a player's entries put to them, and announcing what
 * changed (docs/IEE_CONSTRUCTOR_SPEC.md §7.6). The database, the realtime bus
 * and the notifications are the boundaries.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IeeDecisionRow } from "@/db/schema";
import { userRoom } from "@/lib/realtime/protocol";

import {
  announceDecisions,
  countPendingDecisions,
  decisionView,
  getDecisionRow,
  hasPendingDecision,
  listPendingDecisions,
  listPendingDecisionsForStaff,
  listPendingReactionsForStaff,
  reactionWindowView,
} from "./index";

/** Each `select()` resolves the next queued rows; `selects` counts the reads. */
const dbFake = vi.hoisted(() => {
  interface Chain {
    from(...args: unknown[]): Chain;
    innerJoin(...args: unknown[]): Chain;
    where(...args: unknown[]): Chain;
    orderBy(...args: unknown[]): Chain;
    limit(...args: unknown[]): Chain;
    then(onFulfilled: (rows: unknown[]) => unknown, onRejected?: (error: unknown) => unknown): Promise<unknown>;
  }
  const state = { results: [] as (unknown[] | Error)[], selects: 0 };
  function chain(): Chain {
    const c: Chain = {
      from: () => c,
      innerJoin: () => c,
      where: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (onFulfilled, onRejected) => {
        const next = state.results.shift() ?? [];
        return (next instanceof Error ? Promise.reject(next) : Promise.resolve(next)).then(onFulfilled, onRejected);
      },
    };
    return c;
  }
  const db = {
    select: () => {
      state.selects += 1;
      return chain();
    },
  };
  return { db, state };
});
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const bus = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("@/lib/realtime/bus", () => bus);

const notifications = vi.hoisted(() => ({ notifyUser: vi.fn(async () => {}) }));
vi.mock("@/lib/modules/notifications/service", () => notifications);

const logger = vi.hoisted(() => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/infrastructure/logger", () => logger);

const TAX_NAMES = { ru: "Налог", en: "Tax", uk: "Податок" };

function row(over: Partial<IeeDecisionRow> = {}): IeeDecisionRow {
  return {
    id: "d-1",
    seasonId: "season-1",
    playerId: "sp-1",
    kind: "victim_choice",
    status: "pending",
    instanceId: "inst-tax",
    revisionId: "rev-tax",
    ruleIndex: 0,
    options: [{ id: "discard", kind: "discard", params: { count: 1, among: ["boots", "salve"] } }],
    defaultChoice: { option: "discard", picks: ["boots"] },
    context: { key: "tax", names: TAX_NAMES, then: "discard", count: 1, orKeep: false, rule: "commonest", reveal: true },
    choice: null,
    resolvedByUserId: null,
    causeJournalId: 7,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    resolvedAt: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbFake.state.results.length = 0;
  dbFake.state.selects = 0;
});

describe("decisionView — a pending question as the screens show it", () => {
  it("reads the entry that asked, what is asked, the options and the default", () => {
    expect(decisionView(row())).toEqual({
      id: "d-1",
      kind: "victim_choice",
      seasonPlayerId: "sp-1",
      key: "tax",
      name: TAX_NAMES,
      revisionId: "rev-tax",
      then: "discard",
      count: 1,
      orKeep: false,
      options: [{ id: "discard", kind: "discard", params: { count: 1, among: ["boots", "salve"] } }],
      defaultChoice: { option: "discard", picks: ["boots"] },
      createdAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("keeps a limit's question, two to give with a way out, and fills what an old row lacks", () => {
    expect(decisionView(row({ context: { key: "greed", then: "retain", count: 2, orKeep: true } }))).toMatchObject({
      key: "greed",
      name: { ru: "greed", en: "greed", uk: "greed" },
      then: "retain",
      count: 2,
      orKeep: true,
    });
    expect(decisionView(row({ context: {}, defaultChoice: null as unknown as IeeDecisionRow["defaultChoice"] }))).toMatchObject({
      key: "",
      then: "discard",
      count: 1,
      orKeep: false,
      defaultChoice: { option: "discard" },
    });
  });

  it("is no victim's question for a reaction window", () => {
    expect(decisionView(row({ kind: "reaction_window" }))).toBeNull();
  });
});

describe("the reads", () => {
  it("finds one question by id, whatever its state, and nothing for an unknown one", async () => {
    dbFake.state.results.push([row({ status: "judged" })], []);
    expect(await getDecisionRow("d-1")).toMatchObject({ id: "d-1", status: "judged" });
    expect(await getDecisionRow("d-404")).toBeNull();
  });

  it("tells whether a participant has a question waiting — of a kind, or any", async () => {
    dbFake.state.results.push([row()], [row()], [row()], []);
    expect(await listPendingDecisions("sp-1")).toHaveLength(1);
    expect(await hasPendingDecision("sp-1")).toBe(true);
    expect(await hasPendingDecision("sp-1", "reaction_window")).toBe(false);
    expect(await hasPendingDecision("sp-2")).toBe(false);
  });

  it("lists what a judge may answer, with who waits, and skips what is no victim's question", async () => {
    const seen = new Date("2026-10-20T09:00:00Z");
    const person = { seasonTitle: "Season 1", userId: "user-1", username: "ada", displayName: "Ada", avatarUrl: null, lastSeenAt: seen };
    dbFake.state.results.push([
      { decision: row(), ...person },
      { decision: row({ id: "d-2", kind: "reaction_window" }), ...person },
    ]);
    const listed = await listPendingDecisionsForStaff();
    expect(listed).toEqual([
      {
        view: expect.objectContaining({ id: "d-1", key: "tax" }),
        seasonId: "season-1",
        seasonTitle: "Season 1",
        userId: "user-1",
        username: "ada",
        displayName: "Ada",
        avatarUrl: null,
        lastSeenAt: seen,
      },
    ]);
    dbFake.state.results.push([{ decision: row(), ...person }, { decision: row({ id: "d-3" }), ...person }]);
    expect(await countPendingDecisions()).toBe(2);
  });
});

describe("reaction windows — a turn paused for the player (spec §7.4)", () => {
  const window = (over: Partial<IeeDecisionRow> = {}) =>
    row({
      id: "w-1",
      kind: "reaction_window",
      instanceId: null,
      revisionId: null,
      options: [{ id: "accept", kind: "accept", params: {} }, { id: "react", kind: "react", params: { among: ["coin-1"] } }],
      defaultChoice: { option: "accept" },
      context: {
        rollId: "roll-1",
        outcome: "dropped",
        view: { faces: [6, 5], throws: [[6, 5]], dice: { count: 2, sides: 6 }, result: 11, from: 20, to: 9, cellType: "penalty" },
        offers: [{ instanceId: "coin-1", key: "lucky_coin", rules: { reroll: true } }],
        draws: { dice: [0.9, 0.7], hooks: [], diceAt: 2, hooksAt: 0 },
      },
      ...over,
    });

  it("shows the throw, the move as it stands and what it offers — never the draws", () => {
    expect(reactionWindowView(window())).toEqual({
      id: "w-1",
      seasonPlayerId: "sp-1",
      outcome: "dropped",
      faces: [6, 5],
      result: 11,
      from: 20,
      to: 9,
      offers: [{ instanceId: "coin-1", key: "lucky_coin" }],
      createdAt: "2026-10-20T10:00:00.000Z",
    });
    expect(reactionWindowView(row())).toBeNull();
    expect(decisionView(window())).toBeNull();
  });

  it("a judge's list holds the windows, the choices list the choices, the counter both", async () => {
    const person = { seasonTitle: "Season 1", userId: "user-1", username: "ada", displayName: null, avatarUrl: null, lastSeenAt: null };
    dbFake.state.results.push([{ decision: window(), ...person }, { decision: row(), ...person }]);
    expect((await listPendingReactionsForStaff()).map((r) => [r.view.id, r.username])).toEqual([["w-1", "ada"]]);
    dbFake.state.results.push([{ decision: window(), ...person }, { decision: row(), ...person }]);
    expect((await listPendingDecisionsForStaff()).map((r) => r.view.id)).toEqual(["d-1"]);
    dbFake.state.results.push([{ decision: window(), ...person }, { decision: row(), ...person }]);
    expect(await countPendingDecisions()).toBe(2);
  });
});

describe("announceDecisions — after the commit (spec §7.6)", () => {
  const who = { id: "sp-1", userId: "user-1", seasonId: "season-1", slug: "s1", title: "Season 1" };

  it("reads nothing when nothing changed", async () => {
    await announceDecisions([]);
    expect(dbFake.state.selects).toBe(0);
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it("refreshes the player's page, and a new question also sends them a notification", async () => {
    dbFake.state.results.push([who]);
    await announceDecisions([
      { decisionId: "d-1", playerId: "sp-1", kind: "victim_choice", status: "pending" },
      { decisionId: "d-0", playerId: "sp-1", kind: "victim_choice", status: "defaulted" },
    ]);
    expect(bus.publish).toHaveBeenCalledTimes(2);
    expect(bus.publish).toHaveBeenCalledWith(userRoom("user-1"), "decisions:update", {
      decisionId: "d-1",
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      kind: "victim_choice",
      status: "pending",
    });
    expect(bus.publish).toHaveBeenCalledWith(userRoom("user-1"), "decisions:update", expect.objectContaining({ decisionId: "d-0", status: "defaulted" }));
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUser).toHaveBeenCalledWith("user-1", "decision_opened", {
      seasonId: "season-1",
      seasonSlug: "s1",
      seasonTitle: "Season 1",
      seasonPlayerId: "sp-1",
      requestId: "d-1",
    });
  });

  it("sends no notification for a reaction window, and nothing for a participant it cannot find", async () => {
    dbFake.state.results.push([who]);
    await announceDecisions([
      { decisionId: "d-5", playerId: "sp-1", kind: "reaction_window", status: "pending" },
      { decisionId: "d-6", playerId: "sp-gone", kind: "victim_choice", status: "pending" },
    ]);
    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledWith(userRoom("user-1"), "decisions:update", expect.objectContaining({ decisionId: "d-5" }));
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it("never fails the write it follows: a failure is logged and swallowed", async () => {
    dbFake.state.results.push(new Error("connection reset"));
    await expect(announceDecisions([{ decisionId: "d-1", playerId: "sp-1", kind: "victim_choice", status: "pending" }])).resolves.toBeUndefined();
    expect(logger.log.warn).toHaveBeenCalledWith("iee.decisions.announce.failed", expect.objectContaining({ err: expect.any(Error) }));
    notifications.notifyUser.mockRejectedValueOnce(new Error("mail down"));
    dbFake.state.results.push([who]);
    await expect(announceDecisions([{ decisionId: "d-1", playerId: "sp-1", kind: "victim_choice", status: "pending" }])).resolves.toBeUndefined();
    expect(logger.log.warn).toHaveBeenCalledTimes(2);
  });
});
