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
- **Vitest** for the whole test suite (colocated `*.test.ts(x)`, DB-free) —
  engine/modules/shared/i18n/infrastructure/realtime/components, plus
  source-level architecture invariants.

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
- **Uploaded bytes never live in the database.** Files go through
`lib/infrastructure/storage` (a driver port with `local` and `s3` backends,
chosen by `STORAGE_DRIVER`) and are described by a row in `files`; the
`lib/modules/files` slice owns categories, permissions and access links. The
DB stores a URL, never base64.
- Realtime (Socket.IO, same process + port via `server.ts`): publishers call
`publish(room, event, payload)` from `lib/realtime/bus.ts` (fire-and-forget,
never throws — a socket failure must not break the write it announces);
`lib/realtime/socket-server.ts` forwards the in-process bus into rooms
(`chat`, staff-only `audit`, `season:<id>`); browsers subscribe with
`useRealtimeEvent(room, event, handler)` from
`components/realtime/realtime-provider.tsx`. The contract lives in
`lib/realtime/protocol.ts` — a new live feature is one event row there plus
one `publish` call and one hook usage. Every feature degrades: chat falls
back to HTTP polling, audit shows a "new — show" pill, board badges dim when
the socket is down.

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
| `lib/modules/*/`                    | Vertical slices: `auth`, `season`, `player`, `game`, `catalog`, `moderation`, `site-settings`, `files` — each with `repository/` + `service/` + `actions/` + `index.ts` barrel |
| `lib/infrastructure/storage/`       | File-storage drivers (`local`, `s3`), key format, HMAC access links, env-resolved config — the only code that touches object bytes          |
| `lib/use-cases/`                    | Cross-module adapters only: `admin/actions/{helpers,types}`, `shared/action-error`                                                                                    |
| `lib/api/`                          | API contract: `contract.ts` (HTTP endpoints + Zod body models), `realtime.ts` (Socket.IO events), `spec.ts` (OpenAPI 3.1 builder), `markdown.ts` (`docs/API.md`) — served at `/api-docs`, `/api/openapi.json`, `/api/openapi.md` |
| `db/schema.ts` (now `db/schema/**`) | Drizzle schema — single source of truth (12 tables, 5 pg enums)                                                                                                       |
| `scripts/`                          | `bootstrap-admin.ts`, `seed-demo.ts`, `db-reset.ts`, `db-status.ts`, `enrich-catalog.ts` (tsx + dotenv)                                                               |


---

## 3. Commands

