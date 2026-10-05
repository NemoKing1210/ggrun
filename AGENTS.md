# AGENTS.md — GGRun agent guide

> How to work on this codebase fast and without breaking it. Read this before
> any edit; read [`DESIGN.md`](./docs/DESIGN.md) before any UI work.

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
  `docs/DESIGN.md` is the source of truth for visuals.

## 2. Golden rules (never break)

1. **Layer direction** — imports point strictly downward:

   ```
   app/ (pages) + thin "use server" actions        ← presentation
   lib/modules/*/ (repository/service/actions)     ← application (vertical slices)
   lib/engine/    pure TS, game rules              ← domain
   lib/infrastructure/ (db, auth, http, events)    ← infrastructure
   ```

   Cross-cutting leaf code: `lib/shared/` (ui/utils/constants/stores),
   `lib/config/`, `lib/errors/`, `lib/use-cases/` (adapters only), `lib/i18n/`,
   `lib/api/` (the HTTP + realtime contract behind `/api-docs`).

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

8. **Uploaded bytes never go in the database.** Files go through
   `lib/infrastructure/storage` (driver port: `local` or `s3`, chosen by
   `STORAGE_DRIVER`) and are described by a row in `files`; the
   `lib/modules/files` slice owns categories, permissions and access links.
   A column stores a URL, never a `data:` string. `lib/infrastructure/storage`
   is the only code that touches object bytes.

## 3. Command line

```bash
pnpm dev            # everything: DB check + db:push + Next/Socket.IO server
                    # + bot ticker (scripts/dev.ts; --port N, --no-bots, --no-push).
                    # Turbopack dev = pnpm dev:turbo (plain Next, no sockets —
                    # Windows-only _buildManifest.js.tmp ENOENT race)
pnpm build          # next build --turbopack
pnpm start          # production server
pnpm lint           # eslint (flat config)
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest run — every suite (engine, modules, shared,
                    # infrastructure, i18n, components) + coverage thresholds
pnpm test:watch     # vitest in watch mode while developing
pnpm test:coverage  # vitest run --coverage — the same gate, with the report
pnpm verify         # THE GATE: lint && typecheck && test:coverage.
                    # This is what pre-push runs; never hand off without it.

pnpm db:status      # connectivity + row counts
pnpm db:generate    # SQL migration into drizzle/
pnpm db:push        # apply schema (drizzle-kit push --force)
pnpm db:seed        # demo season run-1 (idempotent)
pnpm db:admin       # first admin from BOOTSTRAP_ADMIN_* (idempotent)
pnpm db:reset       # drop schema + re-apply (asks to type YES)
pnpm db:setup       # push + seed + admin

pnpm api:doc        # regenerate docs/API.md from lib/api/ (API reference;
                    # also served as /api-docs, /api/openapi.json, /api/openapi.md)

pnpm files:migrate  # one-off: move legacy inline base64 avatars/banners from
                    # the users table into the configured storage driver
```

Production/deploy specifics: `Dockerfile` + `compose.yaml` +
`docker/entrypoint.sh` (see [`DEPLOYMENT.md`](./docs/DEPLOYMENT.md)). Container
Postgres maps to host port `5433`.

## 4. Codebase map (current)

