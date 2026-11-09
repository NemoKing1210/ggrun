import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CORE_ENTRY_IDS, CORE_PACK_ID, CORE_REVISIONS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { CORE_PACK_FILE } from "./core-fixture";
import { decodeGgpack, encodeGgpack, manifestContent, revisionIdFor, type GgpackManifest } from "./ggpack";
import { memoryIcons } from "./memory-icons.test-helpers";
import { memoryLibrary } from "./memory-store.test-helpers";
import { contentHash } from "./publish";
import type { LibraryStore } from "./store";

const env = vi.hoisted(() => ({
  store: null as LibraryStore | null,
  actor: { id: "admin-1" } as { id: string } | null,
  coreEditable: false,
}));

vi.mock("./context", () => ({
  libraryAdmin: async () => {
    if (!env.actor) {
      const { AdminError } = await import("@/lib/modules/season/service/errors");
      throw new AdminError("ieeAdminRequired");
    }
    return env.actor;
  },
  withLibrary: (fn: (store: LibraryStore) => Promise<unknown>) => fn(env.store!),
  coreEditable: () => env.coreEditable,
}));

const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => audit);
const logger = vi.hoisted(() => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/infrastructure/logger", () => logger);

const { buildManifest, buildPackFile, exportPack, importInStore, importPack, importSystemPack } = await import("./transfer");
const { createPack, createEntry, saveDraft, publishEntry, setEntryArchived } = await import("./service");

const CORE_BYTES = new Uint8Array(readFileSync(resolve(process.cwd(), CORE_PACK_FILE)));
const CORE = decodeGgpack(CORE_BYTES).manifest;

let mem: ReturnType<typeof memoryLibrary>;

beforeEach(() => {
  mem = memoryLibrary();
  env.store = mem.store;
  env.actor = { id: "admin-1" };
  env.coreEditable = false;
  audit.logAdminAction.mockReset();
  logger.log.info.mockReset();
});

// --- fixtures ---------------------------------------------------------------

const clone = <T>(value: T): T => structuredClone(value);

/** The core manifest with one entry's latest document changed — a new revision. */
function coreWith(slug: CoreKey, change: (doc: EntryDoc) => void): GgpackManifest {
  const m = clone(CORE);
  const entry = m.entries.find((e) => e.slug === slug)!;
  const doc = clone(entry.revisions.at(-1)!.doc) as EntryDoc;
  change(doc);
  entry.slug = doc.slug;
  entry.revisions.push({ number: entry.revisions.at(-1)!.number + 1, contentHash: contentHash(doc), doc });
  return m;
}

const SPOOKY_ID = "5b0c0e1a-7d1f-4c2b-9a51-0e6f3a7c9d01";
const CURSE_ID = "5b0c0e1a-7d1f-4c2b-9a51-0e6f3a7c9d02";
const GLOOM_ID = "5b0c0e1a-7d1f-4c2b-9a51-0e6f3a7c9d03";

/** An item that hands out core's `swamp`. */
const curseDoc = (over: Partial<EntryDoc> = {}): EntryDoc =>
  ({
    dslVersion: 1,
    kind: "item",
    slug: "curse",
    name: { ru: "Проклятие", en: "Curse" },
    character: "bonus",
    rarity: "rare",
    tags: ["directed"],
    glyph: "SparklesIcon",
    usage: { activation: "active", window: "anytime", target: { who: "other" }, charges: 1 },
    rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: CORE_ENTRY_IDS.swamp, slug: "swamp" }, to: "target" }] }],
    ...over,
  }) as EntryDoc;

const gloomDoc = (): EntryDoc =>
  ({
    dslVersion: 1,
    kind: "effect",
    slug: "gloom",
    name: { ru: "Уныние", en: "Gloom" },
    character: "bonus",
    rarity: "common",
    tags: [],
    glyph: "SparklesIcon",
    params: { steps: { type: "int", default: 1, min: 1, max: 3 } },
    duration: { unit: "rolls", count: 1 },
    stacking: { mode: "refresh" },
    rules: [{ when: "afterMovement", do: [{ op: "steps", delta: { param: "steps" } }] }],
  }) as EntryDoc;

