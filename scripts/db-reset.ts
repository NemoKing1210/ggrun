/**
 * Resets the database to an empty schema.
 * Usage: pnpm db:reset
 * Drops and recreates the `public` schema, then re-applies the current
 * Drizzle schema (drizzle-kit push). Requires typing YES — destructive.
 */
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

import pg from "pg";

import { requireDatabaseUrl } from "./lib/load-env";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(
      "This DROPS every table in the public schema. Type YES to continue: ",
    )
  ).trim();
  rl.close();
  if (answer !== "YES") {
    console.log("Aborted.");
    return;
  }

  const pool = new pg.Pool({
    connectionString: requireDatabaseUrl(),
    connectionTimeoutMillis: 5000,
  });
  try {
    await pool.query("drop schema public cascade");
    await pool.query("create schema public");
    console.log("Public schema dropped and recreated.");
  } finally {
    await pool.end();
  }

  console.log("Re-applying the Drizzle schema...");
  // execSync runs through the OS shell by default, so pnpm.cmd resolves on Windows.
  execSync("pnpm drizzle-kit push --force", { stdio: "inherit" });
  console.log("Done. Seed data with 'pnpm db:seed' and create the first admin with 'pnpm db:admin'.");
}

main().catch((e) => {
  console.error(`Reset failed: ${e.message ?? e}`);
  process.exit(1);
});
