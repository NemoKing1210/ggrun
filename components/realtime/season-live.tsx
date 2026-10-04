"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

import {
  usePresence,
  useRealtime,
  useRealtimeConnects,
  useRealtimeEvent,
} from "@/components/realtime/realtime-provider";
import { seasonRoom, type BoardEventBroadcast } from "@/lib/realtime/protocol";

/** Predicate over an incoming season event. Return false to ignore it. */
export type BoardEventMatch = (payload: BoardEventBroadcast) => boolean;

/**
 * Match only one participant's events plus season-wide ones (`seasonPlayerId:
 * null` — season started/reset, admin adjustments). Used by HQ/profile pages
 * so another player's roll doesn't flash your screen, while a season reset
 * still does.
 */
export function matchSeasonPlayer(seasonPlayerId: string): BoardEventMatch {
  return (p) => p.seasonPlayerId === null || p.seasonPlayerId === seasonPlayerId;
}

/**
 * Shared trailing debounce: one roll fans out into several events (roll →
 * move → item/effect) that must collapse into a single server round-trip.
 */
export const SEASON_LIVE_DEBOUNCE_MS = 1500;

/** How long the "updated" toast stays on screen after a live refresh. */
const TOAST_TTL_MS = 2600;

/** How long an inline section keeps its update flash class. */
const FLASH_TTL_MS = 700;

function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export interface SeasonLiveLabels {
  /** Toast body shown right after a live refresh lands. */
  updated: string;
  /** Live pill states. */
  online: string;
  offline: string;
  syncing: string;
  /** Presence hint, `{count}` interpolated — e.g. "{count} watching". */
  watching: string;
}

interface SeasonLiveState {
  connected: boolean;
  /** A refresh is scheduled but hasn't fired yet. */
  pending: boolean;
  /** Increments every time a live batch is applied (refresh fired). */
  liveCount: number;
  refreshNow: () => void;
}

/**
 * Subscribes to `board:event` for a season and re-fetches the server snapshot
 * (debounced) whenever a matching event arrives. Offline writes never arrive
 * over the socket, so every fresh connect also schedules a refresh.
 */
export function useSeasonLive(
  seasonId: string | null,
  opts?: { debounceMs?: number; match?: BoardEventMatch },
): SeasonLiveState {
  const router = useRouter();
  const { connected } = useRealtime();
  const connects = useRealtimeConnects();
  const [pending, setPending] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const timer = useRef<number | null>(null);
  const debounceMs = opts?.debounceMs ?? SEASON_LIVE_DEBOUNCE_MS;
  const matchRef = useLatest(opts?.match);

  const fire = useCallback(() => {
    timer.current = null;
    setPending(false);
    setLiveCount((n) => n + 1);
    router.refresh();
  }, [router]);

  const schedule = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPending(true);
    timer.current = window.setTimeout(fire, debounceMs);
  }, [debounceMs, fire]);

  const refreshNow = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    fire();
  }, [fire]);

  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  useRealtimeEvent(seasonId ? seasonRoom(seasonId) : null, "board:event", (payload) => {
    if (matchRef.current && !matchRef.current(payload)) return;
    scheduleRef.current();
  });

  // Reconnect: events written while offline never arrive over the socket.
  const lastConnectSeen = useRef(connects);
  useEffect(() => {
    if (lastConnectSeen.current === connects) return;
    lastConnectSeen.current = connects;
    // First mount already has a fresh snapshot — only reload on re-connects.
    if (connects > 1) scheduleRef.current();
  }, [connects]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { connected, pending, liveCount, refreshNow };
}

/**
 * Invisible live wiring + animated feedback: a top progress sweep while a
 * refresh is pending and a dismissible "updated" toast when it lands.
 * Renders nothing otherwise.
 */
