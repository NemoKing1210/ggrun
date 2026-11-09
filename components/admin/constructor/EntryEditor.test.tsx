// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import { CORE_DOCS, CORE_ENTRY_IDS, type CoreKey } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";
import { format } from "@/lib/i18n/format";
import { skeletonDraft } from "@/lib/modules/iee/library/draft";

import { ENTRY_ID, entryScreenOf, renderWith, t } from "./fixtures.test-helpers";

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

const { EntryEditor } = await import("./EntryEditor");

const e = t.ieeEditor.entry;
const v = t.ieeEditor.vocab;
const docOf = (key: CoreKey): EntryDoc => structuredClone(CORE_DOCS.find((d) => d.entryId === CORE_ENTRY_IDS[key])!.doc);

function open(doc: EntryDoc, over: Parameters<typeof entryScreenOf>[1] = {}) {
  return renderWith(<EntryEditor screen={entryScreenOf(doc, over)} />);
}

/** The text a block shows, scoped to it. */
const block = (id: string) => within(document.getElementById(id)!);
const panelText = () => document.body.textContent ?? "";

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.saveEntryDraftAction.mockResolvedValue({ ok: t.ieeEditor.toast.draftSaved, data: { slug: "gust", errors: [], warnings: [] } });
  actions.publishEntryAction.mockResolvedValue({ ok: "Published", data: { state: "published", number: 1, errors: [], warnings: [] } });
  actions.runScenariosAction.mockResolvedValue({ ok: t.ieeEditor.toast.scenariosGreen, data: { ok: true, reports: [] } });
  router.refresh.mockReset();
  router.push.mockReset();
});
afterEach(cleanup);

