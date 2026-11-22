import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultCatalogEntry } from "@/lib/engine";
import { CORE_DOCS, CORE_ENTRY_IDS } from "@/lib/engine/iee/core-docs";

import { coreLibrary } from "./fixtures.test-helpers";

const reads = vi.hoisted(() => ({ loadCatalogLibrary: vi.fn(), rows: vi.fn() }));
vi.mock("./library", () => ({ loadCatalogLibrary: reads.loadCatalogLibrary }));
vi.mock("./store", () => ({ pgSeasonCatalogStore: () => ({ rows: reads.rows }) }));

const { catalogEditor, libraryKeys, libraryViews } = await import("./editor");

const LIBRARY = coreLibrary();
/** ward's pack was archived after the season attached it; toll's too, but the season never did. */
const ARCHIVED = LIBRARY.map((e) => (e.slug === "ward" || e.slug === "toll" ? { ...e, available: false } : e));
const WARD = LIBRARY.find((e) => e.slug === "ward")!;
const WARD_ROW = defaultCatalogEntry({ entryId: WARD.entryId, revisionId: WARD.latestRevisionId, character: "bonus", rarity: "rare" });

beforeEach(() => {
  reads.loadCatalogLibrary.mockReset();
  reads.rows.mockReset();
  reads.loadCatalogLibrary.mockResolvedValue(ARCHIVED);
  reads.rows.mockResolvedValue([WARD_ROW]);
});

describe("catalogEditor — the season wizard's IEE stage", () => {
  it("offers what the library offers and whatever the season already attaches", async () => {
    const editor = await catalogEditor("s1");
    expect(reads.rows).toHaveBeenCalledWith("s1");
    expect(editor.rows).toEqual([WARD_ROW]);
    const keys = editor.options.map((o) => o.key);
    expect(keys).toContain("ward");
    expect(keys).not.toContain("toll");
    expect(editor.options.find((o) => o.key === "ward")?.available).toBe(false);
    // Every core entry but toll, which the season never attached.
    expect(editor.options).toHaveLength(CORE_DOCS.length - 1);
  });
});

describe("library read models", () => {
  it("browses the latest revision of every entry", async () => {
    const views = await libraryViews();
    expect(views).toHaveLength(CORE_DOCS.length);
    expect(views.find((v) => v.key === "swamp")?.entryId).toBe(CORE_ENTRY_IDS.swamp);
  });

  it("lists the keys a reward may name — what the library offers", async () => {
    const keys = await libraryKeys();
    expect(Object.keys(keys.effects)).not.toContain("ward");
    expect(Object.keys(keys.items)).toContain("hex_scroll");
  });
});
