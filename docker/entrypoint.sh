#!/bin/sh
# GGRun container entrypoint: wait for Postgres, apply schema, optional
# seed/admin bootstrap, then serve the app.
set -e

# --- 1. Wait for the database ------------------------------------------------
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ggrun] FATAL: DATABASE_URL is not set" >&2
  exit 1
fi

echo "[ggrun] waiting for the database…"
node -e '
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
let tries = 0;
const tick = () => {
  pool.query("select 1").then(() => {
    console.log("[ggrun] database is ready");
    process.exit(0);
  }).catch((err) => {
    tries += 1;
    if (tries > 30) {
      console.error(`[ggrun] database unreachable: ${err.message}`);
      process.exit(1);
    }
    console.log(`[ggrun] database not ready (${tries}/30), retrying…`);
    setTimeout(tick, 2000);
  });
};
tick();
'

# --- 2. Apply the schema (idempotent) ----------------------------------------
echo "[ggrun] applying schema (pnpm db:push)"
pnpm db:push

# --- 3. Optional demo data ----------------------------------------------------
if [ "${SEED_DEMO:-}" = "true" ]; then
  echo "[ggrun] seeding demo data (idempotent)"
  pnpm db:seed
fi

# --- 4. Optional first admin (idempotent — promotes an existing user) ---------
if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  echo "[ggrun] bootstrapping the first admin"
  pnpm db:admin || echo "[ggrun] admin bootstrap failed — continuing anyway"
fi

# --- 5. Serve -----------------------------------------------------------------
echo "[ggrun] starting Next.js on :3000"
exec pnpm start