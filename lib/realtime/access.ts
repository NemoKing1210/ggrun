import { AUDIT_ROOM, CHAT_ROOM, parseSeasonRoom } from "./protocol";

/**
 * Pure realtime policy — who may join what, who may type, and how the
 * session cookie is read. No `db`, no sockets, no timers: every rule the
 * Socket.IO server enforces lives here so it can be unit-tested without
 * processes, ports or a database. `socket-server.ts` is only wiring.
 */

export interface SocketUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
}

export const SESSION_COOKIE = "ggrun_session";

/** Minimum gap between two typing relays of the same socket. */
export const TYPING_THROTTLE_MS = 1500;

/** Max rooms a single socket may hold at once (fan-out amplification cap). */
export const MAX_ROOMS_PER_SOCKET = 8;

/** Sliding-window budget for `join` attempts per socket. */
export const JOIN_RATE_WINDOW_MS = 10_000;
export const JOIN_RATE_MAX = 20;

/** Extracts the raw session token from a `Cookie` header value. */
export function parseSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(idx + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** Staff = admin or judge — the only audit-room members. */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "judge";
}

export type JoinVerdict =
  | { ok: true }
  | { ok: false; error: "UNKNOWN_ROOM" | "FORBIDDEN" | "ROOM_LIMIT" | "RATE_LIMITED" };

/**
 * Decides a `join` request. `chat` and `season:*` are public (same
 * visibility as the pages subscribing to them); `audit` is staff-only.
 * `roomsHeld` / `recentJoins` are the socket's current membership count and
 * the timestamps of its recent join attempts — enforced here so the rule is
 * unit-testable and the server stays wiring-only.
 */
export function authorizeJoin(
  room: unknown,
  user: SocketUser | null,
  opts: { roomsHeld?: number; recentJoins?: readonly number[]; now?: number } = {},
): JoinVerdict {
  const known =
    typeof room === "string" &&
    room.length > 0 &&
    room.length <= 80 &&
    (room === CHAT_ROOM || room === AUDIT_ROOM || parseSeasonRoom(room) !== null);
  if (!known) return { ok: false, error: "UNKNOWN_ROOM" };
  if (room === AUDIT_ROOM && !isStaffRole(user?.role)) {
    return { ok: false, error: "FORBIDDEN" };
  }
  const now = opts.now ?? Date.now();
  const recent = (opts.recentJoins ?? []).filter((t) => now - t < JOIN_RATE_WINDOW_MS);
  if (recent.length >= JOIN_RATE_MAX) return { ok: false, error: "RATE_LIMITED" };
  if ((opts.roomsHeld ?? 0) >= MAX_ROOMS_PER_SOCKET) return { ok: false, error: "ROOM_LIMIT" };
  return { ok: true };
}

/**
 * Decides a `leave` emit. Accepts only known rooms so stray strings can
 * never touch the adapter; unknown input is a silent no-op for the caller.
 */
export function isLeavableRoom(room: unknown): room is string {
  return (
    typeof room === "string" &&
    room.length > 0 &&
    room.length <= 80 &&
    (room === CHAT_ROOM || room === AUDIT_ROOM || parseSeasonRoom(room) !== null)
  );
}

/**
 * Decides a `chat:typing` emit. Anonymous sockets never type (the composer
 * is auth-only anyway); the rest is a per-socket throttle so bursts can
 * never spam the room. Returns the timestamp to store as `lastSent`.
 */
export function typingVerdict(
  user: SocketUser | null,
  now: number,
  lastSent: number,
): { allowed: true; stamp: number } | { allowed: false } {
  if (!user) return { allowed: false };
  if (now - lastSent < TYPING_THROTTLE_MS) return { allowed: false };
  return { allowed: true, stamp: now };
}
