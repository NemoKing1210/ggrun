/**
 * Test doubles for the catalog module: an in-memory store with the SQL
 * store's contract, and a Drizzle stand-in that records statements and replays
 * queued results — the SQL itself runs in the stage's live check.
 */
import type { SeasonCatalogEntry } from "@/lib/engine";

import type { SeasonCatalogStore, Tx } from "./store";

export interface MemoryCatalog {
  store: SeasonCatalogStore;
  /** Rows by season, as stored. */
  seasons: Map<string, SeasonCatalogEntry[]>;
  /** The writes, in order. */
  writes: { op: "insert" | "update" | "remove"; seasonId: string; entryIds: string[] }[];
}

export function memoryCatalog(initial: Record<string, SeasonCatalogEntry[]> = {}): MemoryCatalog {
  const seasons = new Map(Object.entries(initial).map(([id, rows]) => [id, rows.map((r) => structuredClone(r))]));
  const writes: MemoryCatalog["writes"] = [];
  const of = (seasonId: string) => seasons.get(seasonId) ?? [];
  const store: SeasonCatalogStore = {
    rows: async (seasonId) => of(seasonId).map((r) => structuredClone(r)),
    insert: async (seasonId, rows) => {
      if (rows.length === 0) return;
      const have = new Set(of(seasonId).map((r) => r.entryId));
      for (const r of rows) if (have.has(r.entryId)) throw new Error(`duplicate key (${seasonId}, ${r.entryId})`);
      seasons.set(seasonId, [...of(seasonId), ...rows.map((r) => structuredClone(r))]);
      writes.push({ op: "insert", seasonId, entryIds: rows.map((r) => r.entryId) });
    },
    update: async (seasonId, row) => {
      seasons.set(
        seasonId,
        of(seasonId).map((r) => (r.entryId === row.entryId ? structuredClone(row) : r)),
      );
      writes.push({ op: "update", seasonId, entryIds: [row.entryId] });
    },
    remove: async (seasonId, entryIds) => {
      if (entryIds.length === 0) return;
      seasons.set(
        seasonId,
        of(seasonId).filter((r) => !entryIds.includes(r.entryId)),
      );
      writes.push({ op: "remove", seasonId, entryIds: [...entryIds] });
    },
  };
  return { store, seasons, writes };
}

export interface FakeCall {
  op: "select" | "selectDistinct" | "insert" | "update" | "delete";
  table?: unknown;
  /** The selection object, when one was given. */
  fields?: Record<string, unknown>;
  joins: unknown[];
  values?: unknown;
  set?: Record<string, unknown>;
  where: boolean;
  grouped: boolean;
  ordered: boolean;
}

/** A Drizzle stand-in: each awaited statement takes the next queued result. */
export function fakeTx(results: unknown[][] = []): { tx: Tx; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const next = () => results.shift() ?? [];
  const builder = (op: FakeCall["op"], table?: unknown, fields?: Record<string, unknown>) => {
    const call: FakeCall = { op, table, fields, joins: [], where: false, grouped: false, ordered: false };
    calls.push(call);
    const chain: Record<string, unknown> = {
      from: (t: unknown) => ((call.table = t), chain),
      innerJoin: (t: unknown) => (call.joins.push(t), chain),
      where: () => ((call.where = true), chain),
      groupBy: () => ((call.grouped = true), chain),
      orderBy: () => ((call.ordered = true), chain),
      values: (v: unknown) => ((call.values = v), chain),
      set: (v: Record<string, unknown>) => ((call.set = v), chain),
      then: (ok: (rows: unknown[]) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(next()).then(ok, fail),
    };
    return chain;
  };
  const tx = {
    select: (fields?: Record<string, unknown>) => builder("select", undefined, fields),
    selectDistinct: (fields?: Record<string, unknown>) => builder("selectDistinct", undefined, fields),
    insert: (t: unknown) => builder("insert", t),
    update: (t: unknown) => builder("update", t),
    delete: (t: unknown) => builder("delete", t),
  };
  return { tx: tx as unknown as Tx, calls };
}