function spooky(docs: { id: string; doc: EntryDoc }[] = [{ id: CURSE_ID, doc: curseDoc() }], over: Partial<GgpackManifest["pack"]> = {}): GgpackManifest {
  return {
    format: "ggpack",
    formatVersion: 1,
    exportedAt: "2026-10-01T12:00:00.000Z",
    dslVersion: 1,
    pack: {
      id: SPOOKY_ID,
      slug: "spooky",
      names: { ru: "Жуть", en: "Spooky" },
      defaultLocale: "ru",
      capabilities: [],
      minDslVersion: 1,
      dependencies: [{ id: CORE_PACK_ID, slug: "core" }],
      ...over,
    },
    entries: docs.map(({ id, doc }) => ({
      id,
      slug: doc.slug,
      kind: doc.kind,
      revisions: [{ number: 1, contentHash: contentHash(doc), doc }],
    })),
  };
}

const system = (m: GgpackManifest) => importInStore(mem.store, m, { actorId: null, system: true });
const asAdmin = (m: GgpackManifest) => importInStore(mem.store, m, { actorId: "admin-1", system: false });
/** The entry with this slug — an admin's pack's before `core`'s: a slug is unique within a pack only («Проклятие» is in both). */
const entryBySlug = (slug: string) => {
  const found = mem.entries.filter((e) => e.slug === slug);
  return (found.find((e) => e.packId !== CORE_PACK_ID) ?? found[0])!;
};
const counts = () => ({ packs: mem.packs.length, entries: mem.entries.length, revisions: mem.revisions.length });

// --- the system pack ----------------------------------------------------------

describe("import — core into an empty library", () => {
  it("adds the pack, its entries and one revision each, under the ids every installation derives", async () => {
    const report = await importSystemPack(CORE_BYTES);

    expect(report.pack).toEqual({ id: CORE_PACK_ID, slug: "core", state: "added" });
    expect(mem.packs[0]).toMatchObject({ isSystem: true, visibility: "library", createdBy: null, defaultLocale: "ru" });
    expect(report.entries).toHaveLength(CORE.entries.length);
    expect(report.entries.every((e) => e.state === "added" && e.revisionsAdded === 1 && e.revisionsKept === 0)).toBe(true);
    expect(report.draftsKept).toEqual([]);
    for (const [slug, revision] of Object.entries(CORE_REVISIONS)) {
      const entry = entryBySlug(slug);
      expect(entry.id).toBe(CORE_ENTRY_IDS[slug as CoreKey]);
      expect(entry.latestRevisionId).toBe(revision.revisionId);
      expect(contentHash(entry.draft)).toBe(revision.contentHash);
      const stored = mem.revisions.find((r) => r.id === revision.revisionId)!;
      expect(stored).toMatchObject({ number: 1, contentHash: revision.contentHash, dslVersion: 1, createdBy: null });
    }
    expect(mem.dependencies).toEqual([]);
  });

  it("is logged rather than audited — the system is not an admin", async () => {
    await importSystemPack(CORE_BYTES);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
    expect(logger.log.info).toHaveBeenCalledWith("iee.library.system_pack_imported", {
      slug: "core",
      pack: "added",
      revisionsAdded: CORE.entries.length,
    });
  });

  it("adds nothing the second time", async () => {
    await importSystemPack(CORE_BYTES);
    const before = counts();
    const again = await importSystemPack(CORE_BYTES);
    expect(counts()).toEqual(before);
    expect(again.pack.state).toBe("unchanged");
    expect(again.entries.every((e) => e.state === "unchanged" && e.revisionsAdded === 0 && e.revisionsKept === 1)).toBe(true);
  });

  it("exports back as the same manifest — and the same bytes as the file in the repository", async () => {
    await importSystemPack(CORE_BYTES);
    const exported = await buildManifest(mem.store, CORE_PACK_ID);
    expect(manifestContent(exported)).toEqual(manifestContent(CORE));
    expect(encodeGgpack({ ...exported, exportedAt: CORE.exportedAt })).toEqual(CORE_BYTES);
  });

  it("refuses a file that is not a pack, whoever imports it", async () => {
    const garbage = new TextEncoder().encode("not a zip");
    await expect(importSystemPack(garbage)).rejects.toMatchObject({ code: "ieePackInvalid", params: { reason: "not a zip archive" } });
    await expect(importPack(garbage)).rejects.toMatchObject({ code: "ieePackInvalid" });
    expect(counts()).toEqual({ packs: 0, entries: 0, revisions: 0 });
  });
});

