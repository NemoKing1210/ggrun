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
 * - `"bots:<seasonId>"` — live test-bot console for one season. Staff only:
 *   a bot is meant to read as a real player in the public surfaces, so its
 *   activity is never published where a player could see it.
 * - `"user:<userId>"` — private per-user inbox for notifications.
 *   Owner-only; never presence-tracked, never backfilled over REST.
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

/** Private per-user room for notifications. Owner-only (see `access.ts`). */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

const USER_ROOM_RE = /^user:([A-Za-z0-9_-]{1,64})$/;

/** Returns the user id for a `user:*` room, or null. */
export function parseUserRoom(room: string): string | null {
  const m = USER_ROOM_RE.exec(room);
  return m ? m[1]! : null;
}

/** Staff-only room: the live test-bot console of one season. */
export function botsRoom(seasonId: string): string {
  return `bots:${seasonId}`;
}

const BOTS_ROOM_RE = /^bots:([A-Za-z0-9_-]{1,64})$/;

/** Returns the season id for a `bots:*` room, or null. */
export function parseBotsRoom(room: string): string | null {
  const m = BOTS_ROOM_RE.exec(room);
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

/** Serialized notification row pushed into `user:<id>` rooms. */
export interface NotificationBroadcast {
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
  readAt: string | null;
  createdAt: string;
  /** Unread count after this change — lets badges sync without refetch. */
  unread: number;
  /** Per-process sequence stamped by `publish` — same contract as chat. */
  seq?: number;
}

/** Read-state sync for other tabs holding the same `user:<id>` room. */
export interface NotificationReadBroadcast {
  id: string | null;
  readAt: string | null;
  /** Null id = whole inbox marked read. */
  all: boolean;
  unread: number;
  seq?: number;
}

/** A bot run's live state: status, counters, config. Published on every tick
 *  and lifecycle transition into `bots:<seasonId>`. `config` stays loose here
 *  because the protocol module must not import the DB schema; the console
 *  narrows it back to `BotRunConfig`. */
export interface BotRunBroadcast {
  runId: string;
  seasonId: string;
  status: string;
  config: Record<string, unknown>;
  totalTicks: number;
  totalActions: number;
  totalErrors: number;
  lastError: string | null;
  updatedAt: string;
  seq?: number;
}

/**
 * One synthetic player's step, as it happens. Deliberately structured rather
 * than a rendered sentence: the server has no locale, so the console composes
 * the localized line (item names included) from these fields.
 */
export interface BotActivityBroadcast {
  runId: string;
  seasonId: string;
  seasonPlayerId: string | null;
  username: string | null;
  /** roll | resolve | item | skip | error */
  kind: string;
  /** passed | dropped | rerolled, for a resolve. */
  outcome: string | null;
  itemKey: string | null;
  targetUsername: string | null;
  position: number | null;
  balancePoints: number | null;
  /** Raw English journal line — the debugging trace, shown verbatim. */
  detail: string;
  at: string;
  seq?: number;
}

/** A new journal row, shaped like `bot_logs` with the date serialized. */
export interface BotLogBroadcast {
  id: string;
  runId: string;
  level: string;
  action: string;
  botUsername: string | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
  seq?: number;
}

/** Every server→client event. Adding a feature = adding a row here. */
export interface RealtimeEventMap {
  "chat:message": ChatMessageBroadcast;
  "chat:typing": ChatTypingBroadcast;
  "audit:created": AuditEntryBroadcast;
  "board:event": BoardEventBroadcast;
  "bots:run": BotRunBroadcast;
  "bots:activity": BotActivityBroadcast;
  "bots:log": BotLogBroadcast;
  "notifications:created": NotificationBroadcast;
  "notifications:read": NotificationReadBroadcast;
  "presence:update": PresenceBroadcast;
}

/** Server→client event names. */
export type RealtimeServerEvent = keyof RealtimeEventMap;

/** Client→server messages accepted by the socket server. */
export type RealtimeClientEvent = "join" | "leave" | "chat:typing";
