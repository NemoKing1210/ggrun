// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import { GameChoicePanel, type GameChoiceCard, type OfferedGame } from "./GameChoicePanel";

const t = getDictionary("en");
const c = t.iee.gameChoice;

const actions = vi.hoisted(() => ({ answer: vi.fn() }));
vi.mock("@/lib/modules/iee/actions", () => ({ answerDecisionAction: actions.answer }));

const game = (gameId: string, title: string, over: Partial<OfferedGame> = {}): OfferedGame => ({
  gameId,
  title,
  coverUrl: null,
  genres: ["rpg"],
  year: 2005,
  rating: 4.5,
  platform: "pc",
  ...over,
});

const choice = (over: Partial<GameChoiceCard> = {}): GameChoiceCard => ({
  id: "d-1",
  games: [game("g-1", "Celeste", { coverUrl: "/c.png" }), game("g-2", "Hades"), game("g-3", "Inside", { year: null, rating: null })],
  origin: "roll",
  itemName: null,
  ...over,
});

function renderPanel(card: GameChoiceCard | null) {
  return render(
    <I18nProvider locale="en" t={t}>
      <GameChoicePanel choice={card} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  actions.answer.mockReset();
  actions.answer.mockResolvedValue({});
});

afterEach(cleanup);

describe("GameChoicePanel (wave C, spec §7.12)", () => {
  it("shows nothing when no choice waits", () => {
    const { container } = renderPanel(null);
    expect(container.innerHTML).toBe("");
  });

  it("offers every game with what the player chooses by, and says it is their game until they take one", () => {
    renderPanel(choice());
    expect(screen.getByRole("heading", { name: c.heading })).toBeTruthy();
    expect(screen.getByText(format(c.hint, { count: "3" }))).toBeTruthy();
    for (const title of ["Celeste", "Hades", "Inside"]) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: c.take })).toHaveLength(3);
    expect(screen.getByRole("img", { name: format(t.core.dashboard.coverAlt, { title: "Celeste" }) })).toBeTruthy();
    expect(screen.getAllByText("2005")).toHaveLength(2);
  });

  it("taking one sends the game taken", async () => {
    renderPanel(choice());
    fireEvent.click(screen.getAllByRole("button", { name: c.take })[1]!);
    await waitFor(() => expect(actions.answer).toHaveBeenCalledTimes(1));
    const form = actions.answer.mock.calls[0]![1] as FormData;
    expect([form.get("decisionId"), form.get("option"), form.getAll("picks")]).toEqual(["d-1", "take", ["g-2"]]);
  });

  it("says when an item rerolled the game or set it aside", () => {
    const item = { ru: "Отложенная игра", en: "Postponed Game", uk: "Відкладена гра" };
    renderPanel(choice({ origin: "postpone", itemName: item }));
    expect(screen.getByText(format(c.originPostpone, { item: "Postponed Game" }))).toBeTruthy();
    cleanup();
    renderPanel(choice({ origin: "reroll", itemName: { ru: "Переролл игры", en: "Game Reroll", uk: "Перерол гри" } }));
    expect(screen.getByText(format(c.originReroll, { item: "Game Reroll" }))).toBeTruthy();
  });

  it("shows the server's refusal", async () => {
    actions.answer.mockResolvedValue({ error: "Not one of the games offered" });
    renderPanel(choice());
    fireEvent.click(screen.getAllByRole("button", { name: c.take })[0]!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Not one of the games offered"));
  });
});
