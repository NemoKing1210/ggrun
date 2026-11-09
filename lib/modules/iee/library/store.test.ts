/**
 * The SQL store is a list of statements; these tests pin which table each one
 * touches and what it writes. The rules on top run against the in-memory store
 * in `service.test.ts`, and the statements run for real in the stage's live
 * check.
 */
import { describe, expect, it } from "vitest";

import { ieeEntries, ieeEntryRevisions, ieePackDependencies, ieePacks } from "@/db/schema";

import { isActive, pgLibraryStore, type Tx } from "./store";

function fakeTx(results: unknown[][] = []) {
  const calls: { op: string; table?: unknown; values?: unknown; set?: unknown; hasWhere?: boolean }[] = [];
  const next = () => results.shift() ?? [];
  const builder = (op: string, table?: unknown) => {
    const call: (typeof calls)[number] = { op, table };
    calls.push(call);
    const chain: Record<string, unknown> = {
      values: (v: unknown) => ((call.values = v), chain),
      set: (v: unknown) => ((call.set = v), chain),
      where: () => ((call.hasWhere = true), chain),
      from: (t: unknown) => ((call.table = t), chain),
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

describe("pgLibraryStore — reads", () => {
  it("returns a row or null, from the right table", async () => {
    const pack = { id: "p" };
    const { tx, calls } = fakeTx([[pack], [], [pack]]);
    const store = pgLibraryStore(tx);
    await expect(store.pack("p")).resolves.toBe(pack);
    await expect(store.packBySlug("nope")).resolves.toBeNull();
    await expect(store.packs()).resolves.toEqual([pack]);
    expect(calls.map((c) => c.table)).toEqual([ieePacks, ieePacks, ieePacks]);
  });

  it("reads entries and revisions", async () => {
    const entry = { id: "e" };
    const revision = { id: "r" };
    const { tx, calls } = fakeTx([[entry], [], [entry], [entry], [revision], [revision], [revision]]);
    const store = pgLibraryStore(tx);
    await expect(store.entry("e")).resolves.toBe(entry);
    await expect(store.entryBySlug("p", "x")).resolves.toBeNull();
    await expect(store.entriesOfPack("p")).resolves.toEqual([entry]);
    await expect(store.entriesByIds(["e"])).resolves.toEqual([entry]);
    await expect(store.revision("r")).resolves.toBe(revision);
    await expect(store.revisionsOf("e")).resolves.toEqual([revision]);
    await expect(store.revisionsByIds(["r"])).resolves.toEqual([revision]);
    expect(calls.map((c) => c.table)).toEqual([
      ieeEntries,
      ieeEntries,
      ieeEntries,
      ieeEntries,
      ieeEntryRevisions,
      ieeEntryRevisions,
      ieeEntryRevisions,
    ]);
  });

  it("asks nothing for an empty id list", async () => {
    const { tx, calls } = fakeTx();
    const store = pgLibraryStore(tx);
    await expect(store.entriesByIds([])).resolves.toEqual([]);
    await expect(store.revisionsByIds([])).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it("lists a pack's dependencies as sorted ids", async () => {
    const { tx } = fakeTx([[{ id: "b" }, { id: "a" }]]);
    await expect(pgLibraryStore(tx).dependenciesOf("p")).resolves.toEqual(["a", "b"]);
  });
});

describe("pgLibraryStore — writes", () => {
  it("inserts packs, entries and revisions and returns what was written", async () => {
    const { tx, calls } = fakeTx([[{ id: "p" }], [{ id: "e" }], [{ id: "r" }]]);
    const store = pgLibraryStore(tx);
    await expect(store.insertPack({ slug: "x" } as never)).resolves.toEqual({ id: "p" });
    await expect(store.insertEntry({ slug: "y" } as never)).resolves.toEqual({ id: "e" });
    await expect(store.insertRevision({ number: 1 } as never)).resolves.toEqual({ id: "r" });
    expect(calls.map((c) => [c.op, c.table])).toEqual([
      ["insert", ieePacks],
      ["insert", ieeEntries],
      ["insert", ieeEntryRevisions],
    ]);
  });

  it("stamps updatedAt on every pack and entry update, guarded by id", async () => {
    const { tx, calls } = fakeTx([[{ id: "p" }], [], [{ id: "e" }]]);
    const store = pgLibraryStore(tx);
    await expect(store.updatePack("p", { slug: "z" })).resolves.toEqual({ id: "p" });
    await expect(store.updatePack("gone", { slug: "z" })).resolves.toBeNull();
    await expect(store.updateEntry("e", { draft: {} })).resolves.toEqual({ id: "e" });
    for (const call of calls) {
      expect(call).toMatchObject({ op: "update", hasWhere: true });
      expect((call.set as { updatedAt: unknown }).updatedAt).toBeInstanceOf(Date);
    }
  });

  it("replaces a pack's dependencies: delete, then insert what remains", async () => {
    const { tx, calls } = fakeTx();
    const store = pgLibraryStore(tx);
    await store.setDependencies("p", ["a", "b"]);
    await store.setDependencies("p", []);
    expect(calls.map((c) => [c.op, c.table])).toEqual([
      ["delete", ieePackDependencies],
      ["insert", ieePackDependencies],
      ["delete", ieePackDependencies],
    ]);
    expect(calls[1]!.values).toEqual([
      { packId: "p", dependsOnPackId: "a" },
      { packId: "p", dependsOnPackId: "b" },
    ]);
  });

  it("counts the packs and entries that use a file as their icon", async () => {
    const { tx, calls } = fakeTx([[{ n: 1 }], [{ n: "2" }], [], []]);
    const store = pgLibraryStore(tx);
    await expect(store.iconUsers("f1")).resolves.toBe(3);
    await expect(store.iconUsers("f2")).resolves.toBe(0);
    expect(calls.map((c) => c.table)).toEqual([ieePacks, ieeEntries, ieePacks, ieeEntries]);
  });

  it("has no way to change or remove a revision", () => {
    const store = pgLibraryStore(fakeTx().tx) as unknown as Record<string, unknown>;
    expect(Object.keys(store).filter((k) => /revision/i.test(k)).sort()).toEqual([
      "insertRevision",
      "revision",
      "revisionsByIds",
      "revisionsOf",
    ]);
  });
});

describe("isActive", () => {
  it("is false once archived", () => {
    expect(isActive({ archivedAt: null })).toBe(true);
    expect(isActive({ archivedAt: new Date(0) })).toBe(false);
  });
});
