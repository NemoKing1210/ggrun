// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import { scenarioText, type EntryDoc } from "@/lib/engine/iee/dsl";
import { format } from "@/lib/i18n/format";

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
// The real runner: what the editor shows is what publishing will say.
const { runEntryScenarios } = await import("@/lib/modules/iee/sim/scenarios");

const sc = t.ieeEditor.entry.scenarios;
const CORE = new Map(CORE_DOCS.map((d) => [d.entryId, d.doc]));
const docOf = (key: CoreKey): EntryDoc => structuredClone(CORE.get(CORE_ENTRY_IDS[key])!);

function open(doc: EntryDoc, over: Parameters<typeof entryScreenOf>[1] = {}) {
  return renderWith(<EntryEditor screen={entryScreenOf(doc, over)} />);
}

const block = () => within(document.getElementById("block-scenarios")!);
const card = (n: number) => within(document.getElementById(`scenario-${n}`)!);
const sent = (call: number) => actions.runScenariosAction.mock.calls[call]![1] as EntryDoc;

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.saveEntryDraftAction.mockResolvedValue({ ok: t.ieeEditor.toast.draftSaved, data: { slug: "swamp", errors: [], warnings: [] } });
  actions.publishEntryAction.mockResolvedValue({ ok: "Published", data: { state: "published", number: 1, errors: [], warnings: [] } });
  actions.runScenariosAction.mockImplementation(async (entryId: string, draft: EntryDoc) => {
    const data = await runEntryScenarios({ entryId, doc: draft, docOf: (id) => CORE.get(id) ?? null });
    return { ok: data.ok ? t.ieeEditor.toast.scenariosGreen : t.ieeEditor.toast.scenariosRed, data };
  });
});
afterEach(cleanup);

/** Opens the entry and waits for the run its scenarios start with. */
async function opened(doc: EntryDoc, over: Parameters<typeof entryScreenOf>[1] = {}) {
  open(doc, over);
  // The real runner plays every scenario; a loaded machine takes its time.
  const slow = { timeout: 8000 };
  await waitFor(() => expect(actions.runScenariosAction).toHaveBeenCalledTimes(1), slow);
  await waitFor(() => expect(block().queryAllByText(sc.status.notRun)).toHaveLength(0), slow);
  await waitFor(() => expect(block().getByRole("button", { name: new RegExp(sc.run) })).not.toBeNull(), slow);
}

