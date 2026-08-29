# AGENTS.md — GGRun agent guide

> How to work on this codebase fast and without breaking it. Read this before
> any edit; read [`DESIGN.md`](./DESIGN.md) before any UI work.

## 1. 30-second orientation

GGRun = web platform for a seasonal gaming event (HPG): seasons ("runs"),
a board of cells, random game rolls with passed/dropped/rerolled outcomes,
dice movement, leaderboard, public feed, player HQ and an admin console.

- **Next.js 15.5** (App Router, RSC + server actions), **React 19**, **Turbopack**
  (dev + build), **TS strict**, `@/*` → repo root.
- **Tailwind v4** via `@tailwindcss/postcss` (theme = CSS vars + `hud-*`
  classes in `app/globals.css`; no config file).
- **PostgreSQL 17 + Drizzle** (`db/schema/**` is the source of truth),
  **pnpm 9** (lockfile v9), **Node ≥ 20**, **Vitest**.
- HUD tactical design system — square beveled, clipped corners, amber accent.
  `DESIGN.md` is the source of truth for visuals.

## 2. Golden rules (never break)

1. **Layer direction** — imports point strictly downward:

   ```
   app/ (pages) + thin "use server" actions        ← presentation
   lib/modules/*/ (repository/service/actions)     ← application (vertical slices)
   lib/engine/    pure TS, game rules              ← domain
   lib/infrastructure/ (db, auth, http, events)    ← infrastructure
   ```

   Cross-cutting leaf code: `lib/shared/` (ui/utils/constants/stores),
   `lib/config/`, `lib/errors/`, `lib/use-cases/` (adapters only), `lib/i18n/`.

2. **`lib/engine/` stays pure** — no `next/*`, `react`, `drizzle-orm`, `pg`
   (enforced by ESLint `no-restricted-imports`; do not bypass).

3. **Randomness is server-only** — the engine takes an injected `rng` (DI for
   tests); use-cases pass `Math.random`. The client can never fake dice.

4. **Errors as codes** — `GameLoopError(code)` / `AdminError(code, params)` /
   `AuthError(code)`; actions catch and translate via
   `errorText(t.core.errors, code, params)`. Domain never knows UI languages.

5. **Two-tier audit** — every staff mutation → `logAdminAction`
   (`admin_audit_log`, visible at `/admin/audit`); public events →
   `logEvent` (`event_log`). Written inside the same use-case transactions.

6. **i18n is mandatory** for every UI string (see §7). English is the only
   language for docs, comments, commit messages, zod messages, seeds.

7. **Design system is law** — raw checkboxes, rounded pills, soft shadows are
   off-policy (see §6).

## 3. Command line

```bash
pnpm dev            # next dev (webpack). Turbopack dev = pnpm dev:turbo
                    # (plain dev is the default because Turbopack dev has a
                    # Windows-only _buildManifest.js.tmp ENOENT race)
pnpm build          # next build --turbopack
pnpm start          # production server
pnpm lint           # eslint (flat config)
pnpm exec tsc --noEmit
pnpm test           # vitest (engine only)

pnpm db:status      # connectivity + row counts
pnpm db:generate    # SQL migration into drizzle/
pnpm db:push        # apply schema (drizzle-kit push --force)
pnpm db:seed        # demo season run-1 (idempotent)
pnpm db:admin       # first admin from BOOTSTRAP_ADMIN_* (idempotent)
pnpm db:reset       # drop schema + re-apply (asks to type YES)
pnpm db:setup       # push + seed + admin
```

Production/deploy specifics: `Dockerfile` + `compose.yaml` +
`docker/entrypoint.sh` (see [`DEPLOYMENT.md`](./DEPLOYMENT.md)). Container
Postgres maps to host port `5433`.

## 4. Codebase map (current)

| Path | Contents |
| --- | --- |
| `app/(public)/` | Landing, `/board`, `/leaderboard`, `/feed`, `/rules`, `/seasons` + `/seasons/[slug]/{board,leaderboard,feed,rules}`, `/players/[username]`, `/login`, `/register`, `/dashboard`, `/settings` |
| `app/admin/` | `layout.tsx` (staff guard + nav + moderation-pending badge), dashboard, `seasons` + `seasons/[id]/{board,players}`, `users`, `games`, `audit`, `moderation`, `settings` |
| `lib/modules/` | Vertical slices: `auth`, `season`, `player`, `game`, `catalog`, `moderation`, `site-settings` — each `repository/ + service/ + actions/ + index.ts` |
| `lib/engine/` | Pure domain: `types/`, `config/` (Zod `SeasonConfigSchema`), `dice/`, `board/{movement,cell-effects}`, `roll/` (FSM), `index.ts`; colocated `*.test.ts` |
| `lib/infrastructure/` | `db/` (pg pool + drizzle), `auth/` (`session.ts`, `password.ts` scrypt), `events/` (audit + feed), `logger/` |
| `lib/use-cases/admin/actions/` | `helpers.ts` (`toError`, `revalidateAdmin`), `types.ts` (`AdminFormState`) |
| `components/ui/` | `Input, Select, Textarea, Field, Badge, Chip, Switch, Range, Modal, BackLink, PageContainer, status, DebugError, ImageCropper, breadcrumbs…` |
| `components/admin/`, `components/seasons/`, `components/game/`, `components/board/`, `components/dice/` | Screen-level components |
| `db/schema/` | 12 tables, 5 pg enums (split files: users, seasons, players, games, moves, moderation, events, settings) |
| `scripts/` | `seed-demo.ts`, `bootstrap-admin.ts`, `db-reset.ts`, `db-status.ts`, `enrich-catalog.ts` (tsx + dotenv) |

