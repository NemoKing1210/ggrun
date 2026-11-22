// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { CORE_DOCS, CORE_ENTRY_IDS, CORE_PACK_ID } from "@/lib/engine/iee/core-docs";
import { format } from "@/lib/i18n/format";
import { skeletonDraft } from "@/lib/modules/iee/library/draft";
import type { EntrySummary, PackSummary } from "@/lib/modules/iee/library/screens";

import { PACK_ID, entrySummary, packSummary, renderWith, t } from "./fixtures.test-helpers";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({ createPackAction: vi.fn(), importPackAction: vi.fn() }));
vi.mock("@/lib/modules/iee/actions/library", () => actions);

const { LibraryBrowser } = await import("./LibraryBrowser");

const l = t.ieeEditor.library;

const core: PackSummary = packSummary({
  id: CORE_PACK_ID,
  slug: "core",
  name: { ru: "Ядро", en: "Core", uk: "Ядро" },
  system: true,
  editable: false,
  dependencies: [],
  counts: { entries: 16, published: 16, changed: 0, unpublished: 0, archived: 0, withErrors: 0 },
});
const mine = packSummary();
const old = packSummary({ id: "99999999-9999-4999-8999-999999999999", slug: "old", name: { ru: "Старое", en: "Old", uk: "Старе" }, archived: true });

function entries(): EntrySummary[] {
  const coreEntries = CORE_DOCS.map(({ entryId, doc }) =>
    entrySummary(doc, { id: entryId, packId: CORE_PACK_ID, state: "published", latestNumber: 1, ruleText: { ru: "", en: doc.slug, uk: "" } }),
  );
  return [
    ...coreEntries,
    entrySummary(skeletonDraft("gust", "effect"), { id: "g", packId: PACK_ID, errors: 1 }),
    entrySummary(skeletonDraft("relic", "item"), { id: "r", packId: old.id }),
  ];
}

beforeEach(() => {
  router.push.mockReset();
  actions.createPackAction.mockReset();
  actions.importPackAction.mockReset();
});
afterEach(cleanup);

describe("LibraryBrowser — the library screen (plan §6 task 3.1)", () => {
  it("lists packs and entries, archived ones on request", () => {
    renderWith(<LibraryBrowser packs={[core, mine, old]} entries={entries()} />);
    expect(screen.getByRole("heading", { name: "Core" })).not.toBeNull();
    expect(screen.getByText(l.readOnly)).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Old" })).toBeNull();
    expect(screen.queryAllByText("relic")).toHaveLength(0);
    fireEvent.click(screen.getByRole("switch", { name: l.showArchived }));
    expect(screen.getByRole("heading", { name: "Old" })).not.toBeNull();
    expect(screen.getAllByText("relic").length).toBeGreaterThan(0);
  });

  it("filters entries by kind, state and pack", () => {
    renderWith(<LibraryBrowser packs={[core, mine, old]} entries={entries()} />);
    const total = CORE_DOCS.length + 1;
    expect(screen.getByText(format(t.iee.admin.filters.showing, { shown: String(total), total: String(total) }))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: l.stateFilter.new }));
    expect(screen.getAllByText("gust").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("swamp")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: t.iee.admin.filters.reset }));
    fireEvent.click(screen.getByRole("button", { name: t.ieeEditor.kind.item }));
    expect(screen.queryAllByText("gust")).toHaveLength(0);
    expect(screen.getAllByText("speed_boots").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: t.iee.admin.filters.reset }));
    expect(screen.getByText(format(l.errors, { count: "1" }))).not.toBeNull();
  });

  it("creates a pack and opens it", async () => {
    actions.createPackAction.mockResolvedValue({ ok: t.ieeEditor.toast.packCreated, data: { packId: "new-pack" } });
    renderWith(<LibraryBrowser packs={[core]} entries={[]} />);
    fireEvent.click(screen.getByRole("button", { name: l.newPack }));
    const create = screen.getByRole("button", { name: t.ieeEditor.newPack.create });
    expect(create.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(new RegExp(`^${t.ieeEditor.newPack.slug}`)), { target: { value: "Bad Slug" } });
    expect(screen.getByText(t.core.errors.ieeSlugInvalid)).not.toBeNull();
    fireEvent.change(screen.getByLabelText(new RegExp(`^${t.ieeEditor.newPack.slug}`)), { target: { value: "spooky" } });
    fireEvent.change(screen.getByLabelText(`${t.ieeEditor.newPack.name} RU`), { target: { value: "Жуть" } });
    fireEvent.change(screen.getByLabelText(`${t.ieeEditor.newPack.name} EN`), { target: { value: "Spooky" } });
    await act(async () => {
      fireEvent.click(create);
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/catalog?tab=pack&pack=new-pack"));
    expect(actions.createPackAction).toHaveBeenCalledWith({ slug: "spooky", names: { ru: "Жуть", en: "Spooky" } });
  });

  it("imports a pack and reports what came in", async () => {
    actions.importPackAction.mockResolvedValue({
      ok: "Imported",
      data: {
        pack: { id: PACK_ID, slug: "spooky", state: "added" },
        entries: [{ id: CORE_ENTRY_IDS.swamp, slug: "bog", state: "added", revisionsAdded: 2, revisionsKept: 0 }],
        draftsKept: ["gust"],
        iconsReplaced: [],
      },
    });
    renderWith(<LibraryBrowser packs={[core]} entries={[]} />);
    fireEvent.click(screen.getByRole("button", { name: l.import }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([80, 75])], "spooky.ggpack")] } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.ieeEditor.importPack.submit }));
    });
    await waitFor(() => expect(screen.getByText(format(t.ieeEditor.importPack.reportTitle, { slug: "spooky" }))).not.toBeNull());
    expect(screen.getByText(t.ieeEditor.importPack.packState.added)).not.toBeNull();
    expect(screen.getByText(format(t.ieeEditor.importPack.draftsKept, { slugs: "gust" }))).not.toBeNull();
    const form = actions.importPackAction.mock.calls[0]![0] as FormData;
    expect((form.get("file") as File).name).toBe("spooky.ggpack");
  });
});
