# Changelog

> **Author:** [NemoKing1210](https://github.com/NemoKing1210) · **Repository:** [github.com/NemoKing1210/ggrun](https://github.com/NemoKing1210/ggrun) · **Issues:** [github.com/NemoKing1210/ggrun/issues](https://github.com/NemoKing1210/ggrun/issues)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Versioning rules — at the bottom

## [Unreleased]

### Added
- Browser tab titles on every page: `/dashboard`, `/login`, `/register`
  and all `/admin/*` pages now set a localized `<title>` via
  `generateMetadata` (previously they fell back to the generic site title
  from the root layout). Login/register forms were extracted into client
  components (`components/auth/LoginForm.tsx`, `RegisterForm.tsx`) so their
  routes can stay server components that own the metadata; admin season
  pages include the season title in the tab title.
- Live season uptime on the landing hero: `SeasonUptime`
  (`components/landing/SeasonUptime.tsx`) shows how long the current season
  has been running (`Dd HH:MM:SS`) and ticks once per second on the client.
  The server-computed elapsed seconds seed the initial state, so there is no
  hydration mismatch; label is localized (`landing.uptime` in en/ru/uk).
- Database helper scripts with short `pnpm` aliases: `db:status`
  (connectivity check + server info + per-table row counts), `db:push`,
  `db:generate`, `db:seed`, `db:admin`, `db:reset` (destructive, requires
  typing YES) and `db:setup` (push + seed + admin for a fresh database).
- Shared CLI env loader `scripts/lib/load-env.ts`: loads `.env` with
  `override: true`, so a stale `DATABASE_URL` exported in the shell/session
  environment can no longer shadow the project `.env` (this previously made
  every script and `drizzle-kit` silently target an unreachable database).
  `drizzle.config.ts` uses the same override behavior.
- Graceful "site temporarily unavailable" screen when the database is
  unreachable: a throttled `select 1` health probe (`lib/db-health.ts`)
  gates the root layout, session resolution fails soft to anonymous during
  outages, and `app/global-error.tsx` catches any page-level failure with the
  same HUD-styled fallback (localized via locale cookie / navigator).
- Server-side logger `lib/log.ts` (dev pretty / prod JSON, child contexts,
  `LOG_LEVEL` env, `NO_COLOR` / `FORCE_COLOR` honoured). All "use server"
  actions and the audit / event / season / game / auth use-cases log
  meaningful events.
- Dev-only error detail component `components/ui/DebugError.tsx`. Rendered
  next to `state.error` in every form that goes through `useActionState`
  (settings, login, register, dashboard roll/resolve, admin season settings
  and games catalog).
- Shared action error adapter `lib/use-cases/action-error.ts` with a
  `makeToError(domainErrorClass)` factory and a `zodToMessage` helper.

### Changed
- `pnpm dev` now runs the webpack dev server (`next dev`) instead of
  Turbopack: on Windows every file edit crashed HMR with
  `ENOENT … .next/static/development/_buildManifest.js.tmp.<random>`
  (Turbopack's atomic manifest write loses the race with the filesystem /
  antivirus; unfixed in Next 15.5.x). `pnpm build` still uses
  `--turbopack`. Opt back into the Turbopack dev server with the new
  `pnpm dev:turbo` alias if needed.
- Unified public page layout widths: every public page now renders its
  content through `PageContainer` (`components/ui/PageContainer.tsx`),
  which spans exactly the same container as the breadcrumbs row in the
  public shell. The per-page ad-hoc `mx-auto max-w-*` wrappers
  (`max-w-sm` … `max-w-5xl`) are gone, so content edges always align with
  the crumbs and the gap under the breadcrumbs is identical on every page.
  The dashboard no longer nests a duplicate container (and a nested
  `<main>`) inside the shell. Documented in `DESIGN.md` (Layout Containers).
- Settings save no longer falls through to the generic "Unknown error" when
  the payload fails Zod validation; the message targets the first issue
  (e.g. `displayName: String must contain at most 100 character(s)`) and
  the dev panel shows the full Zod issues JSON.
- "Unknown error" fallback (`formUnknown`) reserved for genuinely unknown
  throws; added `formInvalid` for non-field-specific zod fallbacks.

### Fixed
- Page transition no longer flashes a vertical scrollbar during the entrance
  animation (`hud-page-in` slide offset is negative now) and no longer leaves
  a retained transform on the wrapper, which turned it into the containing
  block for every `position: fixed` descendant (final keyframe ends at
  `transform: none`).
- Modals render through a portal to `document.body` and are centered on every
  viewport breakpoint instead of only `sm:` screens.
- Modal scroll lock compensates the hidden scrollbar with `padding-right`,
  so the page no longer shifts when a modal opens or closes.
- Modal keeps its last non-null content during the exit animation instead of
  collapsing to an empty panel when the parent clears it in the same render.


### Added
- MIT license (`LICENSE`), `license` field in `package.json`.
- HUD-themed route loading screens (`app/loading.tsx`, `app/admin/loading.tsx`,
  `components/layout/HudLoader.tsx`) with CSS-only animations and
  `prefers-reduced-motion` support.

### Removed
- `PLAN.md` (the original Russian spec, later translated) — the MVP is
  implemented; the historical version remains in git history.

### Changed
- All markdown documentation (PLAN/README/RUNBOOK/CHANGELOG/AGENTS) and code
  comments translated to English; only site translations (i18n dictionaries)
  remain multilingual. `PLAN.md` restored — it was accidentally deleted in the
  0.5.0 release commit.
- Audit page restored to dictionary-based i18n (was hardcoded).
- Board name DB default changed to "Main board"
  (`drizzle/0002_board-default-name.sql`).
- Admin form success responses moved into the `admin.feedback` dictionary
  namespace.

## [0.5.0] — 2026-08-26

### Added
- Responsive site and admin-console headers: sticky navigation, mobile burger
  menus (`components/layout/SiteHeader.tsx`, `AdminHeader.tsx`), active-section
  highlight, mobile dropdowns with logout.

### Changed
- Server layouts (`app/(public)/layout.tsx`, `app/admin/layout.tsx`) now pass
  data to client headers via props.

## [0.4.1] — 2026-08-26

### Added
- `AGENTS.md` — guidelines for AI agents (architecture, conventions, commands).

## [0.4.0] — 2026-08-26

### Added
- Admin console with its own header and a site ⇄ admin toggle
  (`app/admin/layout.tsx`, route groups `app/(public)/` vs `app/admin/`).
- Admin dashboard `/admin` with stats (users, seasons, games, rolls, moves,
  events).
- User management `/admin/users` (admin role only): search, creation, editing
  (display name/username/email/role/password), blocking, deletion — with
  self-block/self-delete/self-demote guards and audit-log records.
- Migration `drizzle/0001_user-blocking.sql`: `users.is_blocked`;
  `seasons.created_by` and `ledger_entries.created_by` FKs → `ON DELETE SET NULL`.
- Account blocking: a blocked user immediately loses their session and cannot
  log in (`authBlocked` error).

### Changed
- Season list moved from `/admin` to `/admin/seasons`.
- Confirm dialogs for destructive forms extracted into the client-side
  `components/admin/ConfirmButton.tsx` (server components cannot pass event
  handlers).

## [0.3.0] — 2026-08-26

### Added
- Internationalization: English, Russian, Ukrainian languages
  (`lib/i18n/`, per-namespace dictionaries, type safety via `Widen`).
- Language detection from the system `Accept-Language` header, fallback —
  English; manual switching via cookie (`LocaleSwitcher` in the header).
- Use-case errors converted to codes with localizable texts
  (`lib/i18n/errors.ts`).
- Dev quick login as admin/player on the login page
  (`lib/auth/dev-login.ts`, disabled in production).

## [0.2.1] — 2026-08-26

### Changed
- Scrollbars styled to match the HUD theme (WebKit + Firefox).
- Minor seed styling fixes.

## [0.2.0] — 2026-08-26

### Added
- Database schema and first migration (`drizzle/0000_init.sql`): users/sessions,
  seasons, boards, participants, game catalog, rolls, moves, ledger, feed,
  audit.
- Cookie-session authentication (scrypt), first-admin bootstrap
  (`scripts/bootstrap-admin.ts`).
- Game engine `game-engine/` (pure TS): dice, movement, roll FSM, cell-effect
  plugin registry, Zod season config + 50 unit tests.
- Player game loop: game roll, passed/dropped/rerolled outcomes, server-side
  RNG, `/dashboard` with dice animation.
- Public pages: season landing, board (snake layout), leaderboard, event feed,
  player profile, rules (Markdown from the DB).
- Admin panel v1: season CRUD with board cloning, cell editor, season
  participant management with mandatory adjustment reasons, game catalog with
  blacklist, audit log.
- GoldSrc-era-inspired HUD theme (original assets).
- Demo seed (`scripts/seed-demo.ts`), `README.md`, `RUNBOOK.md`.

## [0.1.0] — 2026-08-26

### Added
- Base Next.js 15 scaffold: TypeScript strict, Tailwind v4, ESLint (flat
  config) + Prettier, Vitest, drizzle-kit configuration.

---

## Versioning rules (Semantic Versioning)

The version is `MAJOR.MINOR.PATCH`; it is updated simultaneously in
`package.json` (the `version` field) and in this file (a dated section) in a
single release commit `chore(release): vX.Y.Z`.

- **PATCH** — fixes with no behavior change, styles, documentation,
  refactoring.
- **MINOR** — new features (pages, admin sections, languages, additive schema
  migrations).
- **MAJOR** — breaking changes: removal of pages/features, season-config or
  schema format changes requiring manual data actions.
- While the version is `0.x`: breaking changes bump MINOR and are marked
  **BREAKING** in the changelog; `1.0.0` — once the MVP is stable and released
  to real users.
