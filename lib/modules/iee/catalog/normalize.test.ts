import { describe, expect, it } from "vitest";

import { defaultCatalogEntry, type SeasonCatalogEntry } from "@/lib/engine";
import { CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";

import { coreLibrary, withNewRevision } from "./fixtures.test-helpers";
import type { CatalogEntryOption } from "./library";
import { catalogDiff, isEmptyDiff, normalizeCatalog } from "./normalize";

const LIBRARY = coreLibrary();
const id = (slug: CoreKey) => CORE_ENTRY_IDS[slug];
const optionOf = (library: readonly CatalogEntryOption[], slug: string) => library.find((e) => e.slug === slug)!;

/** A row for a library entry at its latest revision, tuned by `over`. */
function row(slug: CoreKey, over: Partial<SeasonCatalogEntry> = {}, library = LIBRARY): SeasonCatalogEntry {
  const entry = optionOf(library, slug);
  const doc = entry.revisions.find((r) => r.revisionId === entry.latestRevisionId)!.doc!;
  return defaultCatalogEntry({ entryId: entry.entryId, revisionId: entry.latestRevisionId, character: doc.character, rarity: doc.rarity }, over);
}

/** The library with one entry changed. */
const change = (library: readonly CatalogEntryOption[], slug: string, fn: (e: CatalogEntryOption) => CatalogEntryOption) =>
  library.map((e) => (e.slug === slug ? fn(e) : e));

/** The library where `slug`'s revisions reference `refs` (normalize reads references, not rules). */
const referencing = (library: readonly CatalogEntryOption[], slug: string, refs: string[]) =>
  change(library, slug, (e) => ({ ...e, revisions: e.revisions.map((r) => ({ ...r, references: refs })) }));

const OTHER_PACK = { id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f", slug: "fan", names: { ru: "Фан" }, isSystem: false };

/** An entry of another pack that shares `slug` with a core entry. */
function lookalike(slug: CoreKey): CatalogEntryOption {
  const core = optionOf(LIBRARY, slug);
  const entryId = "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e";
  const revisionId = "2e2e2e2e-2e2e-5e2e-8e2e-2e2e2e2e2e2e";
  return {
    ...core,
    entryId,
    pack: OTHER_PACK,
    latestRevisionId: revisionId,
    revisions: [{ ...core.revisions[0]!, entryId, revisionId, references: [] }],
  };
}

const failure = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error as { code: string; params: Record<string, string> };
  }
  throw new Error("expected a refusal");
};

describe("normalizeCatalog — what the wizard may store", () => {
  it("accepts an empty catalog — a season may play nothing", () => {
    expect(normalizeCatalog([], LIBRARY, [])).toEqual({ rows: [], dependencies: [] });
  });

  it("keeps the rows as tuned", () => {
    const rows = [row("swamp", { weight: 3, paramOverrides: { steps: -2 }, rarity: "epic" }), row("ward", { pool: "penalty" })];
    expect(normalizeCatalog(rows, LIBRARY, [])).toEqual({ rows, dependencies: [] });
  });

  it("refuses a malformed submission with the first problem's path", () => {
    expect(failure(() => normalizeCatalog("nope", LIBRARY, []))).toMatchObject({
      code: "ieeCatalogInvalid",
      params: { reason: expect.stringMatching(/^\(root\): /) },
    });
    expect(failure(() => normalizeCatalog([{ ...row("swamp"), weight: -1 }], LIBRARY, []))).toMatchObject({
      code: "ieeCatalogInvalid",
      params: { reason: expect.stringMatching(/^0\.weight: /) },
    });
    expect(failure(() => normalizeCatalog([{ ...row("swamp"), extra: 1 }], LIBRARY, [])).code).toBe("ieeCatalogInvalid");
  });

  it("refuses an entry the library does not hold", () => {
    expect(failure(() => normalizeCatalog([{ ...row("swamp"), entryId: "9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a" }], LIBRARY, [])).code).toBe(
      "ieeEntryNotFound",
    );
  });

  it("refuses the same entry twice", () => {
    expect(failure(() => normalizeCatalog([row("swamp"), row("swamp", { weight: 1 })], LIBRARY, []))).toMatchObject({
      code: "ieeCatalogInvalid",
      params: { reason: "swamp appears twice" },
    });
  });

  it("refuses a revision of another entry, or one that no longer reads", () => {
    const foreign = { ...row("swamp"), revisionId: row("toll").revisionId };
    expect(failure(() => normalizeCatalog([foreign], LIBRARY, [])).params.reason).toBe("swamp: the revision is not this entry's");
    const broken = change(LIBRARY, "swamp", (e) => ({ ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) }));
    expect(failure(() => normalizeCatalog([row("swamp")], broken, [])).params.reason).toBe("swamp: revision 1 no longer reads");
  });

  it("refuses to attach an entry the library no longer offers, but keeps one the season already plays", () => {
    const archived = change(LIBRARY, "toll", (e) => ({ ...e, available: false }));
    expect(failure(() => normalizeCatalog([row("toll")], archived, []))).toMatchObject({
      code: "ieeCatalogUnavailable",
      params: { slug: "toll" },
    });
    expect(normalizeCatalog([row("toll")], archived, [row("toll")]).rows).toHaveLength(1);
  });

  it("pins any revision of an entry, not only the latest", () => {
    const library = withNewRevision(LIBRARY, "swamp", (doc) => {
      doc.rarity = "rare";
    });
    const older = row("swamp", { revisionId: optionOf(library, "swamp").revisions[0]!.revisionId }, library);
    expect(normalizeCatalog([older], library, []).rows[0]!.revisionId).toBe(optionOf(LIBRARY, "swamp").latestRevisionId);
  });
});

