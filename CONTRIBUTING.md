# CONTRIBUTING

Thanks for wanting to contribute! This file explains how to report issues,
work on the codebase and get your changes merged.

Read these first:

- [`AGENTS.md`](./AGENTS.md) — repository guidelines (architecture, invariants)
- [`DEVELOPMENT.md`](./DEVELOPMENT.md) — stack, commands, code conventions
- [`DESIGN.md`](./DESIGN.md) — the HUD design system (read before writing UI)
- [`RUNBOOK.md`](./RUNBOOK.md) — how a season runs on event day

---

## 1. Language policy

English is the only language for:

- markdown documentation, code comments and commit messages;
- zod validation messages, DB defaults, seed/demo content, `scripts/*` output.

**The only multilingual text is site translations** — string values inside
`lib/i18n/dictionaries/{en,ru,uk}/`. Never write UI strings, comments or docs
in Russian/Ukrainian outside those files.

---

## 2. Getting started

```bash
git clone https://github.com/NemoKing1210/ggrun.git
cd ggrun
pnpm install

cp .env.example .env        # fill DATABASE_URL, AUTH_SECRET, ...
pnpm db:push                # apply the schema
pnpm db:seed                # optional demo season (idempotent)
pnpm dev                    # http://localhost:3000
```

Requirements: Node ≥ 20, pnpm 9, PostgreSQL 17. Full setup details in
`README.md` / `DEVELOPMENT.md`.

---

## 3. How to contribute

1. **Open an issue** (bug report or feature request) and describe the problem
 or goal. For visual changes, mention which screen and attach a
 screenshot/URL if possible.
2. **Create a branch** for your work:
  ```bash
   git checkout -b feat/my-change
  ```
3. **Implement** following the conventions in `DEVELOPMENT.md` (architecture
 layers, error-code handling, i18n, audit events — no exceptions).
4. **Verify locally** — see the checklist below.
5. **Open a pull request** against `main`. Reference the issue in the PR
 body, describe *why* the change is needed and how it was tested.

Small fixes (typos, one-line bugfixes) do not need an issue — a PR alone is
fine.

---

## 4. Before you open a PR

Run everything and confirm the output is clean:

```bash
pnpm lint                 # eslint — 0 errors
pnpm exec tsc --noEmit    # type check — clean
pnpm test                 # vitest — all domain tests pass
pnpm build                # next build --turbopack — succeeds
```

Then **verify behavioral changes against a live dev server** (`pnpm dev`):
log in, exercise the changed flow, check the admin console if the change
touches it.

Do not introduce new ESLint errors or type errors; warnings unrelated to your
change are acceptable but be prepared to explain them.

---

## 5. Commit conventions

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `style:`,
`refactor:`. Commit messages are **English**.
- One logical change per commit; a commit may cover a fix plus an unrelated
small feature if they were done together — do not over-engineer commit
history.
- A release commit is `chore(release): vX.Y.Z` and updates both
`package.json` and `CHANGELOG.md` (see §7).

---

## 6. Code &amp; design rules (the important ones)

- **UI must follow `DESIGN.md`.** No rounded pills, no soft shadows, no raw
checkboxes — use the components from `components/ui/` (`Switch`, `Badge`,
`Chip`, `Field`, ...) and `hud-*` classes. UI strings go through i18n.
- `**lib/engine/` stays pure** — no `next/*`, `react`, `drizzle-orm`, `pg`.
ESLint enforces this; do not bypass it.
- **Errors as codes** — use `GameLoopError` / `AdminError` / `AuthError` with
code strings; never leak raw exceptions into UI text.
- **Two-tier audit** — staff mutations write `admin_audit_log` via
`logAdminAction`; user-visible events write the public feed via `logEvent`.
- **Server actions are thin** — business logic lives in
`lib/modules/*/service`; `"use server"` files only parse/validate/delegate.
- **Every public-facing string needs a dictionary entry** in
`lib/i18n/dictionaries/{en,ru,uk}/` — adding a key to one language and not
the other two is a merge-blocking mistake.
- No narration comments in code; if a change has a *why*, put it in the
commit message / changelog.

---

## 7. Changelog

- User-visible changes are recorded in `CHANGELOG.md` under `[Unreleased]`
(Keep a Changelog format), grouped by **Added / Changed / Fixed**.
- During `0.x`, breaking changes are marked **BREAKING** and bump MINOR.
- Final versioning decisions belong to the maintainers (exact rules at the
bottom of `CHANGELOG.md`).

---

## 8. Pull-request checklist

- [ ] `pnpm lint` clean
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] Change verified in a live dev server, admin flow included if affected
- [ ] New UI follows `DESIGN.md`; new strings added to en/ru/uk dictionaries
- [ ] `CHANGELOG.md` `[Unreleased]` entry added for user-visible changes
- [ ] DB schema changes come with a generated migration (`pnpm db:generate`)

