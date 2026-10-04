// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { SEASON_LIVE_DEBOUNCE_MS } from "@/components/realtime/season-live";

const refresh = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refresh.fn }) }));

const rt = vi.hoisted(() => ({
  handlers: [] as Array<{ room: string | null; event: string; handler: (payload: unknown) => void }>,
  fire(room: string, event: string, payload: unknown) {
    for (const h of rt.handlers) if (h.room === room && h.event === event) h.handler(payload);
  },
  reset() {
    rt.handlers = [];
  },
}));

vi.mock("@/components/realtime/realtime-provider", () => ({
  useRealtime: () => ({ connected: true, socket: null, connects: 1 }),
  useRealtimeConnects: () => 1,
  useRealtimeEvent: (room: string | null, event: string, handler: (payload: unknown) => void) => {
    rt.handlers.push({ room, event, handler });
  },
  usePresence: () => null,
}));

import { BoardLiveRefresh } from "./board-live-refresh";

const t = getDictionary("en");

const event = {
  seasonId: "s1",
  seasonPlayerId: null,
  eventType: "move",
  payload: {},
  createdAt: "2026-10-04T00:00:00.000Z",
  username: null,
  displayName: null,
  avatarUrl: null,
};

const renderRefresh = () =>
  render(
    <I18nProvider locale="en" t={t}>
      <BoardLiveRefresh seasonId="s1" />
    </I18nProvider>,
  );

beforeEach(() => {
  rt.reset();
  refresh.fn.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BoardLiveRefresh", () => {
  it("stays silent until a board event arrives", () => {
    const { container } = renderRefresh();
    expect(container.firstChild).toBeNull();
    expect(refresh.fn).not.toHaveBeenCalled();
  });

  it("refreshes once after the shared debounce window", () => {
    renderRefresh();
    act(() => {
      rt.fire("season:s1", "board:event", event);
    });
    act(() => {
      vi.advanceTimersByTime(SEASON_LIVE_DEBOUNCE_MS - 1);
    });
    expect(refresh.fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(refresh.fn).toHaveBeenCalledTimes(1);
  });

  it("shows the dictionary 'updated' label once the refresh lands", () => {
    renderRefresh();
    act(() => {
      rt.fire("season:s1", "board:event", event);
    });
    act(() => {
      vi.advanceTimersByTime(SEASON_LIVE_DEBOUNCE_MS);
    });
    expect(screen.getByText(t.feed.updated)).toBeTruthy();
  });
});
