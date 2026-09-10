# IEE audit — the subsystem read against the code

> An audit of items, effects and challenges: what the platform is, how a season
> actually runs, and where the subsystem is weaker than it looks. Every claim
> below was read out of the working tree, with `file:line`, not recalled from
> the design document — several of the findings are places where the code and
> `ITEMS_EFFECTS_EVENTS.md` disagree.
>
> Nothing here is implemented. This is a decision document, like
> `UX_BACKLOG_PLAN.md` was.
>
> Written 2026-09-09 against the working tree at `0.5.0`, after the two turn-loop
> fixes in `WORKLOG.md` session 22.

---

## 1. What GGrun is

A self-hosted platform for running a **seasonal competitive gaming event** — the
HPG format: a group of people race across a board, and each step is earned by
finishing a randomly assigned video game.

The loop, at its smallest:

> a player is handed a random game from the season's pool → they play it away
> from the site → they come back and declare **passed** or **dropped** → dice
> are rolled, they move along the board, and the cell they land on does
> something to them.

Everything else is scaffolding around that sentence: a game catalog with store
importers so the pool is real games; a board editor so the route has texture; a
moderation queue so a claim of "passed" can be checked; a feed, a leaderboard and
a rules page so the run is legible to spectators; and an admin console that owns
the season from draft to archive.

**Shape of the codebase.** Next.js 15 App Router with server actions, React 19,
TypeScript strict, Tailwind v4 over a hand-built HUD theme, PostgreSQL 17 through
Drizzle, own cookie-session auth, Vitest. The layering is enforced rather than
suggested: `lib/engine` is pure — no React, no Next, no Drizzle, no `pg` — and
everything that touches the database lives in `lib/modules/<domain>/{repository,
service,actions}`. That rule is why the game rules are unit-testable at all, and
it is the single most valuable structural decision in the project.

**Three tiers of content**, deliberately separated (`ITEMS_EFFECTS_EVENTS.md` §3):

| Tier | Where it lives | Who edits it |
| --- | --- | --- |
| Catalog — what an item *is* | TypeScript in `lib/engine/iee/` | a developer, in a release |
| Season pool — what may drop *this run* and how often | `seasons.config.iee` (jsonb) | the host, in the wizard |
| Runtime — what a player actually holds and suffers | 4 tables | the game |

The catalog is code because an effect is inseparable from the function that
implements it. Challenges are the exception — they are prose and a reward, so
they are a real table (`event_templates`) that admins author.

---

## 2. How a season runs

Worth writing down plainly, because two of the findings below are only visible
once you see how much of this is manual.

### 2.1 Setting up

1. **Create** (`season/service/seasons.ts:63`). A slug, a title, and a board —
   either generated from the config or cloned from a previous run. Status
   `draft`. A partial unique index allows exactly one `active` season at a time
   (`db/schema/seasons.ts:41`).
2. **Tune** — the six-stage wizard (`templates → dice → board → pool → iee →
   rules`, `catalog/pool/season-setup.ts:149`). The whole of it lands in one
   jsonb column validated by `SeasonConfigSchema`. The `iee` stage is where the
   host picks which catalog entries may drop, sets rarity/weight/caps/cooldowns
   per entry, decides on PvP and catch-up, and reads the **live drop table** —
   computed by the same picker the game runs, with a simulate-1000-spins button.
3. **Roster.** There is no player-initiated join anywhere in the codebase.
   `addPlayerToSeason` (`season/repository/players.ts:101`) is reached only
   through the admin console. Everyone is added by hand.
4. **Activate.** `changeSeasonStatus` (`season/service/seasons.ts:157`) walks a
   transition table `draft → active → paused → finished → archived`, stamps
   `started_at`, and **resets every participant** to position 0 and balance 0.

### 2.2 A turn

1. **Roll** — `rollNewGame` (`game/service/roll.ts:10`). Refuses if the player
   already has an open roll. `rollRandomGame` filters the catalog by the
   season's pool rules, excludes blacklisted games and anything this player has
   already been given, and — when `perCellGenre` is on — narrows the genres to
   whatever the player's *current cell* demands.
