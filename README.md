# GGRun

**English** · **[Русский](./translations/README.ru.md)** · **[Українська](./translations/README.uk.md)**

![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)
![Author: NemoKing1210](https://img.shields.io/badge/Author-NemoKing1210-181717?logo=github)
![Repo: NemoKing1210/ggrun](https://img.shields.io/badge/Repo-NemoKing1210%2Fggrun-181717?logo=github)
![Stack: Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)
![Issues](https://img.shields.io/github/issues/NemoKing1210/ggrun)

A web platform for a team/competitive gaming event in the HPG genre: seasons
("runs"), a board of cells, random game rolls, outcomes (passed/dropped/
rerolled), dice rolls and movement across the board, a leaderboard, an event
feed, and an admin console.

## Stack

- **Next.js 15** (App Router, Server Actions, RSC), TypeScript strict
- **Tailwind CSS v4** + a custom HUD theme (GoldSrc-era vibe, original assets)
- **PostgreSQL + Drizzle ORM** (drizzle-kit migrations)
- **Own cookie-session auth** (scrypt hashes, a `sessions` table) — no external
  providers
- **Zod** — shared schemas (the season config is validated by
  `SeasonConfigSchema` from the engine)
- **Vitest** — unit tests for the domain engine

## Features

### For players

- **Player HQ** (`/dashboard`, signed in): roll a random game from the
  season pool (blacklisted and already-played games never come up), play it,
  then mark the outcome — **passed / dropped / reroll**. Rerolls require a
  reason and are approved by a referee; advancing on the board applies the
  cell effects (bonus, penalty, teleport, event…) and updates your position,
  balance and streaks.
- **Board** (`/board`): the season map — grid and linear views, live
  in-flight rolls, cell details. **Leaderboard** (`/leaderboard`): standings
  by position and balance. **Feed** (`/feed`): the live event log with
  filters (rolls, passes, drops, moves, joins).
- **Rules** (`/rules`): the current season's rules, written in Markdown by
  the organizers.
- **Seasons** (`/seasons`): the archive of past and current runs with an
  active-season spotlight; a detailed page per season under
  `/seasons/[slug]`.
- **Profile** (`/settings`): avatar (square crop) and wide banner (3:1),
  bio, external-profile links (Twitch/Steam/Discord/…), personal accent
  color and site language. Public profile at `/players/[username]`.

### For organizers (admin console, `/admin`)

- **Overview**: platform stats, the active season, quick actions.
- **Seasons** (`/admin/seasons`): create a run (slug auto-generated,
  board can be cloned from a previous run), and drive its lifecycle
  `draft → active → paused → finished → archived` (activating resets
  participants).
- **Season editor** — per season, three tabs:
  - **Settings** (`/admin/seasons/[id]`): dice (sides, pass/drop dice
    counts, streak multiplier), points/balance rules, board size & loop,
    reroll limits, game-pool source/provider, and the /rules Markdown.
  - **Board** (`/admin/seasons/[id]/board`): edit every cell — type
    (start/finish/penalty/bonus/event/teleport/custom), label and amount.
  - **Players** (`/admin/seasons/[id]/players`): add participants (with
    live user search), edit position/balance/status inline, and remove
    players — every change requires a reason and lands in the audit log.
- **Users** (`/admin/users`): list users, block/unblock, delete, and manage
  roles (admin/judge — judges cannot touch user management).
- **Games catalog** (`/admin/games`): add games manually, **import by store
  URL** (Steam, GOG, Epic, itch.io, Humble — no API key needed), search
  external APIs (RAWG/IGDB/Steam/GameSpot with keys), blacklist games per
  season, and run bulk operations in the pool.
- **Moderation** (`/admin/moderation`): approve/reject pending reroll
  requests and game-completion requests, each with a required reason.
- **Audit log** (`/admin/audit`): every staff mutation with search,
  action-type filters and time periods.
- **Site settings** (`/admin/settings`): global site settings and API
  provider integrations (RAWG/IGDB/Steam/GameSpot keys, outbound proxy) —
  configurable there or via environment variables.

## Quick start

```bash
git clone https://github.com/NemoKing1210/ggrun.git
cd ggrun
pnpm install

cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, ...
pnpm db:setup               # schema + demo season + first admin
pnpm dev                    # http://localhost:3000
```

Local development: [`DEVELOPMENT.md`](./DEVELOPMENT.md) ·
Production deploy: [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Documentation

| Doc | What it covers |
| --- | --- |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Architecture, commands, code conventions, testing, releases |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Docker Compose & manual production deployment, env reference, troubleshooting |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to report issues and submit pull requests |
| [`DESIGN.md`](./DESIGN.md) | The HUD design system — read it before writing any UI |
| [`RUNBOOK.md`](./RUNBOOK.md) | Step-by-step host guide for event day |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release history (Keep a Changelog) |

## Environment variables

See [`.env.example`](./.env.example) — secrets are never committed. The full
reference lives in [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## License

[MIT](./LICENSE) — see the license file for details.

Found a bug or have an idea? Open an issue at
[github.com/NemoKing1210/ggrun/issues](https://github.com/NemoKing1210/ggrun/issues)
or follow [`CONTRIBUTING.md`](./CONTRIBUTING.md). If you use GGRun in your own
event, a star on GitHub is appreciated.