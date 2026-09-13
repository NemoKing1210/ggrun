"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useRealtimeConnects, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { seasonRoom } from "@/lib/realtime/protocol";

/** Trailing debounce: one roll fans out into several events (roll → move →
 * item/effect), and they must collapse into a single server round-trip. */
const REFRESH_DEBOUNCE_MS = 1500;

/**
 * Keeps server-rendered board pages (`/board`, season board) in sync with
 * the game: every `board:event` re-fetches the server snapshot (positions,
 * active rolls, stats) after a short debounce. Renders nothing.
 */
export function BoardLiveRefresh({ seasonId }: { seasonId: string }) {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  const connects = useRealtimeConnects();

  const scheduleRef = useRef(() => {});
  scheduleRef.current = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  };

  useRealtimeEvent(seasonRoom(seasonId), "board:event", () => {
    scheduleRef.current();
  });

  // Reconnect: events written while offline never arrive over the socket —
  // reload the snapshot on every fresh connect instead of showing a stale board.
  const lastConnectSeen = useRef(connects);
  useEffect(() => {
    if (lastConnectSeen.current === connects) return;
    lastConnectSeen.current = connects;
    scheduleRef.current();
  });

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return null;
}
