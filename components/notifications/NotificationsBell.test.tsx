// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { NotificationsBell } from "./NotificationsBell";
import type { NotificationView } from "./NotificationCard";

const t = getDictionary("en");

const feed = vi.hoisted(() => ({
  items: [] as NotificationView[],
  unread: 0,
  live: false,
  refresh: vi.fn(),
}));

vi.mock("./useNotificationsFeed", () => ({
  useNotificationsFeed: () => ({
    items: feed.items,
    unread: feed.unread,
    live: feed.live,
    refresh: feed.refresh,
  }),
}));

vi.mock("@/lib/modules/notifications/actions", () => ({
  markNotificationReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
  deleteNotificationAction: vi.fn(),
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

const fetchMock = vi.fn();

function renderBell() {
  return render(
    <I18nProvider locale="en" t={t}>
      <NotificationsBell userId="u1" />
    </I18nProvider>,
  );
}

const trigger = () => screen.getByRole("button", { name: t.notifications.bellOpen });

beforeEach(() => {
  feed.items = [];
  feed.unread = 0;
  feed.live = false;
  feed.refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items: [], unread: 0 }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotificationsBell trigger", () => {
  it("starts closed and labelled from the dictionary", () => {
    renderBell();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-controls")).toBe("notifications-drawer");
  });

  it("omits the badge at zero unread", () => {
    const { container } = renderBell();
    expect(container.querySelector("span.absolute.-top-1")).toBeNull();
  });

  it("shows the unread count from the feed", () => {
    feed.unread = 4;
    renderBell();
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("caps the badge at 99+", () => {
    feed.unread = 150;
    renderBell();
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("self-loads the snapshot from the notifications API on mount", () => {
    renderBell();
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications", { cache: "no-store" });
  });
});

describe("NotificationsBell drawer", () => {
  it("opens from the bell and locks page scroll", async () => {
    renderBell();
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const dialog = screen.getByRole("dialog", { name: t.notifications.bell });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("translate-x-0");
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
  });

  it("re-syncs with the server whenever it opens", async () => {
    renderBell();
    expect(feed.refresh).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    await waitFor(() => expect(feed.refresh).toHaveBeenCalledTimes(1));
  });

  it("closes on Escape and restores page scroll", async () => {
    renderBell();
    fireEvent.click(trigger());
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });

  it("closes from the header close button", () => {
    renderBell();
    fireEvent.click(trigger());
    fireEvent.click(screen.getAllByRole("button", { name: t.notifications.close })[1]);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("renders the empty state when the feed is empty", () => {
    renderBell();
    fireEvent.click(trigger());
    expect(screen.getByText(t.notifications.empty)).toBeTruthy();
    expect(screen.getByText(t.notifications.emptyHint)).toBeTruthy();
  });

  it("previews at most twelve cards", () => {
    feed.items = Array.from({ length: 15 }, (_, i) => item({ id: `n${i}` }));
    renderBell();
    fireEvent.click(trigger());
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });

  it("offers mark-read only on unread previews and delete on all", () => {
    feed.items = [item({ id: "unread" }), item({ id: "read", readAt: "2026-06-01T12:00:00.000Z" })];
    renderBell();
    fireEvent.click(trigger());
    expect(screen.getAllByRole("button", { name: t.notifications.markRead })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: t.notifications.delete })).toHaveLength(2);
  });

  it("offers mark-all-read only while unread notifications exist", () => {
    feed.items = [item()];
    feed.unread = 0;
    renderBell();
    fireEvent.click(trigger());
    expect(screen.queryByRole("button", { name: t.notifications.markAllRead })).toBeNull();

    cleanup();
    feed.unread = 2;
    renderBell();
    fireEvent.click(trigger());
    expect(screen.getByRole("button", { name: t.notifications.markAllRead })).toBeTruthy();
  });

  it("links to the full inbox", () => {
    renderBell();
    fireEvent.click(trigger());
    expect(screen.getByRole("link", { name: new RegExp(t.notifications.openInbox) }).getAttribute("href")).toBe(
      "/notifications",
    );
  });
});

describe("NotificationsBell bell ring", () => {
  it("rings when unread grows while closed", () => {
    const { container, rerender } = renderBell();
    const ringing = () => container.querySelector(".animate-hud-bell-ring");
    expect(ringing()).toBeNull();
    feed.unread = 3;
    rerender(
      <I18nProvider locale="en" t={t}>
        <NotificationsBell userId="u1" />
      </I18nProvider>,
    );
    expect(ringing()).toBeTruthy();
  });
});
