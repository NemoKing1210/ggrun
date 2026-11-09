import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/lib/i18n/dictionaries";
import { FileError } from "@/lib/modules/files/service/errors";
import { AdminError } from "@/lib/modules/season/service/errors";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn(async () => ({ id: "admin-1" })) }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

vi.mock("@/lib/i18n/server", async () => {
  const { getDictionary: dict } = await import("@/lib/i18n/dictionaries");
  return { getT: async () => ({ locale: "en", t: dict("en") }) };
});
vi.mock("@/lib/infrastructure/logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const lib = vi.hoisted(() => ({
  copyEntry: vi.fn(),
  createEntry: vi.fn(),
  createPack: vi.fn(),
  exportPack: vi.fn(),
  importPack: vi.fn(),
  publishEntry: vi.fn(),
  publishPack: vi.fn(),
  runDraftSandbox: vi.fn(),
  runDraftScenarios: vi.fn(),
  saveDraft: vi.fn(),
  setEntryArchived: vi.fn(),
  setEntryIcon: vi.fn(),
  setPackArchived: vi.fn(),
  setPackIcon: vi.fn(),
  updatePack: vi.fn(),
}));
vi.mock("../library", () => lib);

const actions = await import("./library");
const t = getDictionary("en");
const e = t.ieeEditor.toast;

function form(fields: Record<string, string>, file?: File): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (file) fd.set("file", file);
  return fd;
}

beforeEach(() => {
  cache.revalidatePath.mockClear();
  for (const fn of Object.values(lib)) fn.mockReset();
});