| Path | Contents |
| --- | --- |
| `app/(public)/` | Landing, `/board`, `/leaderboard`, `/feed`, `/rules`, `/seasons` + `/seasons/[slug]/{board,leaderboard,feed,rules}`, `/players/[username]`, `/login`, `/register`, `/dashboard`, `/settings` |
| `app/admin/` | `layout.tsx` (staff guard + nav + moderation-pending badge), dashboard, `seasons` + `seasons/[id]/{board,players}`, `users`, `games`, `files`, `audit`, `moderation`, `settings` |
| `lib/modules/` | Vertical slices: `auth`, `season`, `player`, `game`, `catalog`, `moderation`, `site-settings`, `files` — each `repository/ + service/ + actions/ + index.ts` |
| `lib/api/` | API contract (single source of truth): `contract.ts` (endpoints + Zod body models), `realtime.ts` (Socket.IO rooms/events), `spec.ts` (OpenAPI 3.1 builder), `markdown.ts` (`docs/API.md`) |
| `lib/engine/` | Pure domain: `types/`, `config/` (Zod `SeasonConfigSchema`), `dice/`, `board/{movement,cell-effects}`, `roll/` (FSM), `index.ts`; colocated `*.test.ts` |
| `lib/infrastructure/` | `db/` (pg pool + drizzle), `auth/` (`session.ts`, `password.ts` scrypt), `events/` (audit + feed), `storage/` (file drivers `local` + `s3`, keys, signed links, env config), `logger/` |
| `lib/use-cases/admin/actions/` | `helpers.ts` (`toError`, `revalidateAdmin`), `types.ts` (`AdminFormState`) |
| `components/ui/` | `Input, Select, Textarea, Field, Badge, Chip, Switch, Range, Modal, BackLink, PageContainer, status, DebugError, ImageCropper, breadcrumbs…` |
| `components/admin/`, `components/seasons/`, `components/game/`, `components/board/`, `components/dice/` | Screen-level components |
| `db/schema/` | 13 tables, 6 pg enums (split files: users, seasons, players, games, moves, moderation, events, settings, files) |
| `scripts/` | `seed-demo.ts`, `bootstrap-admin.ts`, `db-reset.ts`, `db-status.ts`, `enrich-catalog.ts`, `migrate-files.ts` (tsx + dotenv) |

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

### Change the API surface (HTTP or Socket.IO)

1. Edit `lib/api/contract.ts` (endpoint, params, body model, every literal
   error code) and/or `lib/api/realtime.ts` (server/client events, rooms). A
   new `RealtimeEventMap` entry or a renamed event breaks the build there
   until the docs catch up — that is the point.
2. `pnpm api:doc` → rewrites `docs/API.md`. Never edit that file by hand.
3. `pnpm verify`. `lib/api/spec.test.ts` fails on a route handler with no spec
   entry (and vice versa), an error code that is documented but not returned
   (and vice versa), a stale `docs/API.md`, and a document that is not valid
   OpenAPI 3.1. The document is served at `/api/openapi.json`, rendered at
   `/api-docs` (Scalar, pinned CDN version — see `app/api-docs/route.ts`) and
   served as markdown at `/api/openapi.md`.
4. Route handlers keep their own hand-written guards: the schemas in
   `lib/api/` describe them, they do not validate at runtime. Do not move
   validation into the docs module — the observable status codes and error
   strings are the contract, and the tests compare them against the source.

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

