/**
 * The SQL store is a list of statements; these tests pin which table each one
 * touches and what it writes. The rules on top run against the in-memory store
 * in `service.test.ts`, and the statements run for real in the stage's live
 * check.
 */
import { describe, expect, it } from "vitest";

import { seasonCatalog, type SeasonCatalogRow } from "@/db/schema";
import { defaultCatalogEntry } from "@/lib/engine";

import { fakeTx } from "./fakes.test-helpers";
import { pgSeasonCatalogStore, toCatalogEntry } from "./store";

const ENTRY = "11111111-1111-4111-8111-111111111111";
const REVISION = "22222222-2222-5222-8222-222222222222";
const ROW = defaultCatalogEntry(
  { entryId: ENTRY, revisionId: REVISION, character: "penalty", rarity: "common" },
  { weight: 7, paramOverrides: { steps: -2 }, durationOverride: 3, targetOverride: "self" },
);

const stored = (over: Partial<SeasonCatalogRow> = {}): SeasonCatalogRow =>
  ({
    seasonId: "s1",
    ...ROW,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  }) as SeasonCatalogRow;

describe("toCatalogEntry", () => {
  it("reads a stored row as the engine's catalog entry", () => {
    expect(toCatalogEntry(stored())).toEqual(ROW);
  });

  it("reads missing jsonb as no overrides", () => {
    const row = toCatalogEntry(stored({ paramOverrides: null, targetOverride: null } as unknown as Partial<SeasonCatalogRow>));
    expect(row.paramOverrides).toEqual({});
    expect(row.targetOverride).toBeNull();
  });
});

describe("pgSeasonCatalogStore", () => {
  it("reads a season's rows from the catalog", async () => {
    const { tx, calls } = fakeTx([[stored()]]);
    await expect(pgSeasonCatalogStore(tx).rows("s1")).resolves.toEqual([ROW]);
    expect(calls).toMatchObject([{ op: "select", table: seasonCatalog, where: true }]);
  });

  it("inserts rows with their season, and asks nothing for none", async () => {
    const { tx, calls } = fakeTx();
    const store = pgSeasonCatalogStore(tx);
    await store.insert("s1", []);
    expect(calls).toEqual([]);
    await store.insert("s1", [ROW]);
    expect(calls).toMatchObject([{ op: "insert", table: seasonCatalog, values: [{ seasonId: "s1", ...ROW }] }]);
  });

  it("updates a row's revision and tuning in place, and stamps the change", async () => {
    const { tx, calls } = fakeTx();
    await pgSeasonCatalogStore(tx).update("s1", ROW);
    const [call] = calls;
    expect(call).toMatchObject({ op: "update", table: seasonCatalog, where: true });
    const { entryId: _entry, ...patch } = ROW;
    expect(call!.set).toEqual({ ...patch, updatedAt: expect.any(Date) });
    expect(call!.set).not.toHaveProperty("seasonId");
  });

  it("removes rows by entry, and asks nothing for none", async () => {
    const { tx, calls } = fakeTx();
    const store = pgSeasonCatalogStore(tx);
    await store.remove("s1", []);
    expect(calls).toEqual([]);
    await store.remove("s1", [ENTRY]);
    expect(calls).toMatchObject([{ op: "delete", table: seasonCatalog, where: true }]);
  });
});
