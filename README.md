# GGRun — game run platform

A web platform for a team/competitive gaming event in the HPG genre: seasons
("runs"), a board of cells, random game rolls, outcomes (passed/drop/reroll),
dice rolls and movement across the board, a leaderboard, an event feed, and an
admin console.

The specification and plan: [PLAN.md](./PLAN.md).

## Stack

- **Next.js 15** (App Router, Server Actions, RSC), TypeScript strict
- **Tailwind CSS v4** + a custom HUD theme (GoldSrc-era vibe, original assets)
- **PostgreSQL + Drizzle ORM** (drizzle-kit migrations)
- **Own cookie-session auth** (scrypt hashes, a `sessions` table) — no external
  providers
- **Zod** — shared schemas (the season config is validated by
  `SeasonConfigSchema` from the engine)
- **Vitest** — unit tests for the domain engine

## Architecture

```
presentation   → app/            pages, thin server actions
application    → lib/use-cases/  orchestration (validate → domain → persist)
domain         → game-engine/    pure TS without next/react/drizzle/pg (game rules)
infrastructure → lib/repositories/, lib/db.ts, lib/auth/
```

The domain (`game-engine/`) knows nothing about the DB or HTTP — it can be
reused in a bot/CLI without changes. Random numbers are generated server-side
only; the client cannot fake a roll.

## Running locally

1. PostgreSQL 17 (in OSPanel — the PostgreSQL-17 module listens on
   `127.127.126.56:5432`, database `ggrun`). Configure `DATABASE_URL` in
   `.env`.
2. Install and migrate:

   ```bash
   pnpm install
   pnpm drizzle-kit push        # apply the schema (or pnpm drizzle-kit generate)
   ```

3. Demo data (season run-1, a 40-cell board, 8 games):

   ```bash
   pnpm exec tsx scripts/seed-demo.ts
   ```

4. First administrator (reads BOOTSTRAP_ADMIN_EMAIL/PASSWORD from `.env`):

   ```bash
   pnpm exec tsx scripts/bootstrap-admin.ts
   ```

5. Dev server:

   ```bash
   pnpm dev                      # http://localhost:3000
   ```

## Environment variables

See [.env.example](./.env.example). Secrets are not committed.

## Scripts

| Command            | Purpose                       |
| ------------------ | ----------------------------- |
| `pnpm dev`         | Next.js dev server            |
| `pnpm build`       | production build              |
| `pnpm lint`        | ESLint                        |
| `pnpm test`        | Vitest (engine unit tests)    |
| `pnpm drizzle-kit` | schema migrations             |

## Structure

```
app/                  public pages, /dashboard, /admin
components/           HUD components (board, dice, dashboard, admin, ui, layout)
game-engine/          pure domain: dice, movement, roll FSM, cell effects
lib/db.ts             Drizzle + pg pool
lib/repositories/     data access
lib/use-cases/        resolve-game-roll, admin, users, auth (+ *-actions.ts server actions)
db/schema.ts          DB schema (the source of truth for types)
drizzle/              SQL migrations
scripts/              bootstrap-admin.ts, seed-demo.ts
```

## Extensibility

New mechanics are added via the cell-effect plugin registry
(`game-engine/cell-effects.ts`, key — the cell type or
`cell.config.effectKey`), via the season config (`seasons.config` JSONB,
validated by Zod), and via separate modules — without rewriting the core.
See PLAN.md §6.4.