export function SeasonLiveRefresh({
  seasonId,
  debounceMs,
  match,
  matchPlayerId,
  labels,
}: {
  seasonId: string | null;
  debounceMs?: number;
  match?: BoardEventMatch;
  /**
   * RSC-friendly filter: refresh only on this participant's events plus
   * season-wide ones. Prefer over `match` in server pages — functions cannot
   * cross the server→client boundary as props.
   */
  matchPlayerId?: string;
  labels: Pick<SeasonLiveLabels, "updated">;
}) {
  const playerMatch = matchPlayerId ? matchSeasonPlayer(matchPlayerId) : undefined;
  const { pending, liveCount } = useSeasonLive(seasonId, {
    debounceMs,
    match: match ?? playerMatch,
  });
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    // The initial snapshot is already fresh — never toast on mount.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setToastVisible(true);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToastVisible(false);
    }, TOAST_TTL_MS);
  }, [liveCount]);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Disabled (no season) — placed after every hook to keep hook order stable.
  if (seasonId === null) return null;
  return (
    <MotionConfig reducedMotion="user">
      {/* pending sweep — thin amber line under the header */}
      <AnimatePresence>
        {pending ? (
          <motion.div
            key="season-live-progress"
            className="fixed inset-x-0 top-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            aria-hidden
          >
            <div className="hud-loader-progress h-0.5 w-full" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* landed toast — click to dismiss early */}
      <AnimatePresence>
        {toastVisible ? (
          <motion.button
            key={`season-live-toast-${liveCount}`}
            type="button"
            onClick={() => setToastVisible(false)}
            className="fixed bottom-6 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 border border-amber/40 bg-[#111110] px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-amber shadow-[0_0_16px_rgba(242,169,0,0.25)] [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <ArrowPathIcon
              className="size-3.5 animate-spin [animation-duration:1.2s]"
              aria-hidden
            />
            {labels.updated}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}

/**
 * Animated LIVE pill: pulsing military dot while connected, amber shimmer
 * while a refresh is pending, rust dot while offline. Optional headcount
 * (`usePresence`) shows how many sockets watch the same season room.
 */
export function LiveBadge({
  seasonId,
  labels,
  showCount = true,
  className,
}: {
  seasonId: string | null;
  labels: Pick<SeasonLiveLabels, "online" | "offline" | "syncing" | "watching">;
  showCount?: boolean;
  className?: string;
}) {
  const room = seasonId ? seasonRoom(seasonId) : null;
  // Reuses the provider's ref-counted membership — no extra socket traffic
  // when a SeasonLiveRefresh for the same room is already mounted.
  const { connected } = useRealtime();
  const count = usePresence(showCount ? room : null);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | null>(null);

  useRealtimeEvent(room, "board:event", () => {
    setPending(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPending(false);
    }, SEASON_LIVE_DEBOUNCE_MS + 400);
  });

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const state = !connected ? "offline" : pending ? "syncing" : "online";
  // Disabled (no season) — placed after every hook to keep hook order stable.
  if (seasonId === null) return null;
  const dot =
    state === "online"
      ? "bg-military animate-pulse"
      : state === "syncing"
        ? "bg-amber animate-pulse"
        : "bg-danger";
  const text =
    state === "online" ? labels.online : state === "syncing" ? labels.syncing : labels.offline;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${
        state === "online"
          ? "border-military/40 bg-military/10 text-military"
          : state === "syncing"
            ? "border-amber/40 bg-amber/10 text-amber"
            : "border-danger/40 bg-danger/10 text-danger"
      } ${className ?? ""}`}
    >
      <span className={`size-1.5 ${dot}`} aria-hidden />
      {text}
      {showCount && connected && count !== null && count > 1 ? (
        <span className="text-dim" aria-label={labels.watching.replace("{count}", String(count))}>
          · {labels.watching.replace("{count}", String(count))}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Instant visual echo for server-rendered sections: replays the HUD fade the
 * moment a matching event arrives (the debounced `router.refresh` lands its
 * fresh data ~1.5s later). No remount, no focus loss — just a class toggle.
 */
export function LiveFlash({
  seasonId,
  match,
  matchPlayerId,
  children,
  className,
}: {
  seasonId: string | null;
  match?: BoardEventMatch;
  /** RSC-friendly filter — see `SeasonLiveRefresh`. */
  matchPlayerId?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [flash, setFlash] = useState(false);
  const timer = useRef<number | null>(null);
  const matchRef = useLatest(
    match ?? (matchPlayerId ? matchSeasonPlayer(matchPlayerId) : undefined),
  );

  useRealtimeEvent(seasonId ? seasonRoom(seasonId) : null, "board:event", (payload) => {
    if (matchRef.current && !matchRef.current(payload)) return;
    setFlash(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setFlash(false);
    }, FLASH_TTL_MS);
  });

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return <div className={`${className ?? ""} ${flash ? "animate-hud-fade" : ""}`}>{children}</div>;
}