describe("import — what changes on the second import", () => {
  beforeEach(async () => {
    await importSystemPack(CORE_BYTES);
  });

  it("a new revision is numbered after the local ones and becomes the latest; a pristine draft follows it", async () => {
    // A change no scenario can see: a stronger wind would break what «Сапоги
    // скорости» promise, and the import would refuse the file for it.
    const m = coreWith("tailwind", (doc) => {
      doc.rarity = "rare";
    });
    const report = await system(m);

    const tailwind = report.entries.find((e) => e.slug === "tailwind")!;
    expect(tailwind).toMatchObject({ state: "updated", revisionsAdded: 1, revisionsKept: 1 });
    expect(report.entries.filter((e) => e.state !== "unchanged")).toHaveLength(1);
    const newest = m.entries.find((e) => e.slug === "tailwind")!.revisions.at(-1)!;
    const entry = entryBySlug("tailwind");
    expect(entry.latestRevisionId).toBe(revisionIdFor(entry.id, newest.contentHash));
    expect(mem.revisions.find((r) => r.id === entry.latestRevisionId)!.number).toBe(2);
    expect(contentHash(entry.draft)).toBe(newest.contentHash);
  });

  it("keeps a draft that holds unpublished work, and says so", async () => {
    const entry = entryBySlug("tailwind");
    const edited = { ...(entry.draft as EntryDoc), rarity: "epic" };
    entry.draft = edited;
    const report = await system(
      coreWith("tailwind", (doc) => {
        doc.rarity = "rare";
      }),
    );
    expect(report.draftsKept).toEqual(["tailwind"]);
    expect(entryBySlug("tailwind").draft).toEqual(edited);
    expect(entryBySlug("tailwind").latestRevisionId).not.toBe(CORE_REVISIONS.tailwind.revisionId);
  });

  it("an entry renamed in the file is renamed here — same entry, same id", async () => {
    const report = await system(
      coreWith("momentum", (doc) => {
        doc.slug = "drive";
      }),
    );
    expect(report.entries.find((e) => e.id === CORE_ENTRY_IDS.momentum)).toMatchObject({ slug: "drive", state: "updated" });
    expect(mem.entries.find((e) => e.id === CORE_ENTRY_IDS.momentum)!.slug).toBe("drive");
  });

  it("pack metadata follows the file", async () => {
    const m = clone(CORE);
    m.pack.names = { ...m.pack.names, en: "Core set" };
    const report = await system(m);
    expect(report.pack.state).toBe("updated");
    expect(mem.packs[0]!.names).toMatchObject({ en: "Core set" });
  });

  it("a history export carries every revision, and another installation gets the same numbers and ids", async () => {
    await system(
      coreWith("lucky", (doc) => {
        doc.rarity = "epic";
      }),
    );
    const full = await buildManifest(mem.store, CORE_PACK_ID, { history: true });
    expect(full.entries.find((e) => e.slug === "lucky")!.revisions.map((r) => r.number)).toEqual([1, 2]);
    expect((await buildManifest(mem.store, CORE_PACK_ID)).entries.find((e) => e.slug === "lucky")!.revisions).toHaveLength(1);

    const source = mem;
    mem = memoryLibrary();
    await system(full);
    const ids = (m: typeof mem) => m.revisions.map((r) => `${r.entryId}/${r.number}/${r.id}`).sort();
    expect(ids(mem)).toEqual(ids(source));
  });
});

