// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import type { EntryView } from "@/lib/engine";
import { coreRegistry } from "@/lib/modules/iee/registry";

import { ReactionPanel, type ReactionWindowCard } from "./ReactionPanel";

const t = getDictionary("en");
const r = t.iee.reaction;

const VIEWS = coreRegistry().viewsByKey();
const view = (key: string): EntryView => VIEWS[key]!;

const actions = vi.hoisted(() => ({ answer: vi.fn(), judge: vi.fn() }));
vi.mock("@/lib/modules/iee/actions", () => ({
  answerDecisionAction: actions.answer,
  judgeDecisionAction: actions.judge,
}));

// The wheel overlay is its own component: here it only says what it was given.
vi.mock("@/components/game/WheelOverlay", () => ({
  WheelOverlay: ({ outcome }: { outcome: { key?: string } | null }) => (outcome ? <div role="dialog">wheel:{outcome.key}</div> : null),
}));

const card = (over: Partial<ReactionWindowCard> = {}): ReactionWindowCard => ({
  id: "w-1",
  outcome: "passed",
  faces: [2],
  result: 2,
  from: 10,
  to: 12,
  offers: [{ instanceId: "coin-1", view: view("speed_boots") }],
  ...over,
});

const sent = (fn: typeof actions.answer) => {
  const form = fn.mock.calls.at(-1)![1] as FormData;
  return { decisionId: form.get("decisionId"), option: form.get("option"), picks: form.getAll("picks") };
};

function renderPanel(windows: ReactionWindowCard[], mode: "player" | "judge" = "player") {
  return render(
    <I18nProvider locale="en" t={t}>
      <ReactionPanel windows={windows} mode={mode} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  actions.answer.mockReset();
  actions.answer.mockResolvedValue({ ok: "accept" });
  actions.judge.mockReset();
  actions.judge.mockResolvedValue({ ok: "accept" });
});

afterEach(() => cleanup());

describe("ReactionPanel — the turn waits for the player's reaction (spec §7.4)", () => {
  it("renders nothing without a window", () => {
    const { container } = renderPanel([]);
    expect(container.textContent).toBe("");
  });

  it("shows the throw, the move as it stands and each item the throw offers", () => {
    renderPanel([card()]);
    expect(screen.getByText(r.heading)).toBeTruthy();
    expect(screen.getByText(r.passed)).toBeTruthy();
    expect(screen.getByText(format(r.shown, { faces: "2", result: "2" }))).toBeTruthy();
    expect(screen.getByText(format(r.moveForward, { from: "10", to: "12" }))).toBeTruthy();
    expect(screen.getByText(view("speed_boots").name.en)).toBeTruthy();
    expect(screen.getByText(r.hint)).toBeTruthy();
  });

  it("a drop going back says so", () => {
    renderPanel([card({ outcome: "dropped", faces: [6, 5], result: 11, from: 20, to: 9 })]);
    expect(screen.getByText(r.dropped)).toBeTruthy();
    expect(screen.getByText(format(r.moveBack, { from: "20", to: "9" }))).toBeTruthy();
  });

  it("uses the item picked, or accepts the dice", async () => {
    renderPanel([card()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `${r.useButton}: ${view("speed_boots").name.en}` }));
    });
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(1));
    expect(sent(actions.answer)).toEqual({ decisionId: "w-1", option: "react", picks: ["coin-1"] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: r.acceptButton }));
    });
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(2));
    expect(sent(actions.answer)).toEqual({ decisionId: "w-1", option: "accept", picks: [] });
  });

  it("shows the wheel the answer's landing spun, and the error the server answered with", async () => {
    actions.answer.mockResolvedValueOnce({ ok: "accept", wheel: { kind: "item", key: "speed_boots" } });
    renderPanel([card()]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: r.acceptButton }));
    });
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toBe("wheel:speed_boots"));
    actions.answer.mockResolvedValueOnce({ error: t.core.errors.ieeDecisionSettled });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: r.acceptButton }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t.core.errors.ieeDecisionSettled));
  });
});

describe("ReactionPanel — a judge accepts for the player", () => {
  it("names whose turn waits and offers acceptance only", async () => {
    renderPanel([card({ offers: [], player: "Ada · Season 1" })], "judge");
    expect(screen.getByText(r.judgeHeading)).toBeTruthy();
    expect(screen.getByText(format(t.iee.decision.judgeFor, { player: "Ada · Season 1" }))).toBeTruthy();
    expect(screen.getByText(r.judgeHint)).toBeTruthy();
    expect(screen.queryByRole("button", { name: new RegExp(`^${r.useButton}`) })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: r.judgeAccept }));
    });
    await waitFor(() => expect(actions.judge).toHaveBeenCalledTimes(1));
    expect(sent(actions.judge)).toEqual({ decisionId: "w-1", option: "accept", picks: [] });
    expect(actions.answer).not.toHaveBeenCalled();
  });
});