1. Follow `docs/DESIGN.md`; use `components/ui/*` (never raw checkboxes → `Switch`,
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

### Add artwork for an item or effect

Artwork is **code, not content** — it ships in the repo and is changed only by
editing the repo. There is no upload in the admin console, on purpose: the app
container has no persistent volume (`compose.yaml` mounts only `pgdata`), so
anything written to `public/` at runtime dies on the next deploy.

**The naming rule — the file name *is* the catalog key.**

```
public/iee/items/<item_key>.webp        e.g. public/iee/items/spare_die.webp
public/iee/effects/<effect_key>.webp    e.g. public/iee/effects/shield.webp
```

Character for character, no transformation. Catalog keys are already
`[a-z0-9_]`, which is a legal file name everywhere, so there is no second name
to keep in sync and nothing to spell wrong. Items and effects live in separate
folders because their key spaces are separate — `lucky` may exist in both.

**Steps — there are two.**

```bash
# 1. save the file, named exactly after the catalog key
#    public/iee/effects/heavy_boots.webp
# 2. regenerate the manifest
pnpm iee:art
```

That is all. `pnpm iee:art` scans `public/iee/` and rewrites
`components/iee/art-manifest.ts`; **no list is edited by hand**. Removing
artwork is the same: delete the file, run it again.

**The image.** Square `.webp`, **256×256** (512 px is the hard ceiling — these
are drawn at 16–24 CSS px, so 256 already covers a high-DPI screen several
times over), **≤ 24 KB**. A transparent background sits best against the HUD
panels, but a full-bleed illustration with its own background is a legitimate
choice — look at it in place before deciding.

**Why a generated manifest and not a runtime folder scan.** A browser cannot
ask whether a file exists, so a component that guessed a path would render a
broken image and a 404 for every entry without art. The file list is therefore
baked in at build time. It is *generated* rather than hand-written because the
first version was hand-written and the first person to add artwork could not
find the list to edit — a design defect, so the list moved out of the way. The
path itself is always derived from the key, never typed.

**What the tests enforce** (`components/iee/IeeArt.test.tsx`, both directions):

| Mistake | Failure |
| --- | --- |
| Added the file, forgot `pnpm iee:art` | `every file in the <kind> folder is reachable by the app` |
| Deleted the file, forgot `pnpm iee:art` | `every registered <kind> key has its file` |
| Hand-edited the manifest | `has a manifest that is not stale` |
| Key is not a real catalog entry | `every registered <kind> key is a real catalog entry` |
| `HexScroll.webp`, `lodestone.png` | `<kind> files are lowercase .webp named after their key` |
| Not square, > 512 px, > 24 KB, or a renamed PNG | `<kind> files are square webp within the size budget` |

Every one of those failure messages names the fix, usually "run `pnpm iee:art`".

**Why not a field on the catalog entry.** `ItemDef` used to carry
`icon: "/iee/xxx.webp"`; it was removed because a path to a file nobody had
drawn is worse than no field at all. A path a test proves points at a real file
does not have that problem — which is the whole reason the registry is checked
against the folder rather than trusted.

### Add a file category (or move an upload to storage)

Files are never stored as text in a column. Bytes go through
`lib/infrastructure/storage`; a row in `files` describes them.

1. Declare the category in `lib/modules/files/service/categories.ts`:
   allowed MIME types, `maxBytes`, `visibility` (`public`/`private`),
   `upload` role (`user`/`staff`/`admin`), `delete` (`owner`/`none`) and
   optional dimension bounds. The registry is the security boundary — it is
   code on purpose, not admin-editable data.
2. Add its label to `admin.files.categories` in the en/ru/uk dictionaries.
3. Store with `storeFile({ category, data, actor })` from a service — never
   `File` handling logic in a component. It sniffs the MIME type from the
   bytes, checks both the category and the global ceiling, reads image
   dimensions, writes the object and inserts the row; a row that fails to
   insert removes the object again.
4. Render with `fileUrl(row)` (public) or `fileAccessUrl(row, { expiresIn })`
   (signed, for private). Delete with `deleteFile`/`deleteFileByUrl` — they
   soft-delete the row and remove the object.
5. Deleting a user or a game must not orphan files: drop the stored URL on
   replace/removal like `updateUserSettings` does, or run
   `pnpm files:migrate` for pre-existing inline data.

`/admin/files` is the manual escape hatch: upload per category, filter, copy
a working link (signed, for private files), delete.

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
`docker/env.example`. Full detail in `docs/DEPLOYMENT.md`.

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

## 8. Testing & verification — the task is not done until it is green

**Rule zero: a task is complete only when `pnpm verify` exits 0.** One red
test anywhere means the work is unfinished — fix it, do not hand off, do not
explain it away. Run the gate at the end of **every** task, however small
(doc-only changes included), before reporting back.

```bash
pnpm verify            # lint && typecheck && test:coverage — the definition of done
pnpm test -- -t "name" # one suite by name while iterating
pnpm test:watch        # watch mode; for the inner loop only
```

- **What runs.** Vitest, colocated next to the code, DB-free and
  network-free. Suites: `lib/engine/` (pure functions with injected `rng`;
  alias-free), `lib/modules/` (service/validation logic with boundary
  fakes), `lib/infrastructure/`, `lib/shared/`, `lib/i18n/` (dictionary
  parity), `lib/realtime/`, `components/` (render to static markup),
  `lib/architecture.test.ts` (layer purity + hook integrity).
- **Coverage is a ratchet.** `vitest.config.mts` holds global thresholds;
  they may only go up. Adding a module without tests lowers the number the
  ratchet refuses to go below — cover it, don't lower the threshold.
- **Test the contract, not the source.** Real behavior, boundaries, error
  codes, state transitions, precedence. No snapshots, no
  `toBeDefined`-as-the-assertion, no tests that restate the implementation.
- **Mocks only at I/O boundaries** (`vi.mock` of the DB/session/repository
  modules). Inject `rng` and clocks; never sleep or hit the network.
- **Invariant tests are first-class.** `lib/modules/game/turn-parity.test.ts`
  and `lib/architecture.test.ts` parse source/AST to enforce rules the type
  system cannot (one turn implementation, layer direction, feed-tab
  coverage). When you learn a rule the hard way, encode it there.
- **Behavior changes** additionally get a live check against `pnpm dev`
  (admin flows included) — tests prove the unit, the server proves the seam.
- `pnpm build` is a release/PR step, not part of `verify` (too slow for the
  push hook); run it before opening a PR.

## 9. Git & releases

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `style:`),
  English messages. One logical change per commit; fetch whole-tree with
  `git add -A` when the user says "commit and push" — do not split or
  over-polish history.
