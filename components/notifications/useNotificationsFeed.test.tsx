// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { NotificationBroadcast } from "@/lib/realtime/protocol";

import { useNotificationsFeed } from "./useNotificationsFeed";
import type { NotificationView } from "./NotificationCard";

const t = getDictionary("en");
const userId = "u1";

const hoisted = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    on: (event: string, fn: (payload: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(fn);
    },
    off: (event: string, fn: (payload: unknown) => void) => {
      handlers.get(event)?.delete(fn);
    },
  };
  return {
    handlers,
    socket,
    toastInfo: vi.fn(),
    connected: true,
    connects: 1,
    joinRoom: vi.fn(async () => ({ ok: true })),
    leaveRoom: vi.fn(),
  };
});

vi.mock("@/components/realtime/realtime-provider", () => ({
  useRealtime: () => ({
    socket: hoisted.socket,
    connected: hoisted.connected,
    connects: hoisted.connects,
    joinRoom: hoisted.joinRoom,
    leaveRoom: hoisted.leaveRoom,
  }),
}));

vi.mock("@/components/ui/toast/useToast", () => ({
  useToast: () => ({ info: hoisted.toastInfo }),
}));

const item = (over: Partial<NotificationView> = {}): NotificationView => ({
  id: "n1",
  kind: "game",
  titleKey: "seasonStarted",
  bodyKey: "seasonStarted",
  params: { season: "S1" },
  severity: "info",
  icon: null,
  imageUrl: null,
  href: null,
  actions: [],
  data: {},
  readAt: null,
  createdAt: "2026-06-01T12:00:00.000Z",
  ...over,
});

const broadcast = (over: Partial<NotificationBroadcast> = {}): NotificationBroadcast => ({
  id: "b1",
  userId,
  kind: "game",
  titleKey: "seasonStarted",
  bodyKey: "seasonStarted",
  params: { season: "S2" },
  severity: "info",
  icon: null,
  imageUrl: null,
  href: null,
  actions: [],
  data: {},
  readAt: null,
  createdAt: "2026-06-01T13:00:00.000Z",
  unread: 2,
  ...over,
});

// Stable references: the hook adopts `initialItems` by identity, so a fresh
// array literal on every render would loop forever.
const EMPTY: NotificationView[] = [];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider locale="en" t={t}>{children}</I18nProvider>
);

const fetchMock = vi.fn();

function fire(event: string, payload: unknown) {
  for (const fn of hoisted.handlers.get(event) ?? []) fn(payload);
}

