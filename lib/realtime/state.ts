/**
 * Realtime attachment probe — the one fact the admin console `system` command
 * cannot read from a module import.
 *
 * `server.ts` (run by `tsx`) and the Next.js server bundle have separate module
 * registries in the same Node process, so a module-level `let` of the socket
 * server would be invisible to server actions. The flag therefore lives on
 * `globalThis`, exactly like the bus in `bus.ts`. It is `false` under
 * `pnpm dev:turbo` (plain Next, no Socket.IO) and `true` whenever
 * `attachRealtime` ran — which is what "sockets enabled" means for the console.
 */

const STATE_KEY = "__ggrun_realtime_attached__";

type RealtimeState = { attached: boolean };

function store(): RealtimeState {
  const g = globalThis as unknown as { [STATE_KEY]?: RealtimeState };
  if (!g[STATE_KEY]) g[STATE_KEY] = { attached: false };
  return g[STATE_KEY];
}

/** Called once by `attachRealtime` when Socket.IO is mounted on the server. */
export function setRealtimeAttached(value: boolean): void {
  store().attached = value;
}

/** True when this process serves Socket.IO connections. */
export function isRealtimeAttached(): boolean {
  return store().attached;
}
