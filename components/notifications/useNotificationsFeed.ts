"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRealtime } from "@/components/realtime/realtime-provider";
import { useToast } from "@/components/ui/toast/useToast";
import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import { userRoom, type NotificationBroadcast } from "@/lib/realtime/protocol";

import { toView, type NotificationView } from "./NotificationCard";

export interface NotificationsFeed {
  items: NotificationView[];
  unread: number;
  live: boolean;
  refresh: () => Promise<void>;
  applyIncoming: (b: NotificationBroadcast) => void;
  applyRead: (id: string | null, all: boolean, unread: number) => void;
}

/**
 * Live inbox feed: starts from the server-rendered snapshot, joins the
 * private `user:<id>` room, prepends incoming notifications (with a toast),
 * and syncs read state across tabs.
 */
export function useNotificationsFeed(opts: {
  userId: string | null;
  initialItems: NotificationView[];
  initialUnread: number;
}): NotificationsFeed {
  const { userId, initialItems, initialUnread } = opts;
  const { socket, connected, connects, joinRoom, leaveRoom } = useRealtime();
  const toast = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<NotificationView[]>(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [live, setLive] = useState(false);
  const toastTitle = useRef(t.notifications.newToast);
  toastTitle.current = t.notifications.newToast;

  // Late snapshot (the header bell self-loads): adopt it once it arrives.
  // Parents pass a stable reference afterwards, so live prepends are safe.
  useEffect(() => {
    setItems(initialItems);
    setUnread(initialUnread);
  }, [initialItems, initialUnread]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        items: NotificationView[];
        unread: number;
      };
      setItems(json.items);
      setUnread(json.unread);
    } catch {
      // Offline — keep the cached snapshot; the badge says OFFLINE.
    }
  }, []);

  const applyIncoming = useCallback(
    (b: NotificationBroadcast) => {
      setItems((prev) => {
        if (prev.some((n) => n.id === b.id)) return prev;
        return [toView(b), ...prev].slice(0, 100);
      });
      setUnread(b.unread);
      const titles = t.notifications.title as Record<string, string>;
      const template = titles[b.titleKey];
      const params: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(b.params)) {
        if (typeof v === "string" || typeof v === "number") params[k] = v;
      }
      toast.info(template ? format(template, params) : toastTitle.current);
    },
    [t, toast],
  );

  const applyRead = useCallback((id: string | null, all: boolean, next: number) => {
    setUnread(next);
    setItems((prev) =>
      all ? prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) : prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
  }, []);

  const applyIncomingRef = useRef(applyIncoming);
  applyIncomingRef.current = applyIncoming;
  const applyReadRef = useRef(applyRead);
  applyReadRef.current = applyRead;

  useEffect(() => {
    if (!userId || !socket) return;
    const room = userRoom(userId);
    let cancelled = false;
    joinRoom(room).then((ack) => {
      if (!cancelled) setLive(ack.ok);
    });
    const onCreated = (b: NotificationBroadcast) => applyIncomingRef.current(b);
    const onRead = (p: { id: string | null; all: boolean; unread: number }) =>
      applyReadRef.current(p.id, p.all, p.unread);
    socket.on("notifications:created", onCreated);
    socket.on("notifications:read", onRead);
    return () => {
      cancelled = true;
      socket.off("notifications:created", onCreated);
      socket.off("notifications:read", onRead);
      leaveRoom(room);
    };
  }, [userId, socket, joinRoom, leaveRoom]);

  // Re-backfill after every reconnect — the socket never replays history.
  const firstConnects = useRef(connects);
  useEffect(() => {
    if (connects > firstConnects.current) {
      firstConnects.current = connects;
      void refresh();
    }
  }, [connects, refresh]);

  useEffect(() => {
    setLive((v) => (connected ? v : false));
  }, [connected]);

  return { items, unread, live: live && connected, refresh, applyIncoming, applyRead };
}