```bash
pnpm dev                # EVERYTHING (scripts/dev.ts): DB check + db:push, then
                        # Next.js webpack + Socket.IO server + bot ticker in the
                        # same process. Flags: --port N, --no-bots, --no-push.
                        # Turbopack dev = pnpm dev:turbo (plain Next, realtime
                        # falls back to polling — Windows-only _buildManifest race).
pnpm dev:next           # next dev (webpack, plain Next — same fallback, no sockets)
pnpm run server         # tsx server.ts (Next + Socket.IO only, no ticker/push;
                        # bare `pnpm server` is a pnpm store-server builtin — exits 0 silently)
pnpm build              # next build --turbopack
pnpm start              # tsx server.ts (production server: Next.js + Socket.IO, same port)
pnpm test               # vitest run — the whole suite (DB-free)
pnpm test:watch         # vitest watch mode
pnpm test:coverage      # vitest run --coverage
pnpm typecheck          # tsc --noEmit
pnpm verify             # lint + typecheck + test:coverage — the gate before handoff/push
pnpm api:doc            # regenerate docs/API.md from lib/api/ (API reference)

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

See [`.env.example`](../.env.example): `DATABASE_URL` (PostgreSQL 17, OSPanel
`127.127.126.56:5432`, db `ggrun` in the reference setup), `AUTH_SECRET`,
`NEXT_PUBLIC_SITE_URL`, `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`; Steam/IGDB/RAWG
keys are optional.

File storage is configured by `STORAGE_DRIVER` (`local` by default, writing to
`STORAGE_LOCAL_ROOT`) or by `S3_BUCKET`/`S3_REGION`/`S3_ENDPOINT`/credentials
for the `s3` driver. `pnpm files:migrate` moves any legacy inline base64
avatars/banners into the configured driver — it is idempotent and safe to
re-run.

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

### File storage

`lib/infrastructure/storage` is a driver port; `lib/modules/files` is the
policy on top of it.

- **Driver** — `getStorage()` resolves `STORAGE_DRIVER` once per process and
  memoizes it; `setStorage()` swaps it in tests. `put`/`get`/`stat`/`delete`
  return `null` for a missing object and throw `StorageError` only on a real
  backend failure. Keys are `<category>/<yyyy>/<mm>/<uuid>.<ext>` and are
  validated before every call — a key can arrive in a URL query string.
- **Module** — `storeFile()` validates size twice (category and global
  ceiling), sniffs the MIME type from the bytes, reads image dimensions from
  the header, hashes the content, writes the object, then inserts the `files`
  row; if the row cannot be written, the object is removed again.
  `deleteFile()` soft-deletes the row and removes the object; `fileUrl()` /
  `fileAccessUrl()` build the renderable or signed link.
- **Categories** — `lib/modules/files/service/categories.ts` declares allowed
  MIME types, size limit, visibility, who may upload and who may delete.
  Adding one means adding an entry there plus a label in the three `admin.files.categories`
  dictionaries; no migration is needed because a row stores only the id.
- **Tests** — the storage and module tests inject a fake driver with
  `setStorage(fake, config)`; nothing touches a real bucket or the network.

---

## 7. Testing

- **Vitest**, colocated `*.test.ts(x)` next to the code it tests. The suite is
  DB-free and network-free; mocks are allowed only at I/O boundaries.
- **Suites**: `lib/engine/` (pure deterministic functions with an injected
  `rng`; alias-free — no mocks/DOM), `lib/modules/` (service/validation logic
  with boundary fakes), `lib/infrastructure/`, `lib/shared/`, `lib/i18n/`
  (dictionary parity across en/ru/uk), `lib/realtime/` (policy units +
  Socket.IO boundary tests), `components/` (`renderToStaticMarkup`), and
  `lib/architecture.test.ts` (layer purity, feed-tab coverage, hook
  integrity).
- **Commands**:
  - `pnpm test` — the whole suite, once (CI/pre-push shape);
  - `pnpm test:watch` — watch mode for the inner loop;
  - `pnpm test:coverage` — same run with a coverage report;
  - `pnpm verify` — **lint + typecheck + test:coverage, the gate; a task is
    done only when this exits 0**.
- **Coverage thresholds** live in `vitest.config.mts` and only ratchet up.
  A module added without tests pulls the global number down and fails the
  gate — cover it rather than lowering the bar.
- **What a good test looks like**: real behavior, boundaries, error codes,
  state transitions, precedence, permissions. No snapshots; no assertions
  that merely restate the implementation ("is defined", "is truthy", string
  contains source). Where a rule cannot be expressed in types (one turn
  implementation, layer direction, "every EventType has a feed tab"), use a
  source/AST invariant test next to the existing ones
  (`lib/modules/game/turn-parity.test.ts`).
- **Handoff**: `pnpm verify` must be green in addition to a live check of
  behavioral changes against `pnpm dev` (admin flows included), and
  `pnpm build` must succeed before a PR.

---

## 8. Git &amp; releases

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `style:`,
`refactor:`.
- **Versioning**: the version lives in `package.json` and `CHANGELOG.md`
(Keep a Changelog format) and both update in a single release commit
`chore(release): vX.Y.Z`. New entries go in `[Unreleased]` and are promoted
on release. While `0.x`, breaking changes bump MINOR and are marked
**BREAKING** (details at the bottom of `CHANGELOG.md`).
- **Husky hooks are wired** (installed by `prepare` on `pnpm install`):
  `pre-commit` runs `lint-staged` (eslint `--fix` on staged code),
  `commit-msg` runs commitlint, and `pre-push` runs `pnpm verify`
  (lint + typecheck + tests). A red check blocks the push; the deliberate
  bypass is `git push --no-verify`. There is still no CI server — the
  pre-push hook is the gate.
- PowerShell note: LF→CRLF warnings from git are cosmetic (see
`.gitattributes` for shell scripts).

