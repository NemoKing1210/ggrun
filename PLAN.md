# Technical Specification and Implementation Plan: Web Platform for a Gaming Event (HPG-like Mechanics)

> This document is both a technical specification and an instruction manual for an AI agent (Claude Code / Cursor / any other coding agent) that will implement the project. Move through the phases sequentially (section 9), cross-checking against the data model (section 5) and the feature specification (section 6). If something is not explicitly specified — choose a simple, extensible solution and record the assumption in a code comment.

## 0. How the Agent Should Work with This Document

1. Do not try to implement everything in one pass. Work through the checklists in section 9, phase by phase, with a working state after each phase (the project must build and deploy at every step).
2. The game logic (the engine) must be written as pure, framework-independent TypeScript functions — this is a key architectural requirement, not a UI detail.
3. All concrete rule numbers (how many points, how many dice sides, how many cells on the board) are **season configuration**, not constants in code. Reasonable MVP defaults are given below; they must be moved into `season.config` (JSONB) and the admin panel.
4. The DB schema, table names, and the code below are a reference, not dogma. Deviations are acceptable if they improve consistency and type safety.
5. Everything marked "Backlog / Phase 8" does not block the MVP, but the schema must leave room for it (don't make choices that would later require a complete rewrite).

---

## 1. What We Are Building

A website for a team-based/competitive gaming event where:

- there is one or more **seasons ("runs")** — a time-limited playthrough of the event with its own set of players, board, and rules;
- each season has a **game board** — a sequence of cells of different types (start, finish, normal, penalty, event, bonus, etc.);
- each **player** has a position on the board, a point balance, and a status;
- a player is **dealt a game** from the general pool (a random roll with filters: platform, genre, already-played games, etc.);
- the player marks the game as **passed / dropped / reroll**;
- depending on the outcome — a **dice roll** and movement across the board with modifiers (point balance, penalty cells, etc.);
- there is a public **leaderboard**, an event feed (who passed/dropped what — in the spirit of streamer "News" posts), and player profiles;
- there is an **admin panel** (role `admin`/`judge`) for starting a new run, editing the board, managing the game pool, manual point adjustments, and action auditing.

The design should have an old-school Valve vibe (Half-Life 1 / Counter-Strike 1.6): HUD elements, large "ammo counter" digits, hazard stripes, console-style menu aesthetics — details in section 8.

The project must be written so that six months from now it is easy to add item inventory, dailies, a shop with in-game currency, global modifiers, etc., without rewriting the core.

---

## 2. Domain (a Genre, Not Someone Else's Specific Rulebook)

The format originated in the Russian-language streaming community (HPG, RGG-LAND, and similar events) and is broadly structured like this: each participant has a token on the game board; a turn consists of rolling a random game, playing it through or dropping it, and then rolling dice to move across the board; special cells along the way affect the point balance and position; the host/judge monitors rule compliance and can intervene manually.

**Important:** do not copy anyone's specific rulebook (it contains hundreds of casuistic rules specific to a particular community — "treasury", "jail", special zones, etc.). Your task is to implement a **flexible engine** supporting this general skeleton, while the user will configure exact numbers and unique mechanic names for their own event via the admin panel and season config. Below (section 6.2) is a reasonable set of default rules for the MVP.

---

## 3. Technology Stack


| Layer                   | Choice                                                                                                                                                                    | Rationale                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework               | **Next.js 15** (App Router, React Server Components, Server Actions), TypeScript strict                                                                                   | native Vercel deployment, RSC reduces client-side JS, Server Actions remove the need for a separate REST/RPC layer for mutations                |
| UI                      | **Tailwind CSS v4** + **shadcn/ui** (Radix-based headless primitives) as the base, with a custom HUD theme on top                                                         | fast to build, easy to radically repaint in a retro style without fighting someone else's ready-made styles                                   |
| Client state            | React Server Components for data, **TanStack Query** for realtime-dependent pieces (leaderboard, feed), **Zustand** for local UI state (dice animation, etc.)             | no need to drag in Redux for a small amount of client state                                                                                    |
| Validation              | **Zod**, shared schemas between client and server                                                                                                                         | single source of truth for forms and API                                                                                                       |
| DB / ORM                | **Postgres (Supabase)** + **Drizzle ORM** + `drizzle-kit` for migrations                                                                                                  | Drizzle is SQL-first, lightweight, works great in Vercel's edge/serverless environment; migrations are plain `.sql` files compatible with the Supabase CLI |
| Auth                    | **Supabase Auth**: email magic link + OAuth (Twitch recommended — the event audience is almost always streamers/viewers)                                                   | native RLS integration, no separate auth service needed                                                                                        |
| Realtime                | **Supabase Realtime** (Postgres Changes + Broadcast)                                                                                                                      | live updates of the board/leaderboard without hand-rolled websocket infrastructure                                                              |
| Files                   | **Supabase Storage** (avatars, game covers, custom board assets)                                                                                                          | same provider as the DB, unified billing                                                                                                       |
| External game data      | Steam Web API / SteamSpy, optionally **IGDB API** (access via Twitch Dev Console — convenient since Twitch OAuth is already in the project)                                | auto-filling covers, genres, platforms in the game catalog                                                                                     |
| Notifications (Backlog) | Discord Webhook / Telegram Bot API                                                                                                                                        | broadcasting the event feed into community chats                                                                                               |
| Tests                   | **Vitest** + Testing Library (unit/integration), **Playwright** (e2e for critical scenarios: roll → outcome → movement)                                                    | the rules engine is high-regression-risk code, unit tests are a must-have                                                                      |
| Lint/format             | ESLint (typescript-eslint) + Prettier + Husky pre-commit                                                                                                                  | style stability as the project evolves across agents/different people                                                                          |
| CI/CD                   | GitHub Actions → Vercel (preview on PR, prod on merge to main) + running Supabase migrations in CI                                                                        | reproducible, automatic pipeline                                                                                                               |
| Package manager         | **pnpm**                                                                                                                                                                  | faster than npm/yarn, ready for a workspace monorepo if the project grows                                                                      |


> A short note on the game catalog: since there is already experience working with Steam/SteamDB (DOM scraping for Komnatushka userscripts) and familiarity with IGDB/RAWG/Backloggd as metadata sources — this project needs not DOM scraping but a full API layer (Steam Web API/IGDB); however, the title-normalization logic and cover handling from that experience can be reused almost directly.

---

## 4. Architecture

### 4.1 Layering Principle

```
presentation   → app/ (Next.js routes, React components, Server Actions as thin controllers)
application    → lib/use-cases/ (orchestration: validate → call domain → persist → log the event)
domain         → packages/game-engine/ (pure TS, NO imports from Next.js/Supabase — only the rules of the game)
infrastructure → lib/supabase/, lib/repositories/ (DB access, external APIs, files)

```

Key rule: **the domain layer must not know that Supabase, Next.js, or HTTP exist.** This is what makes the architecture "evolution-friendly" — the engine can later be reused in a Discord bot, a CLI tool for the judge on stream, or a mobile app without modifications.

For the MVP it is not required to make this a separate pnpm package — a separate folder with pure modules and a ban on importing `next/*` or `@supabase/*` inside it is enough (this can be enforced with the eslint rule `no-restricted-imports`). Extracting it into a separate package (`packages/game-engine`) is worth doing in Phase 8 if a second consumer appears (a bot, a mobile client).

### 4.2 Repository Structure (MVP, single app)

```
hpg-platform/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                 # landing / current season
│   │   ├── board/page.tsx           # game board visualization
│   │   ├── leaderboard/page.tsx
│   │   ├── players/[slug]/page.tsx  # player profile
│   │   ├── feed/page.tsx            # event feed
│   │   └── rules/page.tsx
│   ├── (player)/
│   │   └── dashboard/page.tsx       # player's personal area: current game, passed/dropped buttons, inventory
│   ├── (admin)/
│   │   └── admin/
│   │       ├── seasons/             # season list + creating a new run
│   │       ├── seasons/[id]/board   # board editor
│   │       ├── seasons/[id]/players
│   │       ├── games-catalog/
│   │       ├── audit-log/
│   │       └── settings/
│   ├── api/
│   │   └── webhooks/                # incoming webhooks (Steam, Discord — Backlog)
│   └── layout.tsx
├── components/
│   ├── ui/                          # shadcn primitives + HUD theme
│   ├── board/                       # BoardCanvas, PlayerToken, CellTooltip
│   ├── dice/                        # DiceRoller (animation)
│   └── admin/
├── lib/
│   ├── use-cases/
│   │   ├── resolve-game-roll.ts     # passed/dropped → engine → move record
│   │   ├── start-new-season.ts
│   │   └── ...
│   ├── repositories/
│   │   ├── seasons.repo.ts
│   │   ├── players.repo.ts
│   │   ├── games.repo.ts
│   │   └── ledger.repo.ts
│   ├── supabase/
│   │   ├── server.ts                # server client (service role, only in Server Actions)
│   │   ├── client.ts                # browser client (anon key, under RLS)
│   │   └── middleware.ts            # session refresh
│   └── validation/                  # shared Zod schemas
├── game-engine/                     # pure domain (see 4.1)
│   ├── dice.ts
│   ├── movement.ts
│   ├── ledger.ts
│   ├── roll-state-machine.ts
│   └── types.ts
├── drizzle/
│   ├── schema.ts
│   └── migrations/
├── supabase/
│   ├── config.toml
│   ├── migrations/                  # .sql, kept in sync with drizzle migrations
│   └── seed.sql
├── tests/
├── .github/workflows/ci.yml
├── next.config.ts
├── vercel.json                      # optional: headers, redirects, cron
└── package.json

```

---

## 5. Data Model

### 5.1 Entity Overview

```
profiles ──< season_players >── seasons ──< board_cells (via boards)
   │                                │
   │                                ├──< game_rolls >── games_catalog
   │                                ├──< moves
   │                                ├──< ledger_entries
   │                                └──< event_log
   └──< admin_audit_log

```

### 5.2 SQL Schema (Initial Migration)

```sql
-- 0001_init.sql

create type user_role      as enum ('admin', 'judge', 'player', 'viewer');
create type season_status  as enum ('draft', 'active', 'paused', 'finished', 'archived');
create type cell_type      as enum ('start', 'finish', 'normal', 'penalty', 'event', 'bonus', 'teleport', 'custom');
create type roll_status    as enum ('rolled', 'in_progress', 'passed', 'dropped', 'rerolled');
create type player_status  as enum ('active', 'finished', 'eliminated', 'withdrawn');

-- Profile on top of auth.users
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  twitch_login  text,
  role          user_role not null default 'viewer',
  created_at    timestamptz not null default now()
);

create table seasons (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  status      season_status not null default 'draft',
  config      jsonb not null default '{}'::jsonb,   -- rules: dice, points, board (see 6.2)
  started_at  timestamptz,
  finished_at timestamptz,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table boards (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null default 'Main board',
  created_at timestamptz not null default now()
);

create table board_cells (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  position   int not null,
  cell_type  cell_type not null default 'normal',
  label      text,
  config     jsonb not null default '{}'::jsonb,     -- cell-specific parameters
  unique (board_id, position)
);

create table season_players (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references seasons(id) on delete cascade,
  player_id      uuid not null references profiles(id),
  position       int not null default 0,
  balance_points int not null default 0,
  status         player_status not null default 'active',
  streak_pass    int not null default 0,
  streak_drop    int not null default 0,
  joined_at      timestamptz not null default now(),
  unique (season_id, player_id)
);

create table games_catalog (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  platform      text,                                 -- 'steam', 'nes', 'custom', ...
  external_ids  jsonb not null default '{}'::jsonb,    -- { steam_appid, igdb_id, rawg_id }
  cover_url     text,
  genres        text[] not null default '{}',
  is_blacklisted boolean not null default false,
  created_at    timestamptz not null default now()
);

create table game_rolls (
  id                uuid primary key default gen_random_uuid(),
  season_player_id  uuid not null references season_players(id) on delete cascade,
  game_id           uuid references games_catalog(id),
  status            roll_status not null default 'rolled',
  hours_spent       numeric,
  difficulty_level  int,
  notes             text,
  rolled_at         timestamptz not null default now(),
  resolved_at       timestamptz
);

create table moves (
  id                uuid primary key default gen_random_uuid(),
  season_player_id  uuid not null references season_players(id) on delete cascade,
  game_roll_id      uuid references game_rolls(id),
  from_position     int not null,
  to_position       int not null,
  dice_results      int[] not null,
  cell_landed_type  cell_type,
  created_at        timestamptz not null default now()
);

create table ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  season_player_id  uuid not null references season_players(id) on delete cascade,
  delta             int not null,
  reason            text not null,                     -- 'game_pass_bonus', 'penalty_cell', 'admin_adjustment', ...
  related_move_id   uuid references moves(id),
  created_by        uuid references profiles(id),       -- filled only for manual adjustments
  created_at        timestamptz not null default now()
);

create table event_log (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references seasons(id) on delete cascade,
  season_player_id  uuid references season_players(id),
  event_type        text not null,                      -- 'game_rolled', 'game_passed', 'game_dropped', 'moved', 'season_started', ...
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create table admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references profiles(id),
  action_type text not null,
  target_type text not null,
  target_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index on game_rolls (season_player_id, status);
create index on event_log (season_id, created_at desc);
create index on season_players (season_id, position);

```

### 5.3 RLS (Row Level Security) — Basic Pattern

Public season data (board, leaderboard, feed) is read anonymously; all mutations go only through Server Actions with the service key (or through RLS policies that check the role in `profiles`).

```sql
alter table seasons enable row level security;
alter table season_players enable row level security;
alter table event_log enable row level security;
alter table admin_audit_log enable row level security;

create policy "public read seasons" on seasons for select using (true);
create policy "public read season_players" on season_players for select using (true);
create policy "public read event_log" on event_log for select using (true);

-- helper: current user is admin/judge
create function is_staff() returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin', 'judge')
  );
$$ language sql stable;

create policy "staff write seasons" on seasons for all
  using (is_staff()) with check (is_staff());

create policy "staff write season_players" on season_players for all
  using (is_staff()) with check (is_staff());

create policy "no public access to audit log" on admin_audit_log for select
  using (is_staff());

```

The player's own gameplay actions (marking passed/dropped, spinning the dice) **must not** go directly from the browser into tables via RLS — that invites cheating (the client could fake the dice result). All such mutations must pass through a Server Action/route handler that:

1. verifies that `auth.uid()` = owner of the corresponding `season_players.player_id`;
2. generates random numbers on the server itself (never trusts the client);
3. calls domain functions from `game-engine/`;
4. writes the result with the service key.

---

## 6. Functional Specification

### 6.1 Public Area

- **Home / current season** — status of the active run, a brief leaderboard (top 5), the latest 5 feed events, CTAs to the full sections.
- **Game board** — visualization of cells (SVG/Canvas), player tokens at their positions, hover/click on a cell shows its type and description. Must work on mobile (viewers often watch from a smartphone during the stream).
- **Leaderboard** — sorted by board position (and/or by point balance — make it configurable), player status (in the game/finished/eliminated).
- **Player profile** — avatar, history of passed/dropped games, stats (how many passed, how many dropped, current streak).
- **Event feed** — chronological feed of all season events (roll, pass, drop, move, joining the season, manual judge adjustments) — realtime-updated.
- **Rules** — static/CMS-editable page with the rules text of the current season (the admin must be able to edit it without a deploy — a simple markdown field in the DB).

### 6.2 Game Engine (Domain)

Default configuration for the MVP (example `season.config`):

```json
{
  "dice": {
    "sides": 6,
    "passDiceCount": 1,
    "dropDiceCount": 2,
    "dropStreakMultiplier": true
  },
  "points": {
    "startingBalance": 0,
    "bonusAddsToRollOnPass": true,
    "resetBalanceAfterUse": true
  },
  "board": {
    "size": 40,
    "loop": false
  },
  "rerolls": {
    "allowed": true,
    "limitPerGame": 1
  }
}

```

Basic turn logic (reference implementation; the agent is free to refine it as testing proceeds):

1. A game is rolled for the player from `games_catalog`, taking season filters into account (platform, exclude games already played this season, exclude blacklist).
2. The player marks the outcome: `passed`, `dropped`, or `rerolled`.
3. On `rerolled` — a new roll, position unchanged, the reroll counter for this game increases (limit from config).
4. On `passed` — roll `passDiceCount` dice of `d{sides}`, move forward by the sum; if `balance_points > 0`, add it to the result and zero the balance; reset `streak_drop`, increase `streak_pass`.
5. On `dropped` — roll `dropDiceCount` dice (multiplied if `dropStreakMultiplier` and there is a `streak_drop`), move backward by the sum; handle the balance similarly; reset `streak_pass`, increase `streak_drop`.
6. Apply the effect of the cell the player landed on (see cell types below).
7. Record `moves`, `ledger_entries` (if any), `event_log`.

Cell types for the MVP (`cell_type`), with room for extension via `config` jsonb:

- `start` / `finish` — special entry/exit logic (no dropping/rerolling allowed, reachable only through normal movement — by analogy with the approach commonly accepted in the genre).
- `normal` — no effect.
- `penalty` — points/position modifier (magnitude in `config`).
- `bonus` — positive modifier.
- `event` — triggers a random event from a configurable list ( groundwork for a future "wheel of events", Phase 8).
- `teleport` — teleport to a cell/group of cells according to a rule in `config`.
- `custom` — a "hatch" for future mechanics without a schema migration: logic is read from `config` and handled through a plugin registry in the engine (see 6.4).

All these concrete numbers and the enabling/disabling of cell types must be configurable from the admin panel — this is what makes the architecture "flexible".

### 6.3 Player Dashboard

- The currently rolled game (cover, platform, link to the Steam/IGDB page).
- Buttons "Passed" / "Drop" / "Reroll" (with confirmation — irreversible action).
- Turn phase indicator (roll → in progress → need to mark outcome → dice animation → new position).
- Personal stats and history.
- (Backlog) item/effect inventory if the Phase 8 modules are enabled.

### 6.4 Extensibility ("And Much More" Without Breaking the Core)

Design these into the architecture, but they are not required to be implemented in the MVP:

- **Cell effect plugin registry**: `Record<string, (ctx) => EffectResult>`, keyed by `cell.config.effectKey`, so new effects can be added without touching the core state machine.
- **Item inventory** — separate tables `inventory_items` + `player_inventory` (many-to-many with state); not designed in the MVP, but the name is reserved.
- **Dailies / quests** — a separate module, independent of the core movement engine.
- **Internal currency / shop** — a separate transaction table by analogy with `ledger_entries`, but with its own `currency_type`.
- **Global modifier events** — temporary (`starts_at`/`ends_at`) records affecting the season config on top of the base one — read as an overlay over `season.config` at the moment the turn is resolved.

### 6.5 Admin Panel

A key section, explicitly a priority for the user.

- **Season management ("runs")**:
  - create a new season (draft) with the ability to clone the board/config from the previous one;
  - edit `config` via a friendly form (not raw JSON — Zod schema → auto-generated form, or a manual form with validation);
  - transition status `draft → active → paused → finished → archived`;
  - on start — snapshot the player list and reset positions/balance.
- **Board editor**: list of cells with drag-n-drop reordering, adding/removing cells, assigning types and parameters.
- **Season player management**: add/remove a participant, manually adjust position/balance (with mandatory entries in `admin_audit_log` and `event_log` — transparency for viewers and participants), change status.
- **Game catalog**: import from Steam (by apphash/appid list or by Steam profile), enrichment via IGDB/RAWG, manual addition, blacklist/un-blacklist, bulk exclusion by genre/tag.
- **Judge actions**: force a reroll for a specific player, manual dice roll with a stated reason, resolving disputes (timestamped logs — by analogy with how this is commonly resolved in the genre: whoever performed the action first has priority).
- **Audit log**: full list of administrative actions — who/when/changed what.
- **Rule settings (texts)**: markdown editor for the "Rules" page.

### 6.6 Roles and Access


| Role     | Permissions                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`  | Full access: seasons, board, game catalog, players, audit, settings, role assignment                                                                                 |
| `judge`  | Judge actions inside the active season (overrides, manual rolls), no access to role assignment or creating new seasons (configurable — can also be allowed)          |
| `player` | Personal dashboard, actions only on their own `season_players` record                                                                                                |
| `viewer` | Public pages, no actions                                                                                                                                             |


### 6.7 Authentication

- The primary login method for players is **Twitch OAuth** (natural for a streaming format), plus email magic link as a fallback.
- After first login — a trigger creates the `profiles` record (Postgres trigger `on auth.users insert`).
- Assigning the `admin`/`judge` role — manually via Supabase Studio or a separate protected endpoint for the project owner during bootstrap (you cannot grant yourself permissions through the public UI).

---

## 7. Infrastructure: Vercel + Supabase

### 7.1 Environments

Two Supabase projects are recommended — `staging` and `production` — with matching Vercel environments (`preview`/`production`) and different `.env` files.

### 7.2 Environment Variables (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never expose to the client
STEAM_WEB_API_KEY=
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
NEXT_PUBLIC_SITE_URL=

```

### 7.3 `supabase/config.toml` (Reference)

```toml
project_id = "hpg-platform"

[api]
enabled = true
port = 54321

[db]
port = 54322

[auth]
enabled = true
site_url = "https://your-domain.example"

[auth.external.twitch]
enabled = true
client_id = "env(TWITCH_CLIENT_ID)"
secret = "env(TWITCH_CLIENT_SECRET)"

```

### 7.4 Migrations

- Keep `drizzle/schema.ts` as the source of truth for types, generate `.sql` via `drizzle-kit generate`, apply via `supabase db push` (or `supabase migration up` in CI).
- In CI: a `supabase db push --dry-run` step on PRs (verifying the migration is valid) and a real push on merge to `main` against staging/production depending on the branch.

### 7.5 `next.config.ts` — Notes

- `images.remotePatterns` — allow the cover image domains (Steam CDN [cdn.akamai.steamstatic.com](https://cdn.akamai.steamstatic.com), [images.igdb.com](https://images.igdb.com), Supabase Storage).
- Enable `typedRoutes` for type-safe navigation.

### 7.6 Vercel

- The project connects directly to the GitHub repository, zero-config for Next.js.
- `vercel.json` is only needed if custom headers/redirects/cron are required (e.g. Vercel Cron for future dailies in Phase 8):

```json
{
  "crons": [
    { "path": "/api/cron/daily-reset", "schedule": "0 5 * * *" }
  ]
}

```

---

## 8. Design System: Half-Life 1 / CS 1.6 Vibe

The goal is to evoke a recognizable feel of the era (2000s, GoldSrc shooter HUDs) without copying protected third-party trademarks and assets. We build an **original** visual language inspired by this aesthetic:

### 8.1 What To Do

- **Palette**: dark background (charcoal gray `#1b1b1a`, dark olive `#2a2a22`), accent — warm amber-orange (`#f2a900`) and muted military green (`#7c8f4a`), critical states — rust red (`#b0341f`). Text — warm off-white (`#e6e1d3`), not pure white — this keeps old-game HUD elements from looking "webby".
- **Typography**: large headings — a dense "stencil"/military font (free options: *Big Shoulders Stencil*, *Black Ops One*, *Rajdhani* with wide tracking); for numbers (score counters, board position) — a monospaced technical font with tabular figures (*Share Tech Mono*, *JetBrains Mono*); for body text — a readable grotesque (*Barlow Condensed*, *Inter*), so long rule descriptions don't turn into unreadable stylization.
- **HUD motifs**: corner bracket "frames" on cards, "hazard tape" stripes (black-yellow diagonal hatching) for warnings/dangerous admin actions, score counters in ammo-counter style, thick beveled buttons with a slight bevel/inset, a subtle CRT-scanline overlay (always with a `prefers-reduced-motion` fallback and no contrast loss), a pseudo-console (black background, monospaced green/amber text) for the admin panel as a nod to the developer console in HL1.
- **Sound (optional)**: short techy UI blips on click/success/error — **self-composed or from royalty-free libraries**, not excerpts from Valve games.
- **Icons**: a geometric, "military-technical" set (Lucide/Phosphor with a thick stroke-width work well), not pixel-art sprites from the games themselves.

### 8.2 What Not To Do (Legally and Taste-Wise)

- Do not use Valve/Half-Life/Counter-Strike logos, the games' original fonts (they are not freely redistributable), or extracted textures/sprites from game files — that is someone else's intellectual property.
- Do not copy the HUD of a specific game pixel-for-pixel — the goal is referencing the "vibe", not forking assets.
- Covers of the games being rolled (Steam capsule images, etc.) — use official CDN links via the API; this is standard practice for game catalogs/trackers.

---

## 9. Implementation Plan by Phases

Each phase must end with a working deployment to Vercel (even with placeholders where functionality is not yet ready).

**Phase 0 — Initialization**

- [ ] `pnpm create next-app` (TS, App Router, Tailwind), basic ESLint/Prettier/Husky.
- [ ] Create a Supabase project (staging), connect the CLI, `supabase init`.
- [ ] Connect the repository to Vercel, configure env vars for preview/production.
- [ ] Set up GitHub Actions: lint + typecheck + unit tests on every PR.

**Phase 1 — Data and Auth**

- [ ] Write `drizzle/schema.ts`, generate and apply the first migration (section 5.2).
- [ ] RLS policies (5.3).
- [ ] Supabase Auth: email + Twitch OAuth, `profiles` creation trigger.
- [ ] Mechanism for assigning the first `admin` role (bootstrap script/manual operation).

**Phase 2 — Game Engine (Domain)**

- [ ] `game-engine/dice.ts` — roll generation based on config.
- [ ] `game-engine/movement.ts` — computing the new position taking point balance and outcome type into account.
- [ ] `game-engine/roll-state-machine.ts` — transitions `rolled → in_progress → passed/dropped/rerolled`.
- [ ] Unit tests for all branches (including edge cases: negative balance, finish cell, reroll limit).

**Phase 3 — Public MVP**

- [ ] Pages: current-season landing, board (static render without animations), leaderboard, player profile, event feed, rules.
- [ ] Basic realtime subscription to `event_log`/`season_players` for the leaderboard and feed.

**Phase 4 — Player Game Loop**

- [ ] Personal dashboard: current roll, outcome buttons.
- [ ] Server Action `resolveGameRoll` calling use-case → domain → repositories, with server-side random number generation.
- [ ] Dice roll animation on the client (visuals; final value comes from the server).

**Phase 5 — Admin Panel**

- [ ] Season CRUD + status changes + cloning config/board from the previous season.
- [ ] Board editor (cell list, types, drag-n-drop ordering).
- [ ] Season player management + manual adjustments with mandatory logging.
- [ ] Game catalog: manual addition + import via Steam/IGDB API.
- [ ] Audit log (read-only view over `admin_audit_log`).

**Phase 6 — Polish and Design**

- [ ] HUD theme (section 8) on top of shadcn components, dark theme as the only/default one.
- [ ] Mobile responsiveness (viewer traffic).
- [ ] Accessibility: contrast, `prefers-reduced-motion`, focus states.

**Phase 7 — Deployment, Monitoring, Documentation**

- [ ] Production Supabase project, migrations applied, RLS verified.
- [ ] Vercel Analytics/Sentry (optional).
- [ ] [README.md](README.md) with setup instructions, [RUNBOOK.md](RUNBOOK.md) — how to start a new season on event day.

**Phase 8 — Backlog/Extensions (After MVP)**

- [ ] Item and effect inventory (plugin registry, section 6.4).
- [ ] Dailies/quests.
- [ ] Internal currency and shop.
- [ ] Global modifier events.
- [ ] Discord/Telegram broadcast of the event feed.
- [ ] Multi-season statistics and a "hall of fame".
- [ ] Extracting `game-engine` into a separate pnpm package if a second consumer appears (bot, etc.).

---

## 10. Illustrative TypeScript Domain Contracts

```ts
// game-engine/types.ts
export interface SeasonConfig {
  dice: {
    sides: number;
    passDiceCount: number;
    dropDiceCount: number;
    dropStreakMultiplier: boolean;
  };
  points: {
    startingBalance: number;
    bonusAddsToRollOnPass: boolean;
    resetBalanceAfterUse: boolean;
  };
  board: { size: number; loop: boolean };
  rerolls: { allowed: boolean; limitPerGame: number };
}

export type RollOutcome = "passed" | "dropped" | "rerolled";

export interface MovementInput {
  currentPosition: number;
  balancePoints: number;
  outcome: Exclude<RollOutcome, "rerolled">;
  streakPass: number;
  streakDrop: number;
  config: SeasonConfig;
  rng: () => number; // injected externally for testability and server-side generation
}

export interface MovementResult {
  diceResults: number[];
  newPosition: number;
  newBalancePoints: number;
  newStreakPass: number;
  newStreakDrop: number;
}

export function resolveMovement(input: MovementInput): MovementResult {
  // reference implementation: see the rules in section 6.2
  throw new Error("not implemented");
}

```

```ts
// lib/use-cases/resolve-game-roll.ts (sketch)
export async function resolveGameRoll(params: {
  gameRollId: string;
  outcome: RollOutcome;
  actorUserId: string;
}) {
  // 1. load game_roll + season_player + season.config via repositories
  // 2. verify that actorUserId owns this season_player (or is staff)
  // 3. if outcome === 'rerolled' -> just a new game roll, no engine involved
  // 4. otherwise -> game-engine.resolveMovement(...) with server-side rng
  // 5. save moves/ledger_entries/game_rolls.status in one transaction
  // 6. write to event_log
  // 7. return the result for realtime broadcast
}

```

---

## 11. Open Questions (To Resolve Before/During Implementation)

These items do not block the start of development — the engine and schema are designed so answers can be provided later via configuration — but they should be clarified before Phase 5:

1. Exact starting rules: how many dice sides, how many cells on the board, penalties/bonuses of specific cells — the suggestion is to take the defaults from section 6.2 and adjust after the first test run.
2. Whether an explicit "judge" is needed as a separate role from day one, or a single `admin` role suffices at the start.
3. Source of the game catalog: only the Steam libraries of specific participants, or an arbitrary list of platforms (retro consoles, etc., as in the RGG genre).
4. Whether Twitch integration (OAuth for login, OBS overlay) is needed already in the MVP, or can be added later.
5. Monetization/donations — not designed in the MVP, but if needed (donation-triggered modifiers, etc.), it would be laid in as a separate transaction table by analogy with `ledger_entries`.