2. **Play the game.** Off-platform. This is the part that takes a week.
3. **Declare** — `resolveGameRoll` (`game/service/resolve.ts:39`). Three
   outcomes: `passed`, `dropped`, `rerolled` (reason required, and usually a
   referee's approval).
4. **The turn transaction**, for `passed`/`dropped`:
   `turnRollSeq = sp.rollSeq + 1` → load the player's statuses once →
   `beforeMovement` (dice modifiers) → roll the dice and compute the move →
   `afterMovement` (step modifiers) → find the landing cell →
   `beforeCellEffect` (a shield may veto the landing) → apply the cell →
   `afterCellEffect` → open a transaction → write the roll, the move, the ledger
   entry and the player's new position → spin the wheel if the cell was
   bonus/penalty → `onOutcome` → `onTick` → spend charges → assign a challenge if
   the cell was an event → expire whatever ran out → write the feed rows.
   One transaction, so a move and the drop it produced can never be persisted
   apart.
5. **Or the moderation queue.** With `moderation.completionRequireApproval` on,
   step 4 does not happen: a `completion_requests` row is filed and a judge
   approves it later, which runs an **entirely different code path** — see A1.

### 2.3 Ending

This is the part that surprises: **nothing ends automatically.**

- The `finish` cell is `noOp` (`engine/board/cell-effects/registry.ts:12`). A
  player who reaches the last cell is clamped there by `normalizePosition` and
  keeps rolling, keeps landing on `finish`, keeps spinning nothing.
- `player_status` (`active|finished|eliminated|withdrawn`) is written **only** by
  `adminAdjustPlayer`. Nothing sets it from gameplay, and — see A9 — nothing
  reads it on the write path either.
- A season ends when a human clicks Finish. `changeSeasonStatus(id,"finished")`
  stamps `finished_at`; participants stay `active`.
- The "champion" is `leaderboard[0]` at render time, from a query ordered
  `asc(status), desc(position), desc(balancePoints)`.

So the platform is a **refereed** event, not a simulation: the tooling assumes a
host who is present. That is a legitimate design, but it should be a choice, and
right now the absence of finish detection reads more like an omission — a season
whose winner is decided by an admin remembering to click a status dropdown.

**There is no scheduler.** No cron, no queue, no background worker, confirmed
across the tree. Every expiry in the system is lazy: it happens on the next
resolve that touches the player. Two consequences run through the findings
below — a player who stops rolling keeps their statuses forever, and any path
that resolves a turn without calling the expiry sweep never expires anything.

---

## 3. Where IEE stands today

**Content:** 6 items, 8 effects, plus admin-authored challenges.
**Machine:** 9 declared hooks, 6 dispatched, 5 used by the catalog. 8 patch
fields, 4 used.

| | Declared | Wired into the loop | Used by a catalog entry |
| --- | --- | --- | --- |
| Hooks | 9 | 6 (`resolve.ts:212,224,260,275,367,386`) | 5 |
| Patch fields | 8 | 8 | 4 |

The parts that are genuinely good, and should be protected in any rework:

- **Selection is pure and takes its `rng` as an argument**, so the admin
  preview, the simulator and the game run the same function. What the host sees
  in the drop table is what the players will get. This is rare and worth a lot.
- **Gating happens before the wheel is built**, so a slice that cannot be
  granted is never shown. A wheel that displays an impossible outcome is a lie,
  and the code refuses to tell it.
- **The catalog returns intents, never writes.** An item's `apply` is a pure
  function whose result the service executes inside the turn transaction.
- **Counter-play is an invariant, not a review note** — a test fails the build if
  a negative effect ships without an answer.
- **The charge guard is in the `UPDATE`'s `WHERE`**, so a double-submitted form
  spends exactly one charge.

What follows is everything that is not that.

---

## 4. Findings

Ranked. Each one says what breaks, for whom, and what to do.

### A1 — Approval mode silently switches the entire subsystem off · **critical**

`game/moderation/completion.ts:27-66` is a second implementation of the turn, and
it has no IEE in it at all. Compared with `resolve.ts`, the approval path has:

| | `resolveGameRoll` | `approveCompletionRequest` |
| --- | --- | --- |
| `loadTurnHooks` | yes | **no** |
| `resolveMovement` modifiers | yes | **no** — called without `modifiers` |
| `beforeCellEffect` (shield) | yes | **no** |
| `afterCellEffect` (`taxed`) | yes | **no** |
| `onOutcome` (`momentum`) | yes | **no** |
| `applyWheel` (every drop) | yes | **no** |
| `assignEventFromCell` | yes | **no** |
| `settleTurnHooks` (charges) | yes | **no** |
| `expireEffectsFor` | yes | **no** |
| `rollSeq` increment | yes | **no** (`:66`) |

Turn on `moderation.completionRequireApproval` — a checkbox in the wizard, with
no warning attached — and bonus and penalty cells stop dropping anything, every
status stops firing, event cells stop assigning challenges, and shields never
absorb. Meanwhile the admin console still shows the pool, the drop table still
prints percentages, and `/rules` still promises players the whole list.

The second half is worse than the first. `roll_seq` never advances, so any effect
granted by an item or an event reward — the two paths that still work — compares
its `expires_after_roll_seq` against a counter that is frozen. **Those statuses
become permanent.** It is the same defect class as session 22's, one level up:
there, two clocks inside one turn; here, two turns.

**Fix.** There must be one turn. Extract everything from "the engine FSM
requires rolled → in_progress" (`resolve.ts:194`) to the end of the transaction
into `applyResolvedTurn(tx, { sp, roll, outcome, notes, rating, config })`, and
have both the immediate path and the approval path call it. The approval adds
only the request row's own bookkeeping.

**Guard.** A source test in the shape of `turn-clock.test.ts`: the set of IEE
call sites reachable from `approveCompletionRequest` must equal the set reachable
from `resolveGameRoll`. Then a future divergence is a failing test, not a season.

### A2 — Season tuning applies to wheel drops only · **high**

Three code paths grant an effect. Only one reads the season's configuration.

| Path | params | duration |
| --- | --- | --- |
| Wheel — `game/service/iee.ts:166` | `resolveParams` (defaults + `paramOverrides`) | `entry.durationOverride ?? catalog` |
| Item use — `game/service/use-item.ts:143,161` | `effectDef.defaults` | `duration.value` |
| Event reward — `game/service/events.ts:194` | `def.defaults` | `def.duration.value` |

A host who tunes `heavy_boots` to `steps: 4, duration: 3` gets 4 steps for 3
rolls from a penalty cell, and 2 steps for 1 roll from lead weights and from a
challenge reward. Two thirds of the grants ignore the screen the host tuned them
on.

**Fix.** One `grantEffect(tx, { seasonPlayerId, effectKey, config, anchorRollSeq,
source, appliedBy })` that resolves params and duration from `config.entries` in
exactly one place, and three callers. The same applies to `grantItem` and its
charges.

### A3 — `refresh` can *shorten* a status · **high**

`iee/repository/effects.ts:52` writes `expiresAfterRollSeq` unconditionally.
Refresh is supposed to mean "the clock starts again"; it currently means "the
clock becomes whatever the newest grant says", which can be less.

Combined with A2 this is an exploit with the sign flipped: a season that
overrides `slowed` to 5 rolls hands out a 5-roll slow from a penalty cell — and
then an enemy's hex scroll, which does not read the override, **refreshes it down
to 2**. Attacking a slowed rival helps them.

**Fix.** `expires_after_roll_seq = greatest(coalesce(expires_after_roll_seq, 0),
$new)`, charges likewise. A refresh may never reduce what is already there.

### A4 — The board and the leaderboard show statuses that no longer exist · **high**

`iee/repository/effects.ts:227` (`getActiveEffectsBySeason`) filters on
`state = 'active'` and nothing else — no charge check, no expiry check. It feeds
four public pages: `/board`, `/leaderboard`, `/seasons/[slug]/board`,
`/seasons/[slug]/leaderboard`.

Because expiry is lazy, a row stays `active` until the player's next resolve. A
shield that has already absorbed its hit, or a slow that ran out three days ago,
keeps its badge on every public surface — and for a player who has stopped
rolling, forever.

This is exactly the dashboard bug fixed in session 22, in four more places. It is
now the **fourth** independent reimplementation of "is this status still real".

**Fix.** One repository function that every badge surface calls, with the
predicate in the query (join `season_players`, compare against `roll_seq + 1`,
check `charges_left`). Then delete the freedom to get it wrong.

### A5 — The ledger can record points that were never taken · **medium**

`game/service/resolve.ts:277-279`:

```ts
finalBalance = Math.max(0, finalBalance + afterCell.balanceDelta);
ledgerDelta  += afterCell.balanceDelta;      // ← the unclamped number
```

`taxed` on a player at 0 balance leaves the balance at 0 and writes `-1` to
`ledger_entries`. The ledger is the audit trail *of* the balance; the two must
agree or neither can be trusted to explain the other. Note that `onOutcome`, a
hundred lines further down (`:380`), does it correctly — `delta: adjusted -
finalBalance`. One of the two is a bug and it is not the second one.

### A6 — Two shields burn on one hit · **medium**

`engine/iee/resolve/hooks.ts:91` collects `consumeCharge` from every patch at a
hook, so with two shield rows a single penalty landing spends both charges and
absorbs one landing. `shield.stacking` is `"stack"`, so two drops really are two
rows, and nothing caps how many a player may hold.

`iee-shield.test.ts:83` pins this in place: *"two shields both fire, so both
charges are spent on one hit"*. That test describes the reducer; it does not
defend a decision. From the player's side the rule is obvious — two shields are
two absorbed hits — and the test is currently the only thing standing in the way
of that.

**Fix.** A veto should be satisfied by the first effect that supplies it: once
`skipCellEffect` is set, later patches contribute their `reason` but not their
charge. Alternatively mark the field `exclusive` in `HookPatch` so the rule is
declared rather than implied. Then rewrite the test to state the intent.

### A7 — The usage window binds the caster, never the victim · **medium, a decision**

`engine/iee/use-guards.ts:36` checks `hasOpenRoll` for the **actor**. All three
offensive items are `window: "anytime"`. `/board` shows in-flight rolls.

So: watch the board, wait until a rival has an open roll, hit them with lead
weights, and the penalty lands on the move they are about to submit. That is the
same hindsight advantage `window: "before_roll"` exists to deny — taken from the
other end of the table.

This is not obviously wrong; sniping may be the point. But it is currently
*accidental*, unmentioned in `/rules` and untested. Decide it: either offensive
items refuse a target who has an open roll, or the rules page says out loud that
this is a legal play.

### A8 — Three capabilities are built and wired to nothing · **medium**

- **`expireOverdueEvents`** (`iee/repository/events.ts:209`) — zero call sites.
  The template editor offers `defaultDeadlineHours`, `due_at` is stored on every
  assignment, and nothing ever expires one. `isEventOverdue` in the engine is
  fully tested and called only by its own test. Deadlines are decorative.
- **`revokeItem`** (`iee/repository/inventory.ts:121`) — zero call sites, under a
  comment reading *"Always paired with an audit entry by the caller."* There is
  no caller. **No member of staff can take back a mis-dropped item, clear a
  status, or grant one.** `adminAdjustPlayer` covers position, balance and
  status; the whole of IEE has no staff intervention surface. On event day this
  is the gap a judge hits first.
- **`setSeasonStatus` / `updateSeasonConfig`** (`season/repository/seasons.ts:73,
  83`) — unguarded raw setters, no callers, sitting next to the guarded service
  that everything else goes through.

**Fix.** Either call them or delete them. Concretely: an "Items & effects" panel
on the admin player page — grant, revoke, cleanse, each with a required reason
and an audit row — closes the operational hole and gives `revokeItem` and
`cleanseEffects` the caller they were written for.

### A9 — Player status gates nothing · **medium**

Neither `rollNewGame` (`game/service/roll.ts:10`) nor `resolveGameRoll` reads
`sp.status`. A player marked `finished`, `eliminated` or `withdrawn` keeps
rolling, moving, drawing from the wheel and being targeted by items; the
dashboard's Roll button stays live. The four-state enum is display-only on the
write path, and combined with §2.3 it means the only thing that stops a
"finished" player is that they choose to stop.

It also feeds back into IEE: a withdrawn player still occupies a rank, and rank
is what drives catch-up weighting for everyone else.

### A10 — Approvals can move players on a closed season · **low**

`approveCompletionRequest` (`completion.ts:21`) and `approveRerollRequest`
(`reroll.ts:23`) fetch the season only to parse its config, and never check
`status`. `resolveGameRoll:88`, `rollNewGame:21` and `activateInventoryItem:80`
all check it. A request filed while the season was active can be approved after
it is finished or archived, writing moves and ledger entries onto a closed run.

### A11 — `revealDropsInFeed: false` leaks the drop anyway · **low**

`game/service/iee.ts:235` posts `effect_expired` unconditionally, and
`resolve.ts:409` posts `effect_cleansed` when a shield absorbs. A season that
chose to hide its drops announces each of them a few rolls later, by their
ending. Either gate those two behind the same flag, or drop the flag — a partial
secret is not one.

### A12 — Two fields in the hook snapshot are wrong · **low, latent**

`game/service/iee.ts:296` builds the `IeePlayerSnapshot` that every hook receives
with `moveCount: sp.rollSeq` and `rank: 1`. Elsewhere `moveCount` is
`count(moves)` — `counters.ts:getMoveCount` even carries a comment explaining why
it must not be `roll_seq` — and rank is a real query (`getPlayerRank`). No
catalog entry reads either field today, which is the only reason nothing is
broken, and exactly why the first one that does will be wrong quietly.

**Fix.** Pass the real snapshot (`toPlayerSnapshot`) or delete the two fields
from the hook context until something needs them. A field that lies is worse than
a field that is missing.

---

## 5. Design — where the subsystem is thin rather than broken

### B1 — The machine is bigger than the content

Nine hooks declared, six dispatched, five used. Eight patch fields implemented,
reduced and conflict-resolved; four used. `forcedPosition`, `forcedOutcome`,
`immune` and `diceCountDelta` are fully built and no entry in the catalog touches
them. `onTick` is dispatched every turn and nothing listens.

That is not waste — the reducer had to be written once and it is written well —
but it does say where the next value is: **content, not machinery**. Two things
the existing machine could express today, with no new hook:

- **`beforeGameRoll` is the unused hook worth wiring.** It is the only point that
  could touch the *game pool*: "your next game is drawn from horror only", "your
  next roll ignores the metacritic floor", "you may reroll once for free". In an
  event whose whole substance is which game you are handed, that is the most
  interesting lever the platform has, and nothing currently pulls it.
- **`forcedPosition` + `immune` are a trap and a ward** — one entry each, and the
  override path stops being theoretical.

### B2 — The catalog is a wrapper around itself

Five of six items exist to grant an effect: `lodestone`→`tailwind`,
`spare_die`→`lucky`, `lead_weights`→`heavy_boots`, `jinx`→`unlucky`,
`hex_scroll`→`slowed`. Only `cleansing_salve` does something of its own.

That symmetry is why the boots read as an artifact in session 20: at the level a
player experiences it, the item and the effect are one thing with two names and
two icons. Two honest ways out, and they are not exclusive:

1. Say it in the rules — "an item is how you carry an effect until you want it" —
   and stop drawing them as separate species.
2. Give items verbs of their own. They already return intents, so no new hook is
   needed: steal a point, swap positions with the player behind you, look at
   someone's next game, buy a reroll, bank a move. That is where the catalog
   becomes a game rather than a status-effect list.

### B3 — `durationOverride` means two different things

For an effect it is a number of rolls (`iee.ts:166`); for an item the same field
becomes `charges` (`iee.ts:138`). One control, one label, two meanings. Split it.

### B4 — Nothing bounds statuses

`inventorySize` caps items. There is no cap on effects: no `maxActiveEffects`, no
per-key stack limit, and `stack` entries accumulate without limit. A6 is the
first symptom; a player wearing nine of something is the second.

### B5 — The cooldown clock is the sum of everyone's rolls

`iee/repository/counters.ts:21` — `getSeasonRollSeq` sums `roll_seq` across all
participants. `cooldownRolls: 10` therefore means "ten rolls by anyone", which in
an eight-player season is about one round. The wizard hint says so, but a number
whose meaning changes with the table size is a poor tuning surface. Either
express cooldowns in the player's own rolls, or rename the field
`cooldownSeasonRolls` so the host reads it correctly without the hint.

### B6 — Polarity is printed as a value judgement

The type comment says it plainly: *"which cell pool a thing drops from — NOT
whether it helps its holder"*. Every badge prints «ПОЛОЖИТЕЛЬНЫЙ» next to a hex
scroll. Rename the label to the pool («из бонусного пула»), or introduce the
second axis honestly — pool *and* whether it is good for you — because those are
genuinely two facts and the catalog currently ships only one.

### B7 — A season's IEE history cannot be read back

The counters already exist (`countItemsPerSeason`, `countEffectsPerSeason`,
`lastEffectDropSeq`). Nothing renders them. The simulator predicts a distribution
before the season; nothing measures the one that happened, so a host tuning the
next run is guessing from the feed. One admin page over queries that already
exist turns the prediction into a measurement.

---

## 6. Testing — why the suite could not see any of this

479 unit tests, roughly 180 of them IEE, and **every one of them is pure**. Both
bugs found in session 22 lived in the wiring between correct pure functions, and
so do A1, A2, A3, A4 and A5. The suite is not weak; it is aimed at the half of
the system where the defects are not.

`ITEMS_EFFECTS_SCENARIOS.md` already admits this: 57 scenarios, 46 pure and **11
that need the turn transaction, the database and a browser** — and those 11 are
executed by hand, in a harness that is not in the repository.

**Recommendation.** Promote the probe into a checked-in integration suite:
`probe/*.mts` against a scratch Postgres from `compose.yaml`, behind
`pnpm test:live`, not on the default `pnpm test` path. Four cases pay for the
whole thing:

1. one full turn end to end — the one that found session 22's bugs;
2. **approval mode produces the same result as immediate mode** — this alone
   would have caught A1 the day it was written;
3. a `rolls` duration lasting exactly N rolls, asserting every roll in the window;
4. one shield absorbing exactly one landing, with two shields absorbing two.

---

## 7. Order of work

**First — collapse the duplicates.** A1, A2+A3, A4. All three are the same
shape: one rule with several implementations, drifting. It is the shape of every
serious bug this subsystem has produced, including both of session 22's. Nothing
else should be built on top of it until there is one turn, one grant and one
"is this status still real".

**Second — the small contained ones.** A5 (ledger honesty), A6 (shields), A11
(feed leak), A12 (the lying snapshot).

**Third — the operational holes.** A8 (staff grant/revoke — the one a judge will
need on event day), A9 (player status gating, and a decision about finish
detection), A10 (season-status guard on approvals).

**Fourth — content.** B1 and B2, once the machine underneath is trustworthy. A
richer catalog on top of a turn that silently disables itself in approval mode is
more surface to be wrong.

**Alongside all of it — the live suite** (§6), because every finding above that
matters was found by running the game rather than by reading it.