describe("EntryEditor — the document as forms (plan §6 task 3.2)", () => {
  it("an effect has basics, rules, duration, limits, interaction, scenarios and the sandbox — no usage", () => {
    open(skeletonDraft("gust", "effect"));
    for (const id of ["block-basics", "block-rules", "block-duration", "block-limits", "block-interaction", "block-scenarios", "block-sandbox"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(document.getElementById("block-usage")).toBeNull();
    // A new entry has no rules yet — and says so in the checks.
    expect(screen.getAllByText(t.ieeEditor.issues.no_rules).length).toBeGreaterThan(0);
  });

  it("builds «Болото» from nothing: the text, the power and the checks follow the form", () => {
    open(skeletonDraft("bog", "effect"));
    const basics = block("block-basics");
    fireEvent.change(basics.getByLabelText(`${e.basics.name} RU`), { target: { value: "Болото" } });
    fireEvent.change(basics.getByLabelText(`${e.basics.name} EN`), { target: { value: "Swamp" } });
    fireEvent.click(basics.getByRole("button", { name: t.ieeEditor.character.penalty }));
    expect(screen.getAllByText(t.ieeEditor.unsaved).length).toBeGreaterThan(0);

    // A rule: after the roll, change the distance — the only actions offered there.
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    const add = rules.getByLabelText(e.rules.addAction) as HTMLSelectElement;
    expect([...add.options].map((o) => o.textContent)).toEqual([e.rules.addAction, v.actions.steps.label, v.actions.noMove.label]);
    fireEvent.change(add, { target: { value: "steps" } });
    // A penalty's distance starts at −1.
    expect(rules.getByText("Your move is 1 cell shorter.")).not.toBeNull();

    // Two moves.
    const duration = block("block-duration");
    fireEvent.change(duration.getByLabelText(new RegExp(`^${e.duration.unit}`)), { target: { value: "moves" } });
    fireEvent.change(duration.getByLabelText(new RegExp(`^${e.duration.count}`)), { target: { value: "2" } });

    // Tunable by a season: the value becomes a parameter, born in Limits.
    fireEvent.click(rules.getByRole("button", { name: e.value.param }));
    expect(block("block-limits").getByDisplayValue("steps")).not.toBeNull();

    expect(panelText()).toContain("Your move is 1 cell shorter. Lasts 2 moves.");
    expect(panelText()).toContain("Ваш ход короче на 1 клетку. Действует 2 хода.");
    expect(screen.getByText(e.panel.ok)).not.toBeNull();
    expect(screen.getByText("2.0")).not.toBeNull();
  });

  it("saves the cleaned draft, then the draft is clean again", async () => {
    open(docOf("swamp"));
    expect(screen.queryByText(t.ieeEditor.unsaved)).toBeNull();
    fireEvent.change(block("block-basics").getByLabelText(`${e.basics.name} EN`), { target: { value: "  Bog  " } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: e.save })[0]!);
    });
    await waitFor(() => expect(actions.saveEntryDraftAction).toHaveBeenCalledTimes(1));
    const [id, draft] = actions.saveEntryDraftAction.mock.calls[0]!;
    expect(id).toBe(ENTRY_ID);
    expect((draft as EntryDoc).name).toEqual({ ru: "Болото", en: "Bog", uk: "Болото" });
    await waitFor(() => expect(screen.queryByText(t.ieeEditor.unsaved)).toBeNull());
    expect(router.refresh).toHaveBeenCalled();
  });

  it("publishing saves unsaved work first", async () => {
    open(docOf("swamp"));
    fireEvent.click(block("block-basics").getByRole("button", { name: t.iee.rarity.rare }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(e.publish) })[0]!);
    });
    await waitFor(() => expect(actions.publishEntryAction).toHaveBeenCalledWith(ENTRY_ID));
    expect(actions.saveEntryDraftAction).toHaveBeenCalledTimes(1);
    expect((actions.saveEntryDraftAction.mock.calls[0]![1] as EntryDoc).rarity).toBe("rare");
  });

  it("a refused save leaves the work unsaved", async () => {
    actions.saveEntryDraftAction.mockResolvedValue({ error: "nope" });
    open(docOf("swamp"));
    fireEvent.click(block("block-basics").getByRole("button", { name: t.iee.rarity.rare }));
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: new RegExp(e.publish) })[0]!);
    });
    await waitFor(() => expect(actions.saveEntryDraftAction).toHaveBeenCalled());
    expect(actions.publishEntryAction).not.toHaveBeenCalled();
    expect(screen.getAllByText(t.ieeEditor.unsaved).length).toBeGreaterThan(0);
  });

  it("an item: usage, and a rule that hands out a library effect to the holder", () => {
    open(skeletonDraft("boots", "item"));
    const usage = block("block-usage");
    fireEvent.change(usage.getByLabelText(new RegExp(`^${e.usage.window}`)), { target: { value: "before_roll" } });

    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    // An item's only moment is its use.
    expect((rules.getByLabelText(e.rules.when) as HTMLSelectElement).value).toBe("onUse");
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "grantEffect" } });
    // The effect is still to be chosen: the check says so at the picker.
    expect(rules.getAllByText(t.ieeEditor.issues.fields.entry).length).toBeGreaterThan(0);
    // A self-aimed item has nobody else to give it to.
    const to = rules.getByLabelText(v.fields.to) as HTMLSelectElement;
    expect([...to.options].map((o) => o.value)).toEqual(["self"]);

    const picker = rules.getByLabelText(v.fields.entry) as HTMLSelectElement;
    // Only effects are offered for "give an effect".
    const offered = [...picker.options].map((o) => o.value).filter(Boolean);
    expect(offered).toContain(CORE_ENTRY_IDS.tailwind);
    expect(offered).not.toContain(CORE_ENTRY_IDS.speed_boots);
    fireEvent.change(picker, { target: { value: CORE_ENTRY_IDS.tailwind } });
    expect(rules.getByText("You get “Tailwind”.")).not.toBeNull();
    expect(panelText()).toContain("Use before your roll. Single use. You get “Tailwind”.");

    // Aimed at another player, the chosen player becomes a recipient.
    fireEvent.click(usage.getByRole("button", { name: t.iee.admin.target.other }));
    const aimedTo = rules.getByLabelText(v.fields.to) as HTMLSelectElement;
    expect([...aimedTo.options].map((o) => o.value)).toEqual(["self", "target"]);
  });

  it("switching kind before the first publish swaps usage for duration", () => {
    open(skeletonDraft("thing", "effect"));
    fireEvent.click(block("block-basics").getByRole("button", { name: t.ieeEditor.kind.item }));
    expect(document.getElementById("block-usage")).not.toBeNull();
    expect(document.getElementById("block-duration")).toBeNull();
  });

  it("a published entry keeps its kind", () => {
    open(docOf("swamp"), { entry: { kindLocked: true } });
    expect(block("block-basics").getByRole("button", { name: t.ieeEditor.kind.item }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(e.basics.kindLocked)).not.toBeNull();
  });

  it("conditions offered depend on the moment", () => {
    open(docOf("swamp"));
    const rules = block("block-rules");
    const addCondition = () => rules.getByLabelText(e.rules.addCondition) as HTMLSelectElement;
    // After the roll the cell is not known yet: no cell condition — but the dice are; an
    // effect may read the player its item was aimed at (wave A).
    const waveA = ["rank", "itemCount", "targetRelative", "compareLastRoll"];
    expect([...addCondition().options].map((o) => o.value)).toEqual(["", "outcome", "chance", "hasEntry", "diceShow", ...waveA]);
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "afterCellEffect" } });
    expect([...addCondition().options].map((o) => o.value)).toEqual(["", "outcome", "cellType", "chance", "hasEntry", "diceShow", ...waveA]);
    // The distance cannot change after the cell: the action is marked, not dropped.
    expect(rules.getAllByText(format(t.ieeEditor.issues.action_trigger, { op: v.actions.steps.label, trigger: v.triggers.afterCellEffect.label })).length).toBeGreaterThan(0);
    fireEvent.change(addCondition(), { target: { value: "cellType" } });
    expect(rules.getByRole("button", { name: t.core.cellTypes.penalty })).not.toBeNull();
  });

  it("right after the dice: the pipeline's actions and the dice condition, each with its fields (wave A)", () => {
    open(skeletonDraft("fortune", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "afterDice" } });
    const add = () => rules.getByLabelText(e.rules.addAction) as HTMLSelectElement;
    expect([...add().options].map((o) => o.value)).toEqual(["", "rerollOn", "bestOfTwo", "worstOfTwo", "resultModify", "direction"]);

    // A bonus throws a 1 again; a second face joins it.
    fireEvent.change(add(), { target: { value: "rerollOn" } });
    expect(rules.getByText("A die showing 1 is thrown again once.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "2" }));
    expect(rules.getByText("A die showing 1 or 2 is thrown again once.")).not.toBeNull();

    // The result: a bonus adds 1; a cap may join it, and one of the two always stays.
    fireEvent.change(add(), { target: { value: "resultModify" } });
    expect(rules.getByText(/the dice result is 1 higher\./)).not.toBeNull();
    fireEvent.click(rules.getByRole("switch", { name: v.fields.resultCap }));
    expect(rules.getByText(/the dice result is 1 higher and at most 3\./)).not.toBeNull();
    fireEvent.click(rules.getByRole("switch", { name: v.fields.resultDelta }));
    expect(rules.getByText(/the dice result is at most 3\./)).not.toBeNull();
    expect((rules.getByRole("switch", { name: v.fields.resultCap }) as HTMLButtonElement).disabled).toBe(true);

    // The dice condition: the sum or any die, against a number.
    fireEvent.change(rules.getByLabelText(e.rules.addCondition), { target: { value: "diceShow" } });
    expect(rules.getByText(/^If the dice show 4 or less, /)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.anyDie }));
    fireEvent.click(rules.getByRole("button", { name: v.fields.eq }));
    expect(rules.getByText(/^If a die shows 4, /)).not.toBeNull();
  });

  it("an instant effect: arrival only, a move on a die table, a swap with the rival behind (wave A)", () => {
    open(skeletonDraft("shove", "effect"));
    const duration = block("block-duration");
    fireEvent.change(duration.getByLabelText(new RegExp(`^${e.duration.unit}`)), { target: { value: "instant" } });
    // Nothing is kept, so nothing is counted or stacked.
    expect(duration.queryByLabelText(new RegExp(`^${e.duration.count}`))).toBeNull();
    expect(duration.getByText(e.duration.instantStacking)).not.toBeNull();
    expect(duration.queryByRole("button", { name: e.duration.stackingModes.stack })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    expect([...(rules.getByLabelText(e.rules.when) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["onApply"]);
    const add = () => rules.getByLabelText(e.rules.addAction) as HTMLSelectElement;
    const offered = [...add().options].map((o) => o.value);
    expect(offered).toEqual(expect.arrayContaining(["move", "swapPositions", "rollbackLastMove", "halveGap"]));
    // Jumping to a player needs a chosen one: an effect has none.
    expect(offered).not.toContain("moveToTarget");

    fireEvent.change(add(), { target: { value: "move" } });
    expect(rules.getByText("You instantly move 3 cells forward.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: e.value.table }));
    expect(rules.getByText("You instantly move by a d6 roll: 1–2 → 3 back, 3–4 → stay put, 5–6 → 3 forward.")).not.toBeNull();
    fireEvent.change(rules.getByLabelText(`${v.fields.moveBy} 1`), { target: { value: "-1" } });
    expect(rules.getByText(/1–2 → 1 back/)).not.toBeNull();

    fireEvent.change(add(), { target: { value: "swapPositions" } });
    expect(rules.getByRole("button", { name: v.fields.nearestBehind })).not.toBeNull();
    expect(rules.queryByRole("button", { name: v.fields.target })).toBeNull();
  });

  it("a cursed item: a penalty, never used, firing by itself (wave A)", () => {
    open(skeletonDraft("boots", "item"));
    const usage = block("block-usage");
    fireEvent.click(usage.getByRole("button", { name: e.usage.activations.cursed }));
    // A cursed item is a penalty: the character follows.
    expect(block("block-basics").getByRole("button", { name: t.ieeEditor.character.penalty }).className).toContain("bg-danger");
    // Never used: no moment of use, nobody to aim at; it fires a number of times and is always unique.
    expect(usage.queryByLabelText(e.usage.window)).toBeNull();
    expect(usage.queryByRole("button", { name: t.iee.admin.target.other })).toBeNull();
    expect((usage.getByLabelText(new RegExp(`^${e.usage.fires}`)) as HTMLInputElement).value).toBe("1");
    const unique = usage.getByRole("switch", { name: e.usage.unique }) as HTMLButtonElement;
    expect(unique.getAttribute("aria-checked")).toBe("true");
    expect(unique.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    const when = [...(rules.getByLabelText(e.rules.when) as HTMLSelectElement).options].map((o) => o.value);
    expect(when).not.toContain("onUse");
    expect(when).toEqual(expect.arrayContaining(["onPickup", "afterDice", "afterMovement", "onTick"]));
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "afterDice" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "resultModify" } });
    expect(panelText()).toContain("Cursed: it cannot be used and works by itself.");
    expect(panelText()).toContain("Works once, then it is gone.");
  });

  it("an item that asks for a pick: what it removes, picked by the user at use (wave A)", () => {
    open(skeletonDraft("amulet", "item"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "remove" } });
    expect(rules.getByText("Removes one of your penalty effects or cursed items of your choice.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.removePickOptions.newest }));
    expect(rules.getByText("Removes your newest penalty effect or cursed item.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.removeWhatOptions.effect }));
    expect(rules.getByText("Removes your newest penalty effect.")).not.toBeNull();
  });

  it("an item aimed at a player takes, trades and copies its items, each of the rarities picked (wave B)", () => {
    open(skeletonDraft("glove", "item"));
    fireEvent.click(block("block-usage").getByRole("button", { name: t.iee.admin.target.other }));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    const add = () => rules.getByLabelText(e.rules.addAction) as HTMLSelectElement;
    expect([...add().options].map((o) => o.value)).toEqual(expect.arrayContaining(["stealItem", "transferItem", "swapItems", "copyItem", "grantChosen"]));
    fireEvent.change(add(), { target: { value: "stealItem" } });
    expect(rules.getByText("You take a random bonus item from the chosen player.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: t.iee.rarity.common }));
    fireEvent.click(rules.getByRole("button", { name: t.iee.rarity.rare }));
    fireEvent.change(rules.getByLabelText(v.fields.count), { target: { value: "2" } });
    expect(rules.getByText("You take 2 random common or rare bonus items from the chosen player.")).not.toBeNull();
    // Any rarity again: the filter is gone.
    fireEvent.click(rules.getByRole("button", { name: v.fields.anyRarity }));
    expect(rules.getByText("You take 2 random bonus items from the chosen player.")).not.toBeNull();
  });

  it("a gift goes to a random rival unless a player is chosen; a pick from the catalog has its filter (wave B)", () => {
    open(skeletonDraft("joker", "item"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    const add = () => rules.getByLabelText(e.rules.addAction) as HTMLSelectElement;
    // Nobody to take from or trade with when the item is the user's own.
    expect([...add().options].map((o) => o.value)).not.toContain("stealItem");
    fireEvent.change(add(), { target: { value: "transferItem" } });
    expect(rules.getByRole("button", { name: v.fields.randomRival })).not.toBeNull();
    expect(rules.queryByRole("button", { name: v.fields.target })).toBeNull();
    expect(rules.getByText("A random bonus item of yours goes to a random rival.")).not.toBeNull();
    fireEvent.change(add(), { target: { value: "grantChosen" } });
    // One sentence for the rule: the gift, and the pick.
    expect(rules.getByText(/you get a common bonus item of your choice from the season's catalog\.$/)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: e.usage.activations.active }));
    expect(rules.getByText(/you get a common active bonus item of your choice from the season's catalog\.$/)).not.toBeNull();
  });

  it("one more spin of a wheel at the end of the move (wave B)", () => {
    open(skeletonDraft("treasure_map", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "afterCellEffect" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "extraSpin" } });
    expect(rules.getByText(/the bonus wheel spins once more\.$/i)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.pools.penalty }));
    expect(rules.getByText(/the penalty wheel spins once more\.$/i)).not.toBeNull();
  });

  it("a shield: a held item answers a rival's harm, and its block has a tier (wave B)", () => {
    open(skeletonDraft("shield", "item"));
    fireEvent.click(block("block-usage").getByRole("button", { name: e.usage.activations.passive }));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onIncoming" } });
    const conditions = [...(rules.getByLabelText(e.rules.addCondition) as HTMLSelectElement).options].map((o) => o.value);
    expect(conditions).toEqual(["", "chance", "hasEntry", "rank", "itemCount", "incoming"]);
    fireEvent.change(rules.getByLabelText(e.rules.addCondition), { target: { value: "incoming" } });
    const add = () => rules.getByLabelText(e.rules.addAction) as HTMLSelectElement;
    expect([...add().options].map((o) => o.value)).toEqual(["", "block", "reflect", "amplify", "replace"]);
    fireEvent.change(add(), { target: { value: "block" } });
    expect(rules.getByText("When a rival aims a harmful action at you, it is cancelled.")).not.toBeNull();
    // Its tier: ordinary unless reinforced.
    const interaction = block("block-interaction");
    expect(interaction.getByRole("button", { name: e.interaction.tiers[1] }).className).toContain("bg-amber");
    fireEvent.click(interaction.getByRole("button", { name: e.interaction.tiers[2] }));
    expect(interaction.getByRole("button", { name: e.interaction.tiers[2] }).className).toContain("bg-amber");
    expect(interaction.getByRole("button", { name: e.interaction.tiers[1] }).className).not.toContain("bg-amber");
    // A move back instead: a phoenix's answer, with its cells.
    fireEvent.click(rules.getByRole("button", { name: v.fields.incoming.moveBack }));
    fireEvent.change(add(), { target: { value: "replace" } });
    expect(rules.getAllByText(format(t.ieeEditor.issues.incoming_twice, {})).length).toBeGreaterThan(0);
  });

  it("an effect answers what arrives, of a kind and character, and holds a state while it lasts (wave B)", () => {
    open(skeletonDraft("echo", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onIncoming" } });
    fireEvent.change(rules.getByLabelText(e.rules.addCondition), { target: { value: "incoming" } });
    fireEvent.click(rules.getByRole("button", { name: v.fields.incoming.entry }));
    fireEvent.click(rules.getByRole("button", { name: v.fields.kinds.effect }));
    fireEvent.click(rules.getByRole("button", { name: t.ieeEditor.character.penalty }));
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "amplify" } });
    expect(rules.getByText("When you receive a penalty effect, it fires twice.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "×3" }));
    expect(rules.getByText("When you receive a penalty effect, it fires three times.")).not.toBeNull();
  });

  it("an effect holds a state while it lasts: no lead, its own fields (wave B)", () => {
    open(skeletonDraft("mark", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "whileActive" } });
    // Judged whenever it is asked: no chance, and only the standing states to hold.
    expect([...(rules.getByLabelText(e.rules.addCondition) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "hasEntry", "rank", "itemCount"]);
    expect([...(rules.getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      "",
      "untargetable",
      "forbidItems",
      "pierce",
      "holdLimit",
      // Wave C: the holder's games get no completion conditions.
      "conditionImmunity",
    ]);
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "pierce" } });
    expect(rules.getByText("Harmful actions aimed at you pierce ordinary protection.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.pierceTiers[2] }));
    expect(rules.getByText("Harmful actions aimed at you pierce any protection.")).not.toBeNull();
  });

  it("a choice put to the holder, and a hold limit — their own fields (wave B, spec §6.14)", () => {
    open(skeletonDraft("overload", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onApply" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "victimChoice" } });
    expect(rules.getByText("When it is applied, you discard a bonus item of your choice.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "2" }));
    fireEvent.click(rules.getByRole("button", { name: e.scenarios.no }));
    expect(rules.getByText("When it is applied, you may discard 2 bonus items of your choice to be rid of it.")).not.toBeNull();
  });

  it("a hold limit stands while it lasts, at most one to three items (wave B, spec §6.14)", () => {
    open(skeletonDraft("greed", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "whileActive" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "holdLimit" } });
    expect(rules.getByText(/^You may hold at most 1 bonus item/)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "3" }));
    expect(rules.getByText(/^You may hold at most 3 bonus items/)).not.toBeNull();
  });

  it("the pick of the next game: an effect narrows it by genres, years, a rating — its item's pick among them (wave C, spec §6.16)", () => {
    open(skeletonDraft("veto", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "beforeGameRoll" } });
    // Nothing about a turn is known yet, and nobody is chosen.
    expect([...(rules.getByLabelText(e.rules.addCondition) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "chance", "hasEntry", "rank", "itemCount"]);
    expect([...(rules.getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      "",
      "poolExclude",
      "poolRequire",
      "poolFavor",
      "chooseOfN",
    ]);
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "poolExclude" } });
    expect(rules.getByText("When a game is picked for you, games of the genre you picked cannot come up.")).not.toBeNull();
    // Listed by name: the catalog's genres are offered.
    fireEvent.click(rules.getByRole("button", { name: v.fields.genreSets.list }));
    expect(rules.getByText("When a game is picked for you, games of the genre “action” cannot come up.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.yearsModes.span }));
    expect(rules.getByText("When a game is picked for you, games of the genre “action” released in 2009 or earlier cannot come up.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.ratingModes.span }));
    expect(rules.getByText(/released in 2009 or earlier and rated 4 or higher cannot come up\.$/)).not.toBeNull();
  });

  it("genres listed by name join in lowercase and leave with a click; a rating takes its bounds (wave C, spec §6.16)", () => {
    open(skeletonDraft("only", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "beforeGameRoll" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "poolRequire" } });
    fireEvent.click(rules.getByRole("button", { name: v.fields.genreSets.list }));
    fireEvent.change(rules.getByLabelText(v.fields.genres), { target: { value: "Horror" } });
    fireEvent.click(rules.getByRole("button", { name: v.fields.addGenre }));
    expect(rules.getByText("When a game is picked for you, only games of the genres “action” or “horror” can come up.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "action" }));
    expect(rules.getByText("When a game is picked for you, only games of the genre “horror” can come up.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.ratingModes.span }));
    fireEvent.change(rules.getByLabelText(`${v.fields.rating} ${v.fields.yearFrom}`), { target: { value: "4.5" } });
    fireEvent.change(rules.getByLabelText(`${v.fields.rating} ${v.fields.yearTo}`), { target: { value: "5" } });
    expect(rules.getByText("When a game is picked for you, only games of the genre “horror” rated 4.5–5 can come up.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.ratingModes.none }));
    expect(rules.getByText("When a game is picked for you, only games of the genre “horror” can come up.")).not.toBeNull();
  });

  it("a span of years: its bounds as numbers, the picked one in an effect (wave C, spec §6.16)", () => {
    open(skeletonDraft("era", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "beforeGameRoll" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "poolRequire" } });
    // Genres off: a rule names games by what it is given.
    fireEvent.click(rules.getByRole("button", { name: v.fields.genreSets.none }));
    fireEvent.click(rules.getByRole("button", { name: v.fields.yearsModes.picked }));
    expect(rules.getByText("When a game is picked for you, only games from the years you picked can come up.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.yearsModes.span }));
    fireEvent.change(rules.getByLabelText(v.fields.yearFrom), { target: { value: "1990" } });
    expect(rules.getByText("When a game is picked for you, only games released in 1990–2009 can come up.")).not.toBeNull();
    fireEvent.change(rules.getByLabelText(v.fields.yearTo), { target: { value: "" } });
    expect(rules.getByText("When a game is picked for you, only games released in 1990 or later can come up.")).not.toBeNull();
  });

  it("a held item narrows its holder's pool by what it says itself: no pick to read (wave C, spec §6.16)", () => {
    open({ ...skeletonDraft("charm", "item"), usage: { activation: "passive" } });
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "beforeGameRoll" } });
    expect([...(rules.getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "poolExclude", "poolRequire", "chooseOfN"]);
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "poolExclude" } });
    expect(rules.queryByRole("button", { name: v.fields.genreSets.picked })).toBeNull();
    expect(rules.getByText("When a game is picked for you, games rated 2 or lower cannot come up.")).not.toBeNull();
  });

  it("a choice of games: the draw offers two to five (wave C, spec §7.12)", () => {
    open(skeletonDraft("doors", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "beforeGameRoll" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "chooseOfN" } });
    expect(rules.getByText("When a game is picked for you, the draw offers 3 games and you take one.")).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "5" }));
    expect(rules.getByText("When a game is picked for you, the draw offers 5 games and you take one.")).not.toBeNull();
  });

  it("an item used on an open roll rerolls its user's game or sets it aside; nothing else does (wave C, spec §6.16)", () => {
    open({ ...skeletonDraft("later", "item"), usage: { activation: "active", window: "on_open_roll", charges: 1, target: { who: "self" } } });
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onUse" } });
    const offered = () => [...(rules.getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value);
    expect(offered()).toEqual(expect.arrayContaining(["rerollGame", "postponeGame"]));
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "postponeGame" } });
    expect(rules.getByText(/your game in progress is set aside and comes back as your game 2 rolls later/i)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: "3" }));
    expect(rules.getByText(/comes back as your game 3 rolls later/)).not.toBeNull();
    expect(rules.getByText(v.fields.afterRollsHint)).not.toBeNull();
  });

  it("a completion condition on the game assigned, in three languages, with the tag a season switches it off by (wave C, spec §6.17)", () => {
    open(skeletonDraft("hard", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onRollCreated" } });
    expect([...(rules.getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "addCondition"]);
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "addCondition" } });
    expect(rules.getByText("When you get a game, the game gets a completion condition: “Beat it on a hard difficulty”.")).not.toBeNull();
    fireEvent.change(rules.getByLabelText(`${v.fields.conditionText} EN`), { target: { value: "No deaths" } });
    expect(rules.getByText("When you get a game, the game gets a completion condition: “No deaths”.")).not.toBeNull();
    // An emptied language falls back to Russian; Russian itself is required.
    fireEvent.change(rules.getByLabelText(`${v.fields.conditionText} EN`), { target: { value: "" } });
    expect(rules.getByText("When you get a game, the game gets a completion condition: “Пройти на высокой сложности”.")).not.toBeNull();
    expect(screen.getAllByText(format(t.ieeEditor.issues.condition_tag, { tag: "game_condition" })).length).toBeGreaterThan(0);
  });

  it("an item used at any other time is offered no reroll of the game (wave C, spec §6.16)", () => {
    open({ ...skeletonDraft("early", "item"), usage: { activation: "active", window: "before_roll", charges: 1, target: { who: "self" } } });
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onUse" } });
    const offered = [...(rules.getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value);
    expect(offered).not.toContain("rerollGame");
    expect(offered).not.toContain("postponeGame");
  });

  it("an item that asks for a pick: what is picked, used on its user, and what remembers it (wave C, spec §6.16)", () => {
    open(skeletonDraft("veto", "item"));
    const usage = block("block-usage");
    fireEvent.click(usage.getByRole("button", { name: e.usage.picks.genre }));
    expect(panelText()).toContain("Use at any time, picking a genre. Single use.");
    // The pick goes nowhere until the use hands its user an effect.
    expect(usage.getByText(t.ieeEditor.issues.pick_unused)).not.toBeNull();
    fireEvent.click(usage.getByRole("button", { name: e.usage.picks.none }));
    expect(usage.queryByText(t.ieeEditor.issues.pick_unused)).toBeNull();
  });

  it("an item that stands on the board: its use picks a cell, and a move entering the cell meets it (wave D, spec §6.18)", () => {
    open(skeletonDraft("mine", "item"));
    const usage = block("block-usage");
    fireEvent.click(usage.getByRole("button", { name: e.usage.picks.cell }));
    // Only an item that places itself asks for a cell.
    expect(usage.getByText(t.ieeEditor.issues.place_pick)).not.toBeNull();
    const rules = block("block-rules");
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    // The use places it: offered now that the use asks for a cell.
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "placeObject" } });
    expect(usage.queryByText(t.ieeEditor.issues.place_pick)).toBeNull();
    expect(panelText()).toContain("Use at any time, picking a cell. Single use. The item stands on the chosen cell.");
    // An object without rules for a move entering its cell does nothing — a warning, then a rule that stops it.
    expect(panelText()).toContain(t.ieeEditor.issues.object_idle);
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    fireEvent.change(rules.getAllByLabelText(e.rules.when)[1]!, { target: { value: "onObjectEntered" } });
    fireEvent.change(rules.getAllByLabelText(e.rules.addAction)[1]!, { target: { value: "push" } });
    // A push follows a stop.
    expect(panelText()).toContain(format(t.ieeEditor.issues.object_stop, { op: v.actions.push.label }));
    fireEvent.change(rules.getAllByLabelText(e.rules.addAction)[1]!, { target: { value: "stopMove" } });
    fireEvent.change(rules.getAllByLabelText(e.rules.addAction)[1]!, { target: { value: "spinInstead" } });
    fireEvent.click(rules.getAllByRole("button", { name: v.fields.pools.bonus })[0]!);
    expect(panelText()).toContain(
      "When a move passes through or ends on its cell, the player who entered is thrown 2 cells back, the move stops there without a landing and the bonus wheel spins instead of the cell.",
    );
    expect(panelText()).not.toContain(t.ieeEditor.issues.object_idle);
  });

  it("«Корона»: a held item one in the season, taken by the rival who lands on its holder's cell (wave D, spec §6.19)", () => {
    open(skeletonDraft("crown", "item"));
    const usage = block("block-usage");
    fireEvent.click(usage.getByRole("button", { name: e.usage.activations.passive }));
    fireEvent.click(usage.getByRole("switch", { name: e.usage.seasonUnique }));
    // One in the season is one per player too: the switch shows it, it does not offer it.
    const perPlayer = usage.getByRole("switch", { name: e.usage.unique }) as HTMLButtonElement;
    expect(perPlayer.getAttribute("aria-checked")).toBe("true");
    expect(perPlayer.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onSameCell" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "takeEntry" } });
    expect(panelText()).toContain("Works while you hold it. When a rival's move ends on your cell, the rival who arrived takes this item. There is one in the season.");
    // An effect is never taken: the action is not offered to one.
    cleanup();
    open(skeletonDraft("toll", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    fireEvent.change(block("block-rules").getByLabelText(e.rules.when), { target: { value: "onSameCell" } });
    const offered = [...(block("block-rules").getByLabelText(e.rules.addAction) as HTMLSelectElement).options].map((o) => o.value);
    expect(offered).toEqual(expect.arrayContaining(["balance", "grantEffect"]));
    expect(offered).not.toContain("takeEntry");
  });

  it("the next game: no count to set; the card says until when (wave A)", () => {
    open(skeletonDraft("trap", "effect"));
    const duration = block("block-duration");
    fireEvent.change(duration.getByLabelText(new RegExp(`^${e.duration.unit}`)), { target: { value: "next_game" } });
    expect(duration.queryByLabelText(new RegExp(`^${e.duration.count}`))).toBeNull();
    expect(duration.getByText(e.duration.unitHints.next_game)).not.toBeNull();
    expect(panelText()).toContain(t.iee.panel.expiresNextGame);
  });

  it("standing and items held as conditions; a number read from the game (wave A)", () => {
    open(skeletonDraft("rally", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "steps" } });
    fireEvent.change(rules.getByLabelText(e.rules.addCondition), { target: { value: "rank" } });
    expect(rules.getByText(/^If you are last, /)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.top }));
    expect(rules.getByText(/^If you are among the first 3, /)).not.toBeNull();

    // The dice are known after the roll: the move grows by what they show.
    fireEvent.click(rules.getByRole("button", { name: e.value.source }));
    expect(rules.getByText(/your move is longer by the dice result\.$/)).not.toBeNull();
    fireEvent.change(rules.getByRole("combobox", { name: v.fields.delta }), { target: { value: "itemCount" } });
    expect(rules.getByText(/your move is longer by 1 cell for each item you hold\.$/)).not.toBeNull();
    fireEvent.change(rules.getByRole("combobox", { name: e.value.itemsOf }), { target: { value: "penalty" } });
    fireEvent.change(rules.getByLabelText(`${v.fields.delta} ${e.value.perItem}`), { target: { value: "-2" } });
    expect(rules.getByText(/your move is shorter by 2 cells for each cursed item you hold\.$/)).not.toBeNull();
    // The dice's composition cannot read the game.
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "beforeMovement" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "dice" } });
    expect(within(rules.getAllByRole("group", { name: v.fields.diceCount })[0]!).queryByRole("button", { name: e.value.source })).toBeNull();
  });

  it("«Магнит»: an effect reads the player its item was aimed at, at the holder's turns (wave A)", () => {
    open(skeletonDraft("pull", "effect"));
    fireEvent.click(screen.getByRole("button", { name: e.rules.add }));
    const rules = block("block-rules");
    const offered = () => [...(rules.getByLabelText(e.rules.addCondition) as HTMLSelectElement).options].map((o) => o.value);
    expect(offered()).toEqual(expect.arrayContaining(["targetRelative", "compareLastRoll"]));
    fireEvent.change(rules.getByLabelText(e.rules.addCondition), { target: { value: "compareLastRoll" } });
    fireEvent.change(rules.getByLabelText(e.rules.addAction), { target: { value: "steps" } });
    expect(rules.getByText(/^If your roll is lower than the chosen player's last roll, /)).not.toBeNull();
    fireEvent.click(rules.getByRole("button", { name: v.fields.higher }));
    expect(rules.getByText(/^If your roll is higher than the chosen player's last roll, /)).not.toBeNull();
    // Nobody is remembered when the effect arrives.
    fireEvent.change(rules.getByLabelText(e.rules.when), { target: { value: "onApply" } });
    expect(offered()).not.toContain("targetRelative");
  });

  it("removes a parameter, leaving its default in the rule", () => {
    open(docOf("swamp"));
    fireEvent.click(block("block-limits").getByRole("button", { name: t.ieeEditor.remove }));
    expect(block("block-limits").getByText(e.limits.empty)).not.toBeNull();
    const input = block("block-rules")
      .getAllByLabelText(v.fields.delta)
      .find((el): el is HTMLInputElement => el.tagName === "INPUT")!;
    expect(input.value).toBe("-1");
  });

  it("read-only: no saving, no publishing, a reason and a way to copy", () => {
    open(docOf("swamp"), { entry: { editable: false }, pack: { system: true, editable: false } });
    expect(screen.queryByRole("button", { name: e.save })).toBeNull();
    expect(screen.getByText(format(e.readOnly, { reason: e.readOnlySystem }))).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: e.copyToPack }));
    expect(screen.getByText(format(t.ieeEditor.pack.copyTitle, { name: "Swamp" }))).not.toBeNull();
  });
});
