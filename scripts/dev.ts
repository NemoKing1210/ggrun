/**
 * Dev with everything, one command: `pnpm dev`.
 *
 * Boots, in order:
 *   1. database reachability check (clear error instead of cryptic pg faults);
 *   2. `db:push` — applies the Drizzle schema, idempotent (skip: `--no-push`);
 *   3. the custom Next.js + Socket.IO server (`server.ts`) as a child.
 *
 * The autonomous bot ticker runs inside that child (`BOTS_TICK=1` below),
 * in the same process as Socket.IO — the in-process realtime bus never
 * crosses processes, so ticking anywhere else would publish into the void
 * (skip: `--no-bots`).
 *
 * Flags: `--port N` (default 3000, also `PORT`), `--no-bots`, `--no-push`,
 * `BOTS_TICK_MS` (default 10000). `LOG_LEVEL=debug` restores the verbose
 * per-tick logs (default in dev is `info`). Ctrl+C stops everything.
 */
import "./lib/load-env";

import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import pg from "pg";

import { colors } from "@/lib/infrastructure/logger";

const { bold, cyan, dim, gray, green, link, red, yellow } = colors;
const DEV = cyan("[dev]");

interface DevOptions {
  port: number;
  withBots: boolean;
  withPush: boolean;
}

function parseArgs(argv: string[]): DevOptions {
  let port = Number(process.env.PORT ?? 3000);
  let withBots = true;
  let withPush = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: pnpm dev [--port N] [--no-bots] [--no-push]\n" +
          "  --port N   serve on N (default 3000 / PORT)\n" +
          "  --no-bots  skip the autonomous bot ticker\n" +
          "  --no-push  skip applying the DB schema on boot",
      );
      process.exit(0);
    } else if (arg === "--port") {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) port = Math.floor(n);
      i += 1;
    } else if (arg === "--no-bots") {
      withBots = false;
    } else if (arg === "--no-push") {
      withPush = false;
    } else {
      console.warn(`${DEV} ${yellow(`unknown flag ${arg} (see --help)`)}`);
    }
  }
  return { port, withBots, withPush };
}

async function checkDatabase(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });
  try {
    await pool.query("select 1");
  } catch (e) {
    console.error(
      `${DEV} ${red("cannot reach PostgreSQL.")} Is it running? Check ${bold("DATABASE_URL")} in .env ` +
        `${dim("(local default 127.127.126.56:5432 via OSPanel).")} Cause: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Windows-safe spawn of a pnpm script (cmd.exe resolves the .cmd shim). */
function pnpmArgs(script: string, extra: string[] = []): { command: string; args: string[] } {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/c", "pnpm", script, ...extra] }
    : { command: "pnpm", args: [script, ...extra] };
}

async function applySchema(): Promise<void> {
  console.log(`${DEV} applying schema ${dim("(db:push)")}`);
  const { command, args } = pnpmArgs("db:push");
  const res = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (res.status !== 0) {
    console.error(`${DEV} ${red("db:push failed")} — fix the schema error or boot with ${bold("--no-push")}`);
    process.exit(res.status ?? 1);
  }
}

let child: ChildProcess | null = null;
let stopping = false;

function shutdown(signal: string, code: number): void {
  if (stopping) return;
  stopping = true;
  if (child && child.exitCode === null) {
    child.kill("SIGINT");
    const force = setTimeout(() => child?.kill("SIGKILL"), 5000);
    force.unref();
  }
  console.log(`${DEV} ${gray(`stopped (${signal})`)}`);
  process.exit(code);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  await checkDatabase();
  if (opts.withPush) await applySchema();

  console.log(`${bold("ggrun")} ${dim("dev — db + sockets + bots")}`);
  console.log(`  ${dim("app")}      ${link(`http://localhost:${opts.port}`)}`);
  console.log(`  ${dim("sockets")}  ${green("attached")} ${dim("(same process as the app)")}`);
  console.log(
    `  ${dim("bots")}     ${opts.withBots ? green("ticker in server process") + dim(" (BOTS_TICK_MS to change, --no-bots to skip)") : yellow("disabled (--no-bots)")}`,
  );

  // NOTE: never spawn bare `pnpm server` — `server` is a pnpm builtin (store
  // server management) and silently exits 0 without running our script.
  // `pnpm run server` executes package.json's `tsx server.ts` instead.
  const serverCmd =
    process.platform === "win32"
      ? { command: "cmd.exe", args: ["/c", "pnpm", "run", "server", "--port", String(opts.port)] }
      : { command: "pnpm", args: ["run", "server", "--port", String(opts.port)] };
  child = spawn(serverCmd.command, serverCmd.args, {
    stdio: "inherit",
    // The ticker lives in the child (same process as sockets); BOTS_TICK_MS
    // rides along untouched for it to read. Dev defaults the child log level
    // to `info` — the per-tick `debug` stream drowns the console otherwise;
    // `LOG_LEVEL=debug` brings it back.
    env: {
      ...process.env,
      PORT: String(opts.port),
      BOTS_TICK: opts.withBots ? "1" : "0",
      LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    },
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.log(`${DEV} ${red(`server exited with code ${code ?? "unknown"}`)}`);
      shutdown("child-exit", typeof code === "number" ? code : 1);
    }
  });
  process.on("SIGINT", () => shutdown("SIGINT", 0));
  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
}

void main();
