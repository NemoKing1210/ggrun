// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { GameSummary } from "@/components/dashboard/RollCard";

import { GamesHistory, type HistoryRoll } from "./GamesHistory";

const t = getDictionary("en");

class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
});

const game = (over: Partial<GameSummary> = {}): GameSummary => ({
  title: "Doom",
  platform: "PC",
  coverUrl: "/doom.png",
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
  ...over,
});

const roll = (over: Partial<HistoryRoll> = {}): HistoryRoll => ({
  id: "r1",
  status: "passed",
  rolledAt: "2026-03-03T14:05:00.000Z",
  timeLabel: "03.03.24, 14:05 → 15:20",
  game: game(),
  rating: null,
  notes: null,
  ...over,
});

function renderHistory(rolls: HistoryRoll[]) {
  return render(
    <I18nProvider locale="en" t={t}>
      <GamesHistory rolls={rolls} />
    </I18nProvider>,
  );
}

afterEach(() => cleanup());

describe("GamesHistory list", () => {
  it("renders nothing for an empty history", () => {
    const { container } = renderHistory([]);
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("renders title, status and the pre-formatted time label", () => {
    renderHistory([roll({ status: "dropped" })]);
    expect(screen.getByText("Doom")).toBeTruthy();
    expect(screen.getByText("dropped")).toBeTruthy();
    const time = screen.getByText("03.03.24, 14:05 → 15:20");
    expect(time.getAttribute("datetime")).toBe("2026-03-03T14:05:00.000Z");
  });

  it("falls back to the missing-catalog notice when the game row is gone", () => {
    renderHistory([roll({ game: null })]);
    expect(screen.getByText(t.core.dashboard.missingCatalogEntry)).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.core.gameInfo.details })).toBeNull();
  });

  it("uses the game cover when available and a placeholder otherwise", () => {
    const { container, unmount } = renderHistory([roll()]);
    expect(container.querySelector('img[src="/doom.png"]')).toBeTruthy();
    unmount();
    const { container: bare } = renderHistory([roll({ game: game({ coverUrl: null }) })]);
    expect(bare.querySelector("img")).toBeNull();
  });

  it("shows the platform chip and catalog meta badges", () => {
    renderHistory([roll({ game: game({ metacritic: 88 }) })]);
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText(`${t.core.gameInfo.metaLabel} 88`)).toBeTruthy();
  });

  it("shows the player rating only when present", () => {
    const { unmount } = renderHistory([roll({ rating: 7 })]);
    expect(screen.getByText("7/10")).toBeTruthy();
    unmount();
    renderHistory([roll({ rating: null })]);
    expect(screen.queryByText("7/10")).toBeNull();
  });

  it("quotes the notes when present", () => {
    renderHistory([roll({ notes: "Great run" })]);
    expect(screen.getByText("“Great run”")).toBeTruthy();
  });

  it("tones a dropped row as a danger state", () => {
    renderHistory([roll({ status: "dropped" })]);
    expect(screen.getByText("dropped").className).toContain("text-red-300");
  });
});

describe("GamesHistory details", () => {
  it("opens the details modal for the clicked roll", () => {
    renderHistory([roll({ id: "r1", game: game({ title: "Quake" }) })]);
    fireEvent.click(screen.getByRole("button", { name: t.core.gameInfo.details }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Quake")).toBeTruthy();
  });

  it("closes the details modal", async () => {
    renderHistory([roll()]);
    fireEvent.click(screen.getByRole("button", { name: t.core.gameInfo.details }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.core.gameInfo.close }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
