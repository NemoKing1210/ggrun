"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  InboxIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { HudMotion, riseDelay } from "@/components/ui/motion";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/modules/notifications/actions";

import { NotificationCard, type NotificationView } from "./NotificationCard";
import { useNotificationsFeed } from "./useNotificationsFeed";

/** Cards the drawer renders; anything older lives on `/notifications`. */
const PREVIEW_LIMIT = 12;

/** Unread counter pinned to the bell glyph; morphs in as the count changes. */
function BellCount({ count }: { count: number }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={`badge-${count}`}
          aria-hidden
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="absolute -top-1 -right-1 min-w-4 border border-amber bg-amber px-1 text-center font-mono text-[10px] leading-4 text-black [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)]"
        >
          {count > 99 ? "99+" : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * Header bell + right-edge inbox drawer — the reading sibling of the chat
 * drawer (`components/chat/GlobalChat.tsx`): same 520px frame, hazard tape,
 * amber header band and clip. The bell self-loads a snapshot from
 * `/api/notifications` so the header stays a cheap render; opening the drawer
 * re-syncs with the server and locks page scroll.
 *
 * The drawer is portalled to `document.body` on purpose: the sticky header's
 * `backdrop-filter` makes it the containing block for `position: fixed`, so a
 * drawer rendered inside it would be sectioned to the 56px header band.
 */
export function NotificationsBell({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<{ items: NotificationView[]; unread: number } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setSnapshot(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const { items, unread, live, refresh } = useNotificationsFeed({
    userId,
    initialItems: snapshot?.items ?? [],
    initialUnread: snapshot?.unread ?? 0,
  });
  const [open, setOpen] = useState(false);
  const [ringKey, setRingKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const prevUnread = useRef(unread);
  const wasOpen = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Ring the bell when the unread count grows while the drawer is closed.
  useEffect(() => {
    if (unread > prevUnread.current && !open) setRingKey((k) => k + 1);
    prevUnread.current = unread;
  }, [unread, open]);

  // The bell only holds the mount-time snapshot; opening re-syncs with the server.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Esc closes; the panel takes focus on open and hands it back on close.
  useEffect(() => {
    if (open) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
    else if (wasOpen.current) triggerRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  // Block page scroll behind the drawer (body lock + iOS touch guard).
  useEffect(() => {
    if (!open) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    const prevPad = document.body.style.paddingRight;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;
    const onTouchMove = (e: TouchEvent) => {
      const target = e.target as Node | null;
      if (listRef.current && target && listRef.current.contains(target)) return;
      e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      document.body.style.paddingRight = prevPad;
      document.body.style.overscrollBehavior = "";
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [open]);

  const preview = items.slice(0, PREVIEW_LIMIT);

  const drawer = (
    <>
      <button
        type="button"
        aria-label={t.notifications.close}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={panelRef}
        id="notifications-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t.notifications.bell}
        tabIndex={-1}
        inert={!open}
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col border-l-2 border-amber/25 bg-[#0a0a08] shadow-[0_0_48px_rgba(0,0,0,0.85),0_0_24px_rgba(242,169,0,0.10)] transition-transform duration-300 ease-out focus:outline-none",
          "[clip-path:polygon(12px_0,100%_0,100%_100%,0_100%,0_12px)]",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="hazard-tape h-[3px] shrink-0 opacity-90" aria-hidden />
        <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-amber/30 to-transparent" aria-hidden />

        {/* Header — status readout: channel, link state, unread count */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber/10 bg-gradient-to-r from-[#151510] via-[#1a1a12] to-[#151510] px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center border border-amber/25 bg-amber/10 text-amber shadow-[0_0_12px_rgba(242,169,0,0.18)] [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)]">
              <BellIcon className="size-[18px]" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-display text-[13px] leading-none uppercase tracking-[0.18em] text-amber">
                  {t.notifications.bell}
                </p>
                {live ? (
                  <span className="hidden items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400 sm:inline-flex">
                    <span
                      className="size-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                      aria-hidden
                    />
                    {t.notifications.live}
                  </span>
                ) : (
                  <span className="hidden items-center gap-1.5 border border-amber/20 bg-amber/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber sm:inline-flex">
                    <span className="size-1.5 animate-pulse rounded-full bg-amber" aria-hidden />
                    {t.notifications.offline}
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-dim/80">
                <span className="hidden sm:inline">{t.notifications.kicker}</span>
                <span className="hidden size-1 rounded-full bg-dim/30 sm:inline-block" aria-hidden />
                <span className="text-dim/60">
                  {format(t.notifications.unreadCount, { count: unread })}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.notifications.close}
            className="inline-flex size-9 shrink-0 items-center justify-center border border-[#2a2a21] bg-[#1c1c18] text-dim transition-colors hover:border-amber/30 hover:bg-amber hover:text-black [clip-path:polygon(5px_0,100%_0,100%_calc(100%-5px),calc(100%-5px)_100%,0_100%,0_5px)]"
          >
            <XMarkIcon className="size-5" aria-hidden />
          </button>
        </div>

        {/* Feed */}
        <div
          ref={listRef}
          className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[#080807] px-3 py-3"
        >
          {preview.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-14 text-center">
              <div className="flex size-12 items-center justify-center border border-amber/15 bg-amber/5 text-amber/60 [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
                <InboxIcon className="size-6" aria-hidden />
              </div>
              <p className="mt-4 font-display text-xs uppercase tracking-[0.16em] text-dim">
                {t.notifications.empty}
              </p>
              <p className="mt-1.5 max-w-[26ch] font-mono text-[11px] leading-relaxed text-dim/60">
                {t.notifications.emptyHint}
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {preview.map((n, i) => (
                <li
                  key={n.id}
                  style={riseDelay(i)}
                  className="animate-hud-rise border-b border-line/60 px-1 py-1.5 last:border-b-0"
                >
                  <NotificationCard item={n} unread={!n.readAt} variant="bare">
                    <span className="flex items-center gap-3">
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
        </div>

        {/* Command bar — bulk action + way into the full inbox */}
        <div className="shrink-0 border-t border-amber/10 bg-gradient-to-b from-[#151510] to-[#10100e] p-3">
          <div className="flex flex-wrap items-center gap-2">
            {unread > 0 && (
              <form action={markAllNotificationsReadAction}>
                <button
                  type="submit"
                  title={t.notifications.markAllRead}
                  className="hud-btn inline-flex items-center gap-1.5 !px-3 !py-1.5 text-xs"
                >
                  <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                  {t.notifications.markAllRead}
                </button>
              </form>
            )}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="hud-btn hud-btn-primary ml-auto inline-flex items-center gap-2 !px-3 !py-1.5 text-xs"
            >
              {t.notifications.openInbox}
              <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <HudMotion>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.notifications.bellOpen}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notifications-drawer"
        title={format(t.notifications.unreadCount, { count: unread })}
        className="relative inline-flex items-center justify-center p-1 text-dim transition-colors hover:text-amber"
      >
        <span
          key={ringKey}
          className={ringKey > 0 ? "inline-flex animate-hud-bell-ring" : "inline-flex"}
        >
          <BellIcon className="h-5 w-5" aria-hidden />
        </span>
        <BellCount count={unread} />
      </button>
      {mounted && createPortal(drawer, document.body)}
    </HudMotion>
  );
}