// --- other packs ----------------------------------------------------------------

describe("import — an admin's pack", () => {
  it("is audited, and records its dependency on core", async () => {
    await importSystemPack(CORE_BYTES);
    const report = await importPack(encodeGgpack(spooky()));
    expect(report.pack).toMatchObject({ slug: "spooky", state: "added" });
    expect(mem.packs.find((p) => p.id === SPOOKY_ID)).toMatchObject({ isSystem: false, createdBy: "admin-1" });
    expect(mem.dependencies).toEqual([{ packId: SPOOKY_ID, dependsOnPackId: CORE_PACK_ID }]);
    expect(audit.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "iee_pack_imported",
      targetType: "iee_pack",
      targetId: SPOOKY_ID,
      payload: { slug: "spooky", pack: "added", entriesAdded: 1, revisionsAdded: 1 },
    });
  });

  it("needs an admin", async () => {
    env.actor = null;
    await expect(importPack(encodeGgpack(spooky()))).rejects.toMatchObject({ code: "ieeAdminRequired" });
  });

  it("may not overwrite core unless the installation is a development one", async () => {
    await importSystemPack(CORE_BYTES);
    await expect(asAdmin(CORE)).rejects.toMatchObject({ code: "ieeCoreReadOnly" });
    env.coreEditable = true;
    expect((await asAdmin(CORE)).pack.state).toBe("unchanged");
  });

  it("is refused when a dependency is missing", async () => {
    await expect(asAdmin(spooky())).rejects.toMatchObject({ code: "ieePackDependencyMissing", params: { slug: "core" } });
    expect(counts()).toEqual({ packs: 0, entries: 0, revisions: 0 });
  });

  it("is refused when it reaches into a pack it does not declare", async () => {
    await importSystemPack(CORE_BYTES);
    const before = counts();
    await expect(asAdmin(spooky(undefined, { dependencies: [] }))).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: "references an entry of core, which is not a dependency" },
    });
    expect(counts()).toEqual(before);
  });

  it("is refused when it references an entry nobody has", async () => {
    await importSystemPack(CORE_BYTES);
    const lost = curseDoc({
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: "9a9a9a9a-0000-4000-8000-000000000000", slug: "lost" }, to: "target" }] }],
    } as Partial<EntryDoc>);
    await expect(asAdmin(spooky([{ id: CURSE_ID, doc: lost }]))).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: expect.stringContaining("curse: revision 1 — entry lost is not available") },
    });
  });

  it("runs the scenarios of what it brings, against what is installed — a red one refuses the file", async () => {
    await importSystemPack(CORE_BYTES);
    const promise = (moved: number) =>
      curseDoc({
        scenarios: [
          {
            title: { ru: "Соперник вязнет" },
            given: { holder: { carries: [{ entry: "self" }] } },
            steps: [
              { do: "use", expect: { result: "used", rival: [{ entry: { entry: CORE_ENTRY_IDS.swamp, slug: "swamp" }, count: 1 }] } },
              { do: "roll", by: "rival", outcome: "passed", dice: 5, expect: { moved } },
            ],
          },
        ],
      } as Partial<EntryDoc>);
    const before = counts();
    await expect(asAdmin(spooky([{ id: CURSE_ID, doc: promise(5) }]))).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: "curse: scenario 1 «Соперник вязнет», step 2: expected moved 5, got 4" },
    });
    expect(counts()).toEqual(before);
    expect((await asAdmin(spooky([{ id: CURSE_ID, doc: promise(4) }]))).pack.state).toBe("added");
  });

  it("is refused when its entries hand each other out in a loop", async () => {
    await importSystemPack(CORE_BYTES);
    const a = curseDoc({
      slug: "curse",
      usage: { activation: "active", window: "anytime", target: { who: "self" }, charges: 1 },
      rules: [{ when: "onUse", do: [{ op: "grantItem", entry: { entry: GLOOM_ID, slug: "hex" }, to: "self" }] }],
    } as Partial<EntryDoc>);
    const b = curseDoc({
      slug: "hex",
      name: { ru: "Порча", en: "Hex" },
      usage: { activation: "active", window: "anytime", target: { who: "self" }, charges: 1 },
      rules: [{ when: "onUse", do: [{ op: "grantItem", entry: { entry: CURSE_ID, slug: "curse" }, to: "self" }] }],
    } as Partial<EntryDoc>);
    await expect(
      asAdmin(spooky([
        { id: CURSE_ID, doc: a },
        { id: GLOOM_ID, doc: b },
      ])),
    ).rejects.toMatchObject({ code: "ieePackInvalid", params: { reason: expect.stringContaining("in a loop") } });
  });

  it("is refused when a new entry takes a slug the pack already uses here", async () => {
    await importSystemPack(CORE_BYTES);
    await asAdmin(spooky([{ id: CURSE_ID, doc: curseDoc() }]));
    const clash = { ...gloomDoc(), slug: "curse" } as EntryDoc;
    await expect(asAdmin(spooky([{ id: GLOOM_ID, doc: clash }]))).rejects.toMatchObject({
      code: "ieeSlugTaken",
      params: { slug: "curse" },
    });
  });

  it("checks the set together with the entries this installation already has", async () => {
    await importSystemPack(CORE_BYTES);
    // Here: `curse` hands out `hex`, which does not exist yet — published
    // against nothing, so it is put in place directly.
    const selfUse = { activation: "active", window: "anytime", target: { who: "self" }, charges: 1 };
    const curse = curseDoc({
      usage: selfUse,
      rules: [{ when: "onUse", do: [{ op: "grantItem", entry: { entry: GLOOM_ID, slug: "hex" }, to: "self" }] }],
    } as Partial<EntryDoc>);
    const hex = curseDoc({
      slug: "hex",
      name: { ru: "Порча", en: "Hex" },
      usage: selfUse,
      rules: [{ when: "onUse", do: [{ op: "grantItem", entry: { entry: CURSE_ID, slug: "curse" }, to: "self" }] }],
    } as Partial<EntryDoc>);
    await asAdmin(spooky([{ id: CURSE_ID, doc: curseDoc() }]));
    const local = entryBySlug("curse");
    const rev = await mem.store.insertRevision({
      id: revisionIdFor(CURSE_ID, contentHash(curse)),
      entryId: CURSE_ID,
      number: 2,
      doc: curse,
      dslVersion: 1,
      contentHash: contentHash(curse),
      createdBy: null,
    });
    local.latestRevisionId = rev.id;
    // The file only brings `hex`, which hands `curse` back: a loop across the two.
    await expect(asAdmin(spooky([{ id: GLOOM_ID, doc: hex }]))).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: expect.stringContaining("in a loop") },
    });
  });

  it("is refused when its slug belongs to another pack", async () => {
    await importSystemPack(CORE_BYTES);
    await mem.store.insertPack({
      slug: "spooky",
      names: { ru: "Другая" },
      description: null,
      iconFileId: null,
      visibility: "draft",
      defaultLocale: "ru",
      isSystem: false,
      capabilities: [],
      minDslVersion: 1,
      createdBy: null,
    });
    await expect(asAdmin(spooky())).rejects.toMatchObject({ code: "ieeSlugTaken", params: { slug: "spooky" } });
  });

  it("is refused when it claims an entry of another pack", async () => {
    await importSystemPack(CORE_BYTES);
    const stolen = spooky([{ id: CORE_ENTRY_IDS.swamp, doc: gloomDoc() }]);
    await expect(asAdmin(stolen)).rejects.toMatchObject({ code: "ieeEntryInOtherPack", params: { slug: "gloom" } });
  });

  it("is refused when an entry changes between item and effect", async () => {
    await importSystemPack(CORE_BYTES);
    await asAdmin(spooky([{ id: GLOOM_ID, doc: gloomDoc() }]));
    const asItem = curseDoc({ slug: "gloom" });
    await expect(asAdmin(spooky([{ id: GLOOM_ID, doc: asItem }]))).rejects.toMatchObject({ code: "ieeKindLocked" });
  });
});

