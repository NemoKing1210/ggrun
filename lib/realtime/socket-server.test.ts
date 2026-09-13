import { createServer, type Server as HttpServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";
import { io as clientIO, type Socket as ClientSocket } from "socket.io-client";
import type { Server as IOServer } from "socket.io";

import type { SocketUser } from "./access";
import { publish } from "./bus";
import { snapshotRealtimeMetrics } from "./metrics";
import { AUDIT_ROOM, CHAT_ROOM, seasonRoom } from "./protocol";
import type {
  AuditEntryBroadcast,
  BoardEventBroadcast,
  ChatTypingBroadcast,
  PresenceBroadcast,
} from "./protocol";
import { attachRealtime, type RealtimeDeps } from "./socket-server";
// NOTE (ts-no-test-timers exception): these are boundary tests over real
// client/server sockets — fake timers would freeze Socket.IO heartbeats and
// ack round-trips. Bounded `collect` windows below assert *absence* of
// delivery, which cannot be awaited as a signal; presence is asserted via
// `until` polling wherever a server-side condition exists.

/**
 * Socket.IO boundary tests: a real server on an ephemeral port plus real
 * clients. The user lookup is injected, so no database is involved — the
 * default DB lookup is thin glue over `parseSessionCookie` (unit-tested in
 * `access.test.ts`) and a sessions query.
 *
 * Each test boots its own server; the bus is process-global, so rooms use a
 * unique suffix per test to avoid cross-talk between suites.
 */

let nonce = 0;
function uniqueRoom(prefix: "season"): string {
  nonce += 1;
  return prefix === "season" ? seasonRoom(`test-${Date.now()}-${nonce}`) : CHAT_ROOM;
}

interface TestServer {
  url: string;
  io: IOServer;
  close: () => Promise<void>;
}

async function startTestServer(deps: RealtimeDeps = {}): Promise<TestServer> {
  const http: HttpServer = createServer();
  const io: IOServer = attachRealtime(http, deps);
  await new Promise<void>((res) => http.listen(0, "127.0.0.1", res));
  const addr = http.address();
  if (!addr || typeof addr === "string") throw new Error("ephemeral listen failed");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    io,
    close: () =>
      new Promise<void>((resolve) => {
        io.close(() => http.close(() => resolve()));
      }),
  };
}

/** Polls a server-side condition instead of sleeping a fixed duration. */
async function until(done: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!done()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const sockets: ClientSocket[] = [];
const servers: TestServer[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.disconnect();
  for (const srv of servers.splice(0)) await srv.close();
});

async function connect(url: string, cookie?: string): Promise<ClientSocket> {
  const s = clientIO(url, {
    reconnection: false,
    timeout: 5000,
    extraHeaders: cookie ? { cookie } : undefined,
  });
  await new Promise<void>((resolve, reject) => {
    s.on("connect", () => resolve());
    s.on("connect_error", (err: Error) => reject(err));
  });
  sockets.push(s);
  return s;
}

function join(s: ClientSocket, room: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    s.emit("join", room, resolve);
  });
}

/** Collects every `event` payload for `ms`, then resolves. */
function collect<T>(s: ClientSocket, event: string, ms: number): Promise<T[]> {
  return new Promise((resolve) => {
    const out: T[] = [];
    const on = (payload: T) => {
      out.push(payload);
    };
    s.on(event, on);
    setTimeout(() => {
      s.off(event, on);
      resolve(out);
    }, ms);
  });
}

const staffUser: SocketUser = { id: "admin-1", username: "boss", displayName: "Boss", role: "admin" };
const playerA: SocketUser = { id: "a", username: "alice", displayName: "Alice", role: "viewer" };
const playerB: SocketUser = { id: "b", username: "bob", displayName: null, role: "viewer" };

function lookupByCookie(users: Record<string, SocketUser>): RealtimeDeps {
  return {
    lookupUser: (token: string) => Promise.resolve(users[token] ?? null),
  };
}