describe("normalizeCatalog — what an attached entry hands out comes along", () => {
  it("attaches what an entry references, disabled, at its latest revision", () => {
    const { rows, dependencies } = normalizeCatalog([row("hex_scroll")], LIBRARY, []);
    expect(dependencies).toEqual([id("swamp")]);
    expect(rows.map((r) => r.entryId)).toEqual([id("hex_scroll"), id("swamp")]);
    expect(rows[1]).toEqual(row("swamp", { enabled: false }));
  });

  it("leaves a referenced entry the season attaches as it is", () => {
    const swamp = row("swamp", { weight: 5 });
    expect(normalizeCatalog([row("hex_scroll"), swamp], LIBRARY, [])).toEqual({ rows: [row("hex_scroll"), swamp], dependencies: [] });
  });

  it("follows references through what it attaches", () => {
    const chained = referencing(LIBRARY, "swamp", [id("toll")]);
    const { rows, dependencies } = normalizeCatalog([row("hex_scroll", {}, chained)], chained, []);
    expect(dependencies).toEqual([id("swamp"), id("toll")]);
    expect(rows.filter((r) => !r.enabled).map((r) => r.entryId)).toEqual([id("swamp"), id("toll")]);
  });

  it("stops at an entry already attached, so a cycle ends", () => {
    const cycle = referencing(referencing(LIBRARY, "swamp", [id("hex_scroll")]), "hex_scroll", [id("swamp")]);
    expect(normalizeCatalog([row("hex_scroll", {}, cycle)], cycle, []).rows).toHaveLength(2);
  });

  it("refuses a reference the library cannot attach", () => {
    const ghost = "7c7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c";
    expect(failure(() => normalizeCatalog([row("ward")], referencing(LIBRARY, "ward", [ghost]), []))).toMatchObject({
      code: "ieeCatalogMissingDependency",
      params: { slug: ghost, by: "ward" },
    });
    const archived = change(LIBRARY, "swamp", (e) => ({ ...e, available: false }));
    expect(failure(() => normalizeCatalog([row("hex_scroll")], archived, []))).toMatchObject({
      code: "ieeCatalogMissingDependency",
      params: { slug: "swamp", by: "hex_scroll" },
    });
    const unreadable = change(LIBRARY, "swamp", (e) => ({ ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) }));
    expect(failure(() => normalizeCatalog([row("hex_scroll")], unreadable, [])).code).toBe("ieeCatalogMissingDependency");
  });

  it("attaches an archived reference the season already plays", () => {
    const archived = change(LIBRARY, "swamp", (e) => ({ ...e, available: false }));
    const { dependencies } = normalizeCatalog([row("hex_scroll")], archived, [row("swamp")]);
    expect(dependencies).toEqual([id("swamp")]);
  });
});

