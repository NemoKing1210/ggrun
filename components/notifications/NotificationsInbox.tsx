"use client";

import { useState } from "react";

import { useI18n } from "@/lib/i18n/client";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/modules/notifications/actions";

import { NotificationCard, type NotificationView } from "./NotificationCard";
import { useNotificationsFeed } from "./useNotificationsFeed";

/** Full inbox list: filter tabs, live prepend, per-card read/delete. */
export function NotificationsInbox({
  userId,
  initialItems,
  initialUnread,
}: {
  userId: string;
  initialItems: NotificationView[];
  initialUnread: number;
}) {
  const { t } = useI18n();
  const { items, unread, live, refresh } = useNotificationsFeed({
    userId,
    initialItems,
    initialUnread,
  });
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const visible = filter === "all" ? items : items.filter((n) => !n.readAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-mono text-[11px] tracking-widest ${live ? "text-success" : "text-dim"}`}
        >
          {live ? `● ${t.notifications.live}` : `○ ${t.notifications.offline}`}
        </span>
        <span className="font-mono text-[11px] tracking-widest text-dim">
          {unread > 0 ? t.notifications.marking : ""}
        </span>
        <span className="ml-auto flex gap-2">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`hud-btn !px-3 !py-1 text-xs ${filter === f ? "hud-btn-primary" : ""}`}
            >
              {f === "all" ? t.notifications.all : t.notifications.unread}
            </button>
          ))}
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="hud-btn !px-3 !py-1 text-xs">
              {t.notifications.markAllRead}
            </button>
          </form>
          <button type="button" onClick={() => void refresh()} className="hud-btn !px-3 !py-1 text-xs">
            {t.notifications.open}
          </button>
        </span>
      </div>
      {visible.length === 0 ? (
        <div className="hud-card p-6 text-center">
          <p className="font-display text-lg tracking-widest uppercase">{t.notifications.empty}</p>
          <p className="mt-1 text-sm text-dim">{t.notifications.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <li key={n.id}>
              <NotificationCard item={n} unread={!n.readAt}>
                <span className="mt-2 flex gap-3">
                  {!n.readAt && (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="font-mono text-[11px] tracking-wider text-amber uppercase hover:underline">
                        {t.notifications.markRead}
                      </button>
                    </form>
                  )}
                  <form action={deleteNotificationAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="font-mono text-[11px] tracking-wider text-dim uppercase hover:text-danger">
                      {t.notifications.delete}
                    </button>
                  </form>
                </span>
              </NotificationCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
