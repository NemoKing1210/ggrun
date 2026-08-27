/**
 * Bootstraps the first administrator.
 * Usage: pnpm exec tsx scripts/bootstrap-admin.ts
 * Reads BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD from .env
 */
import "./lib/load-env";

import { Pool } from "pg";

import { hashPassword } from "../lib/auth/password";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in .env",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const existing = await pool.query(
      "select id, role from users where email = $1",
      [email],
    );
    if (existing.rows.length > 0) {
      await pool.query("update users set role = 'admin' where email = $1", [
        email,
      ]);
      console.log(`User ${email} promoted to admin`);
      return;
    }
    const username = email.split("@")[0]!.replace(/[^a-z0-9_-]/g, "") || "admin";
    const passwordHash = await hashPassword(password);
    await pool.query(
      `insert into users (email, username, password_hash, display_name, role)
       values ($1, $2, $3, $2, 'admin')`,
      [email, username, passwordHash],
    );
    console.log(`Admin created: ${email} (username: ${username})`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
