import { describe, expect, it } from "vitest";

import type { IeeEntryRevisionRow, IeeEntryRow, IeePackRow } from "@/db/schema";
import { CORE_DOCS, CORE_ENTRY_IDS, CORE_PACK_ID, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { skeletonDraft } from "./draft";
import { revisionIdFor } from "./ggpack";
import { contentHash } from "./publish";
import { buildLibraryModel, type LibraryInput } from "./screens";

const SPOOKY = "22222222-2222-4222-8222-222222222222";
const CURSE = "33333333-3333-4333-8333-333333333333";
const GUST = "44444444-4444-4444-8444-444444444444";
const OLD = "55555555-5555-4555-8555-555555555555";
const T0 = new Date("2026-10-01T00:00:00Z");

const docOf = (key: CoreKey): EntryDoc => structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);

function pack(over: Partial<IeePackRow> & { id: string; slug: string }): IeePackRow {
  return {
    names: { ru: over.slug },
    description: null,
    iconFileId: null,
    visibility: "library",
    defaultLocale: "ru",
    isSystem: false,
    capabilities: [],
    minDslVersion: 1,
    createdBy: null,
    createdAt: T0,
    updatedAt: T0,
    archivedAt: null,
    ...over,
  };
}

function revision(entryId: string, doc: EntryDoc, number = 1): IeeEntryRevisionRow {
  const hash = contentHash(doc);
  return { id: revisionIdFor(entryId, hash), entryId, number, doc, dslVersion: 1, contentHash: hash, createdBy: null, createdAt: T0 };
}

function entry(over: Partial<IeeEntryRow> & { id: string; packId: string; draft: EntryDoc }): IeeEntryRow {
  return {
    slug: over.draft.slug,
    kind: over.draft.kind,
    iconFileId: null,
    latestRevisionId: null,
    createdBy: null,
    createdAt: T0,
    updatedAt: T0,
    archivedAt: null,
    ...over,
  };
}

/** `core` as installed — the swamp and the boots — and a pack of one's own. */
function library(over: Partial<LibraryInput> = {}): LibraryInput {
  const swamp = docOf("swamp");
  const boots = docOf("speed_boots");
  const tailwind = docOf("tailwind");
  const revs = [
    revision(CORE_ENTRY_IDS.swamp, swamp),
    revision(CORE_ENTRY_IDS.speed_boots, boots),
    revision(CORE_ENTRY_IDS.tailwind, tailwind),
  ];
  // The curse hands out core's swamp; its draft moved on since r1.
  const curseDoc: EntryDoc = {
    ...docOf("hex_scroll"),
    slug: "curse",
    name: { ru: "Проклятие", en: "Curse" },
  };
  const curseRev = revision(CURSE, curseDoc);
  return {
    packs: [
      pack({ id: CORE_PACK_ID, slug: "core", names: { ru: "Ядро", en: "Core" }, isSystem: true, iconFileId: "f-core" }),
      pack({ id: SPOOKY, slug: "spooky", names: { ru: "Жуть", en: "Spooky" } }),
    ],
    entries: [
      entry({ id: CORE_ENTRY_IDS.swamp, packId: CORE_PACK_ID, draft: swamp, latestRevisionId: revs[0]!.id }),
      entry({ id: CORE_ENTRY_IDS.speed_boots, packId: CORE_PACK_ID, draft: boots, latestRevisionId: revs[1]!.id }),
      entry({ id: CORE_ENTRY_IDS.tailwind, packId: CORE_PACK_ID, draft: tailwind, latestRevisionId: revs[2]!.id }),
      entry({
        id: CURSE,
        packId: SPOOKY,
        draft: { ...curseDoc, name: { ru: "Порча", en: "Hex" } },
        latestRevisionId: curseRev.id,
        iconFileId: "f-curse",
      }),
      entry({ id: GUST, packId: SPOOKY, draft: skeletonDraft("gust", "effect") }),
      entry({ id: OLD, packId: SPOOKY, draft: skeletonDraft("old", "item"), archivedAt: T0 }),
    ],
    latest: [...revs, curseRev],
    dependencies: { [SPOOKY]: [CORE_PACK_ID], [CORE_PACK_ID]: [] },
    iconUrls: new Map([
      ["f-core", "/api/files?key=core.png"],
      ["f-curse", "/api/files?key=curse.webp"],
    ]),
    usage: { [CORE_ENTRY_IDS.swamp]: 2 },
    coreEditable: false,
    ...over,
  };
}