describe("socket join rules", () => {
  it("lets anonymous clients into chat and season rooms, never into audit", async () => {
    const srv = await startTestServer();
    servers.push(srv);
    const s = await connect(srv.url);
    const season = uniqueRoom("season");

    expect(await join(s, CHAT_ROOM)).toEqual({ ok: true });
    expect(await join(s, season)).toEqual({ ok: true });
    expect(await join(s, AUDIT_ROOM)).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(await join(s, "nope")).toEqual({ ok: false, error: "UNKNOWN_ROOM" });
    expect(await join(s, 42)).toEqual({ ok: false, error: "UNKNOWN_ROOM" });
  });

  it("lets staff into audit", async () => {
    const srv = await startTestServer(lookupByCookie({ staff: staffUser }));
    servers.push(srv);
    const s = await connect(srv.url, "ggrun_session=staff");
    expect(await join(s, AUDIT_ROOM)).toEqual({ ok: true });
  });

  it("degrades to anonymous when the lookup fails", async () => {
    const srv = await startTestServer({
      lookupUser: () => Promise.reject(new Error("db down")),
    });
    servers.push(srv);
    const s = await connect(srv.url, "ggrun_session=whatever");
    expect(await join(s, CHAT_ROOM)).toEqual({ ok: true });
    expect(await join(s, AUDIT_ROOM)).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("chat typing relay", () => {
  it("relays hints between members and throttles bursts", async () => {
    const srv = await startTestServer(lookupByCookie({ a: playerA, b: playerB }));
    servers.push(srv);
    const a = await connect(srv.url, "ggrun_session=a");
    const b = await connect(srv.url, "ggrun_session=b");
    expect(await join(a, CHAT_ROOM)).toEqual({ ok: true });
    expect(await join(b, CHAT_ROOM)).toEqual({ ok: true });

    const seenByB = collect<ChatTypingBroadcast>(b, "chat:typing", 600);
    a.emit("chat:typing");
    a.emit("chat:typing");
    a.emit("chat:typing");
    const hints = await seenByB;
    expect(hints).toHaveLength(1);
    expect(hints[0]).toEqual({ userId: "a", username: "alice", displayName: "Alice" });
  });

  it("stays silent for anonymous sockets", async () => {
    const srv = await startTestServer(lookupByCookie({ b: playerB }));
    servers.push(srv);
    const anon = await connect(srv.url);
    const member = await connect(srv.url, "ggrun_session=b");
    expect(await join(anon, CHAT_ROOM)).toEqual({ ok: true });
    expect(await join(member, CHAT_ROOM)).toEqual({ ok: true });

    const seen = collect<ChatTypingBroadcast>(member, "chat:typing", 400);
    anon.emit("chat:typing");
    expect(await seen).toHaveLength(0);
  });
});

describe("bus fan-in", () => {
  it("delivers published events only to room members", async () => {
    const srv = await startTestServer();
    servers.push(srv);
    const season = uniqueRoom("season");
    const seasonId = season.slice("season:".length);
    const member = await connect(srv.url);
    const outsider = await connect(srv.url);
    expect(await join(member, season)).toEqual({ ok: true });
    expect(await join(outsider, CHAT_ROOM)).toEqual({ ok: true });

    const memberEvents = collect<BoardEventBroadcast>(member, "board:event", 600);
    const outsiderEvents = collect<BoardEventBroadcast>(outsider, "board:event", 600);
    publish(season, "board:event", {
      seasonId,
      seasonPlayerId: null,
      eventType: "moved",
      payload: { from: 3, to: 9 },
      createdAt: new Date(0).toISOString(),
      username: "alice",
      displayName: "Alice",
      avatarUrl: null,
    });
    expect(await memberEvents).toHaveLength(1);
    expect(await outsiderEvents).toHaveLength(0);
  });

  it("stops delivering after leave", async () => {
    const srv = await startTestServer(lookupByCookie({ staff: staffUser }));
    servers.push(srv);
    const s = await connect(srv.url, "ggrun_session=staff");
    expect(await join(s, AUDIT_ROOM)).toEqual({ ok: true });
    s.emit("leave", AUDIT_ROOM);
    // Wait for the server-side membership to drop, not a fixed sleep.
    const sid = s.id;
    await until(() => !(sid && srv.io.sockets.adapter.sids.get(sid)?.has(AUDIT_ROOM)));

    const seen = collect<AuditEntryBroadcast>(s, "audit:created", 400);
    publish(AUDIT_ROOM, "audit:created", {
      entry: {
        id: "e1",
        actorId: "admin-1",
        actionType: "season_reset",
        targetType: "season",
        targetId: null,
        payload: {},
        createdAt: new Date(0).toISOString(),
      },
      username: "boss",
      avatarUrl: null,
      lastSeenAt: null,
    });
    expect(await seen).toHaveLength(0);
  });

  it("delivers audit rows to staff members", async () => {
    const srv = await startTestServer(lookupByCookie({ staff: staffUser }));
    servers.push(srv);
    const s = await connect(srv.url, "ggrun_session=staff");
    expect(await join(s, AUDIT_ROOM)).toEqual({ ok: true });

    const seen = collect<AuditEntryBroadcast>(s, "audit:created", 2000);
    publish(AUDIT_ROOM, "audit:created", {
      entry: {
        id: "e2",
        actorId: "admin-1",
        actionType: "player_added",
        targetType: "season_player",
        targetId: null,
        payload: {},
        createdAt: new Date(0).toISOString(),
      },
      username: "boss",
      avatarUrl: null,
      lastSeenAt: null,
    });
    const rows = await seen;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entry.actionType).toBe("player_added");
  });
});

describe("membership limits", () => {
  it("caps rooms held per socket", async () => {
    const srv = await startTestServer();
    servers.push(srv);
    const s = await connect(srv.url);
    for (let i = 0; i < 8; i += 1) {
      expect(await join(s, seasonRoom(`limit-${Date.now()}-${nonce}-${i}`))).toEqual({ ok: true });
    }
    expect(await join(s, seasonRoom(`limit-${Date.now()}-${nonce}-over`))).toEqual({
      ok: false,
      error: "ROOM_LIMIT",
    });
  });

  it("re-checks staff membership on every audit join", async () => {
    let calls = 0;
    const srv = await startTestServer({
      lookupUser: () => {
        calls += 1;
        // Connected as staff, demoted before joining.
        return Promise.resolve(calls === 1 ? staffUser : playerA);
      },
    });
    servers.push(srv);
    const s = await connect(srv.url, "ggrun_session=staff");
    expect(await join(s, AUDIT_ROOM)).toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("presence", () => {
  it("publishes headcounts to room members", async () => {
    const srv = await startTestServer();
    servers.push(srv);
    const a = await connect(srv.url);
    const b = await connect(srv.url);
    const seenA = collect<PresenceBroadcast>(a, "presence:update", 800);
    expect(await join(a, CHAT_ROOM)).toEqual({ ok: true });
    expect(await join(b, CHAT_ROOM)).toEqual({ ok: true });
    const updates = await seenA;
    const chatCounts = updates.filter((u) => u.room === CHAT_ROOM).map((u) => u.count);
    expect(chatCounts).toContain(2);
  });

  it("never echoes typing hints back to the sender", async () => {
    const srv = await startTestServer(lookupByCookie({ a: playerA, b: playerB }));
    servers.push(srv);
    const a = await connect(srv.url, "ggrun_session=a");
    const b = await connect(srv.url, "ggrun_session=b");
    expect(await join(a, CHAT_ROOM)).toEqual({ ok: true });
    expect(await join(b, CHAT_ROOM)).toEqual({ ok: true });

    const echo = collect<ChatTypingBroadcast>(a, "chat:typing", 400);
    const heard = collect<ChatTypingBroadcast>(b, "chat:typing", 400);
    a.emit("chat:typing");
    expect(await echo).toHaveLength(0);
    expect(await heard).toHaveLength(1);
  });

  it("records membership metrics", async () => {
    const srv = await startTestServer();
    servers.push(srv);
    const before = snapshotRealtimeMetrics().joins;
    const s = await connect(srv.url);
    expect(await join(s, CHAT_ROOM)).toEqual({ ok: true });
    expect(snapshotRealtimeMetrics().joins).toBeGreaterThan(before);
  });
});
