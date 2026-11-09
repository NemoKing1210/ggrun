import { beforeEach, describe, expect, it, vi } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { memoryLibrary } from "./memory-store.test-helpers";
import type { LibraryStore } from "./store";

const env = vi.hoisted(() => ({
  store: null as LibraryStore | null,
  actor: { id: "admin-1" } as { id: string } | null,
  catalog: [] as { seasonId: string; entryId: string; revisionId: string; enabled: boolean }[],
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
  coreEditable: () => false,
}));
vi.mock("../catalog/art", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../catalog/art")>()),
  iconUrls: async () => new Map<string, string>(),
}));
vi.mock("../catalog/repository", () => ({
  catalogRowsOf: async (ids: readonly string[]) => env.catalog.filter((r) => ids.includes(r.entryId)),
}));
// The games catalog's genres, which a rule of the next game names (wave C, spec §6.16).
vi.mock("@/lib/modules/catalog/repository", () => ({ catalogGenres: async () => ["action", "rpg"] }));
vi.mock("@/lib/modules/season/repository/seasons", () => ({
  listSeasons: async () => [
    { id: "s-live", title: "Run #1", status: "active" },
    { id: "s-old", title: "Run #0", status: "archived" },
    { id: "s-next", title: "Run #2", status: "draft" },
  ],
}));
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { createEntry, createPack, publishEntry, saveDraft } = await import("./service");
const { entryScreen, libraryScreen, packScreen } = await import("./screens");

/** A core document as a fixture — without its scenarios, which name core's own entries. */
const docOf = (key: CoreKey): EntryDoc => {
  const { scenarios: _scenarios, ...doc } = structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);
  return doc;
};

beforeEach(() => {
  env.store = memoryLibrary().store;
  env.actor = { id: "admin-1" };
  env.catalog = [];
});

/** A pack with a published swamp, a scroll that hands it out, and an empty draft. */
async function spooky() {
  const pack = await createPack({ slug: "spooky", names: { ru: "Жуть", en: "Spooky" }, visibility: "library" });
  const swamp = await createEntry({ packId: pack.id, slug: "swamp", kind: "effect" });
  await saveDraft(swamp.id, docOf("swamp"));
  const published = await publishEntry(swamp.id);
  const hexDoc = docOf("hex_scroll");
  hexDoc.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id, slug: "swamp" }, to: "target" }] }];
  const hex = await createEntry({ packId: pack.id, slug: "hex_scroll", kind: "item" });
  await saveDraft(hex.id, hexDoc);
  const gust = await createEntry({ packId: pack.id, slug: "gust", kind: "effect" });
  return { pack, swamp, hex, gust, revision: published.revision! };
}

describe("the constructor's screens", () => {
  it("are an admin's", async () => {
    env.actor = null;
    await expect(libraryScreen()).rejects.toMatchObject({ code: "ieeAdminRequired" });
    await expect(packScreen("x")).rejects.toMatchObject({ code: "ieeAdminRequired" });
    await expect(entryScreen("x")).rejects.toMatchObject({ code: "ieeAdminRequired" });
  });

  it("the library lists every pack and entry", async () => {
    const { pack } = await spooky();
    const screen = await libraryScreen();
    expect(screen.coreEditable).toBe(false);
    expect(screen.packs.map((p) => p.slug)).toEqual(["spooky"]);
    expect(screen.entries.filter((e) => e.packId === pack.id).map((e) => [e.slug, e.state])).toEqual([
      ["gust", "new"],
      ["hex_scroll", "new"],
      ["swamp", "published"],
    ]);
  });

  it("the pack screen says what publishing would do, before it does", async () => {
    const { pack, swamp, hex, gust } = await spooky();
    env.catalog = [{ seasonId: "s-live", entryId: swamp.id, revisionId: "r", enabled: true }];
    const screen = await packScreen(pack.id);
    expect(screen.pack.slug).toBe("spooky");
    // The swamp is published as it is; the scroll is ready; the empty gust is blocked.
    expect(screen.publish.map((p) => [p.entryId, p.state])).toEqual([
      [gust.id, "blocked"],
      [hex.id, "ready"],
    ]);
    expect(screen.publish.find((p) => p.entryId === gust.id)!.errors.map((e) => e.code)).toContain("no_rules");
    expect(screen.entries.find((e) => e.id === swamp.id)!.revisions.map((r) => r.number)).toEqual([1]);
    // Archived seasons are not offered; the live one says it attaches one entry.
    expect(screen.seasons.map((s) => [s.id, s.attached])).toEqual([
      ["s-live", 1],
      ["s-next", 0],
    ]);
    expect(screen.targets.map((p) => p.slug)).toEqual(["spooky"]);
    await expect(packScreen("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "ieePackNotFound" });
  });

  it("the entry screen holds the draft and what it may reference", async () => {
    const { swamp, hex, revision } = await spooky();
    env.catalog = [
      { seasonId: "s-live", entryId: swamp.id, revisionId: revision.id, enabled: false },
      { seasonId: "s-old", entryId: swamp.id, revisionId: revision.id, enabled: true },
    ];
    const screen = await entryScreen(swamp.id);
    expect(screen.draft).toEqual(docOf("swamp"));
    expect(screen.entry).toMatchObject({ slug: "swamp", kindLocked: true, editable: true, state: "published" });
    expect(screen.refs.map((r) => r.slug).sort()).toEqual(["gust", "hex_scroll"]);
    expect(screen.tags).toEqual(expect.arrayContaining(["movement", "directed", "curse"]));
    // What a rule of the next game may name: the games catalog's genres (wave C, spec §6.16).
    expect(screen.genres).toEqual(["action", "rpg"]);
    // The scroll hands the swamp out — in its draft, not yet published.
    expect(screen.referencedBy.map((r) => r.entryId)).toEqual([hex.id]);
    // Seasons that attach it, at which revision — an archived season is not listed.
    expect(screen.seasons).toEqual([{ id: "s-live", title: "Run #1", status: "active", revisionNumber: 1, enabled: false }]);
    expect(screen.revisions.map((r) => r.number)).toEqual([1]);

    const fresh = await entryScreen(hex.id);
    expect(fresh.entry.kindLocked).toBe(false);
    await expect(entryScreen("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "ieeEntryNotFound" });
  });
});
