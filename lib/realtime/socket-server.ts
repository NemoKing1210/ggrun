import { createHash } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import { and, eq, gt } from "drizzle-orm";
import { Server, type Socket } from "socket.io";

import { db } from "@/lib/infrastructure/db";
import { sessions, users } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";

import {
  authorizeJoin,
  isLeavableRoom,
  isStaffRole,
  JOIN_RATE_WINDOW_MS,
  parseSessionCookie,
  typingVerdict,
  type SocketUser,
} from "./access";
import { subscribeRealtime } from "./bus";
import { count } from "./metrics";
import { CHAT_ROOM, parseSeasonRoom, type ChatTypingBroadcast } from "./protocol";

/**
 * Socket.IO server — the only place that owns the `io` instance.
 *
 * Attached to the custom Next.js server (`server.ts`, same Node process, so
 * the in-process bus in `bus.ts` reaches it without Redis or HTTP bridges).
 * Multi-instance path: keep this subscription and add the Socket.IO Redis
 * adapter for cross-node room fan-out, plus a Redis-Streams transport via
 * `setRealtimeTransport` so `publish` reaches every node. Publishers and
 * browser subscribers stay untouched either way.
 *
 * All trust decisions live in the pure `access.ts` (unit-tested); this file
 * is wiring: session lookup, room membership, relay, fan-in. The user
 * lookup is injectable so integration tests run without a database.
 */

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Production session lookup: same cookie + fingerprint as `getCurrentUser`. */
async function lookupUserFromDb(token: string): Promise<SocketUser | null> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, fingerprint(token)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isBlocked, false),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface RealtimeDeps {
  /** Overrides the DB session lookup (tests). Failures still mean anonymous. */
  lookupUser?: (token: string) => Promise<SocketUser | null>;
}

type JoinAck = (res: { ok: true } | { ok: false; error: string }) => void;

interface SocketState {
  user: SocketUser | null;
  token: string | null;
  joinAttempts: number[];
}

/** Presence is published for public rooms only — never for the staff room. */
function isPresenceRoom(room: string): boolean {
  return room === CHAT_ROOM || parseSeasonRoom(room) !== null;
}

/**
 * Attach Socket.IO to an already-created HTTP server. Idempotent per
 * process: the custom `server.ts` calls it exactly once.
 */
export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps = {}): Server {
  const lookup = deps.lookupUser ?? lookupUserFromDb;
  const io = new Server(httpServer, {
    // Default path (`/socket.io/`) — the browser client uses the default too.
    transports: ["websocket", "polling"],
    // Oversized frames are rejected before they reach a handler.
    maxHttpBufferSize: 1_000_000,
    // Dead peers are reaped promptly instead of holding rooms open.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Short client blips resume the server-side session instead of rejoining.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  function broadcastPresence(room: string): void {
    if (!isPresenceRoom(room)) return;
    const countNow = io.sockets.adapter.rooms.get(room)?.size ?? 0;
    io.to(room).emit("presence:update", { room, count: countNow });
    count("presenceUpdates");
  }

  // Resolve the user once per connection; every later check reads socket.data.
  // Any failure (no cookie, unknown token, DB outage) → anonymous socket;
  // pages already handle that state, and room policy denies from there.
  io.use(async (socket, next) => {
    let user: SocketUser | null = null;
    let token: string | null = null;
    try {
      token = parseSessionCookie(socket.handshake.headers.cookie);
      user = token ? await lookup(token) : null;
    } catch (error) {
      log.warn("realtime.auth.unavailable", {
        err: error instanceof Error ? error : undefined,
      });
      user = null;
    }
    socket.data.realtime = { user, token, joinAttempts: [] } satisfies SocketState;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const state = socket.data.realtime as SocketState;
    count("connections");
    log.debug("realtime.connected", {
      socket: socket.id,
      userId: state.user?.id ?? null,
    });

    const roomsHeld = (): number => Math.max(0, socket.rooms.size - 1);

    socket.on("join", (room: unknown, ack?: JoinAck) => {
      const done: JoinAck = typeof ack === "function" ? ack : () => undefined;
      const now = Date.now();
      state.joinAttempts = state.joinAttempts.filter((t) => now - t < JOIN_RATE_WINDOW_MS);
      const verdict = authorizeJoin(room, state.user, {
        roomsHeld: roomsHeld(),
        recentJoins: state.joinAttempts,
        now,
      });
      state.joinAttempts.push(now);
      if (!verdict.ok) {
        count("joinDenied");
        done({ ok: false, error: verdict.error });
        return;
      }
      const name = room as string;
      void (async () => {
        // Staff-only rooms are re-checked against a fresh session lookup so
        // a demotion, block, or revoked cookie stops working at the next
        // join instead of living until disconnect. A lookup outage keeps the
        // cached verdict (fail-open): a DB blip must not lock staff out.
        if (name === "audit") {
          try {
            const fresh = state.token ? await lookup(state.token) : null;
            if (!isStaffRole(fresh?.role)) {
              count("joinDenied");
              done({ ok: false, error: "FORBIDDEN" });
              return;
            }
            state.user = fresh;
          } catch (error) {
            log.warn("realtime.audit.revalidate.failed", {
              err: error instanceof Error ? error : undefined,
            });
            if (!isStaffRole(state.user?.role)) {
              count("joinDenied");
              done({ ok: false, error: "FORBIDDEN" });
              return;
            }
          }
        }
        await socket.join(name);
        count("joins");
        done({ ok: true });
        broadcastPresence(name);
      })();
    });

    socket.on("leave", (room: unknown) => {
      if (!isLeavableRoom(room)) return;
      const wasMember = socket.rooms.has(room);
      void socket.leave(room);
      if (!wasMember) return;
      count("leaves");
      // Defer past the adapter update so the headcount reads the new size.
      setImmediate(() => broadcastPresence(room));
    });
    let lastTypingAt = 0;
    socket.on("chat:typing", () => {
      // Anonymous sockets cannot type; the chat composer is auth-only anyway.
      const user = state.user;
      if (!user) {
        count("typingDropped");
        return;
      }
      const verdict = typingVerdict(user, Date.now(), lastTypingAt);
      if (!verdict.allowed) {
        count("typingDropped");
        return;
      }
      lastTypingAt = verdict.stamp;
      const payload: ChatTypingBroadcast = {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
      };
      // Ephemeral + sender-excluded: dropped under congestion instead of
      // queueing, and the sender never pays for its own hint.
      socket.volatile.to(CHAT_ROOM).emit("chat:typing", payload);
      count("typingRelayed");
    });

    let leavingRooms: string[] = [];
    socket.on("disconnecting", () => {
      leavingRooms = [...socket.rooms].filter((r) => r !== socket.id && isPresenceRoom(r));
    });
    socket.on("disconnect", (reason) => {
      count("disconnects");
      log.debug("realtime.disconnected", { socket: socket.id, reason });
      for (const room of leavingRooms) broadcastPresence(room);
      leavingRooms = [];
    });
  });

  // Fan-in: everything published via `publish(...)` lands in its room.
  // Deferred past the publisher's call stack so a slow room fan-out can
  // never block the HTTP route or transaction that announced the fact.
  // No validation here — publishers are first-party server code speaking the
  // protocol; the socket boundary (join/auth/throttle) is enforced above.
  const unsubscribe = subscribeRealtime(({ room, event, payload }) => {
    count("published");
    setImmediate(() => {
      io.to(room).emit(event, payload);
    });
  });
  void unsubscribe;

  return io;
}
