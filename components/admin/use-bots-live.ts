"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  useRealtime,
  useRealtimeConnects,
  useRealtimeEvent,
} from "@/components/realtime/realtime-provider";
import {
  botsRoom,
  type BotActivityBroadcast,
  type BotLogBroadcast,
  type BotRunBroadcast,
} from "@/lib/realtime/protocol";

/** Ring sizes for the in-memory live buffers. Generous enough for a fast run,
 *  small enough that a console left open for hours cannot grow without bound. */
const MAX_ACTIVITY = 400;
const MAX_LOGS = 300;

/**
 * One RSC refresh per burst. A tick fans out to several activity rows plus a
 * run update; collapsing them keeps the socket cheap and the page calm.
 */
const REFRESH_DEBOUNCE_MS = 1200;

export interface BotsLiveState {
  /** Socket connected — drives the live/idle pill. */
  connected: boolean;
  /** Latest run state per id, merged over the server snapshot by the console. */
  runs: Record<string, BotRunBroadcast>;
  /** Recent steps, oldest first — the newest match per bot is "what it does now". */
  activity: BotActivityBroadcast[];
  /** Live journal rows, newest first (deduped against the server by id). */
  logs: BotLogBroadcast[];
}

/**
 * Live subscription for the bots console: `bots:<seasonId>` is a staff-only
 * room, so the server enforces access on `join` and this hook never needs a
 * token. Events update the local buffers instantly (the "now doing" strip and
 * the log list) and schedule a debounced RSC refresh for the authoritative
 * snapshot (positions, points, inventory, statuses — the things only SQL
 * knows).
 */
export function useBotsLive(seasonId: string): BotsLiveState {
  const router = useRouter();
  const { connected } = useRealtime();
  const connects = useRealtimeConnects();
  const room = botsRoom(seasonId);

  const [runs, setRuns] = useState<Record<string, BotRunBroadcast>>({});
  const [activity, setActivity] = useState<BotActivityBroadcast[]>([]);
  const [logs, setLogs] = useState<BotLogBroadcast[]>([]);
  const timer = useRef<number | null>(null);

  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [router]);

  useRealtimeEvent(room, "bots:run", (run) => {
    setRuns((prev) => ({ ...prev, [run.runId]: run }));
    schedule();
  });

  useRealtimeEvent(room, "bots:activity", (step) => {
    setActivity((prev) => [...prev.slice(-(MAX_ACTIVITY - 1)), step]);
    schedule();
  });

  // The log tab is live on its own — no refresh needed for a journal row.
  useRealtimeEvent(room, "bots:log", (log) => {
    setLogs((prev) => [log, ...prev].slice(0, MAX_LOGS));
  });

  // Reconnect: events written while the socket was down never arrive.
  const lastConnectSeen = useRef(connects);
  useEffect(() => {
    if (lastConnectSeen.current === connects) return;
    lastConnectSeen.current = connects;
    // First mount already has a fresh snapshot — only reload on re-connects.
    if (connects > 1) schedule();
  }, [connects, schedule]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { connected, runs, activity, logs };
}

/**
 * A 1s clock for relative timestamps and the "live" pulse. Returns `null`
 * until it has mounted: `Date.now()` differs between the server render and the
 * browser, so a relative label rendered from it would be a hydration mismatch.
 * Callers skip the time-dependent bits while it is null.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
