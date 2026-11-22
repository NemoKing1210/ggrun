import { beforeEach, describe, expect, it, vi } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { memoryLibrary } from "./memory-store.test-helpers";
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
vi.mock("@/lib/infrastructure/logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const {
  copyEntry,
  createEntry,
  createPack,
  libraryOverview,
  publishEntry,
  publishPack,
  saveDraft,
  setEntryArchived,
  setEntryIcon,
  setPackArchived,
  setPackIcon,
  skeletonDraft,
  syncDependencies,
  updatePack,
} = await import("./service");
const { memoryIcons } = await import("./memory-icons.test-helpers");

/** A core document as a fixture — without its scenarios, which name core's own entries. */
const docOf = (key: CoreKey): EntryDoc => {
  const { scenarios: _scenarios, ...doc } = structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);
  return doc;
};

let mem: ReturnType<typeof memoryLibrary>;

beforeEach(() => {
  mem = memoryLibrary();
  env.store = mem.store;
  env.actor = { id: "admin-1" };
  env.coreEditable = false;
  audit.logAdminAction.mockReset();
});

const actions = () => audit.logAdminAction.mock.calls.map(([a]) => a.actionType);

async function packWith(slug = "spooky") {
  return createPack({ slug, names: { ru: "Жуть", en: "Spooky" } });
}

/** An entry whose draft is a copy of a core document under the pack. */
async function entryFrom(packId: string, key: CoreKey) {
  const doc = docOf(key);
  const entry = await createEntry({ packId, slug: doc.slug, kind: doc.kind });
  await saveDraft(entry.id, doc);
  return entry;
}

describe("who may use the library", () => {
  it("refuses anyone but an admin, before touching anything", async () => {
    env.actor = null;
    await expect(createPack({ slug: "spooky", names: { ru: "Жуть" } })).rejects.toMatchObject({ code: "ieeAdminRequired" });
    expect(mem.packs).toEqual([]);
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });
});

describe("packs", () => {
  it("creates a pack as a draft and audits it", async () => {
    const pack = await packWith();
    expect(pack).toMatchObject({
      slug: "spooky",
      names: { ru: "Жуть", en: "Spooky" },
      visibility: "draft",
      defaultLocale: "ru",
      isSystem: false,
      capabilities: [],
      minDslVersion: 1,
      createdBy: "admin-1",
    });
    expect(audit.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "iee_pack_created", targetType: "iee_pack", targetId: pack.id, actorId: "admin-1" }),
    );
  });

  it("refuses a bad or taken slug", async () => {
    await expect(createPack({ slug: "Spooky!", names: { ru: "Ж" } })).rejects.toThrow(/ieeSlugInvalid/);
    await packWith();
    await expect(packWith()).rejects.toMatchObject({ code: "ieeSlugTaken", params: { slug: "spooky" } });
  });

  it("updates names, slug and visibility; a slug already taken is refused", async () => {
    const pack = await packWith();
    await createPack({ slug: "other", names: { ru: "Другое" } });
    const updated = await updatePack(pack.id, { slug: "spooky_v2", visibility: "library" });
    expect(updated).toMatchObject({ slug: "spooky_v2", visibility: "library" });
    await expect(updatePack(pack.id, { slug: "other" })).rejects.toMatchObject({ code: "ieeSlugTaken" });
    expect(actions()).toContain("iee_pack_updated");
  });

  it("archives and restores, and an archived pack takes no new entries", async () => {
    const pack = await packWith();
    await setPackArchived(pack.id, true);
    await expect(createEntry({ packId: pack.id, slug: "x1", kind: "item" })).rejects.toMatchObject({ code: "ieeArchived" });
    // Archiving twice changes nothing.
    await setPackArchived(pack.id, true);
    const restored = await setPackArchived(pack.id, false);
    expect(restored.archivedAt).toBeNull();
    expect(actions()).toEqual(["iee_pack_created", "iee_pack_archived", "iee_pack_archived", "iee_pack_restored"]);
  });

  it("an unknown pack is reported, not created", async () => {
    await expect(updatePack("00000000-0000-4000-8000-0000000000aa", { names: { ru: "X" } })).rejects.toMatchObject({
      code: "ieePackNotFound",
    });
    await expect(setPackArchived("00000000-0000-4000-8000-0000000000aa", true)).rejects.toMatchObject({
      code: "ieePackNotFound",
    });
  });
});

