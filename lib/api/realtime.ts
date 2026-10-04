import { z } from "zod";

import { SESSION_COOKIE } from "@/lib/realtime/access";
import type {
  RealtimeClientEvent,
  RealtimeEventMap,
  RealtimeServerEvent,
} from "@/lib/realtime/protocol";

/**
 * The realtime half of the API reference: one machine-readable description of
 * the Socket.IO protocol next to the HTTP one in `contract.ts`.
 *
 * Nothing here is a second source of truth. The event *names* are pinned to
 * `RealtimeServerEvent` / `RealtimeClientEvent` by `Record<…>` (a missing or
 * stale row is a compile error, `spec.test.ts` names the offender), the
 * payload *shapes* are pinned to `RealtimeEventMap` by the
 * `_payloadsMatchProtocol` assertion at the bottom, and the transport facts
 * are the constants `lib/realtime/socket-server.ts` actually starts with.
 *
 * Editing the protocol? Add/rename an event in `lib/realtime/protocol.ts` and
 * this file stops compiling until the docs are updated to match.
 */

/** Transport facts, mirrored from `lib/realtime/socket-server.ts` + `server.ts`. */
export const REALTIME_TRANSPORT = {
  engine: "Socket.IO 4 (same origin as the app — one HTTP server, one port)",
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  auth: `Handshake cookie \`${SESSION_COOKIE}\` (sha256 fingerprint, same session table as HTTP). Any failure connects the socket anonymously instead of rejecting it — public rooms still work, privileged joins do not.`,
  limits: [
    "1 MB max frame (`maxHttpBufferSize`) — oversized frames are rejected before any handler runs",
    "25 s ping interval, 20 s ping timeout — dead peers are reaped promptly",
    "100 ms-scale recovery: `connectionStateRecovery` resumes a socket that dropped for ≤ 2 min",
    "≤ 8 rooms held per socket; ≤ 20 `join` attempts per 10 s sliding window",
    "1 `chat:typing` relay per 1.5 s per socket",
  ],
  sequencing:
    "Every payload published through the in-process bus is stamped with `seq` — a monotonic per-process counter. Gaps tell a resumed client it missed events; there is no `?since=` backfill endpoint, so re-read the REST snapshot (`GET /api/chat`, `GET /api/feed`) instead.",
} as const;

export type RealtimeRoomKind = "public" | "staff" | "owner";

export interface RealtimeRoomDoc {
  /** Room name or `pattern:<param>` form, as used in `lib/realtime/protocol.ts`. */
  name: string;
  kind: RealtimeRoomKind;
  /** Presence (`presence:update`) is broadcast for public rooms only. */
  presence: boolean;
  summary: string;
}

export const REALTIME_ROOMS: readonly RealtimeRoomDoc[] = [
  {
    name: "chat",
    kind: "public",
    presence: true,
    summary: "Global chat. Anyone may join; only authenticated users may send or type.",
  },
  {
    name: "season:<seasonId>",
    kind: "public",
    presence: true,
    summary: "One season's public board/feed events — movement, rolls, items, effects.",
  },
  {
    name: "audit",
    kind: "staff",
    presence: false,
    summary:
      "Admin audit log live tail. Staff only (`admin`/`judge`), re-checked against a fresh session on every join.",
  },
  {
    name: "bots:<seasonId>",
    kind: "staff",
    presence: false,
    summary:
      "Live test-bot console for one season. Staff only — bots are indistinguishable from real players in public surfaces, so their activity is never published elsewhere.",
  },
  {
    name: "user:<userId>",
    kind: "owner",
    presence: false,
    summary:
      "Private inbox of one user (notifications + read state). Owner-only; anonymous sockets and other users get `FORBIDDEN`.",
  },
] as const;

export interface RealtimeEventDoc {
  /** Rooms the event is emitted into — each must match a `REALTIME_ROOMS` name. */
  rooms: readonly string[];
  summary: string;
  payload: z.ZodType;
}

