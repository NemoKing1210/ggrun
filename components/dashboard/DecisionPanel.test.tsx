// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import type { EntryView } from "@/lib/engine";
import { coreRegistry } from "@/lib/modules/iee/registry";

import { DecisionPanel, type DecisionCard, type DecisionItem } from "./DecisionPanel";

const t = getDictionary("en");
const d = t.iee.decision;

const VIEWS = coreRegistry().viewsByKey();
const view = (key: string): EntryView => VIEWS[key]!;

const actions = vi.hoisted(() => ({ answer: vi.fn(), judge: vi.fn() }));
vi.mock("@/lib/modules/iee/actions", () => ({
  answerDecisionAction: actions.answer,
  judgeDecisionAction: actions.judge,
}));

const ITEMS: DecisionItem[] = [
  { id: "boots", view: view("speed_boots") },
  { id: "salve", view: view("cleansing_salve") },
  { id: "hex", view: view("hex_scroll") },
];

const tax = (over: Partial<DecisionCard> = {}): DecisionCard => ({
  id: "d-tax",
  name: { ru: "Налог", en: "Tax", uk: "Податок" },
  ruleText: { ru: "Сбросьте предмет.", en: "Discard an item of your choice.", uk: "Скиньте предмет." },
  then: "discard",
  count: 1,
  orKeep: false,
  defaultChoice: { option: "discard", picks: ["hex"] },
  ...over,
});

function renderPanel(decisions: DecisionCard[], items: DecisionItem[] = ITEMS, mode: "player" | "judge" = "player") {
  return render(
    <I18nProvider locale="en" t={t}>
      {mode === "judge" ? (
        <DecisionPanel decisions={decisions} itemsByDecision={Object.fromEntries(decisions.map((c) => [c.id, items]))} mode="judge" />
      ) : (
        <DecisionPanel decisions={decisions} items={items} />
      )}
    </I18nProvider>,
  );
}

/** What the last submitted form carried. */
const sent = (fn: typeof actions.answer) => {
  const form = fn.mock.calls.at(-1)![1] as FormData;
  return { decisionId: form.get("decisionId"), option: form.get("option"), picks: form.getAll("picks") };
};

beforeEach(() => {
  actions.answer.mockReset();
  actions.answer.mockResolvedValue({ ok: "discard" });
  actions.judge.mockReset();
  actions.judge.mockResolvedValue({ ok: "default" });
});

afterEach(() => cleanup());

describe("DecisionPanel — a choice the player makes (spec §7.6)", () => {
  it("renders nothing without a question", () => {
    const { container } = renderPanel([]);
    expect(container.textContent).toBe("");
  });

  it("asks what the entry asks, says the default, and sends the one item picked", async () => {
    renderPanel([tax()]);
    expect(screen.getByText(d.heading)).toBeTruthy();
    expect(screen.getByText("Tax")).toBeTruthy();
    expect(screen.getByText("Discard an item of your choice.")).toBeTruthy();
    expect(screen.getByText(d.discard.one)).toBeTruthy();
    expect(screen.getByText(format(d.defaultIs, { what: format(d.defaultDiscard, { items: `«${view("hex_scroll").name.en}»` }) }))).toBeTruthy();
    const submit = screen.getByRole("button", { name: d.discardButton });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    // One to pick: a second click moves the pick.
    fireEvent.click(screen.getByRole("button", { name: new RegExp(view("speed_boots").name.en) }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(view("cleansing_salve").name.en) }));
    expect(screen.getByRole("button", { name: new RegExp(view("cleansing_salve").name.en) }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: new RegExp(view("speed_boots").name.en) }).getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(submit);
    });
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(1));
    expect(sent(actions.answer)).toEqual({ decisionId: "d-tax", option: "discard", picks: ["salve"] });
  });

  it("two to give, or nothing to give: the button waits for both, and enduring is its own answer", async () => {
    renderPanel([tax({ id: "d-over", count: 2, orKeep: true, defaultChoice: { option: "endure" } })]);
    expect(screen.getByText(format(d.discardOrKeep.many, { count: "2" }))).toBeTruthy();
    expect(screen.getByText(format(d.defaultIs, { what: d.defaultEndure }))).toBeTruthy();
    const submit = () => screen.getByRole("button", { name: new RegExp(`^${d.discardButton}`) });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(view("speed_boots").name.en) }));
    expect((submit() as HTMLButtonElement).disabled).toBe(true);
    expect(submit().textContent).toContain(format(d.picked, { picked: "1", count: "2" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(view("hex_scroll").name.en) }));
    // Full: a third cannot be picked.
    expect((screen.getByRole("button", { name: new RegExp(view("cleansing_salve").name.en) }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(submit());
    });
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(1));
    expect(sent(actions.answer)).toEqual({ decisionId: "d-over", option: "discard", picks: ["boots", "hex"] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d.endureButton }));
    });
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(2));
    expect(sent(actions.answer)).toEqual({ decisionId: "d-over", option: "endure", picks: [] });
  });

  it("which one to keep — the rest burn", () => {
    renderPanel([tax({ then: "retain", defaultChoice: { option: "retain", picks: ["salve"] } })]);
    expect(screen.getByText(d.retain.one)).toBeTruthy();
    expect(screen.getByRole("button", { name: d.retainButton })).toBeTruthy();
    expect(screen.getByText(format(d.defaultIs, { what: format(d.defaultRetain, { items: `«${view("cleansing_salve").name.en}»` }) }))).toBeTruthy();
  });

  it("with nothing left to choose, says so and offers the default", async () => {
    renderPanel([tax()], []);
    expect(screen.getByText(d.nothingLeft)).toBeTruthy();
    expect(screen.queryByRole("button", { name: d.discardButton })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d.defaultButton }));
    });
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(1));
    expect(sent(actions.answer)).toEqual({ decisionId: "d-tax", option: "discard", picks: [] });
  });

  it("shows the error the server answered with", async () => {
    actions.answer.mockResolvedValueOnce({ error: t.core.errors.ieeDecisionChoiceInvalid });
    renderPanel([tax()]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(view("speed_boots").name.en) }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d.discardButton }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t.core.errors.ieeDecisionChoiceInvalid));
  });
});

describe("DecisionPanel — a judge chooses for the player", () => {
  it("names whose choice it is, and may apply the default", async () => {
    renderPanel([tax({ player: "Ada · Season 1" })], ITEMS, "judge");
    expect(screen.getByText(d.judgeHeading)).toBeTruthy();
    expect(screen.getByText(format(d.judgeFor, { player: "Ada · Season 1" }))).toBeTruthy();
    // A judge may always apply the default, even with items left to pick.
    expect(screen.getByRole("button", { name: d.discardButton })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d.defaultButton }));
    });
    await waitFor(() => expect(actions.judge).toHaveBeenCalledTimes(1));
    expect(sent(actions.judge)).toEqual({ decisionId: "d-tax", option: null, picks: [] });
    expect(actions.answer).not.toHaveBeenCalled();
  });
});
