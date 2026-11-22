import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS } from "@/lib/engine/iee/core-docs";

import { fakeTx } from "./fakes.test-helpers";
import { loadCatalogLibrary } from "./library";

const doc = (key: keyof typeof CORE_ENTRY_IDS) => CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!;

const PACK = { id: "p1", slug: "core", names: { ru: "Ядро" }, isSystem: true, archivedAt: null, visibility: "library", iconFileId: null };

function entry(key: keyof typeof CORE_ENTRY_IDS, over: Record<string, unknown> = {}) {
  const d = doc(key);
  return {
    id: d.entryId,
    packId: "p1",
    slug: key,
    kind: d.doc.kind,
    archivedAt: null,
    latestRevisionId: d.revisionId,
    iconFileId: null,
    ...over,
  };
}

const revision = (key: keyof typeof CORE_ENTRY_IDS, over: Record<string, unknown> = {}) => {
  const d = doc(key);
  return { id: d.revisionId, entryId: d.entryId, number: 1, doc: d.doc, ...over };
};

describe("loadCatalogLibrary — the library as a season catalog sees it", () => {
  it("reads every entry with a published revision, its pack, documents and references", async () => {
    const { tx } = fakeTx([[PACK], [entry("hex_scroll")], [revision("hex_scroll")]]);
    const [scroll, ...rest] = await loadCatalogLibrary(tx);
    expect(rest).toEqual([]);
    expect(scroll).toEqual({
      entryId: CORE_ENTRY_IDS.hex_scroll,
      slug: "hex_scroll",
      kind: "item",
      pack: { id: "p1", slug: "core", names: { ru: "Ядро" }, isSystem: true },
      available: true,
      latestRevisionId: doc("hex_scroll").revisionId,
      revisions: [
        {
          revisionId: doc("hex_scroll").revisionId,
          entryId: CORE_ENTRY_IDS.hex_scroll,
          number: 1,
          doc: doc("hex_scroll").doc,
          references: [CORE_ENTRY_IDS.swamp],
        },
      ],
      art: { iconUrl: null, packIconUrl: null, system: true },
    });
  });

  it("draws an entry with its own icon and its pack's, when the files are still there", async () => {
    const pack = { ...PACK, isSystem: false, iconFileId: "f-pack" };
    const icon = { id: "f-entry", key: "iee_icon/2026/10/0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b.webp", visibility: "public" };
    const { tx, calls } = fakeTx([[pack], [entry("ward", { iconFileId: "f-entry" }), entry("swamp")], [revision("ward"), revision("swamp")], [icon]]);
    const [ward, swamp] = await loadCatalogLibrary(tx);
    expect(ward!.art).toEqual({ iconUrl: `/api/files?key=${encodeURIComponent(icon.key)}`, packIconUrl: null, system: false });
    // The pack's icon file is gone: no URL for it.
    expect(swamp!.art).toEqual({ iconUrl: null, packIconUrl: null, system: false });
    expect(calls).toHaveLength(4);
  });

  it("keeps the revisions in the order read, and reads a document that no longer parses as null", async () => {
    const second = { ...revision("swamp"), id: "r2", number: 2, doc: { dslVersion: 1, kind: "effect" } };
    const { tx } = fakeTx([[PACK], [entry("swamp", { latestRevisionId: "r2" })], [revision("swamp"), second]]);
    const [swamp] = await loadCatalogLibrary(tx);
    expect(swamp!.revisions.map((r) => [r.number, r.doc === null])).toEqual([
      [1, false],
      [2, true],
    ]);
    // A document from a newer language does not read either.
    const future = { ...revision("swamp"), doc: { ...doc("swamp").doc, dslVersion: 99 } };
    const { tx: tx2 } = fakeTx([[PACK], [entry("swamp")], [future]]);
    expect((await loadCatalogLibrary(tx2))[0]!.revisions[0]!.doc).toBeNull();
  });

  it("offers an entry only while it and its pack are active and the pack is in the library", async () => {
    const available = async (packOver: Record<string, unknown>, entryOver: Record<string, unknown> = {}) => {
      const { tx } = fakeTx([[{ ...PACK, ...packOver }], [entry("ward", entryOver)], [revision("ward")]]);
      return (await loadCatalogLibrary(tx))[0]!.available;
    };
    expect(await available({})).toBe(true);
    expect(await available({}, { archivedAt: new Date() })).toBe(false);
    expect(await available({ archivedAt: new Date() })).toBe(false);
    expect(await available({ visibility: "draft" })).toBe(false);
  });

  it("leaves out an entry with no pack, no revisions or nothing published", async () => {
    const { tx } = fakeTx([
      [PACK],
      [entry("ward", { packId: "nope" }), entry("swamp"), entry("toll", { latestRevisionId: null }), entry("lucky")],
      [revision("ward"), revision("toll"), revision("lucky")],
    ]);
    expect((await loadCatalogLibrary(tx)).map((e) => e.slug)).toEqual(["lucky"]);
  });
});
