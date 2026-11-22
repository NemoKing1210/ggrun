import { describe, expect, it } from "vitest";

import { CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";

import {
  attachEntry,
  closeOver,
  detachEntry,
  indexOptions,
  isHandout,
  newRow,
  pinRevision,
  pruneOrphans,
  requiredBy,
  tuneEntry,
} from "./edit";
import { coreLibrary, withNewRevision } from "./fixtures.test-helpers";
import type { CatalogEntryOption } from "./library";
import { libraryOptions } from "./views";

const id = (slug: CoreKey) => CORE_ENTRY_IDS[slug];
const LIBRARY = coreLibrary();
const INDEX = indexOptions(libraryOptions(LIBRARY));

/** `slug`'s newest revision references `refs` instead. */
function newestReferences(library: readonly CatalogEntryOption[], slug: string, refs: string[]): CatalogEntryOption[] {
  return library.map((e) =>
    e.slug === slug ? { ...e, revisions: e.revisions.map((r, i, all) => (i === all.length - 1 ? { ...r, references: refs } : r)) } : e,
  );
}

const row = (slug: CoreKey, over = {}) => newRow(INDEX, id(slug), over)!;
const ids = (rows: readonly { entryId: string }[]) => rows.map((r) => r.entryId);

describe("newRow", () => {
  it("attaches an entry at its latest revision with its own pool and weight", () => {
    expect(row("swamp")).toMatchObject({
      entryId: id("swamp"),
      revisionId: INDEX.get(id("swamp"))!.latestRevisionId,
      enabled: true,
      pool: "penalty",
      weight: 100,
    });
    expect(row("ward", { enabled: false }).enabled).toBe(false);
  });

  it("has nothing for an unknown entry or a revision that does not compile", () => {
    expect(newRow(INDEX, "nope")).toBeNull();
    expect(newRow(INDEX, id("swamp"), { revisionId: "nope" })).toBeNull();
    const broken = indexOptions(libraryOptions(LIBRARY.map((e) => (e.slug === "swamp" ? { ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) } : e))));
    expect(newRow(broken, id("swamp"))).toBeNull();
  });
});

describe("dependencies", () => {
  it("knows which attached entries hand an entry out", () => {
    const rows = [row("hex_scroll"), row("swamp", { enabled: false }), row("ward")];
    expect(requiredBy(rows, INDEX, id("swamp"))).toEqual([id("hex_scroll")]);
    expect(requiredBy(rows, INDEX, id("ward"))).toEqual([]);
  });

  it("closes a catalog over what it hands out, disabled, and skips what the library lacks", () => {
    const closed = closeOver([row("hex_scroll"), row("jinx")], INDEX);
    expect(ids(closed)).toEqual([id("hex_scroll"), id("jinx"), id("swamp"), id("unlucky")]);
    expect(closed.slice(2).every((r) => !r.enabled)).toBe(true);
    const ghost = indexOptions(libraryOptions(newestReferences(LIBRARY, "ward", ["nope"])));
    expect(closeOver([newRow(ghost, id("ward"))!], ghost)).toHaveLength(1);
  });

  it("follows references through what it adds", () => {
    const chained = indexOptions(libraryOptions(newestReferences(LIBRARY, "swamp", [id("toll")])));
    expect(ids(closeOver([newRow(chained, id("hex_scroll"))!], chained))).toEqual([id("hex_scroll"), id("swamp"), id("toll")]);
  });

  it("detaches disabled entries nothing hands out any more, transitively, and keeps enabled ones", () => {
    const chained = indexOptions(libraryOptions(newestReferences(LIBRARY, "swamp", [id("toll")])));
    const rows = [newRow(chained, id("swamp"), { enabled: false })!, newRow(chained, id("toll"), { enabled: false })!, newRow(chained, id("ward"))!];
    expect(ids(pruneOrphans(rows, chained))).toEqual([id("ward")]);
  });
});

