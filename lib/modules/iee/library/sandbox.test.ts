import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { CORE_PACK_FILE } from "./core-fixture";
import { decodeGgpack } from "./ggpack";
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
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => audit);
vi.mock("@/lib/infrastructure/logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { createEntry, createPack } = await import("./service");
const { importInStore } = await import("./transfer");
const { contentHash } = await import("./publish");
const { runDraftSandbox } = await import("./sandbox");

const CORE = decodeGgpack(new Uint8Array(readFileSync(resolve(process.cwd(), CORE_PACK_FILE)))).manifest;
const docOf = (key: CoreKey): EntryDoc => {
  const { scenarios: _scenarios, ...doc } = structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);
  return doc;
};

let mem: ReturnType<typeof memoryLibrary>;
beforeEach(async () => {
  mem = memoryLibrary();
  env.store = mem.store;
  env.actor = { id: "admin-1" };
  audit.logAdminAction.mockReset();
  await importInStore(mem.store, CORE, { actorId: null, system: true });
});

/** A pack's entry with a scroll that hands out core's swamp. */
async function scroll() {
  const pack = await createPack({ slug: "spooky", names: { ru: "Жуть" } });
  const entry = await createEntry({ packId: pack.id, slug: "curse_scroll", kind: "item" });
  const draft = { ...docOf("hex_scroll"), slug: "curse_scroll" };
  return { entry, draft };
}

describe("runDraftSandbox — the editor's sandbox, nothing saved but the audit row", () => {
  it("plays the draft against the latest revisions of what it names, and records the run", async () => {
    const { entry, draft } = await scroll();
    const stored = structuredClone(mem.entries.find((e) => e.id === entry.id)!.draft);
    const outcome = await runDraftSandbox(entry.id, draft, { bots: 3, rounds: 8, seed: 5, withCore: false, startWith: true });
    expect(outcome?.ok).toBe(true);
    const run = outcome!.ok ? outcome!.run : null;
    expect(run).toMatchObject({ seed: 5, bots: 3, rounds: 8 });
    // The scroll's swamp is core's latest revision.
    expect(run!.summary.entries.map((e) => e.key)).toContain("swamp");
    // Nothing of the draft was written.
    expect(mem.entries.find((e) => e.id === entry.id)!.draft).toEqual(stored);
    expect(audit.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actionType: "iee_sandbox_run",
        targetType: "iee_entry",
        targetId: entry.id,
        payload: expect.objectContaining({
          slug: "curse_scroll",
          hash: contentHash(draft),
          bots: 3,
          rounds: 8,
          seed: 5,
          withCore: false,
          startWith: true,
          summary: expect.objectContaining({ played: 8 }),
        }),
      }),
    );
  });

  it("the same request plays the same run; no seed is a fresh one", async () => {
    const { entry, draft } = await scroll();
    const request = { bots: 2, rounds: 5, seed: 99, withCore: true, startWith: true };
    const a = await runDraftSandbox(entry.id, draft, request);
    const b = await runDraftSandbox(entry.id, draft, request);
    const turns = (o: typeof a) => (o && o.ok ? o.run.turns.map((t) => [t.bot, t.outcome, t.dice, t.to, t.wheel?.key ?? null]) : null);
    expect(turns(b)).toEqual(turns(a));
    const fresh = await runDraftSandbox(entry.id, draft, { ...request, seed: null });
    expect(fresh?.ok && typeof fresh.run.seed === "number").toBe(true);
  });

  it("core on the wheels: its entries drop too", async () => {
    const { entry, draft } = await scroll();
    const outcome = await runDraftSandbox(entry.id, draft, { bots: 4, rounds: 30, seed: 3, withCore: true, startWith: false });
    const dropped = outcome?.ok ? outcome.run.summary.entries.filter((e) => e.dropped > 0).map((e) => e.key) : [];
    expect(dropped.some((k) => k !== "curse_scroll")).toBe(true);
    // A handout comes with its item and never drops (spec §6.6).
    expect(dropped).not.toContain("magnet_pull");
    expect(dropped).not.toContain("fate_roll");
  });

  it("keeps the request within bounds", async () => {
    const { entry, draft } = await scroll();
    const outcome = await runDraftSandbox(entry.id, draft, { bots: 10, rounds: 0, seed: 1, withCore: false, startWith: true });
    expect(outcome?.ok ? [outcome.run.bots, outcome.run.rounds] : null).toEqual([4, 1]);
  });

  it("a draft that does not parse has nothing to play; one that does not compile is recorded as broken", async () => {
    const { entry, draft } = await scroll();
    audit.logAdminAction.mockClear();
    expect(await runDraftSandbox(entry.id, { slug: "half" }, { bots: 2, rounds: 2, seed: 1, withCore: false, startWith: true })).toBeNull();
    expect(audit.logAdminAction).not.toHaveBeenCalled();
    const ghost = { ...draft, rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: "99999999-9999-4999-8999-999999999999" }, to: "target" }] }] };
    const outcome = await runDraftSandbox(entry.id, ghost, { bots: 2, rounds: 2, seed: 1, withCore: false, startWith: true });
    expect(outcome).toMatchObject({ ok: false, reason: "compile" });
    expect(audit.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ broken: expect.any(String) }) }));
  });

  it("needs an admin and an entry that exists", async () => {
    await expect(
      runDraftSandbox("00000000-0000-4000-8000-00000000dead", docOf("swamp"), { bots: 2, rounds: 2, seed: 1, withCore: false, startWith: true }),
    ).rejects.toMatchObject({ code: "ieeEntryNotFound" });
    env.actor = null;
    await expect(runDraftSandbox("x", docOf("swamp"), { bots: 2, rounds: 2, seed: 1, withCore: false, startWith: true })).rejects.toMatchObject({
      code: "ieeAdminRequired",
    });
  });
});
