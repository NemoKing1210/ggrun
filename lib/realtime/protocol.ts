/**
 * GGRun realtime protocol — the single contract for every live feature.
 *
 * Three parties speak this protocol and nothing else:
 *
 * - publishers — any server code (`logEvent`, `logAdminAction`, API routes)
 *   calls `publish(room, event, payload)` from `lib/realtime/bus.ts`;
 * - the socket server — `lib/realtime/socket-server.ts`, attached to the
 *   custom server in `server.ts`, forwards bus messages into Socket.IO rooms
 *   and relays ephemeral client events (typing);
 * - subscribers — browser code under `components/realtime/*` joins rooms and
 *   handles events.
 *
 * Rooms:
 * - `"chat"` — global chat. Public read; `chat:typing` requires auth.
 * - `"audit"` — admin audit log. Staff (`admin`/`judge`) only.
 * - `"season:<seasonId>"` — one room per season: movement, rolls, items,
 *   effects and every other public feed event of that season.
 *
 * To add a new live feature: pick a room (or add a `*Room` helper next to
 * `seasonRoom`), add the event + payload to `RealtimeEventMap`, publish with
 * `publish(...)` where the fact happens, subscribe with
 * `useRealtimeEvent(room, event, handler)`. No other wiring needed.
 *
 * This module is dependency-free on purpose: it is imported by the browser
 * bundle, the Socket.IO server and the Next.js server alike, so it must not
 * pull in `next/*`, `react`, `drizzle-orm` or `pg`.
 */

/** Global chat room: every connected client may join. */
export const CHAT_ROOM = "chat";

/** Admin audit room: staff only, enforced by the socket server on `join`. */
export const AUDIT_ROOM = "audit";

/** Public per-season room for board/feed events. */
export function seasonRoom(seasonId: string): string {
  return `season:${seasonId}`;
}

const SEASON_ROOM_RE = /^season:([A-Za-z0-9_-]{1,64})$/;

/** Returns the season id for a `season:*` room, or null. */
export function parseSeasonRoom(room: string): string | null {
  const m = SEASON_ROOM_RE.exec(room);
  return m ? m[1]! : null;
}

/** New chat message. All dates are ISO strings (Socket.IO transports JSON). */
export interface ChatMessageBroadcast {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  /**
   * Monotonic per-process sequence stamped by `publish` (`bus.ts`).
   * Clients use it to detect gaps after a reconnect and backfill over REST
   * (`?since=seq`). Absent only on envelopes published before the upgrade.
   */
  seq?: number;
}

/** Ephemeral "user is typing" hint. The server stamps the identity — the
 * client never supplies a name, so it cannot be spoofed. */
export interface ChatTypingBroadcast {
  userId: string;
  username: string;
  displayName: string | null;
}

/** New audit row, shaped like `AdminAuditRow` with dates serialized. */
export interface AuditEntryBroadcast {
  entry: {
    id: string;
    actorId: string;
    actionType: string;
    targetType: string;
    targetId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
  };
  username: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  /** Per-process sequence stamped by `publish` — same contract as chat. */
  seq?: number;
}

/** New public season event (movement, roll outcomes, items, effects…),
 * shaped like a `FeedRow` with dates serialized. */
export interface BoardEventBroadcast {
  seasonId: string;
  seasonPlayerId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** Per-process sequence stamped by `publish` — same contract as chat. */
  seq?: number;
}

/**
 * Room headcount pushed by the socket server after every join/leave/
 * disconnect affecting a public room (`chat`, `season:*`). Ephemeral —
 * never persisted, never backfilled. Clients treat it as a hint.
 */
export interface PresenceBroadcast {
  room: string;
  count: number;
}

/** Every server→client event. Adding a feature = adding a row here. */
export interface RealtimeEventMap {
  "chat:message": ChatMessageBroadcast;
  "chat:typing": ChatTypingBroadcast;
  "audit:created": AuditEntryBroadcast;
  "board:event": BoardEventBroadcast;
  "presence:update": PresenceBroadcast;
}

/** Server→client event names. */
export type RealtimeServerEvent = keyof RealtimeEventMap;

/** Client→server messages accepted by the socket server. */
export type RealtimeClientEvent = "join" | "leave" | "chat:typing";
