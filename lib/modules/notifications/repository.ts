import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { notifications, type NotificationInsert } from "@/db/schema";

export interface NotificationListItem {
  id: string;
  userId: string;
  kind: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, unknown>;
  severity: string;
  icon: string | null;
  imageUrl: string | null;
  href: string | null;
  actions: Array<{ id: string; labelKey: string; href?: string; style?: string }>;
  data: Record<string, unknown>;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function toItem(row: typeof notifications.$inferSelect): NotificationListItem {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    titleKey: row.titleKey,
    bodyKey: row.bodyKey,
    params: (row.params ?? {}) as Record<string, unknown>,
    severity: row.severity,
    icon: row.icon,
    imageUrl: row.imageUrl,
    href: row.href,
    actions: (row.actions ?? []) as NotificationListItem["actions"],
    data: (row.data ?? {}) as Record<string, unknown>,
    dedupeKey: row.dedupeKey,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export async function insertNotification(
  input: Omit<NotificationInsert, "id" | "createdAt">,
): Promise<NotificationListItem> {
  // Dedupe: a retry of the same fact returns the existing row instead of a
  // second card. `dedupeKey` is scoped per user by construction.
  if (input.dedupeKey) {
    const existing = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, input.userId), eq(notifications.dedupeKey, input.dedupeKey)))
      .limit(1);
    if (existing[0]) return toItem(existing[0]);
  }
  const [row] = await db.insert(notifications).values(input).returning();
  if (!row) throw new Error("notification insert returned no row");
  return toItem(row);
}

export async function listNotifications(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
): Promise<NotificationListItem[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100);
  const conditions = opts?.unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);
  const rows = await db
    .select()
    .from(notifications)
    .where(conditions)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(toItem);
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<NotificationListItem | null> {
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  return row ? toItem(row) : null;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  return rows.length > 0;
}