describe("buildLibraryModel — the library screen", () => {
  it("knows where each entry stands against its revisions", () => {
    const model = buildLibraryModel(library());
    const state = (id: string) => model.entries.find((e) => e.id === id)!.state;
    expect(state(CORE_ENTRY_IDS.swamp)).toBe("published");
    expect(state(CURSE)).toBe("changed");
    expect(state(GUST)).toBe("new");
    expect(model.entries.find((e) => e.id === CURSE)!.latestNumber).toBe(1);
    expect(model.entries.find((e) => e.id === GUST)!.latestNumber).toBeNull();
  });

  it("checks every draft and reads its rule text", () => {
    const model = buildLibraryModel(library());
    const curse = model.entries.find((e) => e.id === CURSE)!;
    // The draft's own name, and the text from its rules — the swamp by name.
    expect(curse.name).toEqual({ ru: "Порча", en: "Hex", uk: "Порча" });
    expect(curse.ruleText.en).toBe("Use at any time on another player. Single use. The chosen player gets “Swamp”.");
    expect(curse.errors).toBe(0);
    expect(curse.art).toEqual({ iconUrl: "/api/files?key=curse.webp", packIconUrl: null, system: false });
    const gust = model.entries.find((e) => e.id === GUST)!;
    expect(gust.errors).toBeGreaterThan(0);
    expect(gust.power).toBeNull();
    expect(model.entries.find((e) => e.id === CORE_ENTRY_IDS.swamp)!.seasons).toBe(2);
  });

  it("sums each pack up, archived entries apart", () => {
    const model = buildLibraryModel(library());
    const spooky = model.packs.find((p) => p.id === SPOOKY)!;
    expect(spooky.counts).toEqual({ entries: 2, published: 0, changed: 1, unpublished: 1, archived: 1, withErrors: 1 });
    expect(spooky.name).toEqual({ ru: "Жуть", en: "Spooky", uk: "Жуть" });
    expect(spooky.dependencies.map((d) => d.slug)).toEqual(["core"]);
    const core = model.packs.find((p) => p.id === CORE_PACK_ID)!;
    expect(core.dependents.map((d) => d.slug)).toEqual(["spooky"]);
    expect(core.iconUrl).toBe("/api/files?key=core.png");
  });

  it("the system pack is read-only unless the install is a development one; an archived pack always", () => {
    expect(buildLibraryModel(library()).packs.map((p) => [p.slug, p.editable])).toEqual([
      ["core", false],
      ["spooky", true],
    ]);
    expect(buildLibraryModel(library({ coreEditable: true })).packs.find((p) => p.system)!.editable).toBe(true);
    const archived = library();
    archived.packs = archived.packs.map((p) => (p.id === SPOOKY ? { ...p, archivedAt: T0 } : p));
    const model = buildLibraryModel(archived);
    expect(model.packs.find((p) => p.id === SPOOKY)).toMatchObject({ archived: true, editable: false });
    // Its entries are no longer offered to new references.
    expect(model.refs.find((r) => r.entryId === CURSE)!.available).toBe(false);
  });

  it("resolves references the way publishing will: by the latest revision", () => {
    const { refs } = buildLibraryModel(library());
    const curse = refs.find((r) => r.entryId === CURSE)!;
    // Published as «Проклятие»; the draft's rename is not what others resolve to yet.
    expect(curse).toMatchObject({ published: true, available: true, slug: "curse", name: { ru: "Проклятие", en: "Curse" } });
    const gust = refs.find((r) => r.entryId === GUST)!;
    expect(gust).toMatchObject({ published: false, available: true, kind: "effect" });
    expect(refs.find((r) => r.entryId === OLD)!.available).toBe(false);
    expect(refs.find((r) => r.entryId === CORE_ENTRY_IDS.swamp)!.art.system).toBe(true);
  });
});
