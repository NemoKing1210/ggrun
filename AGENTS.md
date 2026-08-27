# Repository Guidelines

> **Author:** [NemoKing1210](https://github.com/NemoKing1210) · **Repository:** [github.com/NemoKing1210/ggrun](https://github.com/NemoKing1210/ggrun) · **Issues:** [github.com/NemoKing1210/ggrun/issues](https://github.com/NemoKing1210/ggrun/issues)

## Project Overview

GGRun — a web platform for a seasonal gaming event (HPG genre): seasons
("runs"), a board of cells, random game rolls, outcomes (passed/dropped/rerolled),
dice rolls and movement across the board, a leaderboard, an event feed, and an
admin console.

> **Design System:** All UI must follow [`DESIGN.md`](./DESIGN.md) — HUD tactical style (square beveled, clipped corners, `hud-card`/`hud-btn`/`hud-input`/`Badge`/`Chip`/`Switch`/`Range`). Do not introduce rounded pills, soft shadows, or raw checkboxes/inputs outside `components/ui/*` and `app/globals.css`. See `DESIGN.md` §9 for Do/Don’t.

## Language Policy (always applies)

This is an international project. **English is the only language for:**

- all markdown documentation (`README.md`, `RUNBOOK.md`, `CHANGELOG.md`,
  `AGENTS.md`) — including future edits to them;
- all code comments and JSDoc in every `.ts`/`.tsx`/`.css` file;
- commit messages, CLI output of `scripts/*`, zod validation messages,
  DB default values, demo/seed content.

**The only multilingual text is site translations** — string values inside
`lib/i18n/dictionaries/{en,ru,uk}/` (and the native locale display names in
`lib/i18n/config.ts`). Never write UI strings, comments, or docs in Russian or
Ukrainian outside those places. When editing files that already contain
Russian/Ukrainian comments, translate them to English in the same change.

## Architecture & Data Flow

Four layers; imports point strictly downward:

```
app/ (route groups)  +  thin "use server" actions   ← presentation
lib/use-cases/          zod-validate → domain → tx  ← application
game-engine/            pure TS, game rules         ← domain
lib/repositories/, lib/db.ts, lib/auth/             ← infrastructure
```

- **Domain invariant**: `game-engine/` must not import `next/*`, `react`,
  `drizzle-orm`, `pg`. Enforced by convention (doc comments in
  `game-engine/index.ts`, `types.ts`); there is no ESLint rule — do not add
  such imports.
- **Randomness is server-only**: the engine takes an injected
  `rng: () => number` (DI for testability); use-cases pass `Math.random` —
  the client can never fake dice.
- **Errors as codes**: use-cases throw `GameLoopError(code)` /
  `AdminError(code, params)` / `AuthError(code)`; `"use server"` actions catch
  them and translate via `errorText(t.core.errors, code, params)`
  (`lib/i18n/errors.ts`). The domain never knows about UI languages.
- **Two-tier audit**: `logAdminAction` → `admin_audit_log` (every staff
  mutation, viewable at `/admin/audit`); `logEvent` → `event_log` (public
  feed). Both are written inside the same use-case transactions.

Turn flow: `rollAction` → `rollNewGame` (random catalog game, excluding
blacklist and already-played) → player marks the outcome → `resolveAction` →
`resolveGameRoll` → `resolveMovement` (engine) → `applyCellEffect` +
`normalizePosition` → transaction: `game_rolls` + `moves` + `ledger_entries` +
`event_log`.

## Key Directories

| Path | Purpose |
| --- | --- |
| `app/(public)/` | Public shell: landing, `/board`, `/leaderboard`, `/feed`, `/rules`, `/players/[username]`, `/login`, `/register`, `/dashboard` |
| `app/admin/` | Admin console (own layout-guard): dashboard, `seasons/` + `seasons/[id]/{board,players}`, `users`, `games-catalog`, `audit` |
| `game-engine/` | Domain: `dice.ts`, `movement.ts`, `roll-state-machine.ts`, `cell-effects.ts`, `config.ts`, `types.ts` + colocated `*.test.ts` |
| `lib/use-cases/` | Business logic: `resolve-game-roll.ts`, `admin.ts`, `users.ts`, `auth.ts` + `*-actions.ts` (server actions) |
| `lib/repositories/` | DB access: `seasons.repo.ts`, `players.repo.ts`, `games.repo.ts`, `events.repo.ts` |
| `lib/auth/` | `session.ts` (cookie sessions, sha256 tokens), `password.ts` (scrypt), `actions.ts`, `dev-login.ts` (dev-only) |
| `lib/i18n/` | `config.ts`, `server.ts` (`getT()`), `client.tsx` (`useI18n`), `format.ts`, `widen.ts`, `errors.ts`, `dictionaries/{en,ru,uk}/` |
| `db/schema.ts` | Drizzle schema — the source of truth for types (12 tables, 5 pg enums) |
| `drizzle/` | Generated SQL migrations |
| `scripts/` | `bootstrap-admin.ts`, `seed-demo.ts` (tsx + dotenv) |

## Development Commands

```bash
pnpm install
pnpm dev                        # next dev --turbopack, port 3000
pnpm build                      # next build --turbopack
pnpm lint                       # eslint (flat config)
pnpm test                       # vitest run (domain)

# Database helpers (all scripts load .env with override, so a stale
# DATABASE_URL exported in the shell can never shadow the project .env):
pnpm db:status                  # connectivity + server info + row counts per table
pnpm db:generate                # drizzle-kit generate (SQL migration into drizzle/)
pnpm db:push                    # drizzle-kit push --force (apply schema to the DB)
pnpm db:seed                    # demo season run-1, 40-cell board, 8 games (idempotent)
pnpm db:admin                   # first admin from BOOTSTRAP_ADMIN_* in .env
pnpm db:reset                   # drop public schema + re-apply schema (asks to type YES)
pnpm db:setup                   # full fresh-DB bootstrap: push + seed + admin

pnpm drizzle-kit generate       # equivalent of pnpm db:generate
```

DB: PostgreSQL 17 (OSPanel) at `127.127.126.56:5432`, database `ggrun`.
Env vars — see `.env.example` (`DATABASE_URL`, `AUTH_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`; Steam/IGDB —
backlog).

## Code Conventions & Common Patterns

- **Where to put what**: business logic lives only in `lib/use-cases/*`.
  `*-actions.ts` files marked `"use server"` are thin FormData adapters:
  parse → try/catch use-case → `{error?}`/`{ok?}` (the shape for
  `useActionState`, first argument `_prev`) → `revalidatePath` on success.
  Simple actions (`logoutAction`, `blockUserAction`) are void
  `<form action={...}>` handlers without useActionState.
- **i18n is mandatory for UI strings**: server components use
  `const { t, locale } = await getT()` → `t.namespace.key`; client components
  use `useI18n()` (provider in `app/layout.tsx`). Interpolation only via
  `format("template {x}", { x })` (`lib/i18n/format.ts`). Adding a language:
  copy `lib/i18n/dictionaries/en/*.ts` into a new folder, annotate with
  `Widen<typeof EnNs.ns>`, register in `LOCALES` (`config.ts`) and
  `dictionaries/index.ts`.
- **Dictionaries are RSC-serializable**: values are strings only, no
  functions; `pickCore()` in `dictionaries/index.ts` assembles a plain object
  from the core exports. `Widen<T>` (`lib/i18n/widen.ts`) widens en as-const
  literals to `string`, so ru/uk must match the structure, not the literals.
- **Confirm in server forms**: the client-side
  `components/admin/ConfirmButton.tsx` (onClick → `window.confirm` →
  `preventDefault` on cancel). A server component cannot pass `onSubmit` —
  don't try.
- **Guards**: `app/admin/layout.tsx` redirects non-staff; `requireAdmin`
  (`lib/use-cases/users.ts`) is stricter than `requireStaff` — judges cannot
  manage users. Self-block/self-delete/self-demote are forbidden
  (`adminSelf*` codes).
- **Season statuses**: an explicit transition map
  `draft→active→paused→finished→archived` (`lib/use-cases/admin.ts`);
  moving to `active` resets participant positions/balances. Roll FSM
  `rolled→in_progress→passed|dropped|rerolled`; the use-case treats `rolled`
  as `in_progress` at the moment the outcome is marked (`effectiveStatus`).
- **Versioning & changelog**: the version lives in `package.json`
  (`version`) and `CHANGELOG.md` (Keep a Changelog format); both are updated
  in a single release commit `chore(release): vX.Y.Z`. Semver rules: PATCH —
  fixes/styles/docs without behavior changes; MINOR — new features and
  additive schema migrations; MAJOR — breaking changes (feature removal,
  config/schema format changes requiring manual actions). While `0.x`,
  breaking changes bump MINOR and are marked **BREAKING**. New entries go
  into the `[Unreleased]` section and are promoted to a version on release.
- **Formatting**: Prettier (double quotes, semi, 100 cols), ESLint
  `next/core-web-vitals` + `next/typescript` + prettier. Commits follow
  conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `style:`).
