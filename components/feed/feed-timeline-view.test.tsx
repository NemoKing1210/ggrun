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

  it("renders an out-of-turn move, naming the entry only where the row records it", () => {
    renderView({
      rows: [
        row({ id: "a", eventType: "moved_out_of_turn", payload: { from: 12, to: 15 } }),
        row({
          id: "b",
          eventType: "moved_out_of_turn",
          payload: { from: 20, to: 17, key: "pursuit", name: { ru: "Погоня", en: "Pursuit", uk: "Погоня" } },
        }),
      ],
    });
    expect(screen.getByText(/: out of turn, cell 12 →/)).toBeTruthy();
    expect(screen.getByText("15")).toBeTruthy();
    expect(screen.getByText(/\(Pursuit\)/)).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("data-event-type"))).toEqual([
      "moved_out_of_turn",
      "moved_out_of_turn",
    ]);
  });

  it("an item that changed hands reads on the receiver's line: stolen, received or traded, from whom (spec §6.12)", () => {
    const name = { ru: "Сапоги скорости", en: "Boots of Speed", uk: "Чоботи швидкості" };
    renderView({
      rows: [
        row({ id: "a", eventType: "item_moved", payload: { how: "stolen", fromUsername: "bob", itemKey: "speed_boots", name } }),
        row({ id: "b", eventType: "item_moved", payload: { how: "given", fromUsername: "carol" } }),
        row({ id: "c", eventType: "item_moved", payload: { how: "traded", fromUsername: "dan", itemKey: "speed_boots", name } }),
        // Taken by ending a move on the holder's cell (wave D, «Корона», spec §6.19).
        row({ id: "d", eventType: "item_moved", payload: { how: "taken", fromUsername: "eve", itemKey: "crown", name: { ru: "Корона", en: "Crown", uk: "Корона" } } }),
      ],
    });
    const lines = screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Ada stole Boots of Speed from bob",
      "Ada received an item from carol",
      "Ada got Boots of Speed in a trade with dan",
      "Ada took Crown landing on the cell of eve",
    ]);
    expect(screen.getByRole("link", { name: "bob" }).getAttribute("href")).toBe("/players/bob");
  });

  it("an answer to what arrived reads on the line of the player whose entry answered (spec §6.13)", () => {
    const shield = { ru: "Щит", en: "Shield", uk: "Щит" };
    renderView({
      rows: [
        row({ id: "a", eventType: "intercepted", payload: { how: "blocked", key: "shield", name: shield, fromUsername: "bob" } }),
        row({ id: "b", eventType: "intercepted", payload: { how: "reflected", key: "mirror_shield", fromUsername: "carol" } }),
        row({ id: "c", eventType: "intercepted", payload: { how: "amplified", key: "curse_echo", factor: 2 } }),
        row({ id: "d", eventType: "intercepted", payload: { how: "replaced", key: "phoenix", with: 1 } }),
        row({ id: "e", eventType: "intercepted", payload: { how: "replaced", key: "phoenix", with: 0 } }),
      ],
    });
    const lines = screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Ada: Shield blocked it — from bob",
      "Ada: mirror_shield turned it back — from carol",
      "Ada: curse_echo made it count ×2",
      "Ada: phoenix moved them +1 instead",
      "Ada: phoenix kept them in place",
    ]);
    expect(screen.getByRole("link", { name: "bob" }).getAttribute("href")).toBe("/players/bob");
  });

  it("a choice an entry put to the player reads on their line: what went, what stayed, and who chose (spec §7.6)", () => {
    const tax = { ru: "Налог", en: "Tax", uk: "Податок" };
    const greed = { ru: "Проклятие жадности", en: "Curse of Greed", uk: "Прокляття жадібності" };
    const boots = { ru: "Сапоги", en: "Boots", uk: "Чоботи" };
    const shield = { ru: "Щит", en: "Shield", uk: "Щит" };
    renderView({
      rows: [
        row({ id: "a", eventType: "decision_made", payload: { how: "chosen", key: "tax", name: tax, option: "discard", discarded: [boots], burned: [], kept: [] } }),
        row({ id: "b", eventType: "decision_made", payload: { how: "defaulted", key: "overload", option: "endure", discarded: [], burned: [], kept: [] } }),
        row({ id: "c", eventType: "decision_made", payload: { how: "judged", key: "greed", name: greed, option: "retain", discarded: [], burned: [boots], kept: [shield] } }),
        row({ id: "d", eventType: "decision_made", payload: { how: "forced", key: "tax", name: tax, option: "discard", discarded: [boots, shield], burned: [], kept: [] } }),
      ],
    });
    const lines = screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Ada: Tax — discarded: Boots",
      "Ada: overload — gave nothing up (by default)",
      "Ada: Curse of Greed — kept: Shield; burned: Boots (a judge chose)",
      "Ada: Tax — discarded: Boots, Shield",
    ]);
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("data-event-type"))).toEqual(Array(4).fill("decision_made"));
  });

  it("an object placed and an object a move ran into read on the line of the player it concerns (wave D, spec §6.18)", () => {
    const mine = { ru: "Мина", en: "Mine", uk: "Міна" };
    renderView({
      rows: [
        row({ id: "a", eventType: "object_placed", payload: { itemKey: "mine", name: mine, instanceId: "o-1", cell: 14 } }),
        row({
          id: "b",
          eventType: "object_triggered",
          payload: { itemKey: "mine", name: mine, cell: 14, ownerUsername: "bob", stopped: true, pushed: -2, to: 12, extended: 0, spun: null },
        }),
        row({ id: "c", eventType: "object_triggered", payload: { itemKey: "spring", cell: 20, ownerUsername: null, stopped: false, pushed: 0, extended: 2, spun: null } }),
        row({ id: "d", eventType: "object_triggered", payload: { itemKey: "snare", cell: 7, stopped: true, pushed: 0, extended: 0, spun: "negative" } }),
        row({ id: "e", eventType: "object_triggered", payload: { itemKey: "beacon", cell: 9, stopped: true, pushed: 0, extended: 0, spun: "positive" } }),
      ],
    });
    const lines = screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Ada placed Mine on cell 14",
      "Ada ran into Mine on cell 14 — the move stopped there, thrown to cell 12 (placed by bob)",
      "Ada ran into spring on cell 20 — the move went +2 further",
      "Ada ran into snare on cell 7 — the move stopped there; the penalty wheel spun instead",
      "Ada ran into beacon on cell 9 — the move stopped there; the bonus wheel spun instead",
    ]);
    expect(screen.getByRole("link", { name: "bob" }).getAttribute("href")).toBe("/players/bob");
    expect(screen.getAllByRole("listitem").map((li) => li.getAttribute("data-event-type"))).toEqual(["object_placed", ...Array(4).fill("object_triggered")]);
  });

  it("a game chosen, come back, rerolled or set aside by an item reads on the player's line (wave C, spec §7.12)", () => {
    const reroll = { ru: "Переролл игры", en: "Game Reroll", uk: "Перерол гри" };
    const later = { ru: "Отложенная игра", en: "Postponed Game", uk: "Відкладена гра" };
    renderView({
      rows: [
        row({ id: "a", eventType: "game_rolled", payload: { gameId: "g-2", title: "Hades", chosen: true, offered: 3 } }),
        row({ id: "b", eventType: "game_rolled", payload: { gameId: "g-1", title: "Doom", returned: true } }),
        row({ id: "c", eventType: "game_rerolled", payload: { oldGameId: "g-1", newGameId: "g-2", title: "Hades", itemKey: "game_reroll", name: reroll } }),
        row({ id: "d", eventType: "game_rerolled", payload: { oldGameId: "g-1", newGameId: null, title: null, choosing: 3, instant: true } }),
        row({
          id: "e",
          eventType: "game_postponed",
          payload: { gameId: "g-1", title: "Doom", afterRolls: 2, comesBackOn: 6, itemKey: "postponed_game", name: later, newGameId: "g-2", newTitle: "Hades" },
        }),
        row({ id: "f", eventType: "game_postponed", payload: { gameId: "g-1", title: "Doom", comesBackOn: 6, itemKey: "postponed_game", choosing: 2 } }),
      ],
    });
    const lines = screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Ada took a game: “Hades” — of 3 offered",
      "Ada got a set-aside game back: “Doom”",
      "Ada rerolled the game with Game Reroll → “Hades”",
      "Ada rerolled the game → a choice of 3 games",
      "Ada set aside “Doom” with Postponed Game — it comes back on roll 6; next: “Hades”",
      "Ada set aside “Doom” with postponed_game — it comes back on roll 6; next: a choice of 2 games",
    ]);
  });

  it("a reaction item's use reads with what it did to the dice (spec §7.4)", () => {
    const coin = { ru: "Счастливая монета", en: "Lucky Coin", uk: "Щаслива монета" };
    const gold = { ru: "Золотая монета", en: "Golden Coin", uk: "Золота монета" };
    const elixir = { ru: "Эликсир скорости", en: "Elixir of Speed", uk: "Еліксир швидкості" };
    renderView({
      rows: [
        // A throw again: the faces before and after.
        row({ id: "a", eventType: "item_used", payload: { itemKey: "lucky_coin", name: coin, reaction: { before: [1, 2], thrown: [[5, 6]], after: [5, 6], result: { before: 3, after: 11 } } } }),
        // The better of two, the second worse: both throws, the first stands.
        row({ id: "b", eventType: "item_used", payload: { itemKey: "golden_coin", name: gold, reaction: { before: [4], thrown: [[2]], after: [4], result: { before: 4, after: 4 } } } }),
        // No new throw: the result before and after.
        row({ id: "c", eventType: "item_used", payload: { itemKey: "speed_elixir", name: elixir, reaction: { before: [2], thrown: [], after: [2], result: { before: 2, after: 3 } } } }),
        // A row written before the throws were recorded reads its faces.
        row({ id: "d", eventType: "item_used", payload: { itemKey: "lucky_coin", name: coin, reaction: { before: [3], after: [6] } } }),
        row({ id: "e", eventType: "item_used", payload: { itemKey: "lucky_coin", name: coin } }),
      ],
    });
    const lines = screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent);
    expect(lines).toEqual([
      "Ada used Lucky Coin on the dice: 1 + 2 → 5 + 6",
      "Ada used Golden Coin on the dice: 4, thrown again 2 — 4 stands",
      "Ada used Elixir of Speed on the dice result: 2 → 3",
      "Ada used Lucky Coin on the dice: 3 → 6",
      "Ada used Lucky Coin",
    ]);
  });

  it("a cursed item is picked up, not found, and shaken off once it has done its work", () => {
    const name = { ru: "Тяжёлые ботинки", en: "Heavy Boots", uk: "Важкі черевики" };
    renderView({
      rows: [
        row({ id: "a", eventType: "item_granted", payload: { itemKey: "heavy_boots", polarity: "negative", name } }),
        row({ id: "b", eventType: "item_expired", payload: { itemKey: "heavy_boots", character: "penalty", name } }),
      ],
    });
    expect(screen.getByText(/picked up the cursed/)).toBeTruthy();
    expect(screen.getByText(/shook off/)).toBeTruthy();
    expect(screen.queryByText(/ found /)).toBeNull();
  });

  it("names an item from the names the row recorded", () => {
    renderView({
      rows: [
        row({
          eventType: "item_granted",
          payload: { itemKey: "lodestone", name: { ru: "Магнит", en: "Lodestone", uk: "Магніт" } },
        }),
      ],
    });
    expect(screen.getByText("Lodestone")).toBeTruthy();
  });

  it("keeps the recorded name after the entry is renamed or gone", () => {
    renderView({
      rows: [
        row({
          eventType: "effect_expired",
          payload: { effectKey: "retired_status", name: { ru: "Старое", en: "Old Status", uk: "Старе" } },
        }),
      ],
    });
    expect(screen.getByText("Old Status")).toBeTruthy();
  });

  it("shows the key verbatim when the row recorded no name", () => {
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
