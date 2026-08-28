# DEPLOYMENT

How to run GGRun in production: Docker Compose (recommended) or manually on a
bare host.

---

## Requirements

- Node.js ≥ 20 and pnpm 9 (lockfile v9) — for manual deployment.
- PostgreSQL 17 — provided by the Compose `db` service, or any reachable
instance for manual deployment.
- Docker + Docker Compose v2 — for container deployment.

---

## 1. Docker Compose (recommended)

Everything lives in this repository: `Dockerfile`, `compose.yaml`,
`docker/entrypoint.sh`, `docker/env.example`.

```bash
git clone https://github.com/NemoKing1210/ggrun.git
cd ggrun

cp docker/env.example .env   # merge with existing values, fill in secrets
docker compose up --build
```

The site is served at `http://localhost:3000` (override with `APP_PORT`).

### What happens on container start

The `app` container runs `docker/entrypoint.sh`:

1. **waits** for Postgres (`db` service, healthcheck-gated via `depends_on`);
2. applies the schema: `pnpm db:push` (idempotent);
3. `SEED_DEMO=true` → seeds the demo season `run-1` (idempotent);
4. `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` set → creates (or
 promotes) the first admin account (idempotent);
5. serves the app with `pnpm start` (`next start`).

### Configuration

Compose interpolates `${VAR}` from the project `.env`; defaults are defined
in `compose.yaml`. Relevant variables:


| Variable                                              | Default                 | Purpose                                                                                     |
| ----------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `ggrun`                 | Postgres credentials inside the container network                                           |
| `POSTGRES_PORT`                                       | `5433`                  | Host port for Postgres (5433 avoids clashing with a local OSPanel instance on 5432)         |
| `APP_PORT`                                            | `3000`                  | Host port for the web app                                                                   |
| `AUTH_SECRET`                                         | —                       | Session signing secret; generate with `openssl rand -base64 32`                             |
| `NEXT_PUBLIC_SITE_URL`                                | `http://localhost:3000` | Public base URL; **inlined into the client bundle at build time**, so set it before `build` |
| `SEED_DEMO`                                           | `false`                 | Seed the demo season on boot                                                                |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`  | empty                   | Create/promote the first admin on boot                                                      |


Optional external catalog API keys (`RAWG_API_KEY`, `STEAM_WEB_API_KEY`,
`GAMESPOT_API_KEY`, `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`, `PROXY_URL`) are
passed through when present; all of them can stay empty (local game records
and the keyless FreeToGame provider work out of the box).

> **Note:** `AUTH_SECRET` defaults to `change-me-in-production` in the compose
> file — always override it before exposing the site.

### Data persistence

Postgres data lives in the named volume `pgdata`. It survives `docker compose down`; `docker compose down -v` destroys it (schema is re-applied on next
boot via `db:push`).

### Custom public URL

`NEXT_PUBLIC_SITE_URL` is inlined at build time — rebuild with the arg when
the domain changes:

```bash
docker compose build --build-arg NEXT_PUBLIC_SITE_URL=https://example.com
docker compose up -d
```

---

## 2. Manual deployment (bare host)

```bash
cd ggrun
pnpm install --frozen-lockfile

# 1. Environment
cp .env.example .env                # fill: DATABASE_URL, AUTH_SECRET, ...
export NEXT_PUBLIC_SITE_URL=...      # or keep NEXT_PUBLIC_SITE_URL in .env

# 2. Schema
pnpm db:push                        # apply the schema (idempotent)

# 3. Optional demo data / first admin
pnpm db:seed                        # demo season run-1 (idempotent)
pnpm db:admin                       # BOOTSTRAP_ADMIN_* from .env

# 4. Build and serve
pnpm build                          # next build --turbopack
pnpm start                          # next start on :3000
```

Point a reverse proxy (nginx, Caddy, …) at `127.0.0.1:3000` for TLS and a
public hostname.

---

## 3. Environment variables (full reference)

See [`.env.example`](./.env.example) — that file is the single source of
truth. Highlights:

- `DATABASE_URL` — `postgresql://user:password@host:port/database`. Used by
the app, `drizzle` and the `db:*` scripts. Scripts load `.env` with
`override: true`, so the project `.env` always wins over a stale exported
variable.
- `AUTH_SECRET` — signs session cookies; rotating it invalidates all sessions.
- `NEXT_PUBLIC_SITE_URL` — absolute links / metadata base URL.
- `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` — used only by
`pnpm db:admin`; remove them from `.env` after the first run.

---

## 4. Database operations


| Command            | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm db:status`   | connectivity + row counts per table                                     |
| `pnpm db:push`     | apply the current `db/schema/**` to the DB (`drizzle-kit push --force`) |
| `pnpm db:generate` | generate a SQL migration into `drizzle/`                                |
| `pnpm db:seed`     | demo season `run-1`, 40-cell board, 8 games (idempotent)                |
| `pnpm db:admin`    | first admin from `BOOTSTRAP_ADMIN_*` (idempotent)                       |
| `pnpm db:reset`    | drop the public schema + re-apply (asks to type `YES`)                  |
| `pnpm db:setup`    | fresh bootstrap: push + seed + admin                                    |


**Production note:** for a multi-instance or ephemeral setup, replace the
entrypoint's `db:push` with `db:generate` + a migration runner owned by one
instance, and run `db:seed`/`db:admin` explicitly instead of on every boot.

---

## 5. Troubleshooting

- **Container restarts in a loop, app logs show `ECONNREFUSED` to the DB** —
the `db` healthcheck hasn't passed yet or `POSTGRES_*` differs between the
`db` and `app` services; both must use the same credentials.
- **"`DATABASE_URL` is not set"** from a host-run script — the `.env` file is
missing or `DATABASE_URL` is empty; the scripts exit with a clear message.
- **Session cookie invalidates after every restart** — `AUTH_SECRET` is not
stable (left at a default or regenerated between boots).
- **Absolute links point to `localhost`** — `NEXT_PUBLIC_SITE_URL` was not
set (build-time) or the build arg was missing; rebuild with the correct URL.
- **Port 5432/3000 already in use on the host** — set `POSTGRES_PORT` / `APP_PORT`.
- **Windows + Docker**: keep `docker/entrypoint.sh` with LF line endings
(enforced by `.gitattributes`); a CRLF shebang breaks container startup.