describe("library actions", () => {
  it("creates a pack and hands back its id", async () => {
    lib.createPack.mockResolvedValue({ id: "p1" });
    const result = await actions.createPackAction({ slug: "spooky", names: { ru: "Жуть" } });
    expect(result).toEqual({ ok: e.packCreated, data: { packId: "p1" } });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/catalog");
  });

  it("turns a refusal into the translated error, and does not revalidate", async () => {
    lib.createPack.mockRejectedValue(new AdminError("ieeSlugTaken", { slug: "spooky" }));
    const result = await actions.createPackAction({ slug: "spooky", names: { ru: "Жуть" } });
    expect(result.error).toBe(t.core.errors.ieeSlugTaken.replace("{slug}", "spooky"));
    expect(result.data).toBeUndefined();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates, archives and restores packs and entries", async () => {
    expect((await actions.updatePackAction("p1", { visibility: "library" })).ok).toBe(e.packSaved);
    expect(lib.updatePack).toHaveBeenCalledWith("p1", { visibility: "library" });
    expect((await actions.setPackArchivedAction("p1", true)).ok).toBe(e.packArchived);
    expect((await actions.setPackArchivedAction("p1", false)).ok).toBe(e.packRestored);
    lib.createEntry.mockResolvedValue({ id: "e1" });
    expect(await actions.createEntryAction({ packId: "p1", slug: "gust", kind: "effect" })).toEqual({
      ok: e.entryCreated,
      data: { entryId: "e1" },
    });
    lib.copyEntry.mockResolvedValue({ id: "e2" });
    expect((await actions.copyEntryAction("e1", { packId: "p2", slug: "gust_copy" })).data).toEqual({ entryId: "e2" });
    expect((await actions.setEntryArchivedAction("e1", true)).ok).toBe(e.entryArchived);
    expect((await actions.setEntryArchivedAction("e1", false)).ok).toBe(e.entryRestored);
  });

  it("uploads and clears icons, and wants a file to upload", async () => {
    const png = new File([new Uint8Array([0x89, 1, 2])], "i.png", { type: "image/png" });
    expect((await actions.setEntryIconAction(form({ entryId: "e1" }, png))).ok).toBe(e.iconSaved);
    expect(lib.setEntryIcon.mock.calls[0]![0]).toBe("e1");
    expect(lib.setEntryIcon.mock.calls[0]![1]).toEqual(new Uint8Array([0x89, 1, 2]));
    expect((await actions.setEntryIconAction(form({ entryId: "e1", clear: "1" }))).ok).toBe(e.iconCleared);
    expect(lib.setEntryIcon).toHaveBeenLastCalledWith("e1", null);
    expect((await actions.setPackIconAction(form({ packId: "p1" }, png))).ok).toBe(e.iconSaved);
    expect((await actions.setPackIconAction(form({ packId: "p1", clear: "1" }))).ok).toBe(e.iconCleared);

    const none = await actions.setEntryIconAction(form({ entryId: "e1" }));
    expect(none.error).toBe(t.core.errors.fileEmpty);
    lib.setPackIcon.mockRejectedValue(new FileError("fileImageNotSquare", { width: "64", height: "80" }));
    expect((await actions.setPackIconAction(form({ packId: "p1" }, png))).error).toBeTruthy();
  });

  it("saves a draft and returns the server's checks", async () => {
    lib.saveDraft.mockResolvedValue({
      entry: { slug: "gust" },
      check: { doc: null, errors: [{ code: "no_rules", path: ["rules"], message: "m" }], warnings: [] },
    });
    const result = await actions.saveEntryDraftAction("e1", { slug: "gust" });
    expect(result).toEqual({
      ok: e.draftSaved,
      data: { slug: "gust", errors: [{ code: "no_rules", path: ["rules"], message: "m" }], warnings: [] },
    });
  });

  it("a publish says what happened — and a refused one is an error", async () => {
    lib.publishEntry.mockResolvedValue({ state: "published", revision: { number: 3 }, errors: [], warnings: [] });
    expect((await actions.publishEntryAction("e1")).ok).toBe(e.published.replace("{number}", "3"));
    lib.publishEntry.mockResolvedValue({ state: "unchanged", revision: { number: 3 }, errors: [], warnings: [] });
    expect((await actions.publishEntryAction("e1")).ok).toBe(e.unchanged);
    const issue = { code: "no_rules", path: ["rules"], message: "m" };
    lib.publishEntry.mockResolvedValue({ state: "blocked", revision: null, errors: [issue], warnings: [] });
    const blocked = await actions.publishEntryAction("e1");
    expect(blocked.ok).toBeUndefined();
    expect(blocked.error).toBe(e.blocked);
    expect(blocked.data).toEqual({ state: "blocked", number: null, errors: [issue], warnings: [] });
  });

  it("runs a draft's scenarios: green, red, unreadable — and saves nothing", async () => {
    lib.runDraftScenarios.mockResolvedValue({ ok: true, reports: [] });
    expect(await actions.runScenariosAction("e1", { slug: "gust" })).toEqual({ ok: e.scenariosGreen, data: { ok: true, reports: [] } });
    expect(lib.runDraftScenarios).toHaveBeenCalledWith("e1", { slug: "gust" });
    lib.runDraftScenarios.mockResolvedValue({ ok: false, reports: [] });
    expect((await actions.runScenariosAction("e1", {})).ok).toBe(e.scenariosRed);
    lib.runDraftScenarios.mockResolvedValue(null);
    expect(await actions.runScenariosAction("e1", {})).toEqual({ ok: e.scenariosUnreadable, data: null });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    lib.runDraftScenarios.mockRejectedValue(new AdminError("ieeAdminRequired"));
    expect((await actions.runScenariosAction("e1", {})).error).toBe(t.core.errors.ieeAdminRequired);
  });

  it("plays a draft in the sandbox: played, broken, unreadable", async () => {
    const request = { bots: 3, rounds: 10, seed: 7, withCore: false, startWith: true };
    const run = { ok: true, run: { seed: 7 } };
    lib.runDraftSandbox.mockResolvedValue(run);
    expect(await actions.runSandboxAction("e1", { slug: "gust" }, request)).toEqual({ ok: e.sandboxDone, data: run });
    expect(lib.runDraftSandbox).toHaveBeenCalledWith("e1", { slug: "gust" }, request);
    lib.runDraftSandbox.mockResolvedValue({ ok: false, reason: "compile", message: "m" });
    expect((await actions.runSandboxAction("e1", {}, request)).ok).toBe(e.sandboxBroken);
    lib.runDraftSandbox.mockResolvedValue(null);
    expect(await actions.runSandboxAction("e1", {}, request)).toEqual({ ok: e.sandboxUnreadable, data: null });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    lib.runDraftSandbox.mockRejectedValue(new AdminError("ieeAdminRequired"));
    expect((await actions.runSandboxAction("e1", {}, request)).error).toBe(t.core.errors.ieeAdminRequired);
  });

  it("publishes a pack and counts the outcome", async () => {
    lib.publishPack.mockResolvedValue([
      { entryId: "a", slug: "a", state: "published", revision: { number: 2 }, errors: [], warnings: [] },
      { entryId: "b", slug: "b", state: "unchanged", revision: { number: 1 }, errors: [], warnings: [] },
      { entryId: "c", slug: "c", state: "blocked", revision: null, errors: [{ code: "no_rules" }], warnings: [] },
    ]);
    const result = await actions.publishPackAction("p1");
    expect(result.ok).toBe(e.packPublished.replace("{published}", "1").replace("{blocked}", "1"));
    expect(result.data).toEqual({
      published: [{ slug: "a", number: 2 }],
      unchanged: 1,
      blocked: [{ entryId: "c", slug: "c", errors: [{ code: "no_rules" }] }],
    });
  });

  it("imports a file and exports one the browser can save", async () => {
    const file = new File([new Uint8Array([80, 75])], "spooky.ggpack");
    lib.importPack.mockResolvedValue({ pack: { id: "p1", slug: "spooky", state: "added" }, entries: [], draftsKept: [], iconsReplaced: [] });
    const imported = await actions.importPackAction(form({}, file));
    expect(imported.ok).toBe(e.imported.replace("{slug}", "spooky"));
    expect(lib.importPack).toHaveBeenCalledWith(new Uint8Array([80, 75]));
    expect((await actions.importPackAction(form({}))).error).toBe(t.core.errors.fileEmpty);

    lib.exportPack.mockResolvedValue({ fileName: "spooky.ggpack", bytes: new Uint8Array([1, 2, 3]) });
    const exported = await actions.exportPackAction("p1", true);
    expect(lib.exportPack).toHaveBeenCalledWith("p1", { history: true });
    expect(exported).toEqual({ ok: e.exported.replace("{file}", "spooky.ggpack"), data: { fileName: "spooky.ggpack", base64: "AQID" } });
  });
});
