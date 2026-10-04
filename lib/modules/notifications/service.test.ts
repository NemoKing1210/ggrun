import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn() },
}));
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
  notifyMany,
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
    params: {},
    severity: "info",
    icon: "MegaphoneIcon",
    imageUrl: null,
    href: null,
    actions: [],
    data: {},
    dedupeKey: null,
    readAt: null,
    createdAt: new Date("2026-01-02T03:04:05Z"),
    ...overrides,
  };
}

/** Wires `db.select(...).from(...).where(...)` to resolve the given rows. */
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

describe("notifyUser", () => {
  it("persists the shaped notification and pushes it with the unread count", async () => {
    mocked.countUnread.mockResolvedValue(3);
    const item = makeItem({ readAt: null });
    mocked.insertNotification.mockResolvedValue(item);

    const result = await notifyUser("u1", "admin_broadcast", { params: { note: "hi" } });

    expect(result).toBe(item);
    const insert = mocked.insertNotification.mock.calls[0]![0];
    expect(insert.userId).toBe("u1");
    expect(insert.kind).toBe("admin_broadcast");
    expect(insert.dedupeKey).toBeNull();

    expect(mocked.publish).toHaveBeenCalledTimes(1);
    const [room, event, payload] = mocked.publish.mock.calls[0]!;
    expect(room).toBe(userRoom("u1"));
    expect(event).toBe("notifications:created");
    expect(payload).toMatchObject({
      id: "n1",
      userId: "u1",
      unread: 3,
      readAt: null,
      createdAt: "2026-01-02T03:04:05.000Z",
    });
  });

  it("returns null and pushes nothing when the write fails", async () => {
    mocked.insertNotification.mockRejectedValue(new Error("db down"));

    await expect(notifyUser("u1", "admin_broadcast")).resolves.toBeNull();
    expect(mocked.publish).not.toHaveBeenCalled();
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith("notifications.persist.failed", expect.anything());
  });

  it("still returns the persisted item when the realtime push fails", async () => {
    const item = makeItem();
    mocked.insertNotification.mockResolvedValue(item);
    mocked.countUnread.mockRejectedValue(new Error("count failed"));

    await expect(notifyUser("u1", "admin_broadcast")).resolves.toBe(item);
    expect(mocked.publish).not.toHaveBeenCalled();
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith("notifications.realtime.failed", expect.anything());
  });
});

describe("notifyMany", () => {
  it("notifies each recipient exactly once, dropping duplicates and empties", async () => {
    await notifyMany(["a", "", "a", "b"], "admin_broadcast");
    const userIds = mocked.insertNotification.mock.calls.map((call) => call[0].userId);
    expect(userIds).toEqual(["a", "b"]);
  });

  it("does nothing for an empty recipient list", async () => {
    await notifyMany([], "admin_broadcast");
    expect(mocked.insertNotification).not.toHaveBeenCalled();
  });
});

describe("notifyStaff", () => {
  it("notifies only admin and judge rows", async () => {
    selectRows([
      { id: "a", role: "admin" },
      { id: "b", role: "player" },
      { id: "c", role: "judge" },
      { id: "d", role: "viewer" },
    ]);

    await notifyStaff("admin_broadcast");

    const userIds = mocked.insertNotification.mock.calls.map((call) => call[0].userId);
    expect(userIds).toEqual(["a", "c"]);
  });
});

describe("notifySeasonParticipants", () => {
  it("dedupes the roster and stamps the season id onto every payload", async () => {
    selectRows([{ playerId: "p1" }, { playerId: "p2" }, { playerId: "p1" }]);

    await notifySeasonParticipants("s1", "admin_broadcast");

    const inserts = mocked.insertNotification.mock.calls.map((call) => call[0]);
    expect(inserts.map((i) => i.userId)).toEqual(["p1", "p2"]);
    for (const insert of inserts) {
      expect(insert.data).toMatchObject({ seasonId: "s1" });
    }
  });
});

describe("read receipts", () => {
  it("marks one notification read, publishes the receipt and reports unread", async () => {
    const readItem = makeItem({ readAt: new Date("2026-01-03T00:00:00Z") });
    mocked.markNotificationRead.mockResolvedValue(readItem);
    mocked.countUnread.mockResolvedValue(2);

    const result = await markRead("u1", "n1");
    expect(result).toEqual({ item: readItem, unread: 2 });
    expect(mocked.publish).toHaveBeenCalledWith(
      userRoom("u1"),
      "notifications:read",
      { id: "n1", readAt: "2026-01-03T00:00:00.000Z", all: false, unread: 2 },
    );
  });

  it("publishes nothing when the notification was not found or not owned", async () => {
    mocked.markNotificationRead.mockResolvedValue(null);
    mocked.countUnread.mockResolvedValue(4);

    const result = await markRead("u1", "other");
    expect(result).toEqual({ item: null, unread: 4 });
    expect(mocked.publish).not.toHaveBeenCalled();
  });

  it("marks everything read and always publishes unread 0", async () => {
    mocked.markAllNotificationsRead.mockResolvedValue(7);

    const result = await markAllRead("u1");
    expect(result).toEqual({ marked: 7, unread: 0 });
    expect(mocked.publish).toHaveBeenCalledWith(
      userRoom("u1"),
      "notifications:read",
      expect.objectContaining({ id: null, all: true, unread: 0 }),
    );
  });
});

describe("inbox access", () => {
  it("returns the page and the unread count together", async () => {
    const items = [makeItem(), makeItem({ id: "n2" })];
    mocked.listNotifications.mockResolvedValue(items);
    mocked.countUnread.mockResolvedValue(5);

    await expect(getInbox("u1", { limit: 10 })).resolves.toEqual({ items, unread: 5 });
    expect(mocked.listNotifications).toHaveBeenCalledWith("u1", { limit: 10 });
  });

  it("delegates a delete and returns its boolean result", async () => {
    mocked.deleteNotification.mockResolvedValue(true);
    await expect(removeNotification("u1", "n1")).resolves.toBe(true);
    expect(mocked.deleteNotification).toHaveBeenCalledWith("u1", "n1");
  });
});