- Version: `package.json` + `CHANGELOG.md` (Keep a Changelog), updated in one
  release commit `chore(release): vX.Y.Z`. While `0.x`, breaking changes bump
  MINOR and are marked **BREAKING** (exact rules at the bottom of
  `CHANGELOG.md`).
- **Hooks are wired (Husky) and red cannot be pushed:**
  `pre-commit` runs `lint-staged` (eslint --fix on staged code),
  `commit-msg` runs commitlint (conventional commits), and **`pre-push` runs
  `pnpm verify`** — a failing lint, type check or test aborts the push.
  Hooks install via the `prepare` script on `pnpm install`
  (`core.hooksPath=.husky/_`). `git push --no-verify` is the emergency
  escape hatch, not a routine. There is still no CI server — the hook *is*
  the gate.

## 10. Environment & runtime notes

- Local DB: PostgreSQL 17 via OSPanel at `127.127.126.56:5432`, database
  `ggrun` (not a typo — it's the OSPanel-internal host).
- `.env` is git-ignored; `.env.example` documents every variable
  (`DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `BOOTSTRAP_ADMIN_EMAIL/PASSWORD`, optional RAWG/Steam/GameSpot/IGDB keys,
  `PROXY_URL`).
- File storage: `STORAGE_DRIVER=local|s3` (default `local`, files under
  `STORAGE_LOCAL_ROOT`, git-ignored; Docker mounts the `storage` volume there).
  `s3` reads `S3_BUCKET`/`S3_REGION`/`S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/
  `S3_SECRET_ACCESS_KEY`/`S3_FORCE_PATH_STYLE`; `STORAGE_PUBLIC_URL` makes
  public objects redirect straight to a CDN/bucket; `STORAGE_SIGNING_SECRET`
  (default `AUTH_SECRET`) signs private links. Local links and S3 pre-signed
  links last at most 7 days.
- Auth: cookie sessions, scrypt password hashes, `sessions` table; blocked
  users are filtered out by `getCurrentUser()`.
- The public feed filter tabs come from one table,
  `lib/engine/feed/filters.ts` (`FEED_FILTER_TYPES`), which supplies both the
  tab list and the matcher. **Every `EventType` must be filed under a tab** —
  an unfiled one is a compile error in `lib/infrastructure/events` that names
  the offending type. Adding a tab also needs a label in
  `dictionaries/{en,ru,uk}/feed.ts`; the page has no slug fallback, so a
  missing label is a type error too.

## 11. Docs map

| File | For |
| --- | --- |
| `README.md` (+ `translations/README.{ru,uk}.md`) | Project overview, features, quick start |
| `docs/DEVELOPMENT.md` | Architecture, commands, conventions, testing, releases |
| `docs/DEPLOYMENT.md` | Docker + manual production deployment, env reference |
| `CONTRIBUTING.md` | Issue/PR workflow, checklist |
| `docs/DESIGN.md` | HUD design system (read before any UI) |
| `docs/RUNBOOK.md` | Host guide for event day |
| `CHANGELOG.md` | Release history + versioning rules |
| `docs/ITEMS_EFFECTS_EVENTS.md` | Items / effects / events: concept, contracts, decisions, phase plan |
| `docs/ITEMS_EFFECTS_SCENARIOS.md` | **Generated** — what every item and effect promises, as executed scenarios (`pnpm scenarios:doc`) |
| `docs/API.md` | **Generated** — HTTP + realtime API reference: endpoints, error codes, Socket.IO events, models (`pnpm api:doc`; served live at `/api-docs`, `/api/openapi.json`, `/api/openapi.md`) |
| `docs/WORKLOG.md` | Work journal — what each session did and what to pick up next |