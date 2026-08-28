# DEVELOPMENT 

Everything an engineer needs to work on this codebase: architecture,
conventions, commands, design rules and release workflow.

---

## 1. Stack

- **Next.js 15.5** (App Router), **React 19**, **Turbopack** for dev and build.
- **TypeScript strict**, `@/*` → repo root, flat ESLint + Prettier.
- **Tailwind CSS v4** via `@tailwindcss/postcss`; the HUD theme lives as CSS
variables + `hud-*` classes in `app/globals.css` (no `tailwind.config`).
- **Drizzle ORM + PostgreSQL 17**, **pg** as driver, **pnpm 9** (lockfile v9),
Node ≥ 20.
- **Vitest** for domain unit tests (colocated `*.test.ts`, engine only).

> **Design system:** all UI must follow [`DESIGN.md`](./DESIGN.md) — HUD
> tactical style: square beveled controls, clipped corners, no rounded pills,
> no soft shadows, amber = interactive. Do not introduce new input/badge
> shapes outside `components/ui/*` and `app/globals.css`.

---

## 2. Architecture

Four layers; imports point strictly downward:

```
app/ (route groups)  +  thin "use server" actions   ← presentation
lib/modules/*/        zod-validate → domain → tx  ← application (vertical slices)
lib/engine/            pure TS, game rules         ← domain
lib/infrastructure/    db, auth, http, logger       ← infrastructure
```

Shared cross-cutting code lives in `lib/shared/` (leaf), `lib/config/` (env),
`lib/errors/` (AppError + codes), `lib/use-cases/` (cross-module adapters),
`lib/i18n/` (translations).

Non-negotiable rules:

- `lib/engine/` must not import `next/*`, `react`, `drizzle-orm` or `pg`
(enforced by ESLint `no-restricted-imports`).
- Randomness is server-only: the engine takes an injected `rng: () => number`
(DI for testability); use-cases pass `Math.random`.
- Errors as codes: `GameLoopError(code)` / `AdminError(code, params)` /
`AuthError(code)`; `"use server"` actions catch and translate via
`errorText(t.core.errors, code, params)`. The domain never knows about UI
languages.
- Two-tier audit: `logAdminAction` → `admin_audit_log` (every staff mutation,
viewable at `/admin/audit`); `logEvent` → `event_log` (public feed). Both
are written inside the same use-case transactions.

### Turn flow (canonical example)

`rollAction` → `rollNewGame` (random catalog game, excluding blacklist and
already-played) → player marks the outcome → `resolveAction` →
`resolveGameRoll` → `resolveMovement` (engine) → `applyCellEffect` +
`normalizePosition` → transaction: `game_rolls` + `moves` + `ledger_entries` +
`event_log`.

### Key directories