describe("the system pack", () => {
  async function systemPack() {
    return mem.store.insertPack({
      slug: "core",
      names: { ru: "Ядро" },
      description: null,
      iconFileId: null,
      visibility: "library",
      defaultLocale: "ru",
      isSystem: true,
      capabilities: [],
      minDslVersion: 1,
      createdBy: null,
    });
  }

  it("is read-only unless the install says otherwise", async () => {
    const core = await systemPack();
    await expect(updatePack(core.id, { names: { ru: "Другое" } })).rejects.toMatchObject({ code: "ieeCoreReadOnly" });
    await expect(createEntry({ packId: core.id, slug: "gust", kind: "effect" })).rejects.toMatchObject({
      code: "ieeCoreReadOnly",
    });
    env.coreEditable = true;
    await expect(createEntry({ packId: core.id, slug: "gust", kind: "effect" })).resolves.toMatchObject({ slug: "gust" });
  });

  it("is never archived, even where it is editable", async () => {
    const core = await systemPack();
    env.coreEditable = true;
    await expect(setPackArchived(core.id, true)).rejects.toMatchObject({ code: "ieeCoreReadOnly" });
  });
});

describe("icons (spec §12)", () => {
  const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1]);
  const OTHER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 2]);

  it("sets an entry's icon, audited, and stores one file per picture", async () => {
    const icons = memoryIcons();
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "curse", kind: "item" });
    const drawn = await setEntryIcon(entry.id, WEBP, icons.files);
    expect(drawn.iconFileId).toBe(icons.live()[0]);
    expect(audit.logAdminAction).toHaveBeenLastCalledWith({
      actorId: "admin-1",
      actionType: "iee_entry_icon_set",
      targetType: "iee_entry",
      targetId: entry.id,
      payload: { slug: "curse", icon: "set" },
    });
    // The same picture again changes nothing and stores nothing.
    await setEntryIcon(entry.id, WEBP, icons.files);
    expect(icons.stored.size).toBe(1);
  });

  it("removes the picture it replaces, unless another row still uses it", async () => {
    const icons = memoryIcons();
    const pack = await packWith();
    const curse = await createEntry({ packId: pack.id, slug: "curse", kind: "item" });
    const gloom = await createEntry({ packId: pack.id, slug: "gloom", kind: "effect" });
    await setEntryIcon(curse.id, WEBP, icons.files);
    await setEntryIcon(gloom.id, WEBP, icons.files);
    const shared = mem.entries.find((e) => e.slug === "curse")!.iconFileId!;
    await setEntryIcon(curse.id, OTHER, icons.files);
    expect(icons.stored.get(shared)!.gone).toBe(false);
    await setEntryIcon(gloom.id, null, icons.files);
    expect(mem.entries.find((e) => e.slug === "gloom")!.iconFileId).toBeNull();
    expect(icons.stored.get(shared)!.gone).toBe(true);
    expect(audit.logAdminAction).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { slug: "gloom", icon: "cleared" } }));
  });

  it("sets and clears a pack's icon", async () => {
    const icons = memoryIcons();
    const pack = await packWith();
    expect((await setPackIcon(pack.id, WEBP, icons.files)).iconFileId).toBe(icons.live()[0]);
    expect((await setPackIcon(pack.id, null, icons.files)).iconFileId).toBeNull();
    expect(icons.live()).toEqual([]);
    expect(actions().filter((a) => a === "iee_pack_icon_set")).toHaveLength(2);
  });

  it("refuses the system pack's entries, and keeps no picture it stored for a refused change", async () => {
    const icons = memoryIcons();
    const core = await mem.store.insertPack({
      slug: "core",
      names: { ru: "Ядро" },
      description: null,
      iconFileId: null,
      visibility: "library",
      defaultLocale: "ru",
      isSystem: true,
      capabilities: [],
      minDslVersion: 1,
      createdBy: null,
    });
    await expect(setPackIcon(core.id, WEBP, icons.files)).rejects.toMatchObject({ code: "ieeCoreReadOnly" });
    expect(icons.live()).toEqual([]);
    await expect(setEntryIcon("nope", WEBP, icons.files)).rejects.toMatchObject({ code: "ieeEntryNotFound" });
    expect(audit.logAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a picture the icon category does not allow, before anything changes", async () => {
    const icons = memoryIcons();
    const pack = await packWith();
    await expect(setPackIcon(pack.id, new Uint8Array([0, 1]), icons.files)).rejects.toMatchObject({ code: "fileTypeNotAllowed" });
    expect(mem.packs[0]!.iconFileId).toBeNull();
  });

  it("is for admins only", async () => {
    env.actor = null;
    await expect(setPackIcon("p", WEBP, memoryIcons().files)).rejects.toMatchObject({ code: "ieeAdminRequired" });
  });
});

