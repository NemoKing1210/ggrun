// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";
import { format } from "@/lib/i18n/format";
import type { SandboxRequest } from "@/lib/modules/iee/library/sandbox";

import { ENTRY_ID, entryScreenOf, renderWith, t } from "../fixtures.test-helpers";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({
  saveEntryDraftAction: vi.fn(),
  publishEntryAction: vi.fn(),
  setEntryArchivedAction: vi.fn(),
  setEntryIconAction: vi.fn(),
  copyEntryAction: vi.fn(),
  runScenariosAction: vi.fn(),
  runSandboxAction: vi.fn(),
}));
vi.mock("@/lib/modules/iee/actions/library", () => actions);

// The whole editor, rendered and played for real: seconds alone, several more
// under a full coverage run on a small machine.
vi.setConfig({ testTimeout: 30_000 });

const { EntryEditor } = await import("../EntryEditor");
// The real runner: what the block shows is what the server plays.
const { runSandbox } = await import("@/lib/modules/iee/sim/sandbox");

const sb = t.ieeEditor.entry.sandbox;
const CORE = new Map(CORE_DOCS.map((d) => [d.entryId, d.doc]));
const docOf = (key: CoreKey): EntryDoc => {
  const { scenarios: _scenarios, ...doc } = structuredClone(CORE.get(CORE_ENTRY_IDS[key])!);
  return doc;
};
const block = () => within(document.getElementById("block-sandbox")!);

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.runSandboxAction.mockImplementation(async (entryId: string, draft: EntryDoc, request: SandboxRequest) => {
    const data = await runSandbox(
      {
        entryId,
        doc: draft,
        docOf: (id) => CORE.get(id) ?? null,
        extras: request.withCore ? CORE_DOCS.map(({ entryId: id, doc }) => ({ entryId: id, doc })) : [],
      },
      { bots: request.bots, rounds: request.rounds, seed: request.seed ?? 1234, startWith: request.startWith },
    );
    return { ok: data.ok ? t.ieeEditor.toast.sandboxDone : t.ieeEditor.toast.sandboxBroken, data };
  });
});
afterEach(cleanup);

async function play() {
  await act(async () => {
    fireEvent.click(block().getByRole("button", { name: sb.run }));
  });
  await waitFor(() => expect(actions.runSandboxAction).toHaveBeenCalled());
}

