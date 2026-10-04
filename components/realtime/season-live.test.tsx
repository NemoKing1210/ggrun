// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardEventBroadcast } from "@/lib/realtime/protocol";

const refresh = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refresh.fn }),
}));

const rt = vi.hoisted(() => ({
  connected: true,
  connects: 1,
  presence: null as number | null,
  handlers: [] as Array<{ room: string | null; event: string; handler: (payload: unknown) => void }>,
  fire(room: string, event: string, payload: unknown) {
    for (const h of rt.handlers) {
      if (h.room === room && h.event === event) h.handler(payload);
    }
  },
  reset() {
    rt.handlers = [];
    rt.connected = true;
    rt.connects = 1;
    rt.presence = null;
  },
}));

vi.mock("@/components/realtime/realtime-provider", () => ({
  useRealtime: () => ({ connected: rt.connected, socket: null, connects: rt.connects }),
  useRealtimeConnects: () => rt.connects,
  useRealtimeEvent: (room: string | null, event: string, handler: (payload: unknown) => void) => {
    rt.handlers.push({ room, event, handler });
  },
  usePresence: () => rt.presence,
}));

import {
  LiveBadge,
  LiveFlash,
  SeasonLiveRefresh,
  matchSeasonPlayer,
} from "./season-live";

const seasonRoomName = "season:s1";

const boardEvent = (over: Partial<BoardEventBroadcast> = {}): BoardEventBroadcast => ({
  seasonId: "s1",
  seasonPlayerId: "p1",
  eventType: "move",
  payload: {},
  createdAt: "2026-10-04T00:00:00.000Z",
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
  ...over,
});

const labels = { updated: "Season data refreshed" };
const badgeLabels = { online: "LIVE", offline: "OFFLINE", syncing: "SYNCING", watching: "{count} watching" };

beforeEach(() => {
  rt.reset();
  refresh.fn.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("matchSeasonPlayer", () => {
  it("accepts season-wide events and its own player", () => {
    const match = matchSeasonPlayer("p1");
    expect(match(boardEvent({ seasonPlayerId: null }))).toBe(true);
    expect(match(boardEvent({ seasonPlayerId: "p1" }))).toBe(true);
  });

  it("rejects another player's event", () => {
    expect(matchSeasonPlayer("p1")(boardEvent({ seasonPlayerId: "p2" }))).toBe(false);
  });
});

describe("SeasonLiveRefresh", () => {
  it("renders nothing without a season", () => {
    const { container } = render(<SeasonLiveRefresh seasonId={null} labels={labels} />);
    expect(container.firstChild).toBeNull();
  });

  it("debounces a burst of board events into one refresh", () => {
    render(<SeasonLiveRefresh seasonId="s1" debounceMs={1000} labels={labels} />);
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent());
      rt.fire(seasonRoomName, "board:event", boardEvent());
      rt.fire(seasonRoomName, "board:event", boardEvent());
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(refresh.fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(refresh.fn).toHaveBeenCalledTimes(1);
  });

  it("shows the updated toast after the refresh lands", () => {
    render(<SeasonLiveRefresh seasonId="s1" debounceMs={1000} labels={labels} />);
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent());
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(labels.updated)).toBeTruthy();
  });

  it("ignores other players' events when filtered by matchPlayerId", () => {
    render(
      <SeasonLiveRefresh seasonId="s1" debounceMs={1000} matchPlayerId="p1" labels={labels} />,
    );
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent({ seasonPlayerId: "p2" }));
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(refresh.fn).not.toHaveBeenCalled();
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent({ seasonPlayerId: null }));
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(refresh.fn).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on ignored event types", () => {
    render(<SeasonLiveRefresh seasonId="s1" debounceMs={1000} labels={labels} />);
    act(() => {
      rt.fire("season:s1", "presence:update", { room: seasonRoomName, count: 2 });
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(refresh.fn).not.toHaveBeenCalled();
  });
});

describe("LiveBadge", () => {
  it("shows the online pill while connected", () => {
    render(<LiveBadge seasonId="s1" labels={badgeLabels} />);
    expect(screen.getByRole("status").textContent).toContain(badgeLabels.online);
  });

  it("shows the offline pill when the socket is down", () => {
    rt.connected = false;
    render(<LiveBadge seasonId="s1" labels={badgeLabels} />);
    expect(screen.getByRole("status").textContent).toContain(badgeLabels.offline);
  });

  it("switches to syncing on a board event and back after the window", () => {
    render(<LiveBadge seasonId="s1" labels={badgeLabels} />);
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent());
    });
    expect(screen.getByRole("status").textContent).toContain(badgeLabels.syncing);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("status").textContent).toContain(badgeLabels.online);
  });

  it("shows the headcount suffix only when more than one socket watches", () => {
    rt.presence = 3;
    const { unmount } = render(<LiveBadge seasonId="s1" labels={badgeLabels} />);
    expect(screen.getByRole("status").textContent).toContain("3 watching");
    unmount();
    rt.presence = 1;
    render(<LiveBadge seasonId="s1" labels={badgeLabels} />);
    expect(screen.getByRole("status").textContent).not.toContain("watching");
  });

  it("renders nothing without a season", () => {
    const { container } = render(<LiveBadge seasonId={null} labels={badgeLabels} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("LiveFlash", () => {
  it("flashes the wrapper on a matching event then clears the class", () => {
    const { container } = render(
      <LiveFlash seasonId="s1" matchPlayerId="p1">
        <span>panel</span>
      </LiveFlash>,
    );
    const wrapper = container.querySelector("div")!;
    expect(wrapper.className).not.toContain("animate-hud-fade");
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent({ seasonPlayerId: "p1" }));
    });
    expect(wrapper.className).toContain("animate-hud-fade");
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(wrapper.className).not.toContain("animate-hud-fade");
  });

  it("does not flash on another player's event", () => {
    const { container } = render(
      <LiveFlash seasonId="s1" matchPlayerId="p1">
        <span>panel</span>
      </LiveFlash>,
    );
    act(() => {
      rt.fire(seasonRoomName, "board:event", boardEvent({ seasonPlayerId: "p2" }));
    });
    expect(container.querySelector("div")!.className).not.toContain("animate-hud-fade");
  });
});
