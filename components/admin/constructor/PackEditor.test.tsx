// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { CORE_PACK_ID } from "@/lib/engine/iee/core-docs";
import { format } from "@/lib/i18n/format";
import { skeletonDraft } from "@/lib/modules/iee/library/draft";
import type { PackScreen } from "@/lib/modules/iee/library/screens";

import { PACK_ID, entrySummary, packSummary, renderWith, t } from "./fixtures.test-helpers";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({
  copyEntryAction: vi.fn(),
  createEntryAction: vi.fn(),
  exportPackAction: vi.fn(),
  publishPackAction: vi.fn(),
  setEntryArchivedAction: vi.fn(),
  setPackArchivedAction: vi.fn(),
  setPackIconAction: vi.fn(),
  updatePackAction: vi.fn(),
}));
vi.mock("@/lib/modules/iee/actions/library", () => actions);

const { PackEditor } = await import("./PackEditor");

const p = t.ieeEditor.pack;
const GUST = "44444444-4444-4444-8444-444444444444";
const BOG = "55555555-5555-4555-8555-555555555555";

function packScreen(over: Partial<PackScreen> = {}): PackScreen {
  const gust = { ...entrySummary(skeletonDraft("gust", "effect"), { id: GUST, errors: 1 }), revisions: [] };
  const bog = {
    ...entrySummary({ ...skeletonDraft("bog", "effect"), name: { ru: "Болото", en: "Bog" } }, { id: BOG, state: "changed", latestNumber: 1 }),
    revisions: [{ id: "r1", number: 1, createdAt: "2026-10-08T10:00:00.000Z", hash: "abc" }],
  };
  return {
    pack: packSummary(),
    entries: [bog, gust],
    publish: [
      { entryId: BOG, slug: "bog", state: "ready", errors: [], warnings: [{ code: "no_counter", path: ["bog"], message: "m" }] },
      { entryId: GUST, slug: "gust", state: "blocked", errors: [{ code: "no_rules", path: ["rules"], message: "m" }], warnings: [] },
    ],
    seasons: [{ id: "s1", title: "Run #1", status: "active", attached: 1 }],
    targets: [{ id: PACK_ID, slug: "spooky", name: { ru: "Жуть", en: "Spooky", uk: "Жуть" } }],
    ...over,
  };
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: "ok" });
  router.push.mockReset();
});
afterEach(cleanup);

