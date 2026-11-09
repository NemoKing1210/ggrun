import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultCatalogEntry, type SeasonCatalogEntry } from "@/lib/engine";
import { CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";

import { memoryCatalog } from "./fakes.test-helpers";
import { coreLibrary } from "./fixtures.test-helpers";
import type { Tx } from "./store";

const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => audit);

const reads = vi.hoisted(() => ({ heldRevisionIds: vi.fn() }));
vi.mock("./repository", () => reads);

const { applyCatalog, auditCatalogSave, saveSeasonCatalog } = await import("./service");

const LIBRARY = coreLibrary();
const id = (slug: CoreKey) => CORE_ENTRY_IDS[slug];
const NO_TX = null as unknown as Tx;

function row(slug: CoreKey, over: Partial<SeasonCatalogEntry> = {}): SeasonCatalogEntry {
  const entry = LIBRARY.find((e) => e.slug === slug)!;
  const doc = entry.revisions[0]!.doc!;
  return defaultCatalogEntry({ entryId: entry.entryId, revisionId: entry.latestRevisionId, character: doc.character, rarity: doc.rarity }, over);
}

beforeEach(() => {
  audit.logAdminAction.mockReset();
  audit.logAdminAction.mockResolvedValue(undefined);
  reads.heldRevisionIds.mockReset();
  reads.heldRevisionIds.mockResolvedValue([]);
});

describe("applyCatalog — writes only the difference", () => {
  it("removes, updates and inserts what changed, and leaves the rest alone", async () => {
    const before = [row("swamp"), row("ward"), row("toll")];
    const mem = memoryCatalog({ s1: before });
    const next = [row("swamp"), row("ward", { weight: 1 }), row("hex_scroll")];

    const diff = await applyCatalog(mem.store, "s1", before, next);

    expect(diff).toEqual({ attached: [id("hex_scroll")], detached: [id("toll")], switched: [], retuned: [id("ward")] });
    expect(mem.writes).toEqual([
      { op: "remove", seasonId: "s1", entryIds: [id("toll")] },
      { op: "update", seasonId: "s1", entryIds: [id("ward")] },
      { op: "insert", seasonId: "s1", entryIds: [id("hex_scroll")] },
    ]);
    expect(mem.seasons.get("s1")!.map((r) => [r.entryId, r.weight])).toEqual([
      [id("swamp"), 100],
      [id("ward"), 1],
      [id("hex_scroll"), 100],
    ]);
  });

  it("updates a switched revision once, even when it was retuned too", async () => {
    const before = [row("swamp")];
    const mem = memoryCatalog({ s1: before });
    const other = "5d5d5d5d-5d5d-5d5d-8d5d-5d5d5d5d5d5d";
    await applyCatalog(mem.store, "s1", before, [row("swamp", { revisionId: other, weight: 2 })]);
    expect(mem.writes).toEqual([{ op: "update", seasonId: "s1", entryIds: [id("swamp")] }]);
    expect(mem.seasons.get("s1")![0]).toMatchObject({ revisionId: other, weight: 2 });
  });

  it("writes nothing when nothing changed", async () => {
    const rows = [row("swamp")];
    const mem = memoryCatalog({ s1: rows });
    await applyCatalog(mem.store, "s1", rows, rows);
    expect(mem.writes).toEqual([]);
  });
});

describe("saveSeasonCatalog", () => {
  it("checks the submission, closes it over references and stores it", async () => {
    const mem = memoryCatalog({ s1: [row("ward")] });
    const save = await saveSeasonCatalog(NO_TX, "s1", [row("hex_scroll")], { library: LIBRARY, store: mem.store });

    expect(save.diff).toEqual({ attached: [id("hex_scroll"), id("swamp")], detached: [id("ward")], switched: [], retuned: [] });
    expect(save.dependencies).toEqual([id("swamp")]);
    expect(save.slugs[id("swamp")]).toBe("swamp");
    expect(mem.seasons.get("s1")!.map((r) => [r.entryId, r.enabled])).toEqual([
      [id("hex_scroll"), true],
      [id("swamp"), false],
    ]);
  });

  it("keeps what the revisions live instances hold hand out, read from the season", async () => {
    const scroll = LIBRARY.find((e) => e.slug === "hex_scroll")!;
    reads.heldRevisionIds.mockResolvedValue([scroll.latestRevisionId]);
    const mem = memoryCatalog();
    const save = await saveSeasonCatalog(NO_TX, "s1", [row("ward")], { library: LIBRARY, store: mem.store });
    expect(reads.heldRevisionIds).toHaveBeenCalledWith("s1", NO_TX);
    expect(save.dependencies).toEqual([id("swamp")]);
    // Given explicitly, the season is not asked.
    reads.heldRevisionIds.mockClear();
    await saveSeasonCatalog(NO_TX, "s2", [], { library: LIBRARY, store: mem.store, heldRevisions: [] });
    expect(reads.heldRevisionIds).not.toHaveBeenCalled();
  });

  it("attaches what the season's challenges hand out", async () => {
    const mem = memoryCatalog();
    const save = await saveSeasonCatalog(NO_TX, "s1", [], { library: LIBRARY, store: mem.store, requiredSlugs: ["ward"] });
    expect(save.dependencies).toEqual([id("ward")]);
    expect(mem.seasons.get("s1")).toEqual([row("ward", { enabled: false })]);
  });

  it("stores nothing when the submission is refused", async () => {
    const mem = memoryCatalog({ s1: [row("ward")] });
    await expect(saveSeasonCatalog(NO_TX, "s1", [row("ward"), row("ward")], { library: LIBRARY, store: mem.store })).rejects.toMatchObject({
      code: "ieeCatalogInvalid",
    });
    expect(mem.writes).toEqual([]);
  });

  it("keeps an archived entry the season already plays", async () => {
    const archived = LIBRARY.map((e) => (e.slug === "ward" ? { ...e, available: false } : e));
    const mem = memoryCatalog({ s1: [row("ward")] });
    const save = await saveSeasonCatalog(NO_TX, "s1", [row("ward", { weight: 5 })], { library: archived, store: mem.store });
    expect(save.diff.retuned).toEqual([id("ward")]);
  });
});

describe("auditCatalogSave", () => {
  it("records what changed, by slug", async () => {
    const mem = memoryCatalog({ s1: [row("ward"), row("swamp")] });
    const save = await saveSeasonCatalog(NO_TX, "s1", [row("hex_scroll"), row("ward", { weight: 2 })], {
      library: LIBRARY,
      store: mem.store,
    });
    await auditCatalogSave("admin-1", "s1", save);
    expect(audit.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "season_catalog_updated",
      targetType: "season",
      targetId: "s1",
      payload: {
        attached: ["hex_scroll"],
        detached: [],
        switched: [],
        // The submission left swamp out; it stays as hex_scroll's dependency, switched off.
        retuned: ["ward", "swamp"],
        dependencies: ["swamp"],
      },
    });
  });

  it("names a switched revision by its entry, and falls back to the id for an entry the library lost", async () => {
    await auditCatalogSave("admin-1", "s1", {
      diff: { attached: [], detached: ["gone-id"], switched: [{ entryId: id("swamp"), from: "a", to: "b" }], retuned: [] },
      dependencies: [],
      slugs: { [id("swamp")]: "swamp" },
    });
    expect(audit.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ detached: ["gone-id"], switched: ["swamp"] }) }),
    );
  });

  it("writes nothing when nothing changed", async () => {
    await auditCatalogSave("admin-1", "s1", {
      diff: { attached: [], detached: [], switched: [], retuned: [] },
      dependencies: [],
      slugs: {},
    });
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });
});
