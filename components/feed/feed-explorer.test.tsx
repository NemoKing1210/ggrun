// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { seasonRoom, type BoardEventBroadcast } from "@/lib/realtime/protocol";

import { FeedExplorer } from "./feed-explorer";
import type { SerializedFeedRow } from "./feed-wire";

const t = getDictionary("en");

interface CapturedEvent {
  room: string | null;
  event: string;
  handler: (payload: unknown) => void;
}

const realtime = vi.hoisted(() => ({
  connected: true,
  connects: 1,
  watchers: null as number | null,
  events: [] as CapturedEvent[],
}));

vi.mock("@/components/realtime/realtime-provider", () => ({
  useRealtime: () => ({
    socket: null,
    connected: realtime.connected,
    connects: realtime.connects,
    joinRoom: () => Promise.resolve({ ok: true }),
    leaveRoom: () => undefined,
  }),
  useRealtimeConnects: () => realtime.connects,
  usePresence: () => realtime.watchers,
  useRealtimeEvent: (
    room: string | null,
    event: string,
    handler: (payload: unknown) => void,
  ) => {
    realtime.events.push({ room, event, handler });
  },
}));

const row = (over: Partial<SerializedFeedRow> = {}): SerializedFeedRow => ({
  id: "e1",
  seasonId: "s1",
  seasonPlayerId: null,
  eventType: "game_rolled",
  payload: { title: "Doom" },
  createdAt: "2026-06-01T12:00:00.000Z",
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  lastSeenAt: null,
  ...over,
});

function jsonResponse(rows: SerializedFeedRow[]) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ rows }) } as Response);
}

const fetchMock = vi.fn();

function renderExplorer(over: {
  seasonId?: string;
  initialRows?: SerializedFeedRow[];
  initialFilter?: "all" | "passed" | "moved";
} = {}) {
  return render(
    <I18nProvider locale="en" t={t}>
      <FeedExplorer
        seasonId={over.seasonId ?? "s1"}
        initialRows={over.initialRows ?? [row()]}
        initialFilter={over.initialFilter ?? "all"}
      />
    </I18nProvider>,
  );
}

beforeEach(() => {
  realtime.connected = true;
  realtime.connects = 1;
  realtime.watchers = null;
  realtime.events = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => jsonResponse([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FeedExplorer first paint", () => {
  it("renders the server rows without a fetch flash", () => {
    renderExplorer();
    expect(screen.getByText(/rolled a game: “Doom”/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders every filter tab and marks the initial one active", () => {
    renderExplorer({ initialFilter: "all" });
    const all = screen.getByRole("button", { name: t.feed.filters.all });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    for (const key of ["rolled", "passed", "dropped", "moved", "iee", "challenges", "joined", "system"] as const) {
      expect(screen.getByRole("button", { name: t.feed.filters[key] })).toBeTruthy();
    }
    // "all" is the default so the clear-filter escape hatch stays hidden.
    expect(screen.queryByRole("button", { name: `${t.feed.clearFilter} ×` })).toBeNull();
  });

  it("reports the connected live state from the realtime provider", () => {
    renderExplorer();
    expect(screen.getByText(t.feed.live)).toBeTruthy();
  });

  it("reports offline when the realtime provider is disconnected", () => {
    realtime.connected = false;
    renderExplorer();
    expect(screen.getByText(t.feed.offline)).toBeTruthy();
  });

  it("counts watchers only above one and only while connected", () => {
    realtime.watchers = 3;
    const { unmount } = renderExplorer();
    expect(screen.getByText(/3 watching/)).toBeTruthy();
    unmount();

    realtime.watchers = 1;
    renderExplorer();
    expect(screen.queryByText(/watching/)).toBeNull();
  });
});

describe("FeedExplorer filter switching", () => {
  it("fetches the chosen filter from the API and renders its rows", async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse([row({ id: "p1", eventType: "game_passed", payload: { title: "Halo" } })]),
    );
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: t.feed.filters.passed }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/api/feed?");
    expect(url).toContain("seasonId=s1");
    expect(url).toContain("filter=passed");
    expect(url).toContain("limit=80");

    await waitFor(() => expect(screen.getByText(/passed the game/)).toBeTruthy());
  });

  it("marks the selected tab and offers the clear-filter button", async () => {
    renderExplorer();
    const passed = screen.getByRole("button", { name: t.feed.filters.passed });
    fireEvent.click(passed);
    await waitFor(() => expect(passed.getAttribute("aria-pressed")).toBe("true"));
    const clear = screen.getByRole("button", { name: `${t.feed.clearFilter} ×` });
    fireEvent.click(clear);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: t.feed.filters.all }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });

  it("shows the sync-failure alert when the request fails", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) } as Response),
    );
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: t.feed.filters.moved }));
    const alert = await screen.findByRole("alert", undefined, { timeout: 4000 });
    expect(alert.textContent).toContain(t.feed.syncFailed);
  });
});

describe("FeedExplorer live socket layer", () => {
  it("subscribes to board events for the season room", () => {
    renderExplorer({ seasonId: "season-9" });
    expect(realtime.events.some((e) => e.room === seasonRoom("season-9") && e.event === "board:event")).toBe(
      true,
    );
  });

  it("prepends an optimistic row for an incoming board event", async () => {
    renderExplorer();
    const payload: BoardEventBroadcast = {
      seasonId: "s1",
      seasonPlayerId: "sp1",
      eventType: "game_rolled",
      payload: { title: "Live Game" },
      createdAt: "2026-06-01T13:00:00.000Z",
      username: "ada",
      displayName: "Ada",
      avatarUrl: null,
    };
    expect(realtime.events.some((e) => e.event === "board:event")).toBe(true);
    await act(async () => {
      realtime.events.filter((e) => e.event === "board:event").at(-1)?.handler(payload);
    });
    await waitFor(() => expect(screen.getByText("“Live Game”")).toBeTruthy());
  });

  it("refetches after a reconnect", async () => {
    const { rerender } = renderExplorer();
    expect(fetchMock).not.toHaveBeenCalled();
    realtime.connects = 2;
    rerender(
      <I18nProvider locale="en" t={t}>
        <FeedExplorer seasonId="s1" initialRows={[row()]} initialFilter="all" />
      </I18nProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