describe("entries and drafts", () => {
  it("starts an entry from a skeleton draft that names it", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    expect(entry).toMatchObject({ slug: "gust", kind: "effect", latestRevisionId: null, createdBy: "admin-1" });
    expect(entry.draft).toEqual(skeletonDraft("gust", "effect"));
    await expect(createEntry({ packId: pack.id, slug: "gust", kind: "item" })).rejects.toMatchObject({ code: "ieeSlugTaken" });
  });

  it("saves any object as a draft and reports what publish would refuse", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    const saved = await saveDraft(entry.id, { ...skeletonDraft("gust", "effect"), rarity: "mythic" });
    expect(saved.check.errors.map((e) => e.path[0])).toContain("rarity");
    expect(mem.entries[0]!.draft).toMatchObject({ rarity: "mythic" });
    expect(actions()).toContain("iee_entry_draft_saved");
  });

  it("refuses what is not a document, and documents past the size limit", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    await expect(saveDraft(entry.id, ["a"])).rejects.toMatchObject({ code: "ieeDraftInvalid" });
    await expect(saveDraft(entry.id, { blob: "x".repeat(70_000) })).rejects.toMatchObject({ code: "ieeDraftTooLarge" });
  });

  it("an unreadable draft is saved and its check says why", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    const saved = await saveDraft(entry.id, { dslVersion: "one" });
    expect(saved.check).toMatchObject({ doc: null, errors: [expect.objectContaining({ code: "schema" })] });
  });

  it("follows the draft's slug, and refuses one a packmate has", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    await createEntry({ packId: pack.id, slug: "storm", kind: "effect" });
    const saved = await saveDraft(entry.id, skeletonDraft("breeze", "effect"));
    expect(saved.entry.slug).toBe("breeze");
    await expect(saveDraft(entry.id, skeletonDraft("storm", "effect"))).rejects.toMatchObject({ code: "ieeSlugTaken" });
  });

  it("follows the draft's kind until the first publish, then locks it", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "tailwind", kind: "item" });
    const saved = await saveDraft(entry.id, docOf("tailwind"));
    expect(saved.entry.kind).toBe("effect");
    await publishEntry(entry.id);
    await expect(saveDraft(entry.id, { ...docOf("tailwind"), kind: "item" })).rejects.toMatchObject({ code: "ieeKindLocked" });
  });

  it("archives and restores an entry; an archived one cannot be edited", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    await setEntryArchived(entry.id, true);
    await expect(saveDraft(entry.id, skeletonDraft("gust", "effect"))).rejects.toMatchObject({ code: "ieeArchived" });
    await setEntryArchived(entry.id, true);
    await setEntryArchived(entry.id, false);
    await expect(saveDraft(entry.id, skeletonDraft("gust", "effect"))).resolves.toBeTruthy();
    expect(actions()).toEqual(
      expect.arrayContaining(["iee_entry_archived", "iee_entry_restored"]),
    );
  });

  it("an unknown entry is reported", async () => {
    const missing = "00000000-0000-4000-8000-0000000000bb";
    await expect(saveDraft(missing, {})).rejects.toMatchObject({ code: "ieeEntryNotFound" });
    await expect(setEntryArchived(missing, true)).rejects.toMatchObject({ code: "ieeEntryNotFound" });
    await expect(publishEntry(missing)).rejects.toMatchObject({ code: "ieeEntryNotFound" });
  });
});