describe("normalizeCatalog — what live instances hold keeps working", () => {
  const scroll = optionOf(LIBRARY, "hex_scroll").latestRevisionId;

  it("keeps attached, disabled, what a held revision hands out", () => {
    const { rows, dependencies } = normalizeCatalog([row("ward")], LIBRARY, [], { heldRevisions: [scroll] });
    expect(dependencies).toEqual([id("swamp")]);
    expect(rows.find((r) => r.entryId === id("swamp"))?.enabled).toBe(false);
  });

  it("keeps it even when its pack was archived since, and skips what the library cannot read", () => {
    const archived = change(LIBRARY, "swamp", (e) => ({ ...e, available: false }));
    expect(normalizeCatalog([], archived, [], { heldRevisions: [scroll] }).dependencies).toEqual([id("swamp")]);
    const unreadable = change(LIBRARY, "swamp", (e) => ({ ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) }));
    expect(normalizeCatalog([], unreadable, [], { heldRevisions: [scroll] }).dependencies).toEqual([]);
  });

  it("ignores a revision the library does not know and what the season attaches already", () => {
    expect(normalizeCatalog([row("swamp")], LIBRARY, [], { heldRevisions: ["nope", scroll] })).toEqual({
      rows: [row("swamp")],
      dependencies: [],
    });
  });
});

describe("normalizeCatalog — keys the season hands out by key (challenge rewards)", () => {
  it("attaches an entry with each key, disabled, and what it references", () => {
    const { rows, dependencies } = normalizeCatalog([], LIBRARY, [], { requiredSlugs: ["hex_scroll", "ward"] });
    expect(dependencies).toEqual([id("hex_scroll"), id("ward"), id("swamp")]);
    expect(rows.every((r) => !r.enabled)).toBe(true);
  });

  it("does nothing for a key the season attaches already, or one the library does not offer", () => {
    expect(normalizeCatalog([row("ward")], LIBRARY, [], { requiredSlugs: ["ward", "no_such_key"] })).toEqual({
      rows: [row("ward")],
      dependencies: [],
    });
  });

  it("prefers the system pack's entry, and skips what the library no longer offers", () => {
    const library = [lookalike("ward"), ...LIBRARY];
    expect(normalizeCatalog([], library, [], { requiredSlugs: ["ward"] }).dependencies).toEqual([id("ward")]);
    const coreArchived = change(library, "ward", (e) => (e.pack.isSystem ? { ...e, available: false } : e));
    expect(normalizeCatalog([], coreArchived, [], { requiredSlugs: ["ward"] }).dependencies).toEqual([lookalike("ward").entryId]);
  });
});

describe("normalizeCatalog — keys are unique in a season", () => {
  it("refuses two attached entries with the same key", () => {
    const library = [...LIBRARY, lookalike("ward")];
    const twin = { ...row("ward"), entryId: lookalike("ward").entryId, revisionId: lookalike("ward").latestRevisionId };
    expect(failure(() => normalizeCatalog([row("ward"), twin], library, []))).toMatchObject({
      code: "ieeCatalogDuplicateSlug",
      params: { slug: "ward" },
    });
  });
});

describe("catalogDiff", () => {
  const before = [row("swamp"), row("ward"), row("toll", { paramOverrides: { points: 2, cells: 1 } })];

  it("is empty for the same rows, whatever the order of their parameters", () => {
    const same = [row("toll", { paramOverrides: { cells: 1, points: 2 } }), row("ward"), row("swamp")];
    const diff = catalogDiff(before, same);
    expect(diff).toEqual({ attached: [], detached: [], switched: [], retuned: [] });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it("names what was attached, detached, switched to another revision and retuned", () => {
    const switched = "5d5d5d5d-5d5d-5d5d-8d5d-5d5d5d5d5d5d";
    const after = [row("swamp", { revisionId: switched }), row("toll", { weight: 1 }), row("hex_scroll")];
    const diff = catalogDiff(before, after);
    expect(diff).toEqual({
      attached: [id("hex_scroll")],
      detached: [id("ward")],
      switched: [{ entryId: id("swamp"), from: row("swamp").revisionId, to: switched }],
      retuned: [id("toll")],
    });
    expect(isEmptyDiff(diff)).toBe(false);
  });

  it.each([
    ["enabled", { enabled: false }],
    ["pool", { pool: "bonus" as const }],
    ["rarity", { rarity: "legendary" as const }],
    ["maxPerSeason", { maxPerSeason: 1 }],
    ["maxPerPlayer", { maxPerPlayer: 1 }],
    ["cooldownRolls", { cooldownRolls: 1 }],
    ["minPosition", { minPosition: 1 }],
    ["unlockAfterMove", { unlockAfterMove: 1 }],
    ["paramOverrides", { paramOverrides: { steps: -3 } }],
    ["durationOverride", { durationOverride: 4 }],
    ["targetOverride", { targetOverride: "self" as const }],
  ])("counts a change of %s as a retune", (_field, over) => {
    expect(catalogDiff([row("swamp")], [row("swamp", over)]).retuned).toEqual([id("swamp")]);
  });
});
