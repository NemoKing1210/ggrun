// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { FeedTimelineView } from "./feed-timeline-view";
import type { SerializedFeedRow } from "./feed-wire";

const t = getDictionary("en");
const NOW = new Date("2026-06-01T12:00:00.000Z");

const row = (over: Partial<SerializedFeedRow> = {}): SerializedFeedRow => ({
  id: "e1",
  seasonId: "s1",
  seasonPlayerId: null,
  eventType: "game_rolled",
  payload: { title: "Doom" },
  createdAt: NOW.toISOString(),
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  lastSeenAt: null,
  ...over,
});

function renderView(props: {
  rows?: SerializedFeedRow[];
  hasAny?: boolean;
  onClearFilter?: () => void;
}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <FeedTimelineView
        rows={props.rows ?? []}
        hasAny={props.hasAny ?? true}
        onClearFilter={props.onClearFilter}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FeedTimelineView empty states", () => {
  it("shows the onboarding card when the season has no events at all", () => {
    renderView({ rows: [], hasAny: false });
    expect(screen.getByText(t.feed.empty)).toBeTruthy();
    expect(screen.getByText(t.feed.emptyHint)).toBeTruthy();
    expect(screen.queryByText(t.feed.noFilterResults)).toBeNull();
  });

  it("shows the clear-filter hint when a filter hides every row", () => {
    const onClearFilter = vi.fn();
    renderView({ rows: [], hasAny: true, onClearFilter });
    expect(screen.getByText(t.feed.noFilterResults)).toBeTruthy();
    expect(screen.queryByText(t.feed.empty)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.feed.clearFilter }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it("omits the clear button when no handler is wired", () => {
    renderView({ rows: [], hasAny: true });
    expect(screen.queryByRole("button", { name: t.feed.clearFilter })).toBeNull();
  });
});

describe("FeedTimelineView rows", () => {
  it("renders one list item per row carrying its event type", () => {
    renderView({
      rows: [
        row({ id: "a", eventType: "game_rolled" }),
        row({ id: "b", eventType: "game_passed" }),
        row({ id: "c", eventType: "moved" }),
      ],
    });
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-event-type"))).toEqual([
      "game_rolled",
      "game_passed",
      "moved",
    ]);
  });

  it("links the player and shows the rolled title with dice text", () => {
    renderView({ rows: [row({ eventType: "game_rolled", payload: { title: "Doom" } })] });
    const profileLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/players/ada");
    expect(profileLinks.length).toBeGreaterThan(0);
    expect(screen.getByText(/rolled a game: “Doom”/)).toBeTruthy();
    expect(screen.getByText("“Doom”")).toBeTruthy();
  });

  it("falls back to the generic player label when the row has no name", () => {
    renderView({
      rows: [row({ username: null, displayName: null, eventType: "season_started", payload: {} })],
    });
    expect(screen.getByText(t.feed.seasonStarted)).toBeTruthy();
  });

  it("renders the dice chip and suffix for a passed game", () => {
    renderView({
      rows: [row({ eventType: "game_passed", payload: { dice: [3, 4] } })],
    });
    expect(screen.getAllByText(/3 \+ 4/).length).toBeGreaterThan(0);
    expect(screen.getByText(/passed the game \(dice 3 \+ 4\)/)).toBeTruthy();
  });

  it("renders a move as from → to with the destination highlighted", () => {
    renderView({ rows: [row({ eventType: "moved", payload: { from: 3, to: 9 } })] });
    expect(screen.getByText(/: cell 3 →/)).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("resolves item keys through the dictionary catalog", () => {
    renderView({
      rows: [row({ eventType: "item_granted", payload: { itemKey: "lodestone" } })],
    });
    expect(screen.getByText("Lodestone")).toBeTruthy();
  });

  it("shows the item key verbatim when the catalog has no entry", () => {
    renderView({
      rows: [row({ eventType: "item_granted", payload: { itemKey: "not_a_real_item" } })],
    });
    expect(screen.getByText("not_a_real_item")).toBeTruthy();
  });

  it("renders the rating chip only when a rating is present", () => {
    renderView({ rows: [row({ eventType: "game_passed", payload: { rating: 7 } })] });
    expect(screen.getByText("7/10")).toBeTruthy();
  });

  it("falls back to the generic event line for an unknown type", () => {
    renderView({ rows: [row({ eventType: "brand_new", payload: {} })] });
    expect(screen.getByText(t.feed.defaultEvent.replace("{type}", "brand_new"))).toBeTruthy();
  });

  it("marks a bot username with the bot badge", () => {
    renderView({
      rows: [row({ username: "bot_1234abcd_2", displayName: "Robo" })],
    });
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/players/bot_1234abcd_2"),
    ).toBe(true);
    expect(screen.getAllByText(t.core.common.bot).length).toBeGreaterThan(0);
  });

  it("falls back to an avatar when the row has no image", () => {
    const { container } = renderView({ rows: [row({ avatarUrl: null })] });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("“Doom”")).toBeTruthy();
  });

  it("renders the cover image when the row carries one", () => {
    const { container } = renderView({ rows: [row({ avatarUrl: "/a.png" })] });
    expect(container.querySelector('img[src="/a.png"]')).toBeTruthy();
  });

  it("adds a quick link to the player profile when a username exists", () => {
    renderView({ rows: [row({ username: "ada" })] });
    expect(screen.getByText("@ada")).toBeTruthy();
  });
});

describe("FeedTimelineView day separators", () => {
  it("labels a same-day batch once as today", () => {
    renderView({ rows: [row({ id: "a" }), row({ id: "b" })] });
    expect(screen.getAllByText(t.feed.today)).toHaveLength(1);
  });

  it("labels yesterday's rows separately", () => {
    const yesterday = new Date(NOW);
    yesterday.setDate(yesterday.getDate() - 1);
    renderView({
      rows: [row({ id: "a" }), row({ id: "b", createdAt: yesterday.toISOString() })],
    });
    expect(screen.getByText(t.feed.today)).toBeTruthy();
    expect(screen.getByText(t.feed.yesterday)).toBeTruthy();
  });
});