describe("publish", () => {
  it("turns a valid draft into revision 1, points the entry at it and audits it", async () => {
    const pack = await packWith();
    const entry = await entryFrom(pack.id, "tailwind");
    const outcome = await publishEntry(entry.id);
    expect(outcome).toMatchObject({ entryId: entry.id, slug: "tailwind", state: "published", errors: [] });
    expect(outcome.revision).toMatchObject({ number: 1, dslVersion: 1, entryId: entry.id, createdBy: "admin-1" });
    expect(outcome.revision!.doc).toEqual(docOf("tailwind"));
    expect(mem.entries.find((e) => e.id === entry.id)!.latestRevisionId).toBe(outcome.revision!.id);
    expect(audit.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "iee_entry_published",
        targetId: entry.id,
        payload: { slug: "tailwind", number: 1, contentHash: outcome.revision!.contentHash },
      }),
    );
  });

  it("publishing the same content again is a no-op", async () => {
    const pack = await packWith();
    const entry = await entryFrom(pack.id, "tailwind");
    const first = await publishEntry(entry.id);
    const again = await publishEntry(entry.id);
    expect(again).toMatchObject({ state: "unchanged", revision: { id: first.revision!.id } });
    expect(mem.revisions).toHaveLength(1);
    expect(actions().filter((a) => a === "iee_entry_published")).toHaveLength(1);
  });

  it("numbers changed content 2, 3, … and a return to old content reuses its revision", async () => {
    const pack = await packWith();
    const entry = await entryFrom(pack.id, "tailwind");
    await publishEntry(entry.id);
    await saveDraft(entry.id, { ...docOf("tailwind"), rarity: "rare" });
    const second = await publishEntry(entry.id);
    expect(second.revision!.number).toBe(2);
    await saveDraft(entry.id, docOf("tailwind"));
    const back = await publishEntry(entry.id);
    expect(back).toMatchObject({ state: "unchanged", revision: { number: 1 } });
    // The pointer stays on the newest revision.
    expect(mem.entries.find((e) => e.id === entry.id)!.latestRevisionId).toBe(second.revision!.id);
  });

  it("refuses an invalid draft and writes nothing", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    const outcome = await publishEntry(entry.id);
    expect(outcome.state).toBe("blocked");
    expect(outcome.errors.map((e) => e.code)).toContain("no_rules");
    expect(mem.revisions).toEqual([]);
    expect(actions()).not.toContain("iee_entry_published");
  });

  it("publishes a pack's changed entries together, so they may reference each other", async () => {
    const pack = await packWith();
    const slowedDraft = docOf("swamp");
    const hexDraft = docOf("hex_scroll");
    const swamp = await createEntry({ packId: pack.id, slug: "swamp", kind: "effect" });
    const hex = await createEntry({ packId: pack.id, slug: "hex_scroll", kind: "item" });
    // Point the scroll at this pack's `swamp`.
    hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id, slug: "swamp" }, to: "target" }] }];
    await saveDraft(swamp.id, slowedDraft);
    await saveDraft(hex.id, hexDraft);

    const alone = await publishEntry(hex.id);
    expect(alone.errors.map((e) => e.code)).toContain("missing_ref");

    const outcomes = await publishPack(pack.id);
    expect(outcomes.map((o) => [o.slug, o.state])).toEqual([
      ["hex_scroll", "published"],
      ["swamp", "published"],
    ]);
    // Only what changed: a second pack publish publishes nothing.
    const again = await publishPack(pack.id);
    expect(again.map((o) => o.state)).toEqual(["unchanged", "unchanged"]);
  });
});

