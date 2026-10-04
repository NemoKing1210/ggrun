// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";
import type { GameSummary } from "@/components/dashboard/RollCard";

import { PlayerGames, type PlayerGameRow } from "./PlayerGames";

const t = getDictionary("en");

function game(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    title: "Hollow Knight",
    platform: "PC",
    coverUrl: null,
    genres: [],
    tags: [],
    metacritic: null,
    rating: null,
    releasedAt: null,
    esrb: null,
    description: null,
    playtimeHours: null,
    stores: null,
    website: null,
    externalSource: null,
    ...overrides,
  };
}

function row(overrides: Partial<PlayerGameRow> & { id: string }): PlayerGameRow {
  return {
    status: "passed",
    rolledAt: "2026-01-01T00:00:00Z",
    resolvedAt: null,
    rating: null,
    notes: null,
    seasonTitle: "Season One",
    game: game(),
    ...overrides,
  };
}

function renderGames(games: PlayerGameRow[]) {
  return render(
    <I18nProvider locale="en" t={t}>
      <PlayerGames games={games} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("PlayerGames", () => {
  it("renders the empty state when there are no rolls", () => {
    renderGames([]);
    expect(screen.getByText(t.profile.games.empty)).toBeTruthy();
    expect(screen.getByText(t.profile.games.emptyHint)).toBeTruthy();
  });

  it("renders a card per roll with status, season, platform and rating", () => {
    renderGames([
      row({
        id: "r1",
        status: "dropped",
        seasonTitle: "Season Two",
        rating: 7,
        notes: "Too hard",
        game: game({ title: "Elden Ring", platform: "PS5" }),
      }),
    ]);
    expect(screen.getByText("Elden Ring")).toBeTruthy();
    expect(screen.getByText("Season Two")).toBeTruthy();
    expect(screen.getByText("PS5")).toBeTruthy();
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(screen.getByText("“Too hard”")).toBeTruthy();
    const card = screen.getByText("Elden Ring").closest("li");
    if (!card) throw new Error("card not found");
    expect(within(card).getByText(t.profile.rollStats.dropped as string)).toBeTruthy();
  });

  it("falls back to the missing-catalogue label and hides details", () => {
    renderGames([row({ id: "r1", game: null })]);
    expect(screen.getByText(t.core.dashboard.missingCatalogEntry)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.core.gameInfo.details })).toBeNull();
  });

  it("reports the visible count in the summary", () => {
    renderGames([row({ id: "r1" }), row({ id: "r2" })]);
    expect(
      screen.getByText(format(t.profile.games.count, { count: 2 })),
    ).toBeTruthy();
  });

  it("filters by search text across title, platform and season", () => {
    renderGames([
      row({ id: "r1", game: game({ title: "Celeste", platform: "Switch" }) }),
      row({ id: "r2", game: game({ title: "Hades", platform: "PC" }), seasonTitle: "Zeta" }),
    ]);
    const search = screen.getByLabelText(t.profile.games.searchLabel);
    fireEvent.change(search, { target: { value: "zeta" } });
    expect(screen.queryByText("Celeste")).toBeNull();
    expect(screen.getByText("Hades")).toBeTruthy();
    fireEvent.change(search, { target: { value: "switch" } });
    expect(screen.getByText("Celeste")).toBeTruthy();
    expect(screen.queryByText("Hades")).toBeNull();
  });

  it("filters by status tab", () => {
    renderGames([
      row({ id: "r1", status: "passed", game: game({ title: "Passed Game" }) }),
      row({ id: "r2", status: "dropped", game: game({ title: "Dropped Game" }) }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: t.profile.rollStats.dropped as string }));
    expect(screen.getByText("Dropped Game")).toBeTruthy();
    expect(screen.queryByText("Passed Game")).toBeNull();
  });

  it("sorts by rating when selected", () => {
    renderGames([
      row({ id: "r1", rating: 3, game: game({ title: "Low" }) }),
      row({ id: "r2", rating: 9, game: game({ title: "High" }) }),
    ]);
    const headings = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings()).toEqual(["Low", "High"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "rating" } });
    expect(headings()).toEqual(["High", "Low"]);
  });

  it("opens the details modal for a catalogue game", () => {
    renderGames([
      row({ id: "r1", game: game({ title: "Hollow Knight", description: "A bug's tale" }) }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: t.core.gameInfo.details }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("A bug's tale")).toBeTruthy();
  });
});
