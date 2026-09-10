# Changelog

> **Author:** [NemoKing1210](https://github.com/NemoKing1210) · **Repository:** [github.com/NemoKing1210/ggrun](https://github.com/NemoKing1210/ggrun) · **Issues:** [github.com/NemoKing1210/ggrun/issues](https://github.com/NemoKing1210/ggrun/issues)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Versioning rules — at the bottom

## [Unreleased]

### Added
- **Items, effects and challenges** — a whole subsystem, opt-in per season
  (`seasons.config.iee`, migration `0016`). Concept, contracts and the
  decision record live in `ITEMS_EFFECTS_EVENTS.md`.
  - **Catalog (6 items, 8 effects), hardcoded on purpose.** An effect is
    inseparable from the function that implements it, so the catalog lives in
    `lib/engine/iee/` and its keys are persisted forever — deprecate, never
    rename. Text is dictionary keys in `en/ru/uk`, never literals. A test
    fails the build if a negative effect has no positive answer on the same
    hook, if the universal cleanse disappears, or if nothing can prevent a
    penalty landing: counter-play is an invariant, not a review note.
  - **The wheel.** Bonus and penalty cells spin for a drop. Selection is a
    pure weighted picker (`lib/engine/iee/selection/`) that takes its `rng` as
    an argument, so the admin preview, the balance simulator and the game all
    run the same function — the preview cannot drift from reality. Gates cover
    per-season and per-player caps, cooldowns, board position, unlock
    thresholds and inventory space, and each rejection has a named reason.
  - **Statuses that change the turn.** Nine hook points are declared and six
    are dispatched inside the turn transaction; a reducer accumulates additive
    patches, resolves overrides by priority (recording conflicts) and ORs
    vetoes. Duration is counted in resolved rolls, or in charges; expiry is
    lazy and logged.
  - **Inventory and PvP.** Items are used from `/dashboard`, and — when the
    season allows it — on another participant, with a protection window for
    newcomers, an active-only target list, no self-targeting for an
    other-only item, and a usage window that stops an item being played after
    the dice are seen. The charge guard is in the `UPDATE`'s `WHERE`, so eight
    simultaneous uses spend exactly one charge.
  - **Challenges.** Admin-authored event templates (`/admin/catalog`), assigned
    by an event cell, submitted with proof by the player, approved or rejected
    in the moderation queue. The reward is granted in the same transaction as
    the verdict, so an approved challenge cannot be left unpaid.
  - **Season wizard stage** with presets, per-entry tuning (rarity, caps,
    cooldowns, unlock thresholds, param overrides), the live drop table and a
    simulate-1000-spins button.
  - **Public surfaces**: "Items & effects" and "Challenges" feed tabs, active
    status badges on the leaderboard rows and the board roster, and a
    generated rules section listing everything that can drop — including the
    catch-up rule when it is on, because hidden rubber-banding is worse than
    none.
- **`ITEMS_EFFECTS_SCENARIOS.md`** — a generated reference of what every item
  and effect promises, 57 scenarios written as observable consequences. It is
  built by `pnpm scenarios:doc` from `lib/engine/iee/scenarios.ts`, which is
  the same table the tests run, so the document cannot describe behaviour the
  code does not have. 46 are covered by `pnpm test`; the rest need the turn
  transaction and run in the verification harness.
- Feed filter tabs now come from one table (`lib/engine/feed/filters.ts`)
  that supplies both the tab list and the matcher, with a compile-time check
  that every `EventType` is filed under a tab. This closed two pre-existing
  gaps: `season_reset` and `player_left` were reachable only under "All".

### Fixed
- **"No games available in the catalog" was said when the catalog was full.**
  A participant who had been handed every game in the season's pool got the
  message meant for an empty catalog, telling them to check filters that were
  not the problem. Running out of games now names which of four things happened
  — the catalog is empty, you have had them all, the filters exclude every
  unplayed game, or the external provider returned nothing — because the host
  does something different about each.
- **A season could hand out a game the player had already played.** Once the
  unplayed games ran out, one last fallback returned any game at all, silently,
  breaking the rule that already-played games never come up — and hiding the
  fact that the pool was exhausted. Which of the two happened depended on the
  season's pool source, a setting no player can see.
- **A reroll with nothing left to roll could leave a player stuck.** Both reroll
  paths created a roll row with no game attached: unresolvable, and the reroll
  allowance had already been spent on it. They refuse now, and an approval left
  waiting can be rejected with a reason.

### Added
- **Reaching the finish ends a run, and records when.** The last cell of the
  board was decorative: a player who got there parked on it and went on rolling,
  and the season's winner was whoever the leaderboard happened to put first when
  someone looked. The landing that reaches it now marks the participant finished
  and stores the time, in the same write as the move; the feed announces it, the
  dashboard shows the run's end instead of a roll button, and the leaderboard
  ranks finishers ahead of everyone else in the order they arrived — the only
  thing that can separate players standing on the same cell. Looping boards have
  no finish cell and are unchanged. Requires migration `0017`.
- **Staff can take an item or a status back.** A new panel on the season's
  players page lists what each participant is carrying, with a required reason
  per removal; every removal writes an audit row and a public feed line, and
  ends the record rather than deleting it, so the history keeps who ended it and
  why. Until now a judge could correct a position, a balance or a status and
  nothing else — a mis-dropped item could not be undone at all.

### Changed
- **An item can no longer reach into a move that is already underway.** A player
  who has rolled a game is away playing it for days, and that is visible on the
  board, so an offensive item could be timed for exactly that window and shorten
  the move its target was about to report — with no chance for them to answer. A
  penalty cell never behaved that way: its status is handed out at the end of a
  turn and bites the next one. Items now match, so the target sees the status
  coming and can spend a cleansing salve on it.
- **A participant who is finished, eliminated or withdrawn can no longer play.**
  The status was shown everywhere and enforced nowhere: such a player kept
  rolling, moving and drawing from the wheel, and the dashboard kept offering
  the button.

### Fixed
- **The leaderboard ranked finished players below active ones.** The ordering
  sorted by the raw status enum, whose declaration order puts `active` first, so
  the champion card showed whoever was furthest along rather than whoever had
  won. It only ever looked right because nothing set anyone to finished.
- **A moderator could approve a request on a season that had already ended,**
  moving a player and writing points onto a closed run. The three player-facing
  paths all refused this; the two approval paths never checked.

### Fixed
- **A moderation checkbox switched the whole items-and-effects system off.**
  With «прохождение требует подтверждения» on, an approved roll took a second,
  older code path that predated the subsystem: bonus and penalty cells handed
  out nothing, event cells assigned no challenges, shields did not absorb, no
  status applied — and the player's roll counter never advanced, which is the
  clock a status's lifetime is measured against, so anything granted by an item
  or a challenge reward stayed on its target for the rest of the season. The
  admin console still showed the pool and the rules page still promised it. A
  resolved turn now has one implementation that both paths call, with a test
  that fails if either grows its own again.
- **The season's tuning applied only to drops from a cell.** Strength and
  duration set in the wizard were read when the wheel handed something out and
  ignored when the same status arrived from an item or a challenge reward, so
  boots tuned to "−4 cells for 3 rolls" hit for the catalog's "−2 for 1" two
  thirds of the time. One grant path now, for all three.
- **An attack could shorten the status it applied.** Re-applying a `refresh`
  status wrote the new timer flat instead of taking the longer of the two:
  paired with the bug above, hitting a slowed rival with a hex scroll cut their
  slow from the season's five rolls to the catalog's two.
- **A `unique` status could be applied twice.** The wheel refuses a duplicate,
  but an item did not: a second `unlucky` was inserted and both rows fired,
  shrinking the dice twice over. Using an item on a target who already carries
  the status is now refused before the charge is spent.
- **The board and the leaderboard showed statuses that had already ended.**
  Expiry is lazy — a status is marked dead on its owner's next move — and the
  badge query never checked the timer or the charges, so a spent shield stayed
  on display until its owner moved again, and forever for anyone who had stopped
  playing. Those badges are what PvP decisions are made on.
- **Two shields burned on one hit.** Both offered their protection and both were
  charged for it. Two shields now absorb two landings, which is what the entry
  promises and what the generated scenario reference has said all along.
- **The points ledger recorded points that were never taken.** A balance stops
  at zero, but the history was written with the full amount asked for: a penalty
  of 9 against a balance of 5 left the player on 0 and recorded −9. The ledger
  now records what actually moved.
- **A season that hid its drops announced them anyway** — the feed still posted
  each status when it expired, and each time a shield absorbed a hit. Using an
  item on another player stays public regardless; that is the deterrent.

### Fixed
- **Every timed status lasted one roll longer than it promised.** The turn
  decided which statuses were active from the roll that had just finished, but
  expired them against the roll being resolved — one apart — so `heavy_boots`
  shortened two moves instead of one, `slowed` three instead of two, and
  `unlucky` and `taxed` four instead of three. The turn now derives its roll
  number once and every filter, hook context and expiry sweep reads that one
  value, with a test that fails if they ever diverge again. Found by driving a
  real turn in a browser: both halves were individually correct pure functions
  and only the wiring between them was wrong, which is precisely what a unit
  suite cannot see.
- **A movement penalty could send a player backwards.** A roll shorter than the
  penalty — dice 1 against the boots' −2 — subtracted past the cell the player
  started from: at cell 18 they finished on 17, losing ground rather than
  standing still. Shortening a move now clamps at the cell it started from, in
  whichever direction the move was going, so a penalty can cancel a move but
  never reverse it. The earlier fix in this release clamped at cell 0, which is
  the single cell where the old line was right.
- **A spent status stayed on the player's dashboard reading "0 rolls left".**
  The panel carried its own copy of the "still active?" rule and counted it from
  the wrong roll, so a status the game had already stopped applying was still
  drawn as if it were live — visible to the player, inert in the game.

### Added
- **Artwork for items and effects, added in code.** Drop a square `.webp` at
  `public/iee/items/<item_key>.webp` (or `effects/`), register the key in
  `components/iee/art.ts`, done — the file name *is* the catalog key. It
  replaces the entry's glyph everywhere `IeeIcon` renders; an entry without art
  keeps its glyph, so the catalog is never half-drawn. There is no upload in
  the admin console by design: the app container has no persistent volume, so
  anything written at runtime would not survive a deploy. The recipe is in
  `AGENTS.md` §5, the visual spec in `DESIGN.md`, and tests check the registry
  against the folder in both directions — plus name, case, extension,
  squareness, pixel and byte budgets, and that the file really is a WebP.
- **Items and effects now have icons.** Every catalog entry has declared a
  `heroIcon` since the catalog was filled, and nothing rendered it. They appear
  in the admin catalog, the season wizard, the inventory and status panels, the
  rules page and the wheel result.
- **Filters on the items, effects and event lists.** One shared bar — live
  search over name, key and description, plus polarity/rarity chips on the
  catalog, active/inactive on event templates, and armed/not-armed in the
  season wizard's pools. The predicate lives in the engine
  (`lib/engine/iee/filter.ts`), so the lists cannot drift apart on what
  "matches" means, and it is unit-tested without a browser.
- **Component tests.** `vitest.config.mts` adds the `@/` alias and a JSX
  transform so components can be rendered to static markup in the suite; the
  engine suite stays alias-free. 112 new tests, generated from the status
  enums and the catalog so a new value is covered as soon as it exists.

### Changed
- **The items and effects catalog is a card grid.** It was a `min-w-[52rem]`
  table that scrolled sideways for six and eight rows. Note that
  `/admin/catalog` is now client-rendered: 13.6 kB / 315 kB first load against
  a 224 kB baseline, traded for filtering that answers a keystroke.
- **Hook names read as phrases** ("changes the dice", "can cancel the cell")
  instead of the raw `HookName` identifiers, which were developer strings and
  had never been translated.

### Fixed
- **An item card printed "Charges" as a label and "1 charge" as its value.**
  Found by reading the rendered page, not the source.
- **The season wizard's drop table labelled its rows with database keys.**
  An admin tuned odds against `heavy_boots` while the switches directly above
  showed the same entries by name, with nothing connecting the two lists.
- **A moderator's rejection reason was set at 11px.** The single most important
  sentence on the challenges panel. Found by a new invariant test rather than
  by eye, along with two registration-mode explanations in the global settings
  and a dead `text-[10px]` on a cover placeholder that contains no text.

### Fixed
- **A finished season was flagged in danger red, and three status maps
  disagreed about it.** `/admin/seasons` painted `finished` with the `danger`
  variant reserved by `DESIGN.md` §1.2 for actual danger, while `StatusBadge`
  and the season roster painted the same status amber. All three now read one
  source, `lib/shared/ui/status-variants.ts`, and a finished season is neutral
  with a check glyph.
- **`StatusBadge` could not tell a finished season from a finished player.**
  It took a `SeasonStatus | PlayerStatus` union and resolved it through a
  single map, but both enums contain `finished` with opposite meanings — a
  season that is over versus a player who completed the run. The map is now
  two total `Record`s and the component takes a required `kind`, so a new enum
  value is a compile error instead of a silently grey badge.
- **Item and status descriptions were smaller than the names above them.** The
  sentence describing what an entry does rendered at `text-[11px]` under a
  `text-sm` name on five surfaces, inverting the hierarchy — and 11px is not on
  the `DESIGN.md` §2 type scale. Prose now renders through
  `components/iee/EntryDescription.tsx` at `sm` (player surfaces) or `xs`
  (dense admin tables). HUD mono labels are untouched.
- **Two season-wizard stage explanations were written but never rendered.**
  `diceHint` and `boardHint` existed in all three dictionaries and reached no
  screen; both now appear at the top of their stage.

### Changed
- **Every numeric and select control in the season wizard now explains
  itself.** All 13 switches carried a description and all 19 `Field`s carried
  none, including the ones nobody can guess — cache TTL's unit, what the
  candidate limit limits, what each board distribution does. 16 hints added
  (each min/max filter pair is covered once, under `min`), plus 6 for the
  per-entry Advanced drawer in the items & effects stage, in en/ru/uk. Two of
  them disclose behaviour the UI never showed: `cooldownRolls` counts
  season-wide resolved rolls rather than the player's own, and `maxPerSeason`
  is advisory rather than absolute when two players resolve at the same
  instant.

### Fixed
- **A negative movement effect could catapult a player to the far end of a
  looping board.** `heavy_boots` (-2) on a player at cell 0 who rolled a 1
  targeted cell -1, which `normalizePosition` wraps to the *last* cell — so a
  penalty handed out the lead. Negative step modifiers now clamp at zero;
  forward wrapping is unchanged.
- **A shield absorbed only half a penalty landing.** The cell's balance penalty
  was vetoed, but the wheel spun regardless and still granted the negative
  status — so the charge was spent and the player kept the damage the shield
  exists to prevent. An absorbed landing now skips the wheel entirely.
- **The page froze after landing on a bonus or penalty cell.** `Modal` locked
  body scroll per instance, saving `document.body.style.overflow` on mount and
  restoring it on unmount. The wheel opens while the confirmation dialog is
  still playing its exit animation, so the wheel saved the dialog's `hidden`
  as the "original" value and put it back when it closed — leaving the page
  permanently unscrollable. The lock is now a shared counter: the first lock
  records the real original style, the last unlock restores it. This also
  fixes the page scrolling behind an open wheel.
- `<a>` nested inside `<a>` on `/admin/users` (a React hydration error): each
  row is a `Link`, and the avatar inside it rendered a second `Link` to the
  same URL. The redundant inner link is gone.
- `pnpm db:seed` failed with `column "status" is of type season_status but
  expression is of type text`. Inside a scalar subquery the `CASE` branches
  resolve to `text` and Postgres has no implicit cast; the value is now cast
  explicitly. The same script also inserted a board unconditionally, so every
  run added a second board and 40 more cells to the demo season despite being
  documented as idempotent.
- `/admin` and `/admin/catalog` rendered their content into the response that
  carried the layout's redirect. In the App Router a layout and a page render
  in parallel, so a page that queries the database without its own guard
  streams its output to an unauthorised visitor. Both now guard themselves.

- Profile banner field (`users.banner_url`, migration `0006`): users can
  upload a wide header image (3:1, 1500×500) on `/settings`. Shown on the
  public profile page (`/players/[username]`) above the player header card.
- Shared `ImageCropper` modal component
  (`components/ui/ImageCropper.tsx`, built on `react-easy-crop`): the
  avatar uploader in `/settings` now opens this modal so the user can
  position and zoom the crop before saving (replaces the old
  auto-center-square resize). The same component powers the new banner
  upload with a 3:1 aspect lock. Source images up to 5 MB; output is
  JPEG at q=0.85, auto-stepping down to q=0.55 and finally half-size
  to stay under 600 KB.
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
- Header language switcher now updates the locale for authenticated users as
  well: `setLocaleAction` (`lib/i18n/actions.ts`) calls a new
  `setUserLocale` use case (`lib/use-cases/users.ts`) that writes
  `users.locale`, so the change survives across sessions and devices. The
  Settings page form continues to write the column on save. Anonymous
  visitors still get the cookie-only path.
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
- Game engine `lib/engine/` (pure TS): dice, movement, roll FSM, cell-effect
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