describe("publish — the entry's scenarios (§5.5)", () => {
  const passes = (moved: number) => ({
    title: { ru: "Ход короче на клетку" },
    given: { holder: { carries: [{ entry: "self" as const }] } },
    steps: [{ do: "roll" as const, outcome: "passed" as const, dice: 5, expect: { moved } }],
  });

  it("a green scenario lets the draft through, scenarios and all", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "swamp", kind: "effect" });
    await saveDraft(entry.id, { ...docOf("swamp"), scenarios: [passes(4)] });
    const outcome = await publishEntry(entry.id);
    expect(outcome.state).toBe("published");
    expect(outcome.revision!.doc).toMatchObject({ scenarios: [passes(4)] });
  });

  it("a red scenario blocks the publish and says which step expected what", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "swamp", kind: "effect" });
    await saveDraft(entry.id, { ...docOf("swamp"), scenarios: [passes(5)] });
    const outcome = await publishEntry(entry.id);
    expect(outcome.state).toBe("blocked");
    expect(outcome.errors).toEqual([
      expect.objectContaining({
        code: "scenario_failed",
        path: ["scenarios", 0, "steps", 0, "expect", "moved"],
        params: expect.objectContaining({ expected: "5", actual: "4" }),
      }),
    ]);
    expect(mem.revisions).toEqual([]);
    expect(actions()).not.toContain("iee_entry_published");
  });

  it("an entry that hands out a refused packmate is refused with it", async () => {
    const pack = await packWith();
    const swamp = await createEntry({ packId: pack.id, slug: "swamp", kind: "effect" });
    const hex = await createEntry({ packId: pack.id, slug: "hex_scroll", kind: "item" });
    const hexDraft = docOf("hex_scroll");
    hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id, slug: "swamp" }, to: "target" }] }];
    await saveDraft(swamp.id, { ...docOf("swamp"), scenarios: [passes(5)] });
    await saveDraft(hex.id, hexDraft);
    const outcomes = await publishPack(pack.id);
    expect(outcomes.map((o) => [o.slug, o.state, o.errors.map((e) => e.code)])).toEqual([
      ["hex_scroll", "blocked", ["missing_ref"]],
      ["swamp", "blocked", ["scenario_failed"]],
    ]);
  });

  it("a scenario plays the latest revisions of the other entries it names", async () => {
    const base = await packWith("base");
    const mine = await packWith("mine");
    const swamp = await entryFrom(base.id, "swamp");
    await publishEntry(swamp.id);
    // The base pack's draft moves on; the scenario must play what is published.
    await saveDraft(swamp.id, { ...docOf("swamp"), rules: [{ when: "afterMovement", do: [{ op: "steps", delta: -3 }] }] });

    const hexDraft = docOf("hex_scroll");
    hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id, slug: "swamp" }, to: "target" }] }];
    hexDraft.scenarios = [
      {
        title: { ru: "Соперник получает «Болото»" },
        given: { holder: { carries: [{ entry: "self" }] } },
        steps: [
          { do: "use", on: "rival", expect: { result: "used", rival: [{ entry: { entry: swamp.id }, count: 1 }] } },
          { do: "roll", by: "rival", outcome: "passed", dice: 5, expect: { moved: 4 } },
        ],
      },
    ];
    const hex = await createEntry({ packId: mine.id, slug: "hex_scroll", kind: "item" });
    await saveDraft(hex.id, hexDraft);
    expect((await publishEntry(hex.id)).state).toBe("published");
  });
});

describe("dependencies", () => {
  it("follow the references into other packs, from drafts and revisions alike", async () => {
    const base = await packWith("base");
    const addon = await packWith("addon");
    const swamp = await entryFrom(base.id, "swamp");
    await publishEntry(swamp.id);

    const hexDraft = docOf("hex_scroll");
    hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id }, to: "target" }] }];
    const hex = await createEntry({ packId: addon.id, slug: "hex_scroll", kind: "item" });
    await saveDraft(hex.id, hexDraft);
    expect(await mem.store.dependenciesOf(addon.id)).toEqual([base.id]);
    await publishEntry(hex.id);

    // The draft moves on, the revision still needs `base`.
    await saveDraft(hex.id, { ...hexDraft, rules: [] });
    expect(await mem.store.dependenciesOf(addon.id)).toEqual([base.id]);
    // A pack never depends on itself.
    expect(await syncDependencies(mem.store, base.id)).toEqual([]);
  });

  it("drop out when the referencing entry is archived", async () => {
    const base = await packWith("base");
    const addon = await packWith("addon");
    const swamp = await entryFrom(base.id, "swamp");
    const hexDraft = docOf("hex_scroll");
    hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id }, to: "target" }] }];
    const hex = await createEntry({ packId: addon.id, slug: "hex_scroll", kind: "item" });
    await saveDraft(hex.id, hexDraft);
    await setEntryArchived(hex.id, true);
    expect(await mem.store.dependenciesOf(addon.id)).toEqual([]);
  });
});