describe("PackEditor — the pack screen (plan §6 tasks 3.1, 3.4)", () => {
  it("says what publishing would do: ready, and blocked with the reason", () => {
    renderWith(<PackEditor screen={packScreen()} />);
    const publish = within(document.getElementById("pack-publish")!);
    expect(publish.getByText(p.ready)).not.toBeNull();
    expect(publish.getByText("Bog")).not.toBeNull();
    expect(publish.getByText(format(t.ieeEditor.library.warnings, { count: "1" }))).not.toBeNull();
    expect(publish.getByText(t.ieeEditor.issues.no_rules)).not.toBeNull();
  });

  it("publishes the pack", async () => {
    renderWith(<PackEditor screen={packScreen()} />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: p.publish })[0]!);
    });
    await waitFor(() => expect(actions.publishPackAction).toHaveBeenCalledWith(PACK_ID));
  });

  it("nothing to publish: the button rests", () => {
    renderWith(<PackEditor screen={packScreen({ publish: [] })} />);
    expect(screen.getByText(p.nothingToPublish)).not.toBeNull();
    expect(screen.getAllByRole("button", { name: p.publish })[0]!.hasAttribute("disabled")).toBe(true);
  });

  it("creates an entry and opens the editor", async () => {
    actions.createEntryAction.mockResolvedValue({ ok: "ok", data: { entryId: "new-entry" } });
    renderWith(<PackEditor screen={packScreen()} />);
    fireEvent.click(screen.getByRole("button", { name: p.newEntry }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: t.ieeEditor.kind.item }));
    fireEvent.change(dialog.getByLabelText(new RegExp(`^${p.entrySlug}`)), { target: { value: "boots" } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: p.create }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/catalog?tab=entry&entry=new-entry"));
    expect(actions.createEntryAction).toHaveBeenCalledWith({ packId: PACK_ID, slug: "boots", kind: "item" });
  });

  it("copies an entry into a pack of one's own", async () => {
    actions.copyEntryAction.mockResolvedValue({ ok: "ok", data: { entryId: "copy" } });
    renderWith(<PackEditor screen={packScreen()} />);
    fireEvent.click(screen.getAllByRole("button", { name: p.copy })[0]!);
    expect(screen.getByText(format(p.copyTitle, { name: "Bog" }))).not.toBeNull();
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText(new RegExp(`^${p.entrySlug}`)), { target: { value: "bog2" } });
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: p.copySubmit }));
    });
    await waitFor(() => expect(actions.copyEntryAction).toHaveBeenCalledWith(BOG, { packId: PACK_ID, slug: "bog2" }));
    expect(router.push).toHaveBeenCalledWith("/admin/catalog?tab=entry&entry=copy");
  });

  it("saves the pack's metadata", async () => {
    renderWith(<PackEditor screen={packScreen()} />);
    const meta = within(document.getElementById("pack-meta")!);
    fireEvent.change(meta.getByLabelText(`${p.names} UK`), { target: { value: "Моторошне" } });
    fireEvent.change(meta.getByLabelText(`${p.description} RU`), { target: { value: "Страшные штуки" } });
    fireEvent.click(meta.getByRole("switch", { name: p.visibility }));
    await act(async () => {
      fireEvent.click(meta.getByRole("button", { name: p.save }));
    });
    await waitFor(() =>
      // Only what changed: the slug and the language stay out of the patch.
      expect(actions.updatePackAction).toHaveBeenCalledWith(PACK_ID, {
        names: { ru: "Жуть", en: "Spooky", uk: "Моторошне" },
        description: { ru: "Страшные штуки" },
        visibility: "draft",
      }),
    );
  });

  it("a save with nothing changed sends nothing", () => {
    renderWith(<PackEditor screen={packScreen()} />);
    fireEvent.click(within(document.getElementById("pack-meta")!).getByRole("button", { name: p.save }));
    expect(actions.updatePackAction).not.toHaveBeenCalled();
  });

  it("archives after a confirmation", async () => {
    renderWith(<PackEditor screen={packScreen()} />);
    fireEvent.click(screen.getByRole("button", { name: p.archive }));
    expect(screen.getByText(format(p.archiveConfirm, { name: "Spooky" }))).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.core.common.confirm }));
    });
    await waitFor(() => expect(actions.setPackArchivedAction).toHaveBeenCalledWith(PACK_ID, true));
  });

  it("exports a .ggpack the browser saves", async () => {
    actions.exportPackAction.mockResolvedValue({ ok: "ok", data: { fileName: "spooky.ggpack", base64: "AQID" } });
    const created: Blob[] = [];
    const url = globalThis.URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
    url.createObjectURL = (b: Blob) => {
      created.push(b);
      return "blob:x";
    };
    url.revokeObjectURL = () => {};
    renderWith(<PackEditor screen={packScreen()} />);
    fireEvent.click(screen.getByRole("switch", { name: p.exportHistory }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: p.export }));
    });
    await waitFor(() => expect(actions.exportPackAction).toHaveBeenCalledWith(PACK_ID, true));
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]!.size).toBe(3);
  });

  it("a read-only system pack: a notice, no publish, copies go elsewhere", () => {
    renderWith(
      <PackEditor
        screen={packScreen({
          pack: packSummary({ id: CORE_PACK_ID, slug: "core", system: true, editable: false }),
          targets: [{ id: PACK_ID, slug: "spooky", name: { ru: "Жуть", en: "Spooky", uk: "Жуть" } }],
        })}
      />,
    );
    expect(screen.getByText(p.readOnlyNotice)).not.toBeNull();
    expect(screen.queryByRole("button", { name: p.newEntry })).toBeNull();
    expect(screen.queryByRole("button", { name: p.archive })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: p.copy })[0]!);
    expect((screen.getByLabelText(new RegExp(`^${p.copyTarget}`)) as HTMLSelectElement).value).toBe(PACK_ID);
  });

  it("attaching a hidden pack asks to offer it first", () => {
    renderWith(<PackEditor screen={packScreen({ pack: packSummary({ visibility: "draft" }) })} />);
    expect(screen.getByText(p.attachHidden)).not.toBeNull();
  });

  it("attaches to a season through the wizard", () => {
    renderWith(<PackEditor screen={packScreen()} />);
    fireEvent.change(screen.getByLabelText(p.chooseSeason), { target: { value: "s1" } });
    expect(screen.getByRole("link", { name: p.openWizard }).getAttribute("href")).toBe(`/admin/seasons/s1?stage=iee&pack=${PACK_ID}`);
  });
});
