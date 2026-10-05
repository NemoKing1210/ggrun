/**
 * Backfill: move inline `data:image/…;base64,…` avatars and banners out of the
 * `users` table and into the configured storage driver.
 *
 * Usage: pnpm files:migrate
 *
 * Why: profile pictures used to be stored as base64 text in the row, which
 * bloats every read of the users table and cannot be served with caching.
 * New uploads already go through the storage module; this moves what is left.
 *
 * Idempotent — rows that no longer hold an inline image are skipped, so it is
 * safe to run more than once.
 */
import "./lib/load-env";

import { eq, like } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { db, pool } from "@/lib/infrastructure/db";
import { users } from "@/db/schema";
import { fileUrl, storeFile } from "@/lib/modules/files/service";

const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/;

type Field = "avatarUrl" | "bannerUrl";
type Category = "avatar" | "banner";

const TARGETS: Array<{ field: Field; category: Category; column: AnyPgColumn }> = [
  { field: "avatarUrl", category: "avatar", column: users.avatarUrl },
  { field: "bannerUrl", category: "banner", column: users.bannerUrl },
];

async function migrate(field: Field, category: Category, column: AnyPgColumn) {
  const rows = await db
    .select({ id: users.id, role: users.role, value: column })
    .from(users)
    .where(like(column, "data:image/%"));

  console.log(`• ${field}: ${rows.length} inline image(s)`);

  let migrated = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const match = DATA_URL.exec(row.value ?? "");
    if (!match) {
      console.warn(`  ! ${row.id}: unrecognised inline value, skipped`);
      continue;
    }
    try {
      const data = new Uint8Array(Buffer.from(match[2]!.replace(/\s/g, ""), "base64"));
      const file = await storeFile({
        category,
        data,
        actor: { id: row.id, role: row.role },
        // Acting on behalf of the user, not through their session.
        system: true,
        filename: `${category}-legacy`,
      });
      const url = fileUrl(file);
      await db.update(users).set({ [field]: url }).where(eq(users.id, row.id));
      migrated += 1;
      console.log(`  ✓ ${row.id}: ${data.byteLength} B → ${file.key}`);
    } catch (e) {
      failures.push(row.id);
      console.error(`  ✗ ${row.id}: ${(e as Error).message}`);
    }
  }

  return { migrated, failures };
}

async function main() {
  const results = [];
  for (const target of TARGETS) {
    results.push(await migrate(target.field, target.category, target.column));
  }

  const migrated = results.reduce((n, r) => n + r.migrated, 0);
  const failures = results.flatMap((r) => r.failures);
  console.log(`\nMigrated ${migrated} file(s) into the storage driver.`);
  if (failures.length > 0) {
    console.error(`Failed for ${failures.length} row(s): ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