Key component/file pointers:

- Season editor tabs: `components/admin/SeasonTabs.tsx` (server, `getT`).
  Public season tabs: `components/seasons/SeasonTabs.tsx` (client).
- Player management: `components/admin/AddSeasonPlayer.tsx` (client, live
  filter + `useActionState`), roster table in
  `app/admin/seasons/[id]/players/page.tsx` (per-row `form=` pattern).
- Games catalog manager: `components/admin/GamesCatalogManager.tsx`
  (bulk console, import-by-URL modal, external search modal).
- Admin header nav badge: `components/layout/AdminHeader.tsx`
  (`moderationPending` prop, fed by `app/admin/layout.tsx` queries).
- `revalidateAdmin(seasonId)` already covers `/admin/seasons/[id]` **and** its
  `/board` + `/players` subroutes — don't add manual `revalidatePath` there.

## 5. Task recipes (copy these steps)

### Add a server action — two flavors

- **Rich form (validation errors shown inline)** → `useActionState` shape:
  `(_prev: AdminFormState, formData: FormData) => Promise<AdminFormState>`,
  returns `{ok}` / `{error, debug}` via `toError(e, code, ctx)`. Wire through
  `FormShell` (renders error + pending) or a custom form like `AddSeasonPlayer`.
- **Simple control (button/icon)** → void shape:
  `(formData: FormData) => Promise<void>`; `try/catch` with `log.error` +
  **rethrow**, then `revalidateAdmin(seasonId)` /
  `revalidatePath("/admin/…")` (pattern: `toggleBlacklistAction`,
  `removePlayerFromSeasonAction`).
- Never pass a 2-arg `useActionState` action to `<form action={…}>` — TS
  rejects it and it breaks at runtime.

### Edit the schema

1. Edit `db/schema/<file>.ts` → 2. `pnpm db:generate` (creates migration in
   `drizzle/`) → 3. `pnpm db:push` → 4. commit schema + migration together.
   `season_players` children cascade on delete (`moves`, `game_rolls`,
   `ledger_entries`, moderation tables) — deleting a participant wipes their
   history by design.

### Add UI

1. Follow `DESIGN.md`; use `components/ui/*` (never raw checkboxes → `Switch`,
   never `rounded-*`).
2. All labels go through dictionaries **en/ru/uk** in the same change
   (§7). Server: `const { t, locale } = await getT()`. Client: `useI18n()`.