describe("import — the file itself is checked first", () => {
  const refused = async (m: GgpackManifest, reason: string | RegExp) => {
    await importSystemPack(CORE_BYTES);
    const before = counts();
    await expect(asAdmin(m)).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: typeof reason === "string" ? reason : expect.stringMatching(reason) },
    });
    expect(counts()).toEqual(before);
  };

  it("an entry listed twice", async () => {
    const m = spooky();
    m.entries.push(clone(m.entries[0]!));
    await refused(m, "curse: appears twice");
  });

  it("revisions out of order", async () => {
    const m = spooky();
    const doc = curseDoc({ rarity: "epic" });
    m.entries[0]!.revisions.unshift({ number: 2, contentHash: contentHash(doc), doc });
    await refused(m, "curse: revisions are not in order");
  });

  it("a revision whose content does not match its hash", async () => {
    const m = spooky();
    (m.entries[0]!.revisions[0]!.doc as EntryDoc).rarity = "legendary";
    await refused(m, "curse: revision 1 does not match its hash");
  });

  it("the same content twice", async () => {
    const m = spooky();
    m.entries[0]!.revisions.push({ ...clone(m.entries[0]!.revisions[0]!), number: 2 });
    await refused(m, "curse: revision 2 repeats an earlier one");
  });

  it("a document of the other kind", async () => {
    const m = spooky();
    m.entries[0]!.kind = "effect";
    await refused(m, "curse: revision 1 is not an effect");
  });

  it("a latest revision under another slug", async () => {
    const m = spooky();
    m.entries[0]!.slug = "hex";
    await refused(m, "hex: the latest revision is called curse");
  });

  it("a document that is not one", async () => {
    const m = spooky();
    const doc = { ...curseDoc(), rules: "none" } as unknown as EntryDoc;
    m.entries[0]!.revisions[0] = { number: 1, contentHash: contentHash(doc), doc };
    await refused(m, /^curse: revision 1 — rules: /);
    const versionless = { ...curseDoc(), dslVersion: 0 } as unknown as EntryDoc;
    m.entries[0]!.revisions[0] = { number: 1, contentHash: contentHash(versionless), doc: versionless };
    await refused(m, "curse: revision 1 — dslVersion is missing or invalid");
  });

  it("a pack for a newer engine", async () => {
    await expect(asAdmin(spooky(undefined, { minDslVersion: 9 }))).rejects.toMatchObject({
      code: "ieePackTooNew",
      params: { version: "9" },
    });
    await expect(asAdmin({ ...spooky(), dslVersion: 3 })).rejects.toMatchObject({ code: "ieePackTooNew", params: { version: "3" } });
  });
});

