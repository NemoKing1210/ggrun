import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDictionary } from "@/lib/i18n/dictionaries";

import { SeasonTabs } from "./SeasonTabs";

const mocks = vi.hoisted(() => ({
  getLeaderboard: vi.fn(),
  listBotRuns: vi.fn(),
  listBotOwnedPlayers: vi.fn(),
}));

// `getT()` reaches Next's request scope and the session; stub both so the real
// dictionary resolution runs against an anonymous, cookie-less request.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/lib/infrastructure/auth/session", () => ({
  getCurrentUser: async () => null,
}));

vi.mock("@/lib/modules/bots", () => ({
  listBotRuns: mocks.listBotRuns,
  listBotOwnedPlayers: mocks.listBotOwnedPlayers,
}));

vi.mock("@/lib/modules/season/repository/players", () => ({
  getLeaderboard: mocks.getLeaderboard,
}));

const labels = getDictionary("en").admin.seasonTabs;

beforeEach(() => {
  mocks.getLeaderboard.mockReset().mockResolvedValue([]);
  mocks.listBotRuns.mockReset().mockResolvedValue([]);
  mocks.listBotOwnedPlayers.mockReset().mockResolvedValue([]);
});

async function render(
  active: React.ComponentProps<typeof SeasonTabs>["active"],
  opts: Partial<React.ComponentProps<typeof SeasonTabs>> = {},
) {
  const node = await SeasonTabs({ seasonId: "s1", active, ...opts });
  return renderToStaticMarkup(node as React.ReactElement);
}

describe("SeasonTabs", () => {
  it("links every tab to its season route and marks the active one", async () => {
    const html = await render("board");
    expect(html).toContain('href="/admin/seasons/s1"');
    expect(html).toContain('href="/admin/seasons/s1/board"');
    expect(html).toContain('href="/admin/seasons/s1/players"');
    expect(html).toContain('href="/admin/seasons/s1/bots"');
    expect(html).toContain('aria-current="page"');
    // exactly one tab is current
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
  });

  it("labels the tabs from the dictionary", async () => {
    const html = await render("settings");
    expect(html).toContain(labels.settings);
    expect(html).toContain(labels.board);
    expect(html).toContain(labels.players);
    expect(html).toContain(labels.bots);
  });

  it("renders supplied player and bot counts as badges", async () => {
    const html = await render("players", { playerCount: 7, botCount: 3 });
    expect(html).toContain(">7<");
    expect(html).toContain(">3<");
    expect(mocks.getLeaderboard).not.toHaveBeenCalled();
    expect(mocks.listBotRuns).not.toHaveBeenCalled();
  });

  it("resolves omitted counts from the players and bots data", async () => {
    mocks.getLeaderboard.mockResolvedValue([{}, {}, {}, {}]);
    mocks.listBotRuns.mockResolvedValue([{ id: "r1" }]);
    // the one run owns two bots → two bots in total
    mocks.listBotOwnedPlayers.mockResolvedValueOnce([{}, {}]);

    const html = await render("settings");
    expect(html).toContain(">4<"); // players
    expect(html).toContain(">2<"); // bots, counted across runs
  });

  it("omits a badge when a count is zero", async () => {
    const html = await render("settings", { playerCount: 0, botCount: 0 });
    expect(html).not.toContain(">0<");
  });
});
