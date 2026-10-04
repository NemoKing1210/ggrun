/**
 * Remaining branches of the notification service: the realtime push is
 * best-effort in every entry point, and the read receipt falls back to "now"
 * when the stored row has no readAt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/realtime/bus", () => ({ publish: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./repository", () => ({
  countUnread: vi.fn(),
  deleteNotification: vi.fn(),
  insertNotification: vi.fn(),
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));

import { db } from "@/lib/infrastructure/db";
import { publish } from "@/lib/realtime/bus";
import { userRoom } from "@/lib/realtime/protocol";
import { log } from "@/lib/infrastructure/logger";

import * as repo from "./repository";
import type { NotificationListItem } from "./repository";
import {
  getInbox,
  markAllRead,
  markRead,
  notifySeasonParticipants,
  notifyStaff,
  notifyUser,
  removeNotification,
} from "./service";

const mocked = {
  dbSelect: vi.mocked(db.select),
  publish: vi.mocked(publish),
  countUnread: vi.mocked(repo.countUnread),
  deleteNotification: vi.mocked(repo.deleteNotification),
  insertNotification: vi.mocked(repo.insertNotification),
  listNotifications: vi.mocked(repo.listNotifications),
  markAllNotificationsRead: vi.mocked(repo.markAllNotificationsRead),
  markNotificationRead: vi.mocked(repo.markNotificationRead),
};

function makeItem(overrides: Partial<NotificationListItem> = {}): NotificationListItem {
  return {
    id: "n1",
    userId: "u1",
    kind: "admin_broadcast",
    titleKey: "adminBroadcast",
    bodyKey: "adminBroadcast",
    params: { note: "hi" },
    severity: "info",
    icon: "MegaphoneIcon",
    imageUrl: null,
    href: "/notifications",
    actions: [],
    data: { note: "hi" },
    dedupeKey: null,
    readAt: null,
    createdAt: new Date("2026-01-02T03:04:05Z"),
    ...overrides,
  };
}

function selectRows(rows: unknown[]): void {
  mocked.dbSelect.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.countUnread.mockResolvedValue(0);
  mocked.insertNotification.mockResolvedValue(makeItem());
});

describe("notifyUser realtime edge cases", () => {
  it("serializes the stored readAt when the item was already read", async () => {
    const item = makeItem({ readAt: new Date("2026-01-04T05:06:07Z") });
    mocked.insertNotification.mockResolvedValue(item);
    mocked.countUnread.mockResolvedValue(6);

    await notifyUser("u1", "admin_broadcast", { params: { note: "hi" } });

    const [, event, payload] = mocked.publish.mock.calls[0]!;
    expect(event).toBe("notifications:created");
    expect(payload).toMatchObject({
      readAt: "2026-01-04T05:06:07.000Z",
      unread: 6,
      href: "/notifications",
      data: { note: "hi" },
    });
  });

  it("swallows a push failure without losing the persisted item", async () => {
    const item = makeItem();
    mocked.insertNotification.mockResolvedValue(item);
    mocked.publish.mockImplementation(() => {
      throw new Error("bus down");
    });

    await expect(notifyUser("u1", "admin_broadcast")).resolves.toBe(item);
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith("notifications.realtime.failed", expect.anything());
  });
});

describe("fan-out empty cases", () => {
  it("does nothing when no staff rows match", async () => {
    selectRows([]);
    await notifyStaff("admin_broadcast");
    expect(mocked.insertNotification).not.toHaveBeenCalled();
  });

  it("does nothing when a season has no roster", async () => {
    selectRows([]);
    await notifySeasonParticipants("s1", "admin_broadcast");
    expect(mocked.insertNotification).not.toHaveBeenCalled();
  });
});

describe("read receipt fallbacks", () => {
  it("stamps the receipt with the current time when the row has no readAt", async () => {
    mocked.markNotificationRead.mockResolvedValue(makeItem({ readAt: null }));
    mocked.countUnread.mockResolvedValue(1);

    await expect(markRead("u1", "n1")).resolves.toEqual({ item: makeItem({ readAt: null }), unread: 1 });
    expect(mocked.publish).toHaveBeenCalledWith(
      userRoom("u1"),
      "notifications:read",
      expect.objectContaining({
        id: "n1",
        all: false,
        readAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      }),
    );
  });

  it("still reports the read state when the receipt push fails", async () => {
    const readItem = makeItem({ readAt: new Date("2026-01-03T00:00:00Z") });
    mocked.markNotificationRead.mockResolvedValue(readItem);
    mocked.countUnread.mockResolvedValue(2);
    mocked.publish.mockImplementation(() => {
      throw new Error("bus down");
    });

    await expect(markRead("u1", "n1")).resolves.toEqual({ item: readItem, unread: 2 });
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      "notifications.read.realtime.failed",
      expect.objectContaining({ userId: "u1" }),
    );
  });

  it("returns the marked count even when the mark-all receipt push fails", async () => {
    mocked.markAllNotificationsRead.mockResolvedValue(5);
    mocked.publish.mockImplementation(() => {
      throw new Error("bus down");
    });

    await expect(markAllRead("u1")).resolves.toEqual({ marked: 5, unread: 0 });
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      "notifications.read.realtime.failed",
      expect.objectContaining({ userId: "u1" }),
    );
  });
});

describe("inbox passthroughs", () => {
  it("passes undefined options through and combines both reads", async () => {
    const items = [makeItem()];
    mocked.listNotifications.mockResolvedValue(items);
    mocked.countUnread.mockResolvedValue(0);

    await expect(getInbox("u1")).resolves.toEqual({ items, unread: 0 });
    expect(mocked.listNotifications).toHaveBeenCalledWith("u1", undefined);
  });

  it("propagates a false delete result", async () => {
    mocked.deleteNotification.mockResolvedValue(false);
    await expect(removeNotification("u1", "nope")).resolves.toBe(false);
    expect(mocked.deleteNotification).toHaveBeenCalledWith("u1", "nope");
  });
});

describe("realtime room addressing", () => {
  it("always addresses the recipient's private room", async () => {
    await notifyUser("u9", "admin_broadcast");
    expect(mocked.publish.mock.calls[0]![0]).toBe(userRoom("u9"));
  });
});
