"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BoltIcon } from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { usePresence, useRealtime, useRealtimeEvent } from "@/components/realtime/realtime-provider";
import { seasonRoom, type BoardEventBroadcast } from "@/lib/realtime/protocol";

/**
 * Live season activity strip for board pages.
 *
 * Subscribes to the public `season:<id>` room and renders the newest events
 * (movement, rolls, items, effects…) as one-line entries. Text reuses the
 * feed dictionary (`t.feed`), so every event type is already translated —
 * this component only needs its own chrome strings (`t.board.activity`).
 */

const MAX_ENTRIES = 8;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ieeName(dict: Dictionary, kind: "items" | "effects", key: string | null): string {
  if (!key) return "—";
  const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => (c as string).toUpperCase());
  const node = (dict.iee as unknown as Record<string, Record<string, { name?: string }>>)[kind]?.[camel];
  return node?.name ?? key;
}

function diceSuffix(feed: Dictionary["feed"], payload: Record<string, unknown>): string {
  const d = payload.dice;
  if (!Array.isArray(d)) return "";
  const nums = d.filter((x): x is number => typeof x === "number");
  return nums.length > 0 ? ` ${format(feed.diceSuffix, { dice: nums.join(" + ") })}` : "";
}

/** Plain-text twin of the feed timeline line — same strings, no links. */
function describe(entry: BoardEventBroadcast, feed: Dictionary["feed"], dict: Dictionary): string {
  const p = (entry.payload ?? {}) as Record<string, unknown>;
  const actor = entry.displayName ?? entry.username ?? feed.fallbackPlayer;
  const ax = feed.actions;
  switch (entry.eventType) {
    case "game_rolled":
      return `${actor}${format(ax.rolled, { title: str(p.title) ?? feed.unknownTitle })}`;
    case "game_rerolled":
      return `${actor}${format(ax.rerolled, { title: str(p.title) ?? feed.unknownTitle })}`;
    case "game_passed":
      return `${actor}${ax.passed}${diceSuffix(feed, p)}`;
    case "game_dropped":
      return `${actor}${ax.dropped}${diceSuffix(feed, p)}`;
    case "moved": {
      const to = num(p.to);
      return `${actor}${format(ax.movedFrom, { from: String(num(p.from) ?? "?") })}${to ?? "?"}${diceSuffix(feed, p)}`;
    }
    case "season_started":
      return feed.seasonStarted;
    case "player_joined":
      return `${actor}${ax.joined}`;
    case "player_left":
      return `${actor}${ax.left}`;
    case "player_finished":
      return `${actor}${ax.finished}`;
    case "item_granted":
      return `${actor}${ax.itemGranted}${ieeName(dict, "items", str(p.itemKey))}`;
    case "item_used": {
      const target = str(p.targetUsername);
      return `${actor}${ax.itemUsed}${ieeName(dict, "items", str(p.itemKey))}${target ? `${ax.itemUsedOn}${target}` : ""}`;
    }
    case "item_expired":
    case "item_revoked":
      return `${actor}${ax.itemExpired}${ieeName(dict, "items", str(p.itemKey))}`;
    case "effect_applied": {
      const key = ieeName(dict, "effects", str(p.effectKey));
      return `${actor}${p.refreshed === true ? ax.effectRefreshed : ax.effectApplied}${key}`;
    }
    case "effect_expired":
      return `${actor}${ax.effectExpired}${ieeName(dict, "effects", str(p.effectKey))}`;
    case "effect_cleansed":
    case "effect_revoked":
      return `${actor}${ax.effectCleansed}${ieeName(dict, "effects", str(p.effectKey))}`;
    case "event_assigned":
    case "event_submitted":
    case "event_approved":
    case "event_rejected": {
      const title = str(p.title) ?? str(p.eventKey) ?? feed.unknownTitle;
      const verb =
        entry.eventType === "event_assigned"
          ? ax.eventAssigned
          : entry.eventType === "event_submitted"
            ? ax.eventSubmitted
            : entry.eventType === "event_approved"
              ? ax.eventApproved
              : ax.eventRejected;
      return `${actor}${verb}${title}`;
    }
    case "admin_adjustment": {
      const reason = str(p.reason);
      return `${feed.adminAdjustmentPrefix}${actor}${reason ? format(feed.adminAdjustmentReason, { reason }) : ""}`;
    }
    default:
      return format(feed.defaultEvent, { type: entry.eventType });
  }
}

interface LiveEntry {
  key: number;
  createdAt: string;
  text: string;
}

export function BoardLiveFeed({ seasonId }: { seasonId: string }) {
  const { t, locale } = useI18n();
  const { connected } = useRealtime();
  const feed = t.feed;
  const act = t.board.activity;
  const room = seasonRoom(seasonId);
  const presence = usePresence(room);
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  const keyRef = useRef(0);

  useRealtimeEvent(room, "board:event", (entry) => {
    keyRef.current += 1;
    const live: LiveEntry = {
      key: keyRef.current,
      createdAt: entry.createdAt,
      text: describe(entry, feed, t),
    };
    setEntries((prev) => [live, ...prev].slice(0, MAX_ENTRIES));
  });

  const presenceLabel =
    presence !== null && presence > 0 ? format(act.watching, { count: String(presence) }) : null;
  const countLabel =
    [entries.length > 0 ? String(entries.length) : null, presenceLabel]
      .filter((part): part is string => part !== null)
      .join(" · ") || "—";

  return (
    <section aria-label={act.title} className="hud-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 font-display text-sm uppercase tracking-wider">
          <BoltIcon className="size-4 text-amber" aria-hidden />
          {act.title}
          {connected ? (
            <span className="inline-flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" aria-hidden />
              {feed.live}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-dim/20 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-dim">
              <span className="size-1.5 rounded-full bg-dim/50" aria-hidden />
              {feed.live}
            </span>
          )}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
          {countLabel}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 border border-dashed border-dim/20 bg-background/20 px-3 py-4 text-center font-mono text-[11px] leading-relaxed text-dim [clip-path:polygon(6px_0,100%_0,100%_calc(100%-6px),calc(100%-6px)_100%,0_100%,0_6px)]">
          {act.empty}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.li
                key={e.key}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex items-baseline gap-2 border border-[#1e1e18] bg-[#121210] px-2.5 py-1.5 [clip-path:polygon(4px_0,100%_0,100%_calc(100%-4px),calc(100%-4px)_100%,0_100%,0_4px)]"
              >
              <span className="shrink-0 font-mono text-[10px] tracking-widest text-amber/70">
                <EntryTime iso={e.createdAt} locale={locale} nowLabel={act.now} />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-snug text-zinc-200" title={e.text}>
                {e.text}
              </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function EntryTime({ iso, locale, nowLabel }: { iso: string; locale: string | null; nowLabel: string }) {
  const d = new Date(iso);
  if (Date.now() - d.getTime() < 60_000) return <>{nowLabel}</>;
  try {
    return <>{new Intl.DateTimeFormat(locale ?? undefined, { hour: "2-digit", minute: "2-digit" }).format(d)}</>;
  } catch {
    return <>{d.toLocaleTimeString()}</>;
  }
}
