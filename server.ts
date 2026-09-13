/**
 * GGRun custom server — Next.js + Socket.IO on one HTTP server and one port.
 *
 * Why a custom server: Socket.IO needs a long-lived process that owns the
 * HTTP upgrade path. Route handlers (`app/api/*`) are request/response only
 * and cannot hold WebSocket connections, so the realtime layer lives here,
 * attached to the same server that serves Next.js.
 *
 * - `pnpm dev` runs it via `scripts/dev.ts` (plus DB check and schema push);
 *   `pnpm start` runs this file directly via `tsx` (dev = webpack, matching
 *   the previous plain `next dev` default; production serves the `next build`
 *   output). The dev bot ticker also lives here (`BOTS_TICK=1`, set by
 *   `scripts/dev.ts`) — same process as Socket.IO, so bot rolls/resolves
 *   reach live subscribers through the in-process bus. Production ticks via
 *   POST `/api/bots/tick` from an external scheduler instead.
 * - Realtime publishers (`lib/realtime/bus.ts`) and this server share one
 *   Node process, so no Redis/bridge is needed on a single instance. For
 *   multi-instance deployments, swap the bus subscription in
 *   `lib/realtime/socket-server.ts` for the Socket.IO Redis adapter —
 *   publishers and browser subscribers stay untouched.
 */

// First import: seeds `globalThis.AsyncLocalStorage` before any `next/*`
// module is evaluated (see `server-env.ts`) — otherwise the first render
// dies with `Invariant: AsyncLocalStorage … not available`.
import "./server-env";

import { createServer } from "node:http";

import next from "next";

import { colors } from "./lib/infrastructure/logger";
import { tickDueRuns } from "./lib/modules/bots/service";
import { attachRealtime } from "./lib/realtime/socket-server";

const { bold, dim, green, link, magenta, red, yellow } = colors;
const BOTS = magenta("[bots]");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

/** `PORT` wins, then `--port N`, then 3000. */
function resolvePort(): number {
  const fromEnv = Number(process.env.PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
  const flag = process.argv.indexOf("--port");
  const fromFlag = flag >= 0 ? Number(process.argv[flag + 1]) : NaN;
  if (Number.isFinite(fromFlag) && fromFlag > 0) return Math.floor(fromFlag);
  return 3000;
}
const port = resolvePort();

const app = next({ dev });
const handler = app.getRequestHandler();

void app.prepare().then(() => {
  const httpServer = createServer(handler);
  attachRealtime(httpServer);
  httpServer.listen(port, hostname, () => {
    // `hostname` is the bind address (`0.0.0.0` = all interfaces) — not a
    // connectable URL, so display `localhost` for wildcard binds.
    const displayHost = hostname === "0.0.0.0" || hostname === "::" ? "localhost" : hostname;
    console.log(
      `${bold("[ggrun]")} ${green("ready")} on ${link(`http://${displayHost}:${port}`)} ${dim(`(${dev ? "dev" : "prod"}, realtime attached)`)}`,
    );
    startBotTicker();
  });
});

function clampTickMs(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 10_000;
  return Math.min(120_000, Math.max(1000, Math.floor(n)));
}

async function tickOnce(): Promise<void> {
  try {
    const results = await tickDueRuns({ triggeredBy: "cron:dev" });
    const ticked = results.filter((r) => r.ticked);
    if (results.length === 0) {
      console.log(`${BOTS} ${dim("tick: no running runs")}`);
      return;
    }
    for (const r of ticked) {
      const summary = `${r.summary?.actions ?? 0} actions, ${r.summary?.errors ?? 0} errors`;
      const last = r.summary?.lastError ? dim(` — last: ${r.summary.lastError}`) : "";
      const line = `${BOTS} ticked ${bold(r.runId.slice(0, 8))}: ${r.summary?.errors ? yellow(summary) : summary}${last}`;
      console.log(line);
    }
    const skipped = results.length - ticked.length;
    if (skipped > 0)
      console.log(`${BOTS} ${dim(`tick: ${ticked.length}/${results.length} runs ticked (${skipped} not due)`)}`);
  } catch (e) {
    console.warn(`${BOTS} ${red(`tick failed (will retry): ${e instanceof Error ? e.message : e}`)}`);
  }
}

/** Autonomous bot ticker. Opt-in via `BOTS_TICK=1` (dev only) — it must run
 * in this process: the realtime bus is in-process memory, so ticks from any
 * other process would publish board/audit events no socket ever receives. */
function startBotTicker(): void {
  if (process.env.BOTS_TICK !== "1") {
    return;
  }
  const tickMs = clampTickMs(process.env.BOTS_TICK_MS);
  console.log(`${BOTS} ticker every ${bold(`${tickMs}ms`)} ${dim("(same process as sockets)")}`);
  const first = setTimeout(() => void tickOnce(), 2000);
  first.unref();
  setInterval(() => void tickOnce(), tickMs);
}