// --- export -----------------------------------------------------------------------

describe("export", () => {
  it("writes the published entries of a pack, audited, as <slug>.ggpack", async () => {
    await importSystemPack(CORE_BYTES);
    const { fileName, bytes } = await exportPack(CORE_PACK_ID);
    expect(fileName).toBe("core.ggpack");
    expect(manifestContent(decodeGgpack(bytes).manifest)).toEqual(manifestContent(CORE));
    expect(audit.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "iee_pack_exported",
      targetType: "iee_pack",
      targetId: CORE_PACK_ID,
      payload: { slug: "core", entries: CORE.entries.length, history: false },
    });
  });

  it("needs an admin and a pack that exists", async () => {
    await expect(exportPack(CORE_PACK_ID)).rejects.toMatchObject({ code: "ieePackNotFound" });
    env.actor = null;
    await expect(exportPack(CORE_PACK_ID)).rejects.toMatchObject({ code: "ieeAdminRequired" });
  });

  it("leaves out archived and never-published entries, and declares only the packs its documents reach", async () => {
    await importSystemPack(CORE_BYTES);
    const pack = await createPack({ slug: "spooky", names: { ru: "Жуть", en: "Spooky" } });
    const curse = await createEntry({ packId: pack.id, slug: "curse", kind: "item" });
    await saveDraft(curse.id, curseDoc());
    await publishEntry(curse.id);
    const gloom = await createEntry({ packId: pack.id, slug: "gloom", kind: "effect" });
    await saveDraft(gloom.id, gloomDoc());
    await publishEntry(gloom.id);
    await setEntryArchived(gloom.id, true);
    // A draft that reaches into core without being published.
    const draftOnly = await createEntry({ packId: pack.id, slug: "maybe", kind: "item" });
    await saveDraft(draftOnly.id, curseDoc({ slug: "maybe" }));

    const m = await buildManifest(mem.store, pack.id);
    expect(m.entries.map((e) => e.slug)).toEqual(["curse"]);
    expect(m.pack.dependencies).toEqual([{ id: CORE_PACK_ID, slug: "core" }]);

    await setEntryArchived(curse.id, true);
    const empty = await buildManifest(mem.store, pack.id);
    expect(empty.entries).toEqual([]);
    expect(empty.pack.dependencies).toEqual([]);
  });

  it("round-trips an admin's pack into an empty installation", async () => {
    await importSystemPack(CORE_BYTES);
    await asAdmin(spooky([
      { id: CURSE_ID, doc: curseDoc() },
      { id: GLOOM_ID, doc: gloomDoc() },
    ]));
    const first = await buildManifest(mem.store, SPOOKY_ID);

    mem = memoryLibrary();
    await system(CORE);
    await asAdmin(first);
    const second = await buildManifest(mem.store, SPOOKY_ID);
    expect(manifestContent(second)).toEqual(manifestContent(first));
  });
});

