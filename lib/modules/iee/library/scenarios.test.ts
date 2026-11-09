import { beforeEach, describe, expect, it, vi } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { memoryLibrary } from "./memory-store.test-helpers";
import type { LibraryStore } from "./store";

const env = vi.hoisted(() => ({
  store: null as LibraryStore | null,
  actor: { id: "admin-1" } as { id: string } | null,
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
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { createEntry, createPack, publishEntry, saveDraft } = await import("./service");
const { latestDocs, runDraftScenarios } = await import("./scenarios");

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
});

/** A pack holding published `swamp` and a `hex_scroll` that hands it out. */
async function library() {
  const pack = await createPack({ slug: "spooky", names: { ru: "Жуть" } });
  const swamp = await createEntry({ packId: pack.id, slug: "swamp", kind: "effect" });
  await saveDraft(swamp.id, docOf("swamp"));
  await publishEntry(swamp.id);
  const hexDraft = docOf("hex_scroll");
  hexDraft.rules = [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: swamp.id, slug: "swamp" }, to: "target" }] }];
  const hex = await createEntry({ packId: pack.id, slug: "hex_scroll", kind: "item" });
  await saveDraft(hex.id, hexDraft);
  await publishEntry(hex.id);
  const fresh = await createEntry({ packId: pack.id, slug: "fresh", kind: "effect" });
  return { swamp, hex, fresh, hexDraft };
}

describe("latestDocs — what a scenario plays besides its entry", () => {
  it("follows the references of what it loads, and skips entries with no revision", async () => {
    const { swamp, hex, fresh } = await library();
    const docs = await latestDocs(mem.store, [hex.id, fresh.id]);
    expect([...docs.keys()].sort()).toEqual([hex.id, swamp.id].sort());
    expect(docs.get(swamp.id)?.slug).toBe("swamp");
  });

  it("loads nothing for nothing", async () => {
    expect((await latestDocs(mem.store, [])).size).toBe(0);
  });
});

describe("runDraftScenarios — the editor's run, nothing saved", () => {
  it("runs the draft as it is, against the latest revisions of what it names", async () => {
    const { swamp, hex, hexDraft } = await library();
    const draft = {
      ...hexDraft,
      scenarios: [
        {
          title: { ru: "Соперник вязнет" },
          given: { holder: { carries: [{ entry: "self" }] } },
          steps: [
            { do: "use", expect: { result: "used", rival: [{ entry: { entry: swamp.id }, count: 1 }] } },
            { do: "roll", by: "rival", outcome: "passed", dice: 5, expect: { moved: 3 } },
          ],
        },
      ],
    };
    const run = await runDraftScenarios(hex.id, draft);
    expect(run?.ok).toBe(false);
    expect(run!.reports[0]!.steps.map((s) => [s.ok, s.observed?.moved])).toEqual([
      [true, undefined],
      [false, 4],
    ]);
    // Nothing was written: the stored draft has no scenarios.
    expect((mem.entries.find((e) => e.id === hex.id)!.draft as EntryDoc).scenarios).toBeUndefined();
  });

  it("a draft that does not parse has nothing to run", async () => {
    const { hex } = await library();
    expect(await runDraftScenarios(hex.id, { slug: "half" })).toBeNull();
  });

  it("needs an admin and an entry that exists", async () => {
    await expect(runDraftScenarios("00000000-0000-4000-8000-00000000dead", docOf("swamp"))).rejects.toMatchObject({
      code: "ieeEntryNotFound",
    });
    env.actor = null;
    await expect(runDraftScenarios("x", docOf("swamp"))).rejects.toMatchObject({ code: "ieeAdminRequired" });
  });
});
