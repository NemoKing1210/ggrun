# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Versioning rules — at the bottom
of this file and in `AGENTS.md` (section "Versioning & Changelog").

## [Unreleased]

### Added
- MIT license (`LICENSE`), `license` field in `package.json`.

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