// --- icons (§11, §12) -----------------------------------------------------------

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6]);
const OTHER_WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9]);

/** The spooky pack as a file, its pack and its curse drawn. */
function spookyFile(curseIcon = WEBP, packIcon: Uint8Array | null = PNG): Uint8Array {
  const m = spooky();
  m.entries[0]!.icon = "icons/curse.webp";
  const icons = new Map<string, Uint8Array>([["icons/curse.webp", curseIcon]]);
  if (packIcon) {
    m.pack.icon = "icons/_pack.png";
    icons.set("icons/_pack.png", packIcon);
  }
  return encodeGgpack(m, icons);
}

describe("icons travel with a pack", () => {
  it("are stored on import and set on the pack and its entries", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await importPack(spookyFile(), icons.files);
    expect(icons.live()).toHaveLength(2);
    expect(icons.stored.get(entryBySlug("curse").iconFileId!)!.data).toEqual(WEBP);
    expect(icons.stored.get(mem.packs.find((p) => p.slug === "spooky")!.iconFileId!)!.data).toEqual(PNG);
  });

  it("export → import into an empty installation → export gives the same manifest and the same icons", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await importPack(spookyFile(), icons.files);
    const first = decodeGgpack((await exportPack(SPOOKY_ID, {}, icons.files)).bytes);
    expect(first.manifest.pack.icon).toBe("icons/_pack.png");
    expect(first.manifest.entries[0]!.icon).toBe("icons/curse.webp");

    mem = memoryLibrary();
    env.store = mem.store;
    const elsewhere = memoryIcons();
    await importSystemPack(CORE_BYTES, elsewhere.files);
    await importPack(encodeGgpack(first.manifest, first.icons), elsewhere.files);
    const second = decodeGgpack((await exportPack(SPOOKY_ID, {}, elsewhere.files)).bytes);
    expect(manifestContent(second.manifest)).toEqual(manifestContent(first.manifest));
    expect(second.icons).toEqual(first.icons);
  });

  it("stores nothing new when the same icons come in again, and changes nothing", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await importPack(spookyFile(), icons.files);
    const report = await importPack(spookyFile(), icons.files);
    expect(icons.stored.size).toBe(2);
    expect(report.entries[0]!.state).toBe("unchanged");
    expect(report.iconsReplaced).toEqual([]);
  });

  it("replaces a changed icon and removes the old file once nothing uses it", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await importPack(spookyFile(), icons.files);
    const old = entryBySlug("curse").iconFileId!;
    const report = await importPack(spookyFile(OTHER_WEBP), icons.files);
    expect(report.entries[0]!.state).toBe("updated");
    expect(report.iconsReplaced).toEqual([old]);
    expect(entryBySlug("curse").iconFileId).not.toBe(old);
    expect(icons.stored.get(old)!.gone).toBe(true);
  });

  it("keeps an old file another pack or entry still uses", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    // The pack and the curse share one picture.
    await importPack(spookyFile(WEBP, WEBP), icons.files);
    const shared = entryBySlug("curse").iconFileId!;
    await importPack(spookyFile(OTHER_WEBP, WEBP), icons.files);
    expect(icons.stored.get(shared)!.gone).toBe(false);
  });

  it("leaves an installed icon alone when the file names none", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await importPack(spookyFile(), icons.files);
    const before = entryBySlug("curse").iconFileId;
    await importPack(encodeGgpack(spooky()), icons.files);
    expect(entryBySlug("curse").iconFileId).toBe(before);
  });

  it("refuses an icon the category does not allow, naming it, and keeps nothing it stored", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await expect(importPack(spookyFile(new Uint8Array([0, 1, 2])), icons.files)).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: "icons/curse.webp: fileTypeNotAllowed" },
    });
    expect(icons.live()).toEqual([]);
    expect(mem.packs.some((p) => p.slug === "spooky")).toBe(false);
  });

  it("removes the icons it stored when the import itself is refused", async () => {
    const icons = memoryIcons();
    // No core: the pack's dependency is missing.
    await expect(importPack(spookyFile(), icons.files)).rejects.toMatchObject({ code: "ieePackDependencyMissing" });
    expect(icons.stored.size).toBe(2);
    expect(icons.live()).toEqual([]);
  });

  it("names the pack's icon apart from an entry called _pack", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    const m = spooky([{ id: CURSE_ID, doc: curseDoc({ slug: "_pack" }) }]);
    m.pack.icon = "icons/x.png";
    m.entries[0]!.icon = "icons/y.webp";
    await importPack(encodeGgpack(m, new Map([["icons/x.png", PNG], ["icons/y.webp", WEBP]])), icons.files);
    const { manifest } = decodeGgpack((await exportPack(SPOOKY_ID, {}, icons.files)).bytes);
    expect(manifest.pack.icon).toBe("icons/_pack_icon.png");
    expect(manifest.entries[0]!.icon).toBe("icons/_pack.webp");
  });

  it("skips an icon whose file is gone", async () => {
    const icons = memoryIcons();
    await importSystemPack(CORE_BYTES, icons.files);
    await importPack(spookyFile(), icons.files);
    for (const id of icons.live()) await icons.files.discard(id);
    const { pack, entries } = (await buildPackFile(mem.store, SPOOKY_ID, icons.files)).manifest;
    expect(pack.icon).toBeUndefined();
    expect(entries[0]!.icon).toBeUndefined();
  });
});

describe("import — the pack keeps its promises (§5.5)", () => {
  it("refuses a change that breaks what another entry of the file promises", async () => {
    await importSystemPack(CORE_BYTES);
    // A stronger wind: «Сапоги скорости» promise a move two cells longer.
    const m = coreWith("tailwind", (doc) => {
      doc.params!.steps!.default = 3;
      delete doc.scenarios;
    });
    await expect(system(m)).rejects.toMatchObject({
      code: "ieePackInvalid",
      params: { reason: "speed_boots: scenario 1 «Даёт игроку «Попутный ветер»», step 2: expected moved 7, got 8" },
    });
  });
});
