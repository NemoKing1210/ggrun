// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";

import { NotificationsInbox } from "./NotificationsInbox";
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

const actions = vi.hoisted(() => ({
  read: vi.fn(),
  readAll: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/modules/notifications/actions", () => ({
  markNotificationReadAction: actions.read,
  markAllNotificationsReadAction: actions.readAll,
  deleteNotificationAction: actions.remove,
}));

// The vi.mock calls above are hoisted, so this static import resolves stubs.
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

function renderInbox(over: { items?: NotificationView[]; unread?: number } = {}) {
  if (over.items !== undefined) feed.items = over.items;
  if (over.unread !== undefined) feed.unread = over.unread;
  return render(
    <I18nProvider locale="en" t={t}>
      <NotificationsInbox userId="u1" initialItems={[]} initialUnread={0} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  feed.items = [item()];
  feed.unread = 0;
  feed.live = false;
  feed.refresh.mockReset();
  actions.read.mockReset();
  actions.readAll.mockReset();
  actions.remove.mockReset();
});

afterEach(() => cleanup());

describe("NotificationsInbox", () => {
  it("shows the offline marker and no marking hint at zero unread", () => {
    renderInbox({ unread: 0 });
    expect(screen.getByText(`○ ${t.notifications.offline}`)).toBeTruthy();
    expect(screen.queryByText(t.notifications.marking)).toBeNull();
  });

  it("shows the live marker and marking hint when unread", () => {
    feed.live = true;
    renderInbox({ unread: 2 });
    expect(screen.getByText(`● ${t.notifications.live}`)).toBeTruthy();
    expect(screen.getByText(t.notifications.marking)).toBeTruthy();
  });

  it("renders an empty state when there are no notifications", () => {
    renderInbox({ items: [] });
    expect(screen.getByText(t.notifications.empty)).toBeTruthy();
    expect(screen.getByText(t.notifications.emptyHint)).toBeTruthy();
  });

  it("defaults to the all tab and can switch to unread", () => {
    renderInbox({
      items: [item({ id: "unread" }), item({ id: "read", readAt: "2026-06-01T12:00:00.000Z" })],
    });
    expect(screen.getByRole("button", { name: t.notifications.all }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: t.notifications.unread }));
    expect(
      screen.getByRole("button", { name: t.notifications.unread }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("offers mark-read only on unread cards, delete on every card", () => {
    renderInbox({
      items: [item({ id: "unread" }), item({ id: "read", readAt: "2026-06-01T12:00:00.000Z" })],
    });
    expect(screen.getAllByRole("button", { name: t.notifications.markRead })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: t.notifications.delete })).toHaveLength(2);
  });

  it("carries the notification id in each action form", () => {
    const { container } = renderInbox({ items: [item({ id: "abc" })] });
    const ids = [...container.querySelectorAll('input[name="id"]')].map((i) =>
      (i as HTMLInputElement).value,
    );
    expect(ids).toEqual(["abc", "abc"]);
  });

  it("submits the delete action with the row id", async () => {
    renderInbox({ items: [item({ id: "abc" })] });
    fireEvent.click(screen.getByRole("button", { name: t.notifications.delete }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledTimes(1));
    const formData = actions.remove.mock.calls[0][0] as FormData;
    expect(formData.get("id")).toBe("abc");
  });

  it("submits the mark-read action with the row id", async () => {
    renderInbox({ items: [item({ id: "abc" })] });
    fireEvent.click(screen.getByRole("button", { name: t.notifications.markRead }));
    await waitFor(() => expect(actions.read).toHaveBeenCalledTimes(1));
    const formData = actions.read.mock.calls[0][0] as FormData;
    expect(formData.get("id")).toBe("abc");
  });

  it("submits the mark-all action", async () => {
    renderInbox({ items: [item()] });
    fireEvent.click(screen.getByRole("button", { name: t.notifications.markAllRead }));
    await waitFor(() => expect(actions.readAll).toHaveBeenCalledTimes(1));
  });

  it("re-syncs when the open button is pressed", () => {
    renderInbox();
    fireEvent.click(screen.getByRole("button", { name: t.notifications.open }));
    expect(feed.refresh).toHaveBeenCalledTimes(1);
  });
});