describe("attachEntry", () => {
  it("attaches an entry enabled, with what it hands out", () => {
    const rows = attachEntry([], INDEX, id("hex_scroll"));
    expect(rows.map((r) => [r.entryId, r.enabled])).toEqual([
      [id("hex_scroll"), true],
      [id("swamp"), false],
    ]);
  });

  it("switches on an entry attached as a dependency, keeping its tuning", () => {
    const rows = attachEntry([row("hex_scroll"), row("swamp", { enabled: false, weight: 7 })], INDEX, id("swamp"));
    expect(rows[1]).toMatchObject({ enabled: true, weight: 7 });
  });

  it("applies overrides — a preset attaches at its own weight", () => {
    expect(attachEntry([], INDEX, id("ward"), { weight: 3 })[0]).toMatchObject({ weight: 3, enabled: true });
    expect(attachEntry([row("ward")], INDEX, id("ward"), { weight: 9 })[0]!.weight).toBe(9);
  });

  it("leaves the catalog alone for an entry it cannot attach", () => {
    const rows = [row("ward")];
    expect(attachEntry(rows, INDEX, "nope")).toEqual(rows);
  });
});

describe("isHandout", () => {
  it("knows an entry that plays only when handed out, by its latest revision's tag (spec §6.6)", () => {
    expect(isHandout(INDEX.get(id("magnet_pull"))!)).toBe(true);
    expect(isHandout(INDEX.get(id("magnet"))!)).toBe(false);
    // The magnet brings its pull in, switched off: it plays when handed out, never off a wheel.
    expect(attachEntry([], INDEX, id("magnet")).find((r) => r.entryId === id("magnet_pull"))).toMatchObject({ enabled: false });
    // A revision that no longer compiles has no view to say so.
    const broken = indexOptions(libraryOptions(LIBRARY.map((e) => (e.slug === "fate_roll" ? { ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) } : e))));
    expect(isHandout(broken.get(id("fate_roll"))!)).toBe(false);
  });
});

describe("detachEntry", () => {
  it("detaches an entry nothing hands out, and what only it handed out", () => {
    expect(ids(detachEntry(attachEntry([], INDEX, id("hex_scroll")), INDEX, id("hex_scroll")))).toEqual([]);
  });

  it("keeps a handed-out entry attached, disabled", () => {
    const rows = attachEntry(attachEntry([], INDEX, id("hex_scroll")), INDEX, id("swamp"));
    const after = detachEntry(rows, INDEX, id("swamp"));
    expect(after.map((r) => [r.entryId, r.enabled])).toEqual([
      [id("hex_scroll"), true],
      [id("swamp"), false],
    ]);
  });

  it("keeps a dependency the season plays on its own", () => {
    const rows = attachEntry(attachEntry([], INDEX, id("swamp")), INDEX, id("hex_scroll"));
    expect(ids(detachEntry(rows, INDEX, id("hex_scroll")))).toEqual([id("swamp")]);
  });
});

describe("pinRevision", () => {
  const library = newestReferences(
    withNewRevision(LIBRARY, "hex_scroll", (doc) => {
      doc.rarity = "rare";
    }),
    "hex_scroll",
    [id("toll")],
  );
  const index = indexOptions(libraryOptions(library));
  const [first, second] = index.get(id("hex_scroll"))!.revisions;

  it("switches the revision, and what it hands out follows", () => {
    const rows = [newRow(index, id("hex_scroll"), { revisionId: first!.revisionId })!, newRow(index, id("swamp"), { enabled: false })!];
    const pinned = pinRevision(rows, index, id("hex_scroll"), second!.revisionId);
    expect(pinned.map((r) => [r.entryId, r.revisionId === second!.revisionId, r.enabled])).toEqual([
      [id("hex_scroll"), true, true],
      [id("toll"), false, false],
    ]);
  });

  it("refuses a revision that does not compile or is not the entry's", () => {
    const rows = [newRow(index, id("hex_scroll"))!];
    expect(pinRevision(rows, index, id("hex_scroll"), "nope")).toEqual(rows);
    const broken = indexOptions(
      libraryOptions(library.map((e) => (e.slug === "hex_scroll" ? { ...e, revisions: [e.revisions[0]!, { ...e.revisions[1]!, doc: null }] } : e))),
    );
    expect(pinRevision(rows, broken, id("hex_scroll"), second!.revisionId)).toEqual(rows);
  });
});

describe("tuneEntry", () => {
  it("changes one entry's tuning and nothing else", () => {
    const rows = [row("swamp"), row("ward")];
    const tuned = tuneEntry(rows, id("ward"), { weight: 1, maxPerPlayer: 2 });
    expect(tuned[0]).toBe(rows[0]);
    expect(tuned[1]).toMatchObject({ weight: 1, maxPerPlayer: 2, revisionId: rows[1]!.revisionId });
  });
});