- **No narration comments**: when editing code, do not leave comments that
  narrate or justify the change ("was X, now Y", "fixes scrollbar flash",
  step-by-step explanations of the edit). Explain *why* in the commit message
  (and in `DESIGN.md` / `CHANGELOG.md` when it affects the design system or
  behavior). Keep only timeless comments that match the existing comment style
  of the file; when in doubt, no comment.

## Important Files

- `db/schema.ts` — all tables/enums/types (`$inferSelect`); schema edits →
  `drizzle-kit generate` + `push`.
- `game-engine/config.ts` — `DEFAULT_SEASON_CONFIG` + `SeasonConfigSchema`
  (Zod, parses the partial JSONB from `seasons.config`).
- `game-engine/cell-effects.ts` — the `CELL_EFFECTS` plugin registry (key is
  the cellType or `config.effectKey`; penalty/bonus read `config.amount`,
  teleport reads `config.target`; unknown keys → no-op). The extension point
  for new mechanics without migrations.
- `game-engine/roll-state-machine.ts` — `nextRollStatus` throws `RangeError`
  on illegal transitions; `canReroll` / `requestReroll` are pure helpers.
- `lib/db.ts` — pg pool (max 10, cached on globalThis in dev) + drizzle with
  the schema.
- `lib/auth/session.ts` — `getCurrentUser()` (React `cache()`, filters out
  `isBlocked`), `isStaff` = admin|judge.