describe("copyEntry — adapting an entry in a pack of one's own (§10.2)", () => {
  it("starts the copy from the latest revision, under a new slug, sharing the icon", async () => {
    const base = await packWith("base");
    const mine = await packWith("mine");
    const swamp = await entryFrom(base.id, "swamp");
    await publishEntry(swamp.id);
    // The source's draft moves on; the copy takes what was published.
    await saveDraft(swamp.id, { ...docOf("swamp"), rarity: "epic" });
    mem.entries.find((e) => e.id === swamp.id)!.iconFileId = "icon-1";

    const copy = await copyEntry(swamp.id, { packId: mine.id, slug: "bog" });
    expect(copy).toMatchObject({ packId: mine.id, slug: "bog", kind: "effect", iconFileId: "icon-1", latestRevisionId: null });
    expect(copy.draft).toEqual({ ...docOf("swamp"), slug: "bog" });
    expect(audit.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "iee_entry_copied",
        targetId: copy.id,
        payload: { from: swamp.id, fromSlug: "swamp", packId: mine.id, slug: "bog" },
      }),
    );
  });

  it("copies a never-published entry's draft, and keeps its references — and the dependency", async () => {
    const base = await packWith("base");
    const mine = await packWith("mine");
    const swamp = await entryFrom(base.id, "swamp");
    await publishEntry(swamp.id);
    const hexDraft = docOf("hex_scroll");
    hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id }, to: "target" }] }];
    const hex = await createEntry({ packId: base.id, slug: "hex_scroll", kind: "item" });
    await saveDraft(hex.id, hexDraft);

    const copy = await copyEntry(hex.id, { packId: mine.id, slug: "my_hex" });
    expect(copy.draft).toEqual({ ...hexDraft, slug: "my_hex" });
    expect(await mem.store.dependenciesOf(mine.id)).toEqual([base.id]);
  });

  it("copies out of the read-only system pack, never into it, and refuses a taken slug", async () => {
    env.coreEditable = true;
    const core = await createPack({ slug: "core", names: { ru: "Ядро" } });
    mem.packs.find((p) => p.id === core.id)!.isSystem = true;
    const swamp = await entryFrom(core.id, "swamp");
    env.coreEditable = false;
    const mine = await packWith("mine");

    await expect(copyEntry(swamp.id, { packId: core.id, slug: "bog" })).rejects.toMatchObject({ code: "ieeCoreReadOnly" });
    const copy = await copyEntry(swamp.id, { packId: mine.id, slug: "bog" });
    expect(copy.packId).toBe(mine.id);
    await expect(copyEntry(swamp.id, { packId: mine.id, slug: "bog" })).rejects.toMatchObject({ code: "ieeSlugTaken" });
    await expect(copyEntry("00000000-0000-4000-8000-00000000dead", { packId: mine.id, slug: "x1" })).rejects.toMatchObject({
      code: "ieeEntryNotFound",
    });
  });
});

describe("libraryOverview", () => {
  it("lists every pack with its entries, archived ones included", async () => {
    const pack = await packWith();
    const entry = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
    await setEntryArchived(entry.id, true);
    const overview = await libraryOverview();
    expect(overview.packs.map((p) => p.slug)).toEqual(["spooky"]);
    expect(overview.entries[pack.id]!.map((e) => [e.slug, e.archivedAt !== null])).toEqual([["gust", true]]);
  });
});