describe("ScenariosBlock — what the entry promises, checked (spec §5.5)", () => {
  it("opening an entry runs its scenarios once and shows each verdict", async () => {
    const doc = docOf("swamp");
    const total = doc.scenarios!.length;
    await opened(doc);
    expect(actions.runScenariosAction).toHaveBeenCalledWith(ENTRY_ID, expect.objectContaining({ slug: "swamp" }));
    expect(block().getAllByText(sc.status.green)).toHaveLength(total);
    const summary = format(sc.summary, { green: String(total), total: String(total) });
    // In the block's header and in the checks beside the form.
    expect(screen.getAllByText(summary)).toHaveLength(2);
    // Each card reads back as sentences.
    const text = scenarioText(doc.scenarios![0]!, { locale: "en", name: () => "Swamp", kind: () => "effect" });
    expect(card(0).getByText(text.given)).not.toBeNull();
    expect(card(0).getByText(`${text.steps[0]!.when} ${text.steps[0]!.then}`)).not.toBeNull();
  });

  it("an entry without scenarios starts no run", () => {
    const { scenarios: _scenarios, ...doc } = docOf("swamp");
    open(doc);
    expect(block().getByText(sc.empty)).not.toBeNull();
    expect(block().getByRole("button", { name: new RegExp(sc.run) })).toHaveProperty("disabled", true);
    expect(actions.runScenariosAction).not.toHaveBeenCalled();
  });

  it("an edited expectation is re-checked against the last run — no new run — and can take what happened", async () => {
    await opened(docOf("swamp"));
    const moved = card(0).getByLabelText(sc.checks.moved);
    fireEvent.change(moved, { target: { value: "9" } });
    expect(card(0).getByText(sc.status.red)).not.toBeNull();
    expect(card(0).getByText(format(sc.failed, { expected: "9", actual: "4" }))).not.toBeNull();
    expect(screen.getByText(t.ieeEditor.toast.scenariosRed)).not.toBeNull();

    fireEvent.click(card(0).getByRole("button", { name: sc.accept }));
    expect(card(0).getByText(sc.status.green)).not.toBeNull();
    expect((card(0).getByLabelText(sc.checks.moved) as HTMLInputElement).value).toBe("4");
    expect(actions.runScenariosAction).toHaveBeenCalledTimes(1);
  });

  it("a change to what plays needs a new run; the run sends the form as it is", async () => {
    await opened(docOf("swamp"));
    fireEvent.change(card(0).getByLabelText(sc.dice), { target: { value: "6" } });
    expect(card(0).getByText(sc.status.notRun)).not.toBeNull();

    await act(async () => {
      fireEvent.click(block().getByRole("button", { name: new RegExp(sc.run) }));
    });
    await waitFor(() => expect(actions.runScenariosAction).toHaveBeenCalledTimes(2));
    expect((sent(1).scenarios![0]!.steps[0] as { dice: number }).dice).toBe(6);
    // Six on the dice, one cell lost to the swamp.
    await waitFor(() => expect(card(0).getByText(format(sc.failed, { expected: "4", actual: "5" }))).not.toBeNull());
    // Said by the toast and by the checks beside the form.
    expect(screen.getAllByText(t.ieeEditor.toast.scenariosRed).length).toBeGreaterThan(1);
  });

  it("a step that cannot run says why", async () => {
    await opened(docOf("swamp"));
    fireEvent.change(card(0).getByLabelText(sc.dice), { target: { value: "9" } });
    await act(async () => {
      fireEvent.click(block().getByRole("button", { name: new RegExp(sc.run) }));
    });
    const why = format(sc.broken.dice_impossible, { total: "9", count: "1", sides: "6" });
    await waitFor(() => expect(card(0).getByText(why)).not.toBeNull());
    expect(card(0).getByText(sc.status.red)).not.toBeNull();
  });

  it("builds a scenario from nothing: Given, When, Then, a run, and what happened", async () => {
    const { scenarios: _scenarios, ...doc } = docOf("swamp");
    open(doc);
    fireEvent.click(block().getByRole("button", { name: sc.add }));
    const first = card(0);
    expect(first.getByText(sc.status.notRun)).not.toBeNull();
    // A promise needs words: the check says so until it has them.
    expect(screen.getAllByText(t.ieeEditor.issues.fields.scenarioTitle).length).toBeGreaterThan(0);
    fireEvent.change(first.getByLabelText(`${sc.title} RU`), { target: { value: "Короче на клетку" } });
    expect(screen.queryAllByText(t.ieeEditor.issues.fields.scenarioTitle)).toHaveLength(0);

    await act(async () => {
      fireEvent.click(block().getByRole("button", { name: new RegExp(sc.run) }));
    });
    await waitFor(() => expect(actions.runScenariosAction).toHaveBeenCalledTimes(1));
    // Four on the dice, the swamp takes one: the default expectation misses.
    await waitFor(() => expect(first.getByText(format(sc.failed, { expected: "4", actual: "3" }))).not.toBeNull());
    fireEvent.click(first.getByRole("button", { name: sc.accept }));
    expect(first.getByText(sc.status.green)).not.toBeNull();

    // A new check starts from what the step did.
    fireEvent.change(first.getByLabelText(sc.addCheck), { target: { value: "diceCount" } });
    expect((first.getByLabelText(sc.checks.diceCount) as HTMLInputElement).value).toBe("1");
    expect(first.getAllByText(sc.holds).length).toBeGreaterThan(1);
    expect(first.getByText(sc.happened)).not.toBeNull();
  });

  it("fills Given and every kind of step through the forms", async () => {
    const { scenarios: _scenarios, ...doc } = docOf("swamp");
    open(doc);
    fireEvent.click(block().getByRole("button", { name: sc.add }));
    const c = card(0);
    const tailwind = { entry: CORE_ENTRY_IDS.tailwind, slug: "tailwind" };
    const hex = { entry: CORE_ENTRY_IDS.hex_scroll, slug: "hex_scroll" };
    fireEvent.change(c.getByLabelText(`${sc.title} RU`), { target: { value: "Всё сразу" } });
    fireEvent.click(c.getByRole("button", { name: sc.addNote }));
    fireEvent.change(c.getByLabelText(`${sc.note} EN`), { target: { value: "Why" } });

    // Given: who stands where with what, and the season.
    fireEvent.change(c.getByLabelText(`${sc.holder} · ${sc.position}`), { target: { value: "0" } });
    fireEvent.change(c.getByLabelText(`${sc.rival} · ${sc.points}`), { target: { value: "9" } });
    fireEvent.click(c.getAllByRole("switch", { name: sc.inFlight })[1]!);
    fireEvent.click(c.getByRole("switch", { name: sc.left }));
    fireEvent.click(c.getByRole("switch", { name: sc.left }));
    fireEvent.click(c.getAllByRole("button", { name: sc.addCarry })[1]!);
    fireEvent.change(c.getByLabelText(`${sc.rival} · ${sc.carries}`), { target: { value: tailwind.entry } });
    fireEvent.change(c.getAllByLabelText(sc.count)[1]!, { target: { value: "2" } });
    fireEvent.change(c.getByLabelText(sc.sides), { target: { value: "8" } });
    fireEvent.click(c.getByRole("switch", { name: sc.loop }));
    fireEvent.change(c.getByLabelText(sc.draws), { target: { value: "high" } });

    // A turn of the rival's: a dropped game that ends on a bonus cell.
    fireEvent.change(c.getByLabelText(sc.rolls), { target: { value: "rival" } });
    fireEvent.change(c.getByLabelText(sc.game), { target: { value: "dropped" } });
    fireEvent.change(c.getByLabelText(sc.cell), { target: { value: "bonus" } });
    fireEvent.change(c.getByLabelText(sc.addCheck), { target: { value: "wheel" } });
    fireEvent.change(c.getByLabelText(sc.checks.wheel), { target: { value: "bonus" } });
    fireEvent.change(c.getByLabelText(sc.addCheck), { target: { value: "cellFires" } });
    fireEvent.click(within(c.getByRole("group", { name: sc.checks.cellFires })).getByRole("switch"));

    // An item used on the rival, refused.
    fireEvent.change(c.getByLabelText(sc.addStep), { target: { value: "use" } });
    fireEvent.change(c.getByLabelText(sc.item), { target: { value: hex.entry } });
    fireEvent.change(c.getByLabelText(sc.aimed), { target: { value: "rival" } });
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[1]!, { target: { value: "reason" } });
    fireEvent.change(c.getByLabelText(sc.checks.reason), { target: { value: "ieeTargetProtected" } });
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[1]!, { target: { value: "rival" } });
    fireEvent.change(c.getAllByLabelText(sc.count)[2]!, { target: { value: "0" } });

    // A handout to the rival that refreshes the one there.
    fireEvent.change(c.getByLabelText(sc.addStep), { target: { value: "grant" } });
    fireEvent.change(c.getByLabelText(sc.entry), { target: { value: tailwind.entry } });
    fireEvent.change(c.getByLabelText(sc.to), { target: { value: "rival" } });
    fireEvent.change(c.getAllByLabelText(sc.checks.result)[1]!, { target: { value: "refreshed" } });
    // …and moved before the use.
    fireEvent.click(c.getAllByRole("button", { name: t.ieeEditor.entry.rules.moveUp })[3]!);

    // A step that changes its mind, then goes.
    fireEvent.change(c.getByLabelText(sc.addStep), { target: { value: "roll" } });
    fireEvent.change(c.getByLabelText(format(sc.step, { number: "4" })), { target: { value: "grant" } });
    fireEvent.click(c.getAllByRole("button", { name: sc.removeStep })[3]!);

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: t.ieeEditor.entry.save })[0]!);
    });
    await waitFor(() => expect(actions.saveEntryDraftAction).toHaveBeenCalledTimes(1));
    const saved = (actions.saveEntryDraftAction.mock.calls[0]![1] as EntryDoc).scenarios!;
    expect(saved).toEqual([
      {
        title: { ru: "Всё сразу" },
        note: { ru: "", en: "Why" },
        given: {
          holder: { carries: [{ entry: "self" }], position: 0 },
          rival: { balance: 9, inFlight: true, carries: [{ entry: tailwind, count: 2 }] },
          sides: 8,
          loop: true,
          draws: "high",
        },
        steps: [
          { do: "roll", by: "rival", outcome: "dropped", dice: 4, cell: "bonus", expect: { moved: 4, wheel: "bonus", cellFires: false } },
          { do: "grant", entry: tailwind, to: "rival", expect: { result: "refreshed" } },
          { do: "use", item: hex, on: "rival", expect: { result: "refused", reason: "ieeTargetProtected", rival: [{ entry: "self", count: 0 }] } },
        ],
      },
    ]);
  });

  it("answers a choice through the forms: who, which way, which items — and checks what waits (wave B, spec §7.6)", async () => {
    const { scenarios: _scenarios, ...doc } = docOf("swamp");
    open(doc);
    fireEvent.click(block().getByRole("button", { name: sc.add }));
    const c = card(0);
    const hex = { entry: CORE_ENTRY_IDS.hex_scroll, slug: "hex_scroll" };
    fireEvent.change(c.getByLabelText(`${sc.title} RU`), { target: { value: "Выбор" } });
    fireEvent.change(c.getByLabelText(sc.addStep), { target: { value: "decide" } });
    fireEvent.change(c.getByLabelText(sc.decidedBy), { target: { value: "rival" } });
    // The default needs no picks: they show once an option that takes items is named.
    expect(c.queryByRole("group", { name: sc.picks })).toBeNull();
    fireEvent.change(c.getByLabelText(sc.option), { target: { value: "discard" } });
    const picks = within(c.getByRole("group", { name: sc.picks }));
    fireEvent.click(picks.getByRole("button", { name: sc.addPick }));
    fireEvent.change(picks.getByRole("combobox"), { target: { value: hex.entry } });
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[1]!, { target: { value: "decision" } });
    fireEvent.change(c.getByLabelText(sc.checks.decision), { target: { value: "none" } });

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: t.ieeEditor.entry.save })[0]!);
    });
    await waitFor(() => expect(actions.saveEntryDraftAction).toHaveBeenCalledTimes(1));
    const saved = (actions.saveEntryDraftAction.mock.calls[0]![1] as EntryDoc).scenarios!;
    expect(saved[0]!.steps[1]).toEqual({ do: "decide", by: "rival", option: "discard", picks: [hex], expect: { result: "decided", decision: "none" } });
  });

  it("the next game through the forms: the games given, a draw, what a use picks and takes, the game checks (wave C, spec §5.5, §7.12)", async () => {
    const { scenarios: _scenarios, ...doc } = docOf("swamp");
    open(doc);
    fireEvent.click(block().getByRole("button", { name: sc.add }));
    const c = card(0);
    const hex = { entry: CORE_ENTRY_IDS.hex_scroll, slug: "hex_scroll" };
    fireEvent.change(c.getByLabelText(`${sc.title} RU`), { target: { value: "Игры" } });
    expect(c.getByText(sc.poolHint)).not.toBeNull();

    // Given: the holder plays Starfall — a game in flight, which the switch now says and keeps — and has passed two.
    fireEvent.change(c.getByLabelText(`${sc.holder} · ${sc.playing}`), { target: { value: "starfall" } });
    const inFlight = c.getAllByRole("switch", { name: sc.inFlight })[0]! as HTMLButtonElement;
    expect(inFlight.getAttribute("aria-checked")).toBe("true");
    expect(inFlight.disabled).toBe(true);
    const passed = within(c.getByRole("group", { name: `${sc.holder} · ${sc.passedGames}` }));
    fireEvent.click(passed.getByRole("button", { name: "Night Shift" }));
    fireEvent.click(passed.getByRole("button", { name: "Old Keep" }));
    fireEvent.click(passed.getByRole("button", { name: "Night Shift" }));
    fireEvent.click(passed.getByRole("button", { name: "Sky Garden" }));

    // The rival's next game, a choice taken; the holder's game and the choice checked after it.
    fireEvent.change(c.getByLabelText(sc.addStep), { target: { value: "draw" } });
    fireEvent.change(c.getByLabelText(sc.drawnBy), { target: { value: "rival" } });
    fireEvent.change(c.getByLabelText(sc.take), { target: { value: "quiet_house" } });
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[1]!, { target: { value: "game" } });
    fireEvent.change(c.getByLabelText(sc.checks.game), { target: { value: "none" } });
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[1]!, { target: { value: "offered" } });
    fireEvent.change(c.getByLabelText(sc.checks.offered), { target: { value: "3" } });
    // And the completion conditions the game holds (spec §6.17).
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[1]!, { target: { value: "conditions" } });
    fireEvent.change(c.getByLabelText(sc.checks.conditions), { target: { value: "2" } });
    fireEvent.change(c.getAllByLabelText(sc.checks.result)[0]!, { target: { value: "choosing" } });

    // An item used with a pick for the next game — years, then a genre — and the game a choice takes.
    fireEvent.change(c.getByLabelText(sc.addStep), { target: { value: "use" } });
    fireEvent.change(c.getByLabelText(sc.item), { target: { value: hex.entry } });
    const pick = within(c.getByRole("group", { name: sc.pick }));
    fireEvent.change(pick.getByRole("combobox", { name: sc.pick }), { target: { value: "years" } });
    expect((pick.getByLabelText(`${sc.pick} · ${sc.pickFrom}`) as HTMLInputElement).value).toBe("1990");
    fireEvent.change(pick.getByRole("combobox", { name: sc.pick }), { target: { value: "genre" } });
    fireEvent.change(pick.getByLabelText(sc.pickGenre), { target: { value: "horror" } });
    fireEvent.change(c.getAllByLabelText(sc.take)[1]!, { target: { value: "gear_run" } });
    fireEvent.change(c.getAllByLabelText(sc.addCheck)[2]!, { target: { value: "reason" } });
    // A use is refused in the item path's words — the pool's own reason among them.
    const reasons = [...(c.getByLabelText(sc.checks.reason) as HTMLSelectElement).options].map((o) => o.value);
    expect(reasons).toEqual(expect.arrayContaining(["ieeItemNotFound", "ieePickInvalid", "catalogAllPlayed"]));
    expect(reasons).not.toContain("gameAlreadyHaveRoll");

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: t.ieeEditor.entry.save })[0]!);
    });
    await waitFor(() => expect(actions.saveEntryDraftAction).toHaveBeenCalledTimes(1));
    const saved = (actions.saveEntryDraftAction.mock.calls[0]![1] as EntryDoc).scenarios!;
    expect(saved[0]!.given).toEqual({ holder: { carries: [{ entry: "self" }], game: "starfall", passed: ["old_keep", "sky_garden"] } });
    expect(saved[0]!.steps.slice(1)).toEqual([
      { do: "draw", by: "rival", take: "quiet_house", expect: { result: "choosing", game: "none", offered: 3, conditions: 2 } },
      { do: "use", item: hex, pick: { genre: "horror" }, take: "gear_run", expect: { result: "refused", reason: "ieeItemNotFound" } },
    ]);
  });

  it("objects on the board through the forms: those given, whose, and the cell a use picks (wave D, spec §6.18)", async () => {
    const { scenarios: _scenarios, ...boots } = docOf("speed_boots");
    const mine: EntryDoc = {
      ...boots,
      usage: { activation: "active", window: "anytime", charges: 1, target: { who: "self" }, pick: "cell" },
      rules: [
        { when: "onUse", do: [{ op: "placeObject" }] },
        { when: "onObjectEntered", do: [{ op: "stopMove" }] },
      ],
    };
    open(mine);
    fireEvent.click(block().getByRole("button", { name: sc.add }));
    const c = card(0);
    fireEvent.change(c.getByLabelText(`${sc.title} RU`), { target: { value: "Мина" } });

    // Given: two objects, one of them the rival's, then one gone again.
    fireEvent.click(c.getByRole("button", { name: sc.addObject }));
    fireEvent.click(c.getByRole("button", { name: sc.addObject }));
    fireEvent.change(c.getAllByLabelText(sc.objectCell)[0]!, { target: { value: "13" } });
    fireEvent.change(c.getAllByLabelText(sc.objectOwner)[0]!, { target: { value: "rival" } });
    // The removes in order: the carried entry's, then each object's.
    fireEvent.click(c.getAllByRole("button", { name: t.ieeEditor.remove })[2]!);
    expect(c.getAllByLabelText(sc.objectItem)).toHaveLength(1);

    // The use picks its cell — the default it starts with, changed — and checks what stands after it.
    const pick = within(c.getByRole("group", { name: sc.pick }));
    expect((pick.getByRole("combobox", { name: sc.pick }) as HTMLSelectElement).value).toBe("cell");
    fireEvent.change(pick.getByLabelText(`${sc.pick} · ${sc.pickKinds.cell}`), { target: { value: "20" } });
    fireEvent.change(c.getByLabelText(sc.checks.objects), { target: { value: "2" } });

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: t.ieeEditor.entry.save })[0]!);
    });
    await waitFor(() => expect(actions.saveEntryDraftAction).toHaveBeenCalledTimes(1));
    const saved = (actions.saveEntryDraftAction.mock.calls[0]![1] as EntryDoc).scenarios!;
    expect(saved[0]!.given).toEqual({ holder: { carries: [{ entry: "self" }] }, objects: [{ entry: "self", cell: 13, owner: "rival" }] });
    expect(saved[0]!.steps).toEqual([{ do: "use", pick: { cell: 20 }, expect: { result: "used", objects: 2 } }]);
  });

  it("duplicates and removes scenarios", async () => {
    await opened(docOf("swamp"));
    const total = docOf("swamp").scenarios!.length;
    fireEvent.click(card(0).getByRole("button", { name: sc.duplicate }));
    expect(document.getElementById(`scenario-${total}`)).not.toBeNull();
    // The copy plays what the original did: the last run still describes it.
    expect(card(1).getByText(sc.status.green)).not.toBeNull();
    expect((card(1).getByLabelText(sc.id) as HTMLInputElement).value).toBe(`SC-SWAMP-${total + 1}`);
    fireEvent.click(card(1).getByRole("button", { name: sc.removeScenario }));
    expect(document.getElementById(`scenario-${total}`)).toBeNull();
  });

  it("saving runs them again, quietly", async () => {
    await opened(docOf("swamp"));
    fireEvent.change(card(0).getByLabelText(sc.checks.moved), { target: { value: "3" } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: t.ieeEditor.entry.save })[0]!);
    });
    await waitFor(() => expect(actions.runScenariosAction).toHaveBeenCalledTimes(2));
    expect((sent(1).scenarios![0]!.steps[0]!.expect as { moved: number }).moved).toBe(3);
  });

  it("a publish that scenarios refused shows what they did", async () => {
    actions.publishEntryAction.mockResolvedValue({
      error: t.ieeEditor.toast.blocked,
      data: { state: "blocked", number: null, errors: [], warnings: [] },
    });
    await opened(docOf("swamp"));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(t.ieeEditor.entry.publish) })[0]!);
    });
    await waitFor(() => expect(actions.publishEntryAction).toHaveBeenCalledWith(ENTRY_ID));
    await waitFor(() => expect(actions.runScenariosAction).toHaveBeenCalledTimes(2));
  });

  it("a system entry's scenarios run but cannot be changed", async () => {
    await opened(docOf("swamp"), { entry: { editable: false } });
    expect(block().queryByRole("button", { name: sc.add })).toBeNull();
    expect(block().queryByRole("button", { name: sc.removeScenario })).toBeNull();
    expect(block().getByRole("button", { name: new RegExp(sc.run) })).toHaveProperty("disabled", false);
    expect((card(0).getByLabelText(sc.checks.moved) as HTMLInputElement).disabled).toBe(true);
  });
});
