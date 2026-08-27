/**
 * Database health check.
 * Usage: pnpm db:status
 * Verifies connectivity (with a short timeout), prints server/database info,
 * lists public tables with row counts and warns when the DATABASE_URL found
 * in the outer environment differs from the project `.env`.
 */
import pg from "pg";

import { rawEnv, requireDatabaseUrl } from "./lib/load-env";

const CONNECT_TIMEOUT_MS = 5000;

/** Hides the password in a connection string for safe printing. */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  // Warn early when the outer environment tried to override .env values.
  const sessionUrl = rawEnv.DATABASE_URL;
  if (sessionUrl && sessionUrl !== process.env.DATABASE_URL) {
    console.warn(
      `Warning: DATABASE_URL from the shell/session was overridden by .env.\n` +
        `  session: ${maskUrl(sessionUrl)}\n` +
        `  .env:    ${maskUrl(process.env.DATABASE_URL ?? "")}\n` +
        `  Consider removing the stale variable from your environment.`,
    );
  }

  const pool = new pg.Pool({
    connectionString: requireDatabaseUrl(),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  try {
    const info = await pool.query("select version(), current_database()");
    console.log(`Connected to ${info.rows[0].current_database}`);
    console.log(`Server: ${(info.rows[0].version as string).split(",")[0]}`);

    const tables = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    if (tables.rows.length === 0) {
      console.log("Tables: none — run 'pnpm db:push' to create the schema.");
      return;
    }
    for (const row of tables.rows) {
      const count = await pool.query(
        `select count(*)::int as n from "${row.table_name}"`,
      );
      console.log(`${count.rows[0].n.toString().padStart(6)}  ${row.table_name}`);
    }
    console.log(`Total tables: ${tables.rows.length} — database looks healthy.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`Database check failed: ${e.message ?? e}`);
  process.exit(1);
});
