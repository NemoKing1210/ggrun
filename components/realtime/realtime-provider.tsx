"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";

import type {
  RealtimeEventMap,
  RealtimeServerEvent,
} from "@/lib/realtime/protocol";

/**
 * Browser side of the realtime protocol (`lib/realtime/protocol.ts`).
 *
 * `RealtimeProvider` (mounted once in the root layout) holds a single
 * Socket.IO connection: same-origin default path, websocket first with HTTP
 * long-polling fallback, infinite reconnect with backoff. Every feature below
 * degrades gracefully — when `connected` is false, components fall back to
 * their pre-socket behavior (chat polls, audit/board show a retry hint).
 *
 * `useRealtimeEvent(room, event, handler)` is the only subscription API:
 * it joins the room (the server enforces access, e.g. staff-only audit),
 * routes matching events to `handler`, and leaves + unsubscribes on unmount.
 * The handler always sees the latest closure via a ref, so it never
 * re-subscribes on re-render.
 *
 * Rooms are reference-counted in the provider: N hooks on one room produce
 * one server `join`, and the room is left only when the last hook unmounts.
 * On every `connect` (initial or reconnect) all held rooms are re-joined
 * automatically; `connects` lets lists backfill over REST (`?since=seq`)
 * to close the offline gap.
 */

export interface JoinAck {
  ok: boolean;
  error?: string;
}

/** Server→client events with payloads — derived from `RealtimeEventMap` so
 the socket types can never drift from the protocol. */
export type ServerToClientEvents = {
  [K in RealtimeServerEvent]: (payload: RealtimeEventMap[K]) => void;
};

/** Client→server messages accepted by `lib/realtime/socket-server.ts`. */
export interface ClientToServerEvents {
  join: (room: string, ack: (res: JoinAck) => void) => void;
  leave: (room: string) => void;
  "chat:typing": () => void;
}
export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface RealtimeContextValue {
  socket: RealtimeSocket | null;
  connected: boolean;
  /** Increments on every `connect` — components use it to backfill. */
  connects: number;
  joinRoom: (room: string) => Promise<JoinAck>;
  leaveRoom: (room: string) => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  socket: null,
  connected: false,
  connects: 0,
  joinRoom: () => Promise.resolve({ ok: false, error: "NO_SOCKET" }),
  leaveRoom: () => undefined,
});

function emitJoin(socket: RealtimeSocket, room: string): Promise<JoinAck> {
  const { promise, resolve } = Promise.withResolvers<JoinAck>();
  try {
    socket.emit("join", room, (res: JoinAck | undefined) => {
      resolve(res ?? { ok: false, error: "NO_ACK" });
    });
  } catch {
    resolve({ ok: false, error: "EMIT_FAILED" });
  }
  return promise;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<RealtimeSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connects, setConnects] = useState(0);
  const socketRef = useRef<RealtimeSocket | null>(null);
  // room → hooks currently holding it. The server sees one join per room;
  // `joined` tracks whether the server has acknowledged membership.
  const roomsRef = useRef(new Map<string, { count: number; joined: boolean }>());

  const joinRoom = useCallback((room: string): Promise<JoinAck> => {
    const entry = roomsRef.current.get(room);
    if (entry) {
      entry.count += 1;
      if (entry.joined) return Promise.resolve({ ok: true });
      const s = socketRef.current;
      if (!s) return Promise.resolve({ ok: false, error: "NO_SOCKET" });
      return emitJoin(s, room).then((res) => {
        const current = roomsRef.current.get(room);
        if (!current) return res;
        if (res.ok) {
          current.joined = true;
          return res;
        }
        // Intent released while the ack was in flight → undo the server join.
        if (current.count === 0) s.emit("leave", room);
        return res;
      });
    }
    roomsRef.current.set(room, { count: 1, joined: false });
    const s = socketRef.current;
    if (!s) return Promise.resolve({ ok: false, error: "NO_SOCKET" });
    return emitJoin(s, room).then((res) => {
      const current = roomsRef.current.get(room);
      if (!current) return res;
      if (res.ok) {
        current.joined = true;
        return res;
      }
      if (current.count === 0) {
        roomsRef.current.delete(room);
        s.emit("leave", room);
      }
      return res;
    });
  }, []);

  const leaveRoom = useCallback((room: string): void => {
    const entry = roomsRef.current.get(room);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count > 0) return;
    roomsRef.current.delete(room);
    const s = socketRef.current;
    // If the join ack is still in flight, the ack handler above emits the
    // compensating leave; otherwise leave now. Either way the server ends
    // with no membership for this room.
    if (entry.joined && s) s.emit("leave", room);
  }, []);

  useEffect(() => {
    const s = io({
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10_000,
    }) as unknown as RealtimeSocket;
    socketRef.current = s;
    // Captured for the cleanup below (lint: never read .current in cleanup).
    const rooms = roomsRef.current;
    const onConnect = () => {
      setConnected(true);
      setConnects((n) => n + 1);
      // Re-establish every held room on the fresh transport: Socket.IO
      // assigns a new session, so server-side membership is gone.
      for (const [room, entry] of rooms) {
        entry.joined = false;
        emitJoin(s, room).then((res) => {
          const current = rooms.get(room);
          if (!current) {
            if (res.ok) s.emit("leave", room);
            return;
          }
          if (res.ok) current.joined = true;
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    setSocket(s);
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.disconnect();
      socketRef.current = null;
      rooms.clear();
      setSocket(null);
      setConnected(false);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ socket, connected, connects, joinRoom, leaveRoom }}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Live headcount for a public room (`chat`, `season:*`), pushed by the
 * server after every join/leave/disconnect. `null` = no data yet (offline
 * or not a member). Never used for access decisions — display hint only.
 */
export function usePresence(room: string | null): number | null {
  const [count, setCount] = useState<number | null>(null);
  useRealtimeEvent(room, "presence:update", (update) => {
    if (update.room === room) setCount(update.count);
  });
  useEffect(() => {
    if (!room) setCount(null);
  }, [room]);
  return count;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}

/** Successful `connect` count — changes on every reconnect. */
export function useRealtimeConnects(): number {
  return useRealtime().connects;
}

/** Subscribe to one server→client event in a room. `room: null` = disabled. */
export function useRealtimeEvent<E extends RealtimeServerEvent>(
  room: string | null,
  event: E,
  handler: (payload: RealtimeEventMap[E]) => void,
): void {
  const { socket, joinRoom, leaveRoom } = useRealtime();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket || !room) return;
    // Erase the generic to the payload union: a listener accepting any
    // payload is assignable to every per-event signature (contravariance),
    // which the unresolved generic `E` cannot prove to tsc.
    type AnyPayload = RealtimeEventMap[RealtimeServerEvent];
    const ev = event as RealtimeServerEvent;
    const onPayload = (payload: AnyPayload) => {
      (handlerRef.current as (p: AnyPayload) => void)(payload);
    };
    socket.on(ev, onPayload);
    void joinRoom(room);
    return () => {
      socket.off(ev, onPayload);
      leaveRoom(room);
    };
  }, [socket, room, event, joinRoom, leaveRoom]);
}
