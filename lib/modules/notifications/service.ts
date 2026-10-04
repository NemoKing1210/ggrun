import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { seasonPlayers, users } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";
import { publish } from "@/lib/realtime/bus";
import { userRoom } from "@/lib/realtime/protocol";
import type {
  NotificationBroadcast,
  NotificationReadBroadcast,
} from "@/lib/realtime/protocol";
import { buildNotification } from "@/lib/engine/notifications";
import type { NotificationKind, NotifyInput } from "@/lib/engine/notifications";

import {
  countUnread,
  deleteNotification,
  insertNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationListItem,
} from "./repository";

export type { NotificationListItem };

function serialize(item: NotificationListItem, unread: number): NotificationBroadcast {
  return {
    id: item.id,
    userId: item.userId,
    kind: item.kind,
    titleKey: item.titleKey,
    bodyKey: item.bodyKey,
    params: item.params,
    severity: item.severity,
    icon: item.icon,
    imageUrl: item.imageUrl,
    href: item.href,
    actions: item.actions,
    data: item.data,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    unread,
  };
}

/**
 * Core fan-out: persist one notification, then push it into the recipient's
 * private `user:<id>` room. The write is the source of truth — the push is
 * best-effort and never breaks the caller (same contract as `logEvent`).
 */
export async function notifyUser(
  userId: string,
  kind: NotificationKind,
  input: NotifyInput = {},
): Promise<NotificationListItem | null> {
  const built = buildNotification(kind, input);
  let item: NotificationListItem;
  try {
    item = await insertNotification({
      userId,
      kind: built.kind,
      titleKey: built.titleKey,
      bodyKey: built.bodyKey,
      params: built.params,
      severity: built.severity,
      icon: built.icon,
      imageUrl: built.imageUrl,
      href: built.href,
      actions: built.actions,
      data: built.data,
      dedupeKey: built.dedupeKey,
    });
  } catch (error) {
    log.warn("notifications.persist.failed", {
      userId,
      kind,
      err: error instanceof Error ? error : undefined,
    });
    return null;
  }
  try {
    const unread = await countUnread(userId);
    publish(userRoom(userId), "notifications:created", serialize(item, unread));
  } catch (error) {
    log.warn("notifications.realtime.failed", {
      userId,
      kind,
      err: error instanceof Error ? error : undefined,
    });
  }
  return item;
}
/** Same fact to many recipients (season-wide announcements). */
export async function notifyMany(
  userIds: string[],
  kind: NotificationKind,
  input: NotifyInput = {},
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  for (const userId of ids) {
    await notifyUser(userId, kind, input);
  }
}

/** Every staff member (admin/judge, not blocked) — moderation receipts. */
export async function notifyStaff(
  kind: NotificationKind,
  input: NotifyInput = {},
): Promise<void> {
  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.isBlocked, false));
  const ids = rows
    .filter((u) => u.role === "admin" || u.role === "judge")
    .map((u) => u.id);
  await notifyMany(ids, kind, input);
}

/** Participants of a season (active roster) — season-wide announcements. */
export async function notifySeasonParticipants(
  seasonId: string,
  kind: NotificationKind,
  input: NotifyInput = {},
): Promise<void> {
  const roster = await db
    .select({ playerId: seasonPlayers.playerId })
    .from(seasonPlayers)
    .where(eq(seasonPlayers.seasonId, seasonId));
  const ids = [...new Set(roster.map((r) => r.playerId))];
  await notifyMany(ids, kind, { ...input, seasonId });
}

// --- Reads / writes owned by the inbox owner (actions + API route) ---------

export async function getInbox(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
): Promise<{ items: NotificationListItem[]; unread: number }> {
  const [items, unread] = await Promise.all([
    listNotifications(userId, opts),
    countUnread(userId),
  ]);
  return { items, unread };
}

export async function markRead(
  userId: string,
  id: string,
): Promise<{ item: NotificationListItem | null; unread: number }> {
  const item = await markNotificationRead(userId, id);
  const unread = await countUnread(userId);
  if (item) {
    const payload: NotificationReadBroadcast = {
      id: item.id,
      readAt: item.readAt ? item.readAt.toISOString() : new Date().toISOString(),
      all: false,
      unread,
    };
    try {
      publish(userRoom(userId), "notifications:read", payload);
    } catch (error) {
      log.warn("notifications.read.realtime.failed", {
        userId,
        err: error instanceof Error ? error : undefined,
      });
    }
  }
  return { item, unread };
}

export async function markAllRead(userId: string): Promise<{ marked: number; unread: number }> {
  const marked = await markAllNotificationsRead(userId);
  const payload: NotificationReadBroadcast = {
    id: null,
    readAt: new Date().toISOString(),
    all: true,
    unread: 0,
  };
  try {
    publish(userRoom(userId), "notifications:read", payload);
  } catch (error) {
    log.warn("notifications.read.realtime.failed", {
      userId,
      err: error instanceof Error ? error : undefined,
    });
  }
  return { marked, unread: 0 };
}

export async function removeNotification(userId: string, id: string): Promise<boolean> {
  return deleteNotification(userId, id);
}
