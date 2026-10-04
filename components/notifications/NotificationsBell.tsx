"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  InboxIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { Badge } from "@/components/ui/Badge";
import { HudMotion, riseDelay } from "@/components/ui/motion";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/modules/notifications/actions";

import { NotificationCard, type NotificationView } from "./NotificationCard";
import { useNotificationsFeed } from "./useNotificationsFeed";

/**
 * Header bell: unread badge, HUD dropdown with the latest cards.
 * Self-loads its snapshot from `/api/notifications` so the site
 * header stays a cheap render. Authenticated users only.
 *
 * Motion (DESIGN.md §8): panel 160ms ease-out (opacity + translateY),
 * items stagger via `animate-hud-rise`, bell rings 450ms on arrival.
 * All CSS so the server snapshot never flashes unstyled.
 */
export function NotificationsBell({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<{ items: NotificationView[]; unread: number } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications?limit=5", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setSnapshot(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const { items, unread, live } = useNotificationsFeed({
    userId,
    initialItems: snapshot?.items ?? [],
    initialUnread: snapshot?.unread ?? 0,
  });
  const [open, setOpen] = useState(false);
  const [ringKey, setRingKey] = useState(0);
  const prevUnread = useRef(unread);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Ring the bell when the unread count grows while the menu is closed.
  useEffect(() => {
    if (unread > prevUnread.current && !open) setRingKey((k) => k + 1);
    prevUnread.current = unread;
  }, [unread, open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  // Close on outside interaction. A fixed backdrop can't be used here: the
  // sticky header's backdrop-filter turns it into the containing block for
  // `position: fixed` descendants, so the overlay would only span the header.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open ]);

  const preview = items.slice(0, 5);

  return (
    <HudMotion>
      <span ref={containerRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={t.notifications.bellOpen}
          aria-expanded={open}
          title={format(t.notifications.unreadCount, { count: unread })}
          className="relative hidden items-center justify-center p-1 text-dim transition-colors hover:text-amber sm:inline-flex"
        >
          <span
            key={ringKey}
            className={ringKey > 0 ? "inline-flex animate-hud-bell-ring" : "inline-flex"}
          >
            <BellIcon className="h-5 w-5" aria-hidden />
          </span>
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key={`badge-${unread}`}
                aria-hidden
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="absolute -top-1 -right-1 min-w-4 border border-amber bg-amber px-1 text-center font-mono text-[10px] leading-4 text-black [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]"
              >
                {unread > 99 ? "99+" : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <AnimatePresence>
          {open && (
            <>
              <motion.span
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                style={{ position: "absolute", top: "2.25rem", right: 0, zIndex: 50 }}
                className="block w-[22rem] origin-top-right"
                role="dialog"
                aria-label={t.notifications.bell}
              >
                <span className="hud-card block">
                  <span className="block h-1 bg-amber" aria-hidden />
                <span className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                  <span className="font-display text-xs tracking-widest text-foreground uppercase">
                    {t.notifications.bell}
                  </span>
                  {unread > 0 && (
                    <Badge variant="amber" size="sm">
                      {unread > 99 ? "99+" : unread}
                    </Badge>
                  )}
                  <Badge variant={live ? "military" : "dim"} size="sm">
                    {live ? `● ${t.notifications.live}` : `○ ${t.notifications.offline}`}
                  </Badge>
                  {unread > 0 && (
                    <form action={markAllNotificationsReadAction} className="ml-auto shrink-0">
                      <button
                        type="submit"
                        title={t.notifications.markAllRead}
                        className="inline-flex items-center gap-1 px-1 py-0.5 font-mono text-[11px] tracking-wider whitespace-nowrap text-amber uppercase transition-colors hover:bg-amber/10"
                      >
                        <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                        {t.notifications.markAllRead}
                      </button>
                    </form>
                  )}
                </span>
                <span className="block max-h-96 overflow-y-auto p-2">
                  {preview.length === 0 ? (
                    <span className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                      <InboxIcon className="h-8 w-8 text-dim" aria-hidden />
                      <span className="font-display text-sm tracking-widest text-dim uppercase">
                        {t.notifications.empty}
                      </span>
                      <span className="text-xs text-dim">{t.notifications.emptyHint}</span>
                    </span>
                  ) : (
                    <ul className="space-y-1">
                      {preview.map((n, i) => (
                        <li
                          key={n.id}
                          style={riseDelay(i)}
                          className="animate-hud-rise border-b border-line/60 px-1 py-1.5 last:border-b-0"
                        >
                          <NotificationCard item={n} unread={!n.readAt} variant="bare">
                            <span className="mt-1.5 flex gap-3">
                              {!n.readAt && (
                                <form action={markNotificationReadAction}>
                                  <input type="hidden" name="id" value={n.id} />
                                  <button
                                    type="submit"
                                    className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wider text-amber uppercase hover:underline"
                                  >
                                    <CheckIcon className="h-3 w-3" aria-hidden />
                                    {t.notifications.markRead}
                                  </button>
                                </form>
                              )}
                              <form action={deleteNotificationAction}>
                                <input type="hidden" name="id" value={n.id} />
                                <button
                                  type="submit"
                                  aria-label={t.notifications.delete}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wider text-dim uppercase transition-colors hover:text-danger"
                                >
                                  <TrashIcon className="h-3 w-3" aria-hidden />
                                  {t.notifications.delete}
                                </button>
                              </form>
                            </span>
                          </NotificationCard>
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
                <span className="block border-t border-line p-2">
                  <Link
                    href="/notifications"
                    onClick={() => setOpen(false)}
                    className="hud-btn hud-btn-primary flex w-full items-center justify-center gap-2 !py-1.5 text-xs"
                  >
                    {t.notifications.openInbox}
                    <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </span>
                </span>
              </motion.span>
            </>
          )}
        </AnimatePresence>
      </span>
    </HudMotion>
  );
}