| Path                                | Purpose                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/(public)/`                     | Public shell: landing, `/board`, `/leaderboard`, `/feed`, `/rules`, `/players/[username]`, `/login`, `/register`, `/dashboard`                                        |
| `app/admin/`                        | Admin console: dashboard, `seasons/` + `seasons/[id]/{board,players}`, `users`, `games-catalog`, `audit`, `moderation`, `settings`                                    |
| `lib/engine/`                       | Domain (pure TS): `types/`, `config/` (Zod `SeasonConfigSchema`), `dice/`, `board/{movement,cell-effects}`, `roll/` (FSM), `index.ts`; colocated `*.test.ts`          |
| `lib/modules/*/`                    | Vertical slices: `auth`, `season`, `player`, `game`, `catalog`, `moderation`, `site-settings` — each with `repository/` + `service/` + `actions/` + `index.ts` barrel |
| `lib/use-cases/`                    | Cross-module adapters only: `admin/actions/{helpers,types}`, `shared/action-error`                                                                                    |
| `db/schema.ts` (now `db/schema/**`) | Drizzle schema — single source of truth (12 tables, 5 pg enums)                                                                                                       |
| `scripts/`                          | `bootstrap-admin.ts`, `seed-demo.ts`, `db-reset.ts`, `db-status.ts`, `enrich-catalog.ts` (tsx + dotenv)                                                               |


---

## 3. Commands

```bash
pnpm dev                # next dev (webpack — Turbopack dev has a Windows-only
                        # _buildManifest.js.tmp ENOENT race; use dev:turbo to opt back in)
pnpm dev:turbo          # next dev --turbopack
pnpm build              # next build --turbopack
pnpm start              # next start (production server)
pnpm lint               # eslint (flat config)
pnpm test               # vitest run (domain tests)
pnpm exec tsc --noEmit  # type check

pnpm db:status          # connectivity + row counts
pnpm db:generate        # drizzle-kit generate (SQL migration into drizzle/)
pnpm db:push            # drizzle-kit push --force (apply schema)
pnpm db:seed            # demo season run-1, 40-cell board, 8 games (idempotent)
pnpm db:admin           # first admin from BOOTSTRAP_ADMIN_* in .env
pnpm db:reset           # drop public schema + re-apply (asks to type YES)
pnpm db:setup           # fresh bootstrap: push + seed + admin
```

All `db:*` scripts load `.env` with `override: true` — a stale `DATABASE_URL`
exported in the shell can never shadow the project `.env`.

### Environment

See [`.env.example`](./.env.example): `DATABASE_URL` (PostgreSQL 17, OSPanel
`127.127.126.56:5432`, db `ggrun` in the reference setup), `AUTH_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`; Steam/IGDB/RAWG
keys are optional.

---

## 4. Code conventions &amp; common patterns

- **Business logic** lives only in `lib/modules/*/service`. Actions in
`lib/modules/*/actions/*.ts` are thin `"use server"` adapters.
- **Form actions** come in two flavors:
  - `useActionState`-shaped for rich forms — `(_prev, formData) → {error?}/{ok?}`, used through `FormShell` (error/success display + pending
  state) or the pattern in `AddSeasonPlayer` / `GamesCatalogManager`
  modals.
  - **void form actions** for simple controls — `(formData) => Promise<void>`
  with `log.error` + rethrow and `revalidatePath` (e.g.
  `toggleBlacklistAction`, row-level forms in the roster table that use the
  HTML `form="..."` attribute to associate inputs across a table row).
  - Revalidate via `revalidateAdmin(seasonId)` (covers `/admin`,
  `/admin/seasons`, and the season's settings/board/players routes).
- **i18n is mandatory for UI strings**: server components use
`const { t, locale } = await getT()`; client components use `useI18n()`.
Interpolation only via `format("template {x}", { x })`. Adding a language:
copy `lib/i18n/dictionaries/en/*.ts`, annotate with
`Widen<typeof EnNs.ns>`, register in `LOCALES` and `dictionaries/index.ts`.
ru/uk dictionaries must match the en **structure**, not the literals
(see `lib/i18n/widen.ts`).
Note: ru/uk are all lower-case strings — never write UI strings in Russian
or Ukrainian outside `lib/i18n/dictionaries/*/` and code comments stay in
English.
- **Confirm destructive server forms**: `components/admin/ConfirmButton.tsx`
(`window.confirm` on click, `preventDefault` on cancel). A server component
cannot pass `onSubmit` — don't try.
- **Guards**: `app/admin/layout.tsx` redirects non-staff; `requireAdmin` is
stricter than `requireStaff` — judges cannot manage users. Self-block /
self-delete / self-demote are forbidden (`adminSelf*` codes).
- **Season statuses** use an explicit transition map
`draft→active→paused→finished→archived` (`lib/modules/season/service`);
moving to `active` resets participant positions/balances. The roll FSM
(`lib/engine/roll/state-machine.ts`) is `rolled→in_progress→ passed|dropped|rerolled`; `canReroll`/`requestReroll` are pure helpers.
- **Cell effects** are pluggable: `CELL_EFFECTS` registry in
`lib/engine/board/cell-effects/` (key = cellType or `config.effectKey`);
unknown keys → no-op. New mechanics need no migrations.
- **Comment style**: no narration comments ("was X, now Y"); explain *why* in
the commit message / CHANGELOG / DESIGN.md. Keep timeless comments matching
the file's existing style.

---

## 5. Design system (short version)

Read `DESIGN.md` before writing UI. Summary:

- **Do:** `Input/Select/Textarea/Chip/Badge/Switch/Range/Field` from
`components/ui`; `hud-card`, `hud-btn`, clipped corners `polygon(...)`;
`font-display` (stencil) for headings/numbers, `font-mono` for codes.
- **Don't:** `rounded-full`/`rounded-md`/pill chips, raw
`input[type=checkbox]` (use `Switch`), soft shadows, pastel colors,
JSON textareas for admin config (use templates/chips/switches/ranges).
- Alerts: `hud-card` + `border-danger/30 bg-danger/10` (error) or
`border-emerald-800 bg-emerald-950/30` (success), clip 4px.
- Motion: 120–240ms ease-out on `transform/opacity/filter` only; respect
`prefers-reduced-motion`; use `components/ui/PageTransition.tsx` for route
transitions (never per-page entrance animations).

---

## 6. Data layer &amp; migrations

- `db/schema/**` is the source of truth. After schema edits:
`pnpm db:generate` (creates a numbered SQL migration in `drizzle/`) then
`pnpm db:push` (applies it). Commit both the schema change and the
migration.
- Local DB: PostgreSQL 17 via OSPanel (`127.127.126.56:5432`, database
`ggrun`); never hardcode absolute paths in code.

---

## 7. Testing

- **Vitest**, colocated: `lib/engine/<module>.test.ts`. Run: `pnpm test`.
- All domain branches are covered: dice, movement (passed/dropped, balance
consumption, streak multiplier, clamp vs wrap), roll FSM (legal/illegal
transitions, reroll limit), cell effects (all types + plugin routing),
Zod config (defaults/rejections). Style: pure deterministic functions with
an injected `rng` — no mocks/DB/DOM.
- There are no tests outside `lib/engine/`. If you add UI tests, keep them
next to the module under test and keep the DB out of them.
- Before handing off changes: `pnpm lint` + `pnpm exec tsc --noEmit` +
`pnpm test` + `pnpm build`; verify behavioral changes against a live dev
server.

---

## 8. Git &amp; releases

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `style:`,
`refactor:`.
- **Versioning**: the version lives in `package.json` and `CHANGELOG.md`
(Keep a Changelog format) and both update in a single release commit
`chore(release): vX.Y.Z`. New entries go in `[Unreleased]` and are promoted
on release. While `0.x`, breaking changes bump MINOR and are marked
**BREAKING** (details at the bottom of `CHANGELOG.md`).
- No CI; husky/lint-staged are installed but pre-commit hooks are **not**
wired — don't rely on them.
- PowerShell note: LF→CRLF warnings from git are cosmetic (see
`.gitattributes` for shell scripts).