beforeEach(() => {
  hoisted.handlers.clear();
  hoisted.toastInfo.mockReset();
  hoisted.connected = true;
  hoisted.connects = 1;
  hoisted.joinRoom.mockClear();
  hoisted.leaveRoom.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNotificationsFeed snapshot", () => {
  it("starts from the server-rendered snapshot", () => {
    const snapshot = [item()];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 3 }),
      { wrapper },
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.unread).toBe(3);
  });

  it("adopts a late snapshot when the parent swaps the reference", () => {
    const late = [item({ id: "late" })];
    const { result, rerender } = renderHook(
      (props: { items: NotificationView[]; unread: number }) =>
        useNotificationsFeed({ userId, initialItems: props.items, initialUnread: props.unread }),
      { wrapper, initialProps: { items: EMPTY, unread: 0 } },
    );
    expect(result.current.items).toHaveLength(0);
    rerender({ items: late, unread: 1 });
    expect(result.current.items[0]?.id).toBe("late");
    expect(result.current.unread).toBe(1);
  });

  it("joins the private user room and goes live on the ack", async () => {
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.live).toBe(true));
    expect(hoisted.joinRoom).toHaveBeenCalledWith(`user:${userId}`);
  });

  it("stays offline and does not join without a socket or user", async () => {
    hoisted.connected = false;
    const { result } = renderHook(
      () => useNotificationsFeed({ userId: null, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    await act(async () => {});
    expect(hoisted.joinRoom).not.toHaveBeenCalled();
    expect(result.current.live).toBe(false);
  });

  it("leaves the room and unsubscribes on unmount", async () => {
    const { unmount } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    await waitFor(() => expect(hoisted.handlers.get("notifications:created")?.size).toBe(1));
    unmount();
    expect(hoisted.leaveRoom).toHaveBeenCalledWith(`user:${userId}`);
    expect(hoisted.handlers.get("notifications:created")?.size).toBe(0);
    expect(hoisted.handlers.get("notifications:read")?.size).toBe(0);
  });
});

describe("useNotificationsFeed refresh", () => {
  it("replaces the snapshot with the fetched page", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [item({ id: "fresh" })], unread: 9 }),
    });
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/notifications?limit=50");
    expect(result.current.items[0]?.id).toBe("fresh");
    expect(result.current.unread).toBe(9);
  });

  it("keeps the cached snapshot when the response is not ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    const snapshot = [item()];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 2 }),
      { wrapper },
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.unread).toBe(2);
  });

  it("keeps the cached snapshot when the request throws", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const snapshot = [item()];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 2 }),
      { wrapper },
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.unread).toBe(2);
  });

  it("re-backfills after a reconnect", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], unread: 0 }) });
    const { rerender } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    hoisted.connects = 2;
    rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe("useNotificationsFeed incoming events", () => {
  it("prepends a socket notification, updates the badge and toasts its title", async () => {
    const snapshot = [item()];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 1 }),
      { wrapper },
    );
    await waitFor(() => expect(hoisted.handlers.get("notifications:created")?.size).toBe(1));
    act(() => fire("notifications:created", broadcast({ id: "new" })));
    expect(result.current.items[0]?.id).toBe("new");
    expect(result.current.items).toHaveLength(2);
    expect(result.current.unread).toBe(2);
    expect(hoisted.toastInfo).toHaveBeenCalledWith("S2 has started");
  });

  it("ignores a duplicate notification id", async () => {
    const snapshot = [item({ id: "dup" })];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 1 }),
      { wrapper },
    );
    await waitFor(() => expect(hoisted.handlers.get("notifications:created")?.size).toBe(1));
    act(() => fire("notifications:created", broadcast({ id: "dup" })));
    expect(result.current.items).toHaveLength(1);
  });

  it("falls back to the generic toast label for an unknown title key", async () => {
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    await waitFor(() => expect(hoisted.handlers.get("notifications:created")?.size).toBe(1));
    act(() => fire("notifications:created", broadcast({ id: "x", titleKey: "no_such_key" })));
    expect(hoisted.toastInfo).toHaveBeenCalledWith(t.notifications.newToast);
    expect(result.current.items).toHaveLength(1);
  });

  it("marks one notification read from a cross-tab event", async () => {
    const snapshot = [item({ id: "a" }), item({ id: "b" })];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 2 }),
      { wrapper },
    );
    await waitFor(() => expect(hoisted.handlers.get("notifications:read")?.size).toBe(1));
    act(() => fire("notifications:read", { id: "a", all: false, unread: 1 }));
    expect(result.current.items.find((n) => n.id === "a")?.readAt).toBeTruthy();
    expect(result.current.items.find((n) => n.id === "b")?.readAt).toBeNull();
    expect(result.current.unread).toBe(1);
  });

  it("marks every notification read on an all event", async () => {
    const snapshot = [item({ id: "a" }), item({ id: "b" })];
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: snapshot, initialUnread: 2 }),
      { wrapper },
    );
    await waitFor(() => expect(hoisted.handlers.get("notifications:read")?.size).toBe(1));
    act(() => fire("notifications:read", { id: null, all: true, unread: 0 }));
    expect(result.current.items.every((n) => n.readAt)).toBe(true);
    expect(result.current.unread).toBe(0);
  });

  it("drops live when the socket disconnects", async () => {
    hoisted.connected = false;
    const { result } = renderHook(
      () => useNotificationsFeed({ userId, initialItems: EMPTY, initialUnread: 0 }),
      { wrapper },
    );
    await act(async () => {});
    expect(result.current.live).toBe(false);
  });
});
