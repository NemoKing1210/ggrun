// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardCell } from "@/db/schema";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

import { BoardView, CellTypeIcon, type BoardPlayer, type BoardRoll, type BoardStats } from "./board-view";

const t = getDictionary("en");

const cell = (over: Partial<BoardCell> & { position: number; cellType: BoardCell["cellType"] }): BoardCell => ({
  id: `c-${over.position}`,
  boardId: "b1",
  label: null,
  config: {},
  ...over,
});

const player = (over: Partial<BoardPlayer> & { username: string; position: number }): BoardPlayer => ({
  displayName: null,
  avatarUrl: null,
  lastSeenAt: null,
  balancePoints: 0,
  status: "active",
  streakPass: 0,
  streakDrop: 0,
  rerollsUsed: 0,
  effects: [],
  ...over,
});

const roll = (over: Partial<BoardRoll> & { username: string }): BoardRoll => ({
  displayName: null,
  avatarUrl: null,
  lastSeenAt: null,
  gameTitle: null,
  platform: null,
  rolledAt: new Date().toISOString(),
  status: "rolled",
  coverUrl: null,
  genres: [],
  metacritic: null,
  releasedAt: null,
  description: null,
  playtimeHours: null,
  externalSource: null,
  ...over,
});

const stats: BoardStats = { totalMoves: 12, passedRolls: 7, droppedRolls: 2, rerolls: 1 };

const cells: BoardCell[] = [
  cell({ position: 0, cellType: "start", label: "Alpha" }),
  cell({ position: 1, cellType: "penalty", label: "Beta", config: { amount: -5 } }),
  cell({ position: 2, cellType: "normal", label: "Gamma" }),
];

const renderBoard = (
  over: {
    cells?: BoardCell[];
    players?: BoardPlayer[];
    rolls?: BoardRoll[];
    stats?: BoardStats;
    seasonStartedAt?: string | null;
  } = {},
) =>
  render(
    <I18nProvider locale="en" t={t}>
      <BoardView
        cells={over.cells ?? cells}
        players={over.players ?? []}
        rolls={over.rolls ?? []}
        stats={{ ...stats, ...over.stats }}
        seasonStartedAt={over.seasonStartedAt ?? null}
      />
    </I18nProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CellTypeIcon", () => {
  it("draws an icon for every cell type", () => {
    for (const type of ["start", "finish", "penalty", "bonus", "teleport", "event", "custom", "normal"] as const) {
      const { container } = render(<CellTypeIcon type={type} />);
      expect(container.querySelector("svg"), type).not.toBeNull();
      cleanup();
    }
  });
});

describe("BoardView stats", () => {
  it("renders the count tiles from the snapshot", () => {
    renderBoard({ players: [player({ username: "ada", position: 2 })] });
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("1/1")).toBeTruthy();
  });

  it("shows the leader by furthest cell, then points", () => {
    renderBoard({
      players: [
        player({ username: "ada", displayName: "Ada", position: 1, balancePoints: 90 }),
        player({ username: "bob", displayName: "Bob", position: 1, balancePoints: 120 }),
        player({ username: "cid", displayName: "Cid", position: 0, balancePoints: 500 }),
      ],
    });
    expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
  });

  it("falls back to the no-leader dash with no players", () => {
    renderBoard();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("counts only active participants in the ratio", () => {
    renderBoard({
      players: [
        player({ username: "ada", position: 1 }),
        player({ username: "bob", position: 0, status: "eliminated" }),
      ],
    });
    expect(screen.getByText("1/2")).toBeTruthy();
  });
});

describe("BoardView roster", () => {
  it("renders each player with status, cell and their current game", () => {
    renderBoard({
      players: [
        player({ username: "ada", displayName: "Ada", position: 2 }),
        player({ username: "bob", displayName: null, position: 0 }),
      ],
      rolls: [roll({ username: "ada", gameTitle: "Doom", platform: "PC", metacritic: 88, genres: ["Action"] })],
    });
    expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
    expect(screen.getByText("@bob")).toBeTruthy();
    expect(screen.getAllByText(t.core.playerStatuses.active).length).toBe(2);
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("Doom")).toBeTruthy();
    expect(screen.getByText("PC")).toBeTruthy();
    expect(screen.getByText("★ 88")).toBeTruthy();
    expect(screen.getByText("Action")).toBeTruthy();
  });

  it("shows the idle note for a player without a roll", () => {
    renderBoard({ players: [player({ username: "bob", position: 0 })] });
    expect(screen.getAllByText(t.board.roster.noGame).length).toBeGreaterThan(0);
  });

  it("shows the empty roster note when nobody is playing", () => {
    renderBoard();
    expect(screen.getByText(t.board.roster.noGame)).toBeTruthy();
    expect(screen.getByText(new RegExp(t.board.roster.title))).toBeTruthy();
  });
});

describe("BoardView board", () => {
  it("renders every cell in grid mode by default", () => {
    renderBoard();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("Gamma")).toBeTruthy();
    expect(screen.getByText(/3 CELLS/)).toBeTruthy();
  });

  it("switches to linear mode and persists the choice", async () => {
    renderBoard();
    const linear = screen.getByRole("button", { name: new RegExp(t.board.view.linear) });
    fireEvent.click(linear);
    expect(linear.getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("ggrun.board.viewMode")).toBe("linear");
    await waitFor(() =>
      expect(screen.getAllByText(t.core.cellTypes.penalty).length).toBeGreaterThan(0),
    );
  });

  it("restores the saved view mode on mount", () => {
    window.localStorage.setItem("ggrun.board.viewMode", "linear");
    renderBoard();
    expect(
      screen.getByRole("button", { name: new RegExp(t.board.view.linear) }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("marks the cells that hold players", () => {
    const { container } = renderBoard({
      players: [player({ username: "ada", displayName: "Ada", position: 0 })],
    });
    const bubble = Array.from(container.querySelectorAll("span")).find(
      (span) => span.textContent === "1" && span.className.includes("border-amber/60"),
    );
    expect(bubble).toBeTruthy();
  });
});

describe("BoardView cell details", () => {
  const openCell = async (label: string) => {
    const target = screen.getByText(label).closest("button");
    if (!target) throw new Error(`cell button for ${label} not found`);
    fireEvent.click(target);
    return screen.findByRole("dialog");
  };

  it("opens the details modal with the effect and occupants", async () => {
    renderBoard({ players: [player({ username: "ada", displayName: "Ada", position: 1 })] });
    const dialog = await openCell("Beta");
    expect(screen.getByText(t.board.descriptions.penalty)).toBeTruthy();
    expect(dialog.textContent).toContain("Ada");
    expect(dialog.textContent).toContain(format(t.board.cell.amount, { n: -5 }));
  });

  it("steps to the next cell and disables the edges", async () => {
    renderBoard();
    const dialog = await openCell("Alpha");
    const prev = screen.getByRole("button", { name: new RegExp(t.board.cell.prevCell) }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: new RegExp(t.board.cell.nextCell) }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    await waitFor(() => expect(dialog.textContent).toContain("Beta"));
    const prevAfter = screen.getByRole("button", {
      name: new RegExp(t.board.cell.prevCell),
    }) as HTMLButtonElement;
    expect(prevAfter.disabled).toBe(false);
  });

  it("closes the modal with Escape", async () => {
    renderBoard();
    await openCell("Gamma");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
