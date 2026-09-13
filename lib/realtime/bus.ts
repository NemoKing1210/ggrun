import { EventEmitter } from "node:events";

import { log } from "@/lib/infrastructure/logger";

import type { RealtimeEventMap, RealtimeServerEvent } from "./protocol";

/**
 * In-process realtime bus — decouples publishers from Socket.IO.
 *
 * Any server code (services, repositories, API routes, server actions) calls
 * `publish(room, event, payload)`; the socket server (`socket-server.ts`,
 * same Node process via the custom `server.ts`) subscribes once and forwards
 * each envelope into the matching Socket.IO room.
 *
 * Why a bus instead of importing the `io` instance directly:
 * - publishers never import socket state → no import cycles, no layer
 *   violations (`lib/modules/*` and `lib/infrastructure/*` stay as they are);
 * - publishing is fire-and-forget and NEVER throws: a realtime failure must
 *   not break the write it announces (chat insert, audit insert, roll
 *   resolution). Failures are logged and swallowed.
 *
 * NOTE: server-only (`node:events`). Never import from client components —
 * browsers subscribe through `components/realtime/*` instead.
 */
const BUS_KEY = "__ggrun_realtime_bus__";
const ENVELOPE = "message";

export interface RealtimeEnvelope<E extends RealtimeServerEvent = RealtimeServerEvent> {
  room: string;
  event: E;
  payload: RealtimeEventMap[E];
  /** Monotonic per-process sequence — stamped here so every publisher agrees. */
  seq: number;
}

/**
 * Pluggable fan-out transport. Default is the in-process `EventEmitter`
 * below (single Node process: publishers and `socket-server.ts` share it,
 * no Redis needed). Multi-instance deployments call `setRealtimeTransport`
 * once at boot with a Redis-Streams fan-in; `publish`/`subscribeRealtime`
 * signatures stay untouched.
 */
export interface RealtimeTransport {
  emit(envelope: RealtimeEnvelope): void;
  on(handler: (envelope: RealtimeEnvelope) => void): () => void;
}

type GlobalBus = typeof globalThis & { [BUS_KEY]?: EventEmitter };

function bus(): EventEmitter {
  const g = globalThis as GlobalBus;
  if (!g[BUS_KEY]) {
    const emitter = new EventEmitter();
    // One listener (the socket server) per envelope; publishers are unbounded.
    emitter.setMaxListeners(0);
    g[BUS_KEY] = emitter;
  }
  return g[BUS_KEY]!;
}

let seqCounter = 0;
let transport: RealtimeTransport | null = null;

/** Override the fan-out transport (tests, future Redis adapter). */
export function setRealtimeTransport(next: RealtimeTransport | null): void {
  transport = next;
}

/** Last stamped sequence — lets diagnostics and tests assert ordering. */
export function lastRealtimeSeq(): number {
  return seqCounter;
}

/** Called once by the socket server to forward envelopes into rooms. */
export function subscribeRealtime(
  handler: (envelope: RealtimeEnvelope) => void,
): () => void {
  if (transport) return transport.on(handler);
  const b = bus();
  b.on(ENVELOPE, handler);
  return () => {
    b.off(ENVELOPE, handler);
  };
}

/** Publish a typed event into a room. Never throws. */
export function publish<E extends RealtimeServerEvent>(
  room: string,
  event: E,
  payload: RealtimeEventMap[E],
): void {
  try {
    seqCounter += 1;
    const seq = seqCounter;
    // Stamp a copy so concurrent subscribers never share a mutated object
    // and the caller's literal keeps its identity for tests.
    const stamped = { ...payload, seq };
    const envelope = { room, event, payload: stamped, seq } as RealtimeEnvelope<E>;
    if (transport) {
      transport.emit(envelope);
      return;
    }
    bus().emit(ENVELOPE, envelope);
  } catch (error) {
    // The announcement failed — the underlying write already succeeded.
    log.warn("realtime.publish.failed", {
      room,
      event,
      err: error instanceof Error ? error : undefined,
    });
  }
}