export const REALTIME_EVENTS = {
  "chat:message": {
    rooms: ["chat"],
    summary: "A chat message was stored and is now visible to every member.",
    payload: z.object({
      id: z.string(),
      userId: z.string(),
      content: z.string(),
      createdAt: z.iso.datetime(),
      username: z.string(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      role: z.string(),
      seq: z.number().int().optional(),
    }),
  },
  "chat:typing": {
    rooms: ["chat"],
    summary:
      "Ephemeral typing hint. Identity is stamped by the server; sent volatile (dropped under congestion) and never to the sender.",
    payload: z.object({
      userId: z.string(),
      username: z.string(),
      displayName: z.string().nullable(),
    }),
  },
  "audit:created": {
    rooms: ["audit"],
    summary: "A new `admin_audit_log` row, shaped like a staff audit row with dates serialized.",
    payload: z.object({
      entry: z.object({
        id: z.string(),
        actorId: z.string(),
        actionType: z.string(),
        targetType: z.string(),
        targetId: z.string().nullable(),
        payload: z.record(z.string(), z.unknown()),
        createdAt: z.iso.datetime(),
      }),
      username: z.string(),
      avatarUrl: z.string().nullable(),
      lastSeenAt: z.iso.datetime().nullable(),
      seq: z.number().int().optional(),
    }),
  },
  "board:event": {
    rooms: ["season:<seasonId>"],
    summary:
      "One public season event (movement, roll outcome, item, effect, milestone…) — the live twin of a row in `GET /api/feed`.",
    payload: z.object({
      seasonId: z.string(),
      seasonPlayerId: z.string().nullable(),
      eventType: z.string(),
      payload: z.record(z.string(), z.unknown()),
      createdAt: z.iso.datetime(),
      username: z.string().nullable(),
      displayName: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      seq: z.number().int().optional(),
    }),
  },
  "bots:run": {
    rooms: ["bots:<seasonId>"],
    summary:
      "Live bot-run state (status, counters, config) — published on every tick and lifecycle transition.",
    payload: z.object({
      runId: z.string(),
      seasonId: z.string(),
      status: z.string(),
      config: z.record(z.string(), z.unknown()),
      totalTicks: z.number().int(),
      totalActions: z.number().int(),
      totalErrors: z.number().int(),
      lastError: z.string().nullable(),
      updatedAt: z.iso.datetime(),
      seq: z.number().int().optional(),
    }),
  },
  "bots:activity": {
    rooms: ["bots:<seasonId>"],
    summary:
      "One synthetic player's step, structured (never a rendered sentence) so the console can compose a localized line from the same fields.",
    payload: z.object({
      runId: z.string(),
      seasonId: z.string(),
      seasonPlayerId: z.string().nullable(),
      username: z.string().nullable(),
      kind: z.string().describe("roll | resolve | item | skip | error"),
      outcome: z.string().nullable().describe("passed | dropped | rerolled, for a resolve"),
      itemKey: z.string().nullable(),
      targetUsername: z.string().nullable(),
      position: z.number().int().nullable(),
      balancePoints: z.number().int().nullable(),
      detail: z.string().describe("Raw English journal line — the debugging trace, shown verbatim"),
      at: z.iso.datetime(),
      seq: z.number().int().optional(),
    }),
  },
  "bots:log": {
    rooms: ["bots:<seasonId>"],
    summary: "A new `bot_logs` journal row, date serialized.",
    payload: z.object({
      id: z.string(),
      runId: z.string(),
      level: z.string(),
      action: z.string(),
      botUsername: z.string().nullable(),
      message: z.string(),
      payload: z.record(z.string(), z.unknown()),
      createdAt: z.iso.datetime(),
      seq: z.number().int().optional(),
    }),
  },
  "notifications:created": {
    rooms: ["user:<userId>"],
    summary: "A notification was delivered to one inbox.",
    payload: z.object({
      id: z.string(),
      userId: z.string(),
      kind: z.string(),
      titleKey: z.string(),
      bodyKey: z.string(),
      params: z.record(z.string(), z.unknown()),
      severity: z.string(),
      icon: z.string().nullable(),
      imageUrl: z.string().nullable(),
      href: z.string().nullable(),
      actions: z.array(
        z.object({
          id: z.string(),
          labelKey: z.string(),
          href: z.string().optional(),
          style: z.string().optional(),
        }),
      ),
      data: z.record(z.string(), z.unknown()),
      readAt: z.iso.datetime().nullable(),
      createdAt: z.iso.datetime(),
      unread: z.number().int().describe("Unread count after this change — lets badges sync without refetch"),
      seq: z.number().int().optional(),
    }),
  },
  "notifications:read": {
    rooms: ["user:<userId>"],
    summary: "Read-state sync for other tabs of the same user. `id: null` means the whole inbox was marked read.",
    payload: z.object({
      id: z.string().nullable(),
      readAt: z.iso.datetime().nullable(),
      all: z.boolean(),
      unread: z.number().int(),
      seq: z.number().int().optional(),
    }),
  },
  "presence:update": {
    rooms: ["chat", "season:<seasonId>"],
    summary:
      "Room headcount hint, pushed after every join/leave/disconnect in a public room. Ephemeral: never persisted, never backfilled.",
    payload: z.object({
      room: z.string(),
      count: z.number().int(),
    }),
  },
} satisfies Record<RealtimeServerEvent, RealtimeEventDoc>;

export interface RealtimeClientEventDoc {
  signature: string;
  summary: string;
  /** `null` when the server never acknowledges the emit. */
  ack: z.ZodType | null;
  errors: readonly string[];
  notes?: string;
}

export const REALTIME_CLIENT_EVENTS = {
  join: {
    signature: "join(room: string, ack: (res) => void)",
    summary: "Join a room. Rooms held at once: ≤ 8. Ack is called after the room is actually entered.",
    ack: z.object({ ok: z.boolean(), error: z.string().optional() }).describe("`{ ok: true }` or `{ ok: false, error }`"),
    errors: ["UNKNOWN_ROOM", "FORBIDDEN", "RATE_LIMITED", "ROOM_LIMIT"],
    notes:
      "Staff/owner rooms are re-validated against a fresh session lookup on every join, so a revoked cookie or a demotion takes effect at the next join. A DB outage keeps the cached verdict.",
  },
  leave: {
    signature: "leave(room: string)",
    summary: "Leave a room. Unknown or malformed room names are silently ignored.",
    ack: null,
    errors: [],
  },
  "chat:typing": {
    signature: "chat:typing()",
    summary:
      "Announce typing in `chat`. The server stamps the identity (the client never sends a name) and throttles to one relay per 1.5 s per socket.",
    ack: null,
    errors: [],
    notes: "Anonymous sockets are dropped. The hint is never echoed to the sender.",
  },
} satisfies Record<RealtimeClientEvent, RealtimeClientEventDoc>;

/** Client-side ack fallbacks the browser provider synthesizes without a server round trip. */
export const REALTIME_CLIENT_ACK_FALLBACKS = ["NO_ACK", "EMIT_FAILED", "NO_SOCKET"] as const;

/** Join error codes, from `authorizeJoin` in `lib/realtime/access.ts`. */
export const REALTIME_JOIN_ERRORS = {
  UNKNOWN_ROOM: "Room is not a known room name, is empty, or is longer than 80 characters.",
  FORBIDDEN: "`audit` / `bots:<seasonId>` without the `admin` or `judge` role, or `user:<userId>` not owned by the socket.",
  RATE_LIMITED: "More than 20 `join` attempts within 10 s on one socket.",
  ROOM_LIMIT: "The socket already holds 8 rooms.",
} as const;

/**
 * Compile-time pin: every event's documented payload must be mutually
 * assignable with its `RealtimeEventMap` interface. A field added to the
 * protocol but not to the docs (or the other way round) fails here with the
 * offending event names, exactly like the feed-tab exhaustiveness check.
 */
type PayloadMismatch = {
  [K in RealtimeServerEvent]: z.infer<(typeof REALTIME_EVENTS)[K]["payload"]> extends RealtimeEventMap[K]
    ? RealtimeEventMap[K] extends z.infer<(typeof REALTIME_EVENTS)[K]["payload"]>
      ? never
      : K
    : K;
}[RealtimeServerEvent];

const _payloadsMatchProtocol: [PayloadMismatch] extends [never]
  ? true
  : ["realtime payloads drifted from RealtimeEventMap (lib/realtime/protocol.ts):", PayloadMismatch] = true;
void _payloadsMatchProtocol;
