/**
 * Dev with everything: Next.js dev server + autonomous bot ticker in one process.
 * Usage:
 *   pnpm dev:bots                 # next dev on :3000 + ticker every 10s
 *   pnpm dev:bots --port 3100     # extra args pass through to `next dev`
 *
 * Env: BOTS_TICK_MS (default 10000) — how often due `running` runs are ticked.
 * Each run still keeps its own cadence (tickIntervalMs); the loop only fires.
 *
 * The ticker calls tickDueRuns() directly — the same steps as POST
 * /api/bots/tick, no CRON_SECRET needed locally. Ctrl+C stops both.
 */
import "./lib/load-env";

import { spawn, type ChildProcess } from "node:child_process";

import { tickDueRuns } from "@/lib/modules/bots/service";

function clampTickMs(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return 10_000;
  return Math.min(120_000, Math.max(1000, Math.floor(n)));
}

const TICK_MS = clampTickMs(process.env.BOTS_TICK_MS);
const nextArgs = process.argv.slice(2);

let child: ChildProcess | null = null;
let timer: NodeJS.Timeout | undefined;
let stopping = false;

function shutdown(signal: string, code: number): void {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  if (child && child.exitCode === null) {
    child.kill("SIGINT");
    const force = setTimeout(() => child?.kill("SIGKILL"), 5000);
    force.unref();
  }
  console.log(`[dev:bots] stopped (${signal})`);
  process.exit(code);
}

async function tickOnce(): Promise<void> {
  try {
    const results = await tickDueRuns({ triggeredBy: "cron:dev" });
    const ticked = results.filter((r) => r.ticked);
    if (results.length === 0) {
      console.log("[bots] tick: no running runs");
      return;
    }
    for (const r of ticked) {
      console.log(
        `[bots] ticked ${r.runId.slice(0, 8)}: ${r.summary?.actions ?? 0} actions, ${r.summary?.errors ?? 0} errors` +
          (r.summary?.lastError ? ` — last: ${r.summary.lastError}` : ""),
      );
    }
    const skipped = results.length - ticked.length;
    if (skipped > 0) console.log(`[bots] tick: ${ticked.length}/${results.length} runs ticked (${skipped} not due)`);
  } catch (e) {
    console.warn(`[bots] tick failed (will retry): ${e instanceof Error ? e.message : e}`);
  }
}

function main(): void {
  // cmd.exe on Windows resolves the pnpm .cmd shim without shell:true
  // (which would warn DEP0190); plain spawn works on POSIX.
  const childCmd =
    process.platform === "win32"
      ? { command: "cmd.exe", args: ["/c", "pnpm", "dev", ...nextArgs] }
      : { command: "pnpm", args: ["dev", ...nextArgs] };
  child = spawn(childCmd.command, childCmd.args, { stdio: "inherit" });
  child.on("exit", (code) => {
    if (!stopping) {
      console.log(`[dev:bots] next dev exited with code ${code ?? "unknown"}`);
      shutdown("child-exit", typeof code === "number" ? code : 1);
    }
  });
  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));

  console.log(`[dev:bots] ticker every ${TICK_MS}ms (BOTS_TICK_MS to change)`);
  const first = setTimeout(() => {
    if (!stopping) void tickOnce();
  }, 2000);
  first.unref();
  timer = setInterval(() => {
    if (!stopping) void tickOnce();
  }, TICK_MS);
}

main();
