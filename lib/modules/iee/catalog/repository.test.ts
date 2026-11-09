import { describe, expect, it } from "vitest";

import { files, ieeEntries, ieeEntryRevisions, ieeInstances, ieePacks, seasonCatalog, type SeasonCatalogRow } from "@/db/schema";
import { defaultCatalogEntry, NO_ART } from "@/lib/engine";

import { fakeTx } from "./fakes.test-helpers";
import { catalogUsageByEntry, heldRevisionIds, loadPlaySet } from "./repository";

const ROW = defaultCatalogEntry({
  entryId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-5222-8222-222222222222",
  character: "penalty",
  rarity: "common",
});
const STORED = { seasonId: "s1", ...ROW, createdAt: new Date(0), updatedAt: new Date(0) } as unknown as SeasonCatalogRow;

describe("loadPlaySet — what a season's registry compiles", () => {
  it("reads the catalog with its revisions' documents, then the revisions only live instances hold", async () => {
    const doc = { slug: "swamp" };
    const held = { entryId: ROW.entryId, revisionId: "33333333-3333-5333-8333-333333333333", doc: { slug: "swamp", old: true } };
    const art = { entryId: ROW.entryId, entryIconFileId: "f1", packIconFileId: null, system: false };
    const icon = { id: "f1", key: "iee_icon/2026/10/0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b.webp", visibility: "public" };
    const { tx, calls } = fakeTx([[{ row: STORED, doc }], [held], [art], [icon]]);

    await expect(loadPlaySet("s1", tx)).resolves.toEqual({
      catalog: [{ row: ROW, doc }],
      held: [held],
      art: { [ROW.entryId]: { iconUrl: `/api/files?key=${encodeURIComponent(icon.key)}`, packIconUrl: null, system: false } },
    });

    expect(calls).toMatchObject([
      { op: "select", table: seasonCatalog, joins: [ieeEntryRevisions], where: true },
      { op: "selectDistinct", table: ieeInstances, joins: [ieeEntryRevisions], where: true },
      { op: "select", table: ieeEntries, joins: [ieePacks], where: true },
      { op: "select", table: files, where: true },
    ]);
    expect(Object.keys(calls[1]!.fields!)).toEqual(["entryId", "revisionId", "doc"]);
  });

  it("still reads held revisions for a season with an empty catalog, and draws an unknown entry plainly", async () => {
    const held = { entryId: ROW.entryId, revisionId: ROW.revisionId, doc: {} };
    const { tx, calls } = fakeTx([[], [held], []]);
    await expect(loadPlaySet("s1", tx)).resolves.toEqual({ catalog: [], held: [held], art: { [ROW.entryId]: NO_ART } });
    // No icon file to look up: no fourth read.
    expect(calls).toHaveLength(3);
  });

  it("asks nothing about art for a season with nothing to play", async () => {
    const { tx, calls } = fakeTx([[], []]);
    await expect(loadPlaySet("s1", tx)).resolves.toEqual({ catalog: [], held: [], art: {} });
    expect(calls).toHaveLength(2);
  });
});

describe("heldRevisionIds", () => {
  it("lists the revisions a season's live instances hold", async () => {
    const { tx, calls } = fakeTx([[{ revisionId: "r1" }, { revisionId: "r2" }]]);
    await expect(heldRevisionIds("s1", tx)).resolves.toEqual(["r1", "r2"]);
    expect(calls).toMatchObject([{ op: "selectDistinct", table: ieeInstances, where: true }]);
  });
});

describe("catalogUsageByEntry", () => {
  it("counts the seasons that attach each entry", async () => {
    const { tx, calls } = fakeTx([[{ entryId: "a", n: 2 }, { entryId: "b", n: "1" }]]);
    await expect(catalogUsageByEntry(tx)).resolves.toEqual({ a: 2, b: 1 });
    expect(calls).toMatchObject([{ op: "select", table: seasonCatalog, grouped: true }]);
  });
});