3. Confirm destructive actions via `components/admin/ConfirmButton.tsx`
   (server forms can't pass `onSubmit`). It now spreads extra button attrs
   (`aria-label`, `title`).
4. Admin pages must be reachable through the guard in
   `app/admin/layout.tsx`; staff-only vs admin-only via `requireStaff` /
   `requireAdmin` (judges cannot manage users).

### Add a game mechanic (no migration needed)

Register in the `CELL_EFFECTS` plugin registry
(`lib/engine/board/cell-effects/index.ts`) — key = cellType or
`config.effectKey`; penaltys/bonus read `config.amount`, teleport reads
`config.target`; unknown keys are no-ops. Add engine unit tests next to the
file.

### Add i18n keys or a language

- Keys: add to `lib/i18n/dictionaries/{en,ru,uk}/<ns>.ts` **all three at once**
  (en is the source of truth; ru/uk must match the structure via
  `Widen<typeof EnNs.ns>`, not the literals).
- Language: copy `en/*` → new folder, translate, register in `LOCALES` +
  `LOCALE_LABELS` (`lib/i18n/config.ts`) and `dictionaries/index.ts`.
  `pickCore()` must stay RSC-serializable (strings only, no functions).

### Change behavior that affects users

Follow the canonical turn flow: `rollAction → rollNewGame → resolveAction →
resolveGameRoll → resolveMovement (engine) → applyCellEffect +
normalizePosition` inside one transaction (`game_rolls + moves +
ledger_entries + event_log`). Season statuses follow the transition map
`draft→active→paused→finished→archived` (activating resets participants);
the roll FSM lives in `lib/engine/roll/state-machine.ts`
(`rolled→in_progress→passed|dropped|rerolled`).

### Deploy / run in Docker

`docker compose up --build`; on boot the entrypoint waits for Postgres,
runs `db:push`, then optional `db:seed` (`SEED_DEMO=true`) and `db:admin`
(`BOOTSTRAP_ADMIN_*`). Container DB maps to host `5433`. Env template:
`docker/env.example`. Full detail in `DEPLOYMENT.md`.

## 6. UI pitfalls (all seen in this codebase — don't repeat)

- **`overflow-x-auto` flashes a scrollbar** — it makes `overflow-y` compute to
  `auto`. For tab rows / nav strips use `flex-wrap` (or `overflow-x-clip`)
  instead of `overflow-x-auto`.
- **Raw `<input type="checkbox">`** — off-policy; use `Switch` for booleans,
  or the catalog's checked-style for table row selection.
- **Text arrows as icons** — never render raw Unicode arrows (`→`, `←`, `↑`, `↓`,
  `⇒`, …) as button/link affordances or element separators (e.g.
  `view profile →`, `<span>→</span>` between two values). Use Heroicons instead
  (`ArrowRightIcon` / `ArrowLeftIcon` from `@heroicons/react/24/outline`). Raw
  arrows are OK only inside prose/dictionary strings, code comments and compact
  data labels (e.g. `"Settings → Integrations"`, `"{from} → {to}"`).
- **Forms across table rows** — a `<form>` cannot wrap `<td>` cells: give
  inputs/buttons a `form="row-<id>"` attribute and render one hidden
  `<form id="row-<id>" action={…}>` per row after the table (see the roster
  page in the season editor). Void 1-arg actions only.
- **`NEXT_PUBLIC_*` is inlined at build time** — changing
  `NEXT_PUBLIC_SITE_URL` requires a rebuild (compose `build.args`).
- **`.env` with `override: true`** in scripts/drizzle — a stale exported
  `DATABASE_URL` can never shadow the project `.env`; the same loader makes
  env vars pass-through in containers (no `.env` file baked in).
- **Windows**: keep `docker/entrypoint.sh` LF via `.gitattributes`; git shows
  cosmetic LF→CRLF warnings on commit — harmless.

## 7. i18n quick rules

- Site languages: `en` (default), `ru`, `uk` — nothing else is registered.
- All prose goes to dictionaries; only HUD codes / brand names may be
  hardcoded (e.g. `// FILTER`, `ACTIONS`, `RAWG · IGDB`).
- Interpolation only via `format("template {x}", { x })`
  (`lib/i18n/format.ts`).
- Feed event types are rendered by `components/feed/feed-list.tsx` — adding a
  new `logEvent` type requires: `EventType` union
  (`lib/infrastructure/events/index.ts`), eventMeta/rendering cases, and
  `actions.*` text in en/ru/uk `feed.ts`.

## 8. Testing & verification

- Vitest, colocated in `lib/engine/` — pure deterministic functions with
  injected `rng`; no mocks/DB/DOM.
- No tests outside `lib/engine/`; UI tests (if added) stay colocated and DB-free.
- **Before handoff:** `pnpm lint` → `pnpm exec tsc --noEmit` → `pnpm test` →
  `pnpm build`; verify behavioral changes against a live dev server (admin
  flows included).

## 9. Git & releases

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `style:`),
  English messages. One logical change per commit; fetch whole-tree with
  `git add -A` when the user says "commit and push" — do not split or
  over-polish history.
- Version: `package.json` + `CHANGELOG.md` (Keep a Changelog), updated in one
  release commit `chore(release): vX.Y.Z`. While `0.x`, breaking changes bump
  MINOR and are marked **BREAKING** (exact rules at the bottom of
  `CHANGELOG.md`).
- No CI, husky not wired — run the checks yourself.

## 10. Environment & runtime notes

- Local DB: PostgreSQL 17 via OSPanel at `127.127.126.56:5432`, database
  `ggrun` (not a typo — it's the OSPanel-internal host).
- `.env` is git-ignored; `.env.example` documents every variable
  (`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`, optional RAWG/Steam/GameSpot/IGDB keys,
  `PROXY_URL`).
- Auth: cookie sessions, scrypt password hashes, `sessions` table; blocked
  users are filtered out by `getCurrentUser()`.
- The public feed filter tabs are fixed (rolls/passes/drops/moves/joins) —
  new event types render under “All” until a filter is added.

## 11. Docs map

| File | For |
| --- | --- |
| `README.md` (+ `translations/README.{ru,uk}.md`) | Project overview, features, quick start |
| `DEVELOPMENT.md` | Architecture, commands, conventions, testing, releases |
| `DEPLOYMENT.md` | Docker + manual production deployment, env reference |
| `CONTRIBUTING.md` | Issue/PR workflow, checklist |
| `DESIGN.md` | HUD design system (read before any UI) |
| `RUNBOOK.md` | Host guide for event day |
| `CHANGELOG.md` | Release history + versioning rules |