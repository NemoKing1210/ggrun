/**
 * Shared .env loader for CLI scripts.
 * Usage: import "../lib/load-env"; (as the FIRST import of the script)
 *
 * Uses `override: true` so that a stale DATABASE_URL exported in the
 * shell/session environment cannot shadow the project `.env` file — dotenv
 * skips variables that already exist in process.env by default, which once
 * made every script silently target an unreachable database.
 */
import { config } from "dotenv";

/** Snapshot of the environment BEFORE .env was applied (for diagnostics). */
export const rawEnv: NodeJS.ProcessEnv = { ...process.env };

config({ override: true });

/**
 * Returns the project database URL or exits with a clear error when missing.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set — copy .env.example to .env and fill it in.",
    );
    process.exit(1);
  }
  return url;
}
