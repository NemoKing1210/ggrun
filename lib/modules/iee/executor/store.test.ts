/**
 * The SQL store is a list of guarded statements; these tests pin what each
 * statement writes and that the guards are in the statement itself. The rules
 * on top are tested against the in-memory store in `executor.test.ts`, and the
 * statements run for real in the stage's live check.
 */
import { describe, expect, it } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import { ieeDecisions } from "@/db/schema";

import { pgStore, type Tx } from "./store";

const dialect = new PgDialect();

/** Records every builder call; terminal awaits resolve the queued rows. */
function fakeTx(results: unknown[][] = []) {
  const calls: { op: string; table?: unknown; values?: unknown; set?: unknown; where?: SQL }[] = [];
  const next = () => results.shift() ?? [];
  const builder = (op: string, table?: unknown) => {
    const call: (typeof calls)[number] = { op, table };
    calls.push(call);
    const chain: Record<string, unknown> = {
      values: (v: unknown) => ((call.values = v), chain),
      set: (v: unknown) => ((call.set = v), chain),
      where: (w: SQL) => ((call.where = w), chain),
      from: (t: unknown) => ((call.table = t), chain),
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      returning: () => Promise.resolve(next()),
      then: (ok: (rows: unknown[]) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(next()).then(ok, fail),
    };
    return chain;
  };
  const tx = {
    insert: (t: unknown) => builder("insert", t),
    update: (t: unknown) => builder("update", t),
    delete: (t: unknown) => builder("delete", t),
    select: () => builder("select"),
  };
  return { tx: tx as unknown as Tx, calls };
}

const whereSql = (w: SQL | undefined) => (w ? dialect.sqlToQuery(w).sql : "");

describe("pgStore", () => {
  it("journal inserts a row and returns its id", async () => {
    const { tx, calls } = fakeTx([[{ id: 42 }]]);
    const id = await pgStore(tx).journal({
      seasonId: "s",
      turnSeq: 1,
      op: "grant",
      actorPlayerId: null,
      targetPlayerId: "sp",
      actorUserId: null,
      instanceId: "i",
      revisionId: "r",
      ruleIndex: null,
      intent: {},
      outcome: {},
      rng: null,
      causeId: null,
      visibility: "staff",
    });
    expect(id).toBe(42);
    expect(calls[0]).toMatchObject({ op: "insert", values: { op: "grant", targetPlayerId: "sp" } });
  });

  it("guards every state change in its own WHERE", async () => {
    const row = { id: "i", status: "active" };
    const { tx, calls } = fakeTx([[row], [row], [row], [], [], []]);
    const store = pgStore(tx);
    expect(await store.setRemaining("i", 2)).toBe(row);
    expect(await store.spendCharge("i")).toBe(row);
    expect(await store.end("i", "cleansed")).toBe(row);
    expect(await store.setRemaining("i", 1)).toBeNull();
    expect(await store.spendCharge("i")).toBeNull();
    expect(await store.end("i", "used")).toBeNull();

    const [remaining, charge, end] = calls;
    expect(remaining!.set).toEqual({ remaining: 2 });
    expect(whereSql(remaining!.where)).toContain('"status" = $');
    expect(whereSql(charge!.where)).toMatch(/"status" = \$\d+ and "iee_instances"\."charges_left" > \$\d+/);
    expect(end!.set).toMatchObject({ status: "ended", endReason: "cleansed" });
    expect(whereSql(end!.where)).toContain('"status" = $');
  });

  it("renews a counter — what is left and the roll it counts from — on an active instance only", async () => {
    const row = { id: "i", status: "active" };
    const { tx, calls } = fakeTx([[row], []]);
    const store = pgStore(tx);
    expect(await store.renew("i", { remaining: 2, countFromRollSeq: 6 })).toBe(row);
    expect(await store.renew("i", { remaining: 2, countFromRollSeq: 6 })).toBeNull();
    expect(calls[0]).toMatchObject({ op: "update", set: { remaining: 2, countFromRollSeq: 6 } });
    expect(whereSql(calls[0]!.where)).toContain('"status" = $');
  });

  it("points an active effect at another player, guarded like every change (spec §6.11)", async () => {
    const { tx, calls } = fakeTx([[]]);
    await pgStore(tx).aim("i", "sp-2");
    expect(calls[0]).toMatchObject({ op: "update", set: { aimedPlayerId: "sp-2" } });
    expect(whereSql(calls[0]!.where)).toContain('"status" = $');
  });

  it("reads a holder's active instances and single rows", async () => {
    const { tx, calls } = fakeTx([[{ id: "a" }], [{ id: "b" }], []]);
    const store = pgStore(tx);
    expect(await store.activeForHolder("sp")).toEqual([{ id: "a" }]);
    expect(await store.getInstance("b")).toEqual({ id: "b" });
    expect(await store.getInstance("zzz")).toBeNull();
    expect(whereSql(calls[0]!.where)).toMatch(/"holder_player_id" = \$\d+ and "iee_instances"\."status" = \$\d+/);
  });

  it("moves points with a ledger line and the new balance", async () => {
    const { tx, calls } = fakeTx([[{ balance: 7 }], [], [], [], []]);
    const store = pgStore(tx);
    expect(await store.balanceOf("sp")).toBe(7);
    expect(await store.balanceOf("ghost")).toBeNull();
    await store.writeBalance({ seasonPlayerId: "sp", delta: -2, reason: "item:x", balance: 5 });
    expect(calls[2]).toMatchObject({ op: "insert", values: { seasonPlayerId: "sp", delta: -2, reason: "item:x" } });
    expect(calls[3]).toMatchObject({ op: "update", set: { balancePoints: 5 } });
  });

  it("clears a season's decisions and instances before its journal, and counts the last two", async () => {
    const { tx, calls } = fakeTx([[], [{ id: "i1" }, { id: "i2" }], [{ id: 1 }]]);
    expect(await pgStore(tx).clearSeason("s")).toEqual({ instances: 2, journal: 1 });
    expect(calls.map((c) => c.op)).toEqual(["delete", "delete", "delete"]);
    expect(calls[0]!.table).toBe(ieeDecisions);
  });

  it("opens, reads and settles decisions — the guard is in the statement (spec §7.6)", async () => {
    const row = { id: "d1", status: "pending" };
    const { tx, calls } = fakeTx([[row], [row], [row], [row], [], [row], []]);
    const store = pgStore(tx);
    const input = {
      id: "d1",
      seasonId: "s",
      playerId: "sp",
      kind: "victim_choice" as const,
      instanceId: "i",
      revisionId: "r",
      ruleIndex: null,
      options: [],
      defaultChoice: {},
      context: {},
      causeJournalId: 7,
    };
    expect(await store.insertDecision(input)).toBe(row);
    expect(calls[0]).toMatchObject({ op: "insert", table: ieeDecisions, values: input });
    expect(await store.getDecision("d1")).toBe(row);
    expect(await store.pendingDecisions("sp")).toEqual([row]);
    expect(whereSql(calls[2]!.where)).toContain('"status" = $');
    expect(await store.reaskDecision("d1", { options: [1], defaultChoice: {}, context: {} })).toBe(row);
    expect(calls[3]).toMatchObject({ op: "update", set: { options: [1] } });
    expect(whereSql(calls[3]!.where)).toContain('"status" = $');
    expect(await store.reaskDecision("d1", { options: [], defaultChoice: {}, context: {} })).toBeNull();
    const settled = await store.settleDecision("d1", { status: "judged", choice: { option: "discard" }, resolvedByUserId: "u" });
    expect(settled).toBe(row);
    expect(calls[5]).toMatchObject({ op: "update", set: { status: "judged", choice: { option: "discard" }, resolvedByUserId: "u" } });
    expect((calls[5]!.set as { resolvedAt: unknown }).resolvedAt).toBeInstanceOf(Date);
    expect(whereSql(calls[5]!.where)).toContain('"status" = $');
    expect(await store.settleDecision("d1", { status: "resolved", choice: null, resolvedByUserId: null })).toBeNull();
  });

  it("lists revisions whose compile failure is already journaled", async () => {
    const { tx } = fakeTx([[{ revisionId: "r1" }, { revisionId: null }]]);
    expect(await pgStore(tx).compileFailuresJournaled("s")).toEqual(new Set(["r1"]));
  });

  it("reads the season's places, moves a player out of turn and finds where their last move started", async () => {
    const { tx, calls } = fakeTx([[{ id: "a", position: 3, status: "active" }], [], [], [{ from: 7 }], []]);
    const store = pgStore(tx);
    expect(await store.places("s")).toEqual([{ id: "a", position: 3, status: "active" }]);
    expect(whereSql(calls[0]!.where)).toContain('"season_id" = $');

    await store.setPosition("a", 5, false);
    expect(calls[1]).toMatchObject({ op: "update", set: { position: 5 } });
    expect(calls[1]!.set).not.toHaveProperty("status");
    await store.setPosition("a", 39, true);
    expect(calls[2]).toMatchObject({ op: "update", set: { position: 39, status: "finished" } });
    expect((calls[2]!.set as { finishedAt: unknown }).finishedAt).toBeInstanceOf(Date);
    expect(whereSql(calls[2]!.where)).toContain('"id" = $');

    expect(await store.lastMoveStart("a")).toBe(7);
    expect(await store.lastMoveStart("b")).toBeNull();
    expect(whereSql(calls[3]!.where)).toContain('"season_player_id" = $');
  });

  it("hands an active instance a player holds to another, its counter anew, guarded (spec §6.12)", async () => {
    const row = { id: "i", status: "active" };
    const { tx, calls } = fakeTx([[row], [], [{ username: "bob" }], []]);
    const store = pgStore(tx);
    expect(await store.rehome("i", "sp-2", 7)).toBe(row);
    expect(await store.rehome("i", "sp-2", null)).toBeNull();
    expect(calls[0]).toMatchObject({ op: "update", set: { holderPlayerId: "sp-2", anchorRollSeq: 7, countFromRollSeq: null } });
    expect(whereSql(calls[0]!.where)).toMatch(/"status" = \$\d+ and "iee_instances"\."holder_kind" = \$\d+/);
    expect(await store.nameOf("sp-2")).toBe("bob");
    expect(await store.nameOf("ghost")).toBeNull();
  });

  it("inserts an instance and returns it", async () => {
    const { tx, calls } = fakeTx([[{ id: "i" }]]);
    const row = await pgStore(tx).insertInstance({
      id: "i",
      seasonId: "s",
      entryId: "e",
      revisionId: "r",
      kind: "effect",
      holderKind: "player",
      holderPlayerId: "sp",
      ownerPlayerId: null,
      params: {},
      chargesLeft: null,
      remaining: 2,
      remainingUnit: "rolls",
      anchorRollSeq: 4,
      source: "cell_penalty",
      sourceMoveId: null,
      causeJournalId: 1,
      grantedRollSeq: 0,
    });
    expect(row).toEqual({ id: "i" });
    expect(calls[0]).toMatchObject({ op: "insert", values: { remaining: 2, anchorRollSeq: 4 } });
  });
});
