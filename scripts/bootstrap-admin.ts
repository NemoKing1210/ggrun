/**
 * Bootstrap первого администратора.
 * Использование: pnpm exec tsx scripts/bootstrap-admin.ts
 * Берёт BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD из .env
 */
import "dotenv/config";

import { Pool } from "pg";

import { hashPassword } from "../lib/auth/password";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      "Задайте BOOTSTRAP_ADMIN_EMAIL и BOOTSTRAP_ADMIN_PASSWORD в .env",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD должен быть не короче 8 символов");
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
      console.log(`Пользователь ${email} повышен до роли admin`);
      return;
    }
    const username = email.split("@")[0]!.replace(/[^a-z0-9_-]/g, "") || "admin";
    const passwordHash = await hashPassword(password);
    await pool.query(
      `insert into users (email, username, password_hash, display_name, role)
       values ($1, $2, $3, $2, 'admin')`,
      [email, username, passwordHash],
    );
    console.log(`Создан администратор ${email} (username: ${username})`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
