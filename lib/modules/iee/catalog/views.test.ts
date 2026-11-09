import { describe, expect, it } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, CORE_PACK_ID } from "@/lib/engine/iee/core-docs";

import { coreLibrary, withNewRevision } from "./fixtures.test-helpers";
import type { CatalogEntryOption } from "./library";
import { keysOf, latestViews, libraryFacts, libraryOptions } from "./views";

const LIBRARY = coreLibrary();
/** The core items' slugs, sorted. */
const ITEMS = CORE_DOCS.filter((d) => d.doc.kind === "item").map((d) => d.doc.slug).sort();

const FAN_PACK = { id: "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f", slug: "fan", names: { ru: "Фан", en: "Fan" }, isSystem: false };

/** An entry of the fan pack with `slug`, built on a core entry's revision. */
function fanEntry(slug: string, from: string, over: Partial<CatalogEntryOption> = {}): CatalogEntryOption {
  const core = LIBRARY.find((e) => e.slug === from)!;
  const entryId = "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e";
  const revisionId = "2e2e2e2e-2e2e-5e2e-8e2e-2e2e2e2e2e2e";
  const doc = { ...core.revisions[0]!.doc!, slug, name: { ru: "Фанатский", en: "Fan-made" } };
  return {
    ...core,
    entryId,
    slug,
    pack: FAN_PACK,
    latestRevisionId: revisionId,
    revisions: [{ revisionId, entryId, number: 1, doc, references: [] }],
    ...over,
  };
}

describe("libraryOptions — what the wizard may attach", () => {
  const options = libraryOptions(LIBRARY);
  const swamp = options.find((o) => o.key === "swamp")!;

  it("lists every entry with its pack, availability and revisions", () => {
    expect(options).toHaveLength(CORE_DOCS.length);
    expect(swamp).toMatchObject({
      entryId: CORE_ENTRY_IDS.swamp,
      kind: "effect",
      pack: { id: CORE_PACK_ID, slug: "core", name: { ru: "Ядро", en: "Core", uk: "Ядро" }, system: true },
      available: true,
      latestRevisionId: LIBRARY.find((e) => e.slug === "swamp")!.latestRevisionId,
    });
  });

  it("compiles each revision into its view, with its references and power", () => {
    const [revision] = swamp.revisions;
    expect(revision).toMatchObject({ number: 1, references: [] });
    expect(revision!.view).toMatchObject({ key: "swamp", entryId: CORE_ENTRY_IDS.swamp, kind: "effect" });
    expect(revision!.power).toEqual(expect.any(Number));
    const scroll = options.find((o) => o.key === "hex_scroll")!.revisions[0]!;
    expect(scroll.references).toEqual([CORE_ENTRY_IDS.swamp]);
  });

  it("fills a pack name's missing locales", () => {
    const [fan] = libraryOptions([fanEntry("fan_ward", "ward", { pack: { ...FAN_PACK, names: { ru: "Фан" } } })]);
    expect(fan!.pack.name).toEqual({ ru: "Фан", en: "Фан", uk: "Фан" });
  });

  it("has no view for a revision that no longer reads or no longer checks", () => {
    const unreadable = LIBRARY.map((e) => (e.slug === "ward" ? { ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) } : e));
    expect(libraryOptions(unreadable).find((o) => o.key === "ward")!.revisions[0]).toMatchObject({ view: null, power: null });
    // Without swamp in the library the scroll's reference resolves to nothing.
    const orphaned = LIBRARY.filter((e) => e.slug !== "swamp");
    expect(libraryOptions(orphaned).find((o) => o.key === "hex_scroll")!.revisions[0]).toMatchObject({
      view: null,
      power: null,
      references: [CORE_ENTRY_IDS.swamp],
    });
  });

  it("lists only what `include` keeps", () => {
    expect(libraryOptions(LIBRARY, (e) => e.kind === "item").map((o) => o.kind)).toEqual(Array(ITEMS.length).fill("item"));
  });
});

describe("latestViews — what the catalog page browses", () => {
  it("shows each entry at its latest revision, and skips one that no longer compiles", () => {
    const library = withNewRevision(LIBRARY, "swamp", (doc) => {
      doc.rarity = "epic";
    });
    const views = latestViews(libraryOptions(library));
    expect(views).toHaveLength(CORE_DOCS.length);
    expect(views.find((v) => v.key === "swamp")?.rarity).toBe("epic");
    const broken = library.map((e) => (e.slug === "ward" ? { ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) } : e));
    expect(latestViews(libraryOptions(broken)).map((v) => v.key)).not.toContain("ward");
  });
});

describe("libraryFacts", () => {
  it("resolves references to each entry's latest revision", () => {
    const facts = libraryFacts(
      withNewRevision(LIBRARY, "swamp", (doc) => {
        doc.tags = ["movement", "terrain"];
      }),
    );
    expect(facts.get(CORE_ENTRY_IDS.swamp)).toMatchObject({ slug: "swamp", kind: "effect", character: "penalty", tags: ["movement", "terrain"] });
    expect(facts.size).toBe(CORE_DOCS.length);
  });
});

describe("keysOf — the keys a challenge reward may name", () => {
  it("lists items and effects apart, with their names", () => {
    const keys = keysOf(LIBRARY);
    expect(Object.keys(keys.items).sort()).toEqual(ITEMS);
    expect(Object.keys(keys.effects)).toHaveLength(CORE_DOCS.length - ITEMS.length);
    expect(keys.effects.swamp?.ru).toBe("Болото");
  });

  it("names a shared key after the system pack, and leaves out what the library no longer offers", () => {
    const keys = keysOf([fanEntry("ward", "ward"), fanEntry("fan_only", "ward", { available: false }), ...LIBRARY]);
    expect(keys.effects.ward?.ru).toBe("Оберег");
    expect(keys.effects.fan_only).toBeUndefined();
    // A fan entry under its own key is a key too.
    expect(keysOf([fanEntry("fan_ward", "ward")]).effects.fan_ward?.en).toBe("Fan-made");
  });

  it("skips an entry whose latest revision no longer reads", () => {
    const keys = keysOf(LIBRARY.map((e) => (e.slug === "ward" ? { ...e, revisions: e.revisions.map((r) => ({ ...r, doc: null })) } : e)));
    expect(keys.effects.ward).toBeUndefined();
  });
});