describe("SandboxBlock — the draft played by bots, nothing saved (spec §10.5)", () => {
  it("plays with the bots, rounds and seed chosen, and shows the summary and the turns", async () => {
    renderWith(<EntryEditor screen={entryScreenOf(docOf("hex_scroll"))} />);
    fireEvent.change(block().getByLabelText(sb.bots), { target: { value: "2" } });
    fireEvent.change(block().getByLabelText(sb.rounds), { target: { value: "5" } });
    fireEvent.change(block().getByLabelText(sb.seed), { target: { value: "11" } });
    await play();
    const [id, draft, request] = actions.runSandboxAction.mock.calls[0]!;
    expect(id).toBe(ENTRY_ID);
    expect((draft as EntryDoc).slug).toBe("hex_scroll");
    expect(request).toEqual({ bots: 2, rounds: 5, seed: 11, withCore: false, startWith: true });

    const summary = format(sb.ranSummary, { seed: "11", bots: "2", played: "5", rounds: "5" });
    await waitFor(() => expect(block().getByText(summary)).not.toBeNull());
    expect(block().getAllByText(format(sb.botName, { number: "1" })).length).toBeGreaterThan(0);
    expect(block().getAllByText(format(sb.botName, { number: "2" })).length).toBeGreaterThan(0);
    // The entry leads its table; what it hands out follows.
    const rows = within(block().getByText(sb.entriesTitle).parentElement!).getAllByRole("row");
    expect(rows[1]!.textContent).toContain("Hex Scroll");
    expect(rows.some((r) => r.textContent?.includes("Swamp"))).toBe(true);
    expect(block().getByText(format(sb.round, { number: "1" }))).not.toBeNull();
    // The seed stays in the box: playing again repeats the run.
    expect((block().getByLabelText(sb.seed) as HTMLInputElement).value).toBe("11");
    fireEvent.click(block().getByRole("button", { name: sb.newSeed }));
    expect((block().getByLabelText(sb.seed) as HTMLInputElement).value).toBe("");
  });

  it("shows only the turns the entry took part in, or all of them", async () => {
    renderWith(<EntryEditor screen={entryScreenOf(docOf("hex_scroll"))} />);
    fireEvent.change(block().getByLabelText(sb.rounds), { target: { value: "12" } });
    fireEvent.click(block().getByRole("switch", { name: sb.startWith }));
    fireEvent.click(block().getByRole("switch", { name: sb.withCore }));
    await play();
    expect(actions.runSandboxAction.mock.calls[0]![2]).toMatchObject({ withCore: true, startWith: false, seed: null });
    await waitFor(() => expect(block().getByText(sb.trace)).not.toBeNull());
    const lines = () => document.querySelectorAll("#block-sandbox details li").length;
    const mine = lines();
    fireEvent.click(block().getByRole("switch", { name: sb.onlyMine }));
    expect(lines()).toBeGreaterThan(mine);
  });

  it("a change to what the entry plays marks the run as stale", async () => {
    renderWith(<EntryEditor screen={entryScreenOf(docOf("swamp"))} />);
    await play();
    await waitFor(() => expect(block().getByText(sb.trace)).not.toBeNull());
    expect(screen.queryByText(sb.stale)).toBeNull();
    // A name is only a name…
    fireEvent.change(within(document.getElementById("block-basics")!).getByLabelText(`${t.ieeEditor.entry.basics.name} EN`), {
      target: { value: "Mire" },
    });
    expect(screen.queryByText(sb.stale)).toBeNull();
    // …a rarity is how often it drops.
    fireEvent.click(within(document.getElementById("block-basics")!).getByRole("button", { name: t.iee.rarity.epic }));
    expect(screen.getByText(sb.stale)).not.toBeNull();
  });

  it("a bot its own item takes to the finish shows the move and no game result", async () => {
    const { params: _params, ...teleport } = docOf("teleport");
    const far: EntryDoc = { ...teleport, slug: "far_teleport", rules: [{ when: "onUse", do: [{ op: "move", by: 40 }] }] };
    renderWith(<EntryEditor screen={entryScreenOf(far)} />);
    fireEvent.change(block().getByLabelText(sb.bots), { target: { value: "4" } });
    fireEvent.change(block().getByLabelText(sb.rounds), { target: { value: "10" } });
    fireEvent.change(block().getByLabelText(sb.seed), { target: { value: "42" } });
    await play();
    await waitFor(() => expect(block().getAllByText(sb.status.finished).length).toBeGreaterThan(0));
    const lines = block()
      .getAllByText(sb.status.finished)
      .flatMap((el) => (el.closest("li") ? [el.closest("li")!] : []));
    const noResult = lines.filter((li) => !within(li).queryByText(sb.outcome.passed) && !within(li).queryByText(sb.outcome.dropped));
    expect(noResult.length).toBeGreaterThan(0);
  });

  it("says why an entry does not play, and when a draft does not read", async () => {
    actions.runSandboxAction.mockResolvedValueOnce({ ok: t.ieeEditor.toast.sandboxBroken, data: { ok: false, reason: "compile", message: "ghost" } });
    renderWith(<EntryEditor screen={entryScreenOf(docOf("swamp"))} />);
    await play();
    await waitFor(() => expect(block().getByText(format(sb.broken, { message: "ghost" }))).not.toBeNull());

    actions.runSandboxAction.mockResolvedValueOnce({ ok: t.ieeEditor.toast.sandboxUnreadable, data: null });
    await act(async () => {
      fireEvent.click(block().getByRole("button", { name: sb.run }));
    });
    await waitFor(() => expect(screen.getByText(t.ieeEditor.toast.sandboxUnreadable)).not.toBeNull());

    actions.runSandboxAction.mockResolvedValueOnce({ error: "nope" });
    await act(async () => {
      fireEvent.click(block().getByRole("button", { name: sb.run }));
    });
    await waitFor(() => expect(screen.getByText("nope")).not.toBeNull());
  });
});