- `app/admin/layout.tsx`, `app/(public)/layout.tsx` — two shells with
  different headers.

## Runtime/Tooling Preferences

- **License — MIT** (`LICENSE`); the project is `private: true` in
  `package.json` — public distribution is not planned, but the code may be
  reused within the team.
- **Package manager — pnpm** (lockfile v9). Node ≥ 20.
- Next 15.5 App Router, React 19, Turbopack in both dev and build. TS strict,
  `@/*` → repo root.
- Tailwind v4 via `@tailwindcss/postcss` (no separate config file; the HUD
  theme lives as CSS variables and the `hud-*`/`ammo-counter`/`hazard-tape`
  classes in `app/globals.css`).
- Windows/OSPanel environment: the DB is started by the OSPanel module; don't
  hardcode absolute paths in code.
- No CI; husky/lint-staged are in devDeps but pre-commit hooks are not wired
  up — don't rely on them.

## Testing & QA

- **Vitest**, colocated files: `game-engine/<module>.test.ts`. Run:
  `pnpm test`.
- All domain branches are covered: dice (faces/validation), movement
  (passed/dropped, balance consumption, streak multiplier, clamp vs wrap),
  FSM (legal/illegal transitions, reroll limit), cell effects (all types +
  plugin routing by `effectKey`), Zod config (defaults/rejections). Style:
  pure deterministic functions with an injected `rng`, no mocks/DB/DOM.
- There are no tests outside `game-engine/`; when adding UI tests keep them
  next to the module under test and keep the DB out of them.
- Before handing off changes: `pnpm lint` + `pnpm exec tsc --noEmit` +
  `pnpm test` + `pnpm build`; verify behavioral changes against a live dev
  server.
