# IEE fix plan

> The findings of [`IEE_AUDIT.md`](./IEE_AUDIT.md), turned into an order of work.
> Every stage says, in plain terms, **what a player or a host sees today that is
> wrong**, what changes in the code, and how the fix is proved. Nothing is
> "cleanup" — each item exists because something visible is broken.
>
> Written 2026-09-10 against the working tree at `0.5.0`.
> Baseline before any of this: 479 tests / 23 files green.

---

## Status — 2026-09-10

**Stages 1–5 are done and verified.** Stage 6 (content) is deferred by the host.

| Stage | State |
| --- | --- |
| 1 — One turn | **Done.** `applyResolvedTurn` in `service/turn.ts`; both entry points delegate. Proved live in approval mode. |
| 2 — One grant | **Done.** `grantEffect` / `grantInventoryItem`; `refreshEffect` takes the later expiry. Two further bugs fell out of centralising it: `unique` stacking was not enforced outside the wheel, and a challenge reward ignored the stacking policy entirely. |
| 3 — One "is this status alive" | **Done.** `stillInForce()` applies the rule in SQL; the four badge surfaces and the dashboard all read it from the repository. |
| 4 — Four contained fixes | **Done.** Ledger honesty (in the engine *and* the turn), two shields absorb two hits, the reveal flag gates both ends, the hook context carries the real snapshot. |
| 5 — Operational holes | **Done**, with the host's decisions: a judge can remove an item or a status (audited); reaching the finish cell ends the run and records the time; the leaderboard ranks finishers by arrival; no write path moves a participant who is out of the run; approvals refuse a closed season. Sniping resolved as §6c below. |
| 6 — Content | Deferred — `beforeGameRoll` and the item/effect split, to be picked up later. |

**Decisions taken by the host on 2026-09-10** (§5 and §6c of this plan):

1. *A judge can lift a status or take an item back.* Built as removal only —
   granting is a different act and would have to answer to the season's pool and
   its caps.
2. *Reaching the finish records the time and the place.* Built as automatic:
   the landing that reaches the last cell sets `status = 'finished'` and
   `finished_at` in the same statement as the move, and the leaderboard orders
   finishers by arrival. A looping board has no finish cell, so such a season
   still ends when the host says so.
3. *Sniping* — decided as: **a status never touches a move already in flight.**
   A cell drop never did; an item aimed at a player with an open roll used to.
   The clock now starts one roll later for a recipient who is mid-game, so
   offensive items stay usable (an open roll is the normal state in this format,
   and forbidding the use would make them dead weight) while the victim gets the
   answering window §8.3 requires everywhere else.

**Verification after stage 5.** `tsc --noEmit` clean · `eslint` 0 errors, 5
pre-existing warnings · **551 tests / 29 files** (was 479 / 23) · `next build`
succeeds · three live probes green:

- `probe-boots.mjs` — immediate mode, unchanged behaviour;
- `probe-approval.mjs` — approval mode: filing an outcome moves nobody, the
  judge's approval produces the move *and* advances `roll_seq`, a status fires
  and expires on schedule, and a landing cell spins its wheel;
- `probe-finish.mjs` — the finishing move records the time, the dashboard stops
  offering a roll, and a judge removes a status and an item through the admin
  panel, each with a reason, each landing in the feed and the audit log.

Every new test was mutation-checked: reverting the fix fails it. Three
characterization tests were rewritten rather than kept, because each pinned a
behaviour nobody had chosen — see stage 4.

**One thing to run before this reaches players:** migration `0017` adds
`season_players.finished_at`. `pnpm db:push` (or `pnpm db:migrate`) applies it.

---

## The ordering principle

Stages 1–3 are the same defect three times over: **one rule with several
implementations, drifting apart.** That is the shape of both bugs found in
session 22, and of the three worst findings in the audit. They come first, and
nothing is built on top of them until they are done, because every new feature
added to a duplicated rule has to be added twice and will eventually be added
once.

Stage 4 is small and contained. Stage 5 is the operational hole a judge falls
into on event day. Stage 6 is content, and content is the only thing here that
is worth doing *after* the machine is trustworthy rather than before.

| Stage | Fixes | Nature | Needs a decision from the host |
| --- | --- | --- | --- |
| 1 — One turn | A1 | refactor + bug | no |
| 2 — One grant | A2, A3 | bug | no |
| 3 — One "is this status alive" | A4 | bug | no |
| 4 — Four contained fixes | A5, A6, A11, A12 | bug | A6 is a rule, flagged |
| 5 — Operational holes | A8, A9, A10 | missing capability | **yes** |
| 6 — Content | B1, B2, A7 | design | **yes** |

---

## Stage 1 — One turn

### What is broken today

Turn on «прохождение требует подтверждения» in the season settings and the whole
items-and-effects system stops existing, without a word anywhere:

- bonus and penalty cells hand out nothing — the wheel never spins;
- event cells assign no challenges;
- a shield does not absorb the penalty it is being carried for;
- boots, slow, jinx, tailwind — none of them apply;
- and the player's roll counter stops advancing, so any status that *was* given
  by an item or a challenge reward **never expires**. It stays on them for the
  rest of the season.

Meanwhile the admin console still shows the pool and the drop table, and
`/rules` still promises players every entry in it.

The cause: a resolved turn is written twice. `resolveGameRoll`
(`lib/modules/game/service/resolve.ts:194-445`) is the real one; when the
approval switch is on, the move is executed instead by
`approveCompletionRequest` (`lib/modules/game/moderation/completion.ts:27-66`),
which was written before IEE existed and never learned about it.

### The change

1. **New file `lib/modules/game/service/turn.ts`** with one exported function:

   ```ts
   /**
    * Everything that happens once a roll's outcome is decided.
    *
    * It lives in its own file because there are two ways to reach it — the
    * player marking the outcome, and a judge approving the request the player
    * filed — and for a year they were two different pieces of code. The second
    * one predated items and effects and never learned about them: with
    * `moderation.completionRequireApproval` on, no wheel spun, no status fired,
    * no challenge was assigned, and `roll_seq` never moved, which quietly made
    * every item-granted status permanent. One turn, one implementation.
    */
   export async function applyResolvedTurn(input: ResolvedTurnInput): Promise<ResolvedTurnResult>
   ```

   The body is today's `resolve.ts:194-445`, moved verbatim: the single
   `turnRollSeq`, the six hooks, the movement, the cell, the wheel, the
   challenge assignment, the charge settlement, the expiry sweep and the feed
   batch — all inside the one transaction they are in now.

   Two seams for the approval path, both small:
   - `extraWrites?: (tx, ctx: { moveId: string }) => Promise<void>` — the
     approval marks its own request row inside the same transaction;
   - `extraEvents?: FeedEntry[]` and `feedExtra?: Record<string, unknown>` — the
     `completion_approved` row and the `approvedBy` field on the outcome event.

2. **`resolve.ts`** keeps its guards, its reroll branch and its
   completion-queue branch, parses notes/rating as it does now, and ends with
   `return applyResolvedTurn({...})`.

3. **`completion.ts`** keeps its staff check and its own guards, and replaces
   lines 27–66 with the same call, passing `notes: req.reason`,
   `rating: req.rating` and the two seams.

### Verified by

- **A parity test** in the shape of `turn-clock.test.ts`: walk the call graph of
  both entry points and assert that the set of IEE calls reachable from
  `approveCompletionRequest` equals the set reachable from `resolveGameRoll`.
  A future divergence then fails a test instead of a season.
- The existing 479 stay green.
- **Live probe, approval mode**: the same heavy-boots scenario as session 22,
  with `completionRequireApproval: true` — the boots must shorten exactly one
  move and then expire, identically to immediate mode.

### Risk

This is the largest change of the six and it touches the turn transaction. It is
a *move*, not a rewrite: the body is transplanted line for line and the diff
should read as such. If a line changes meaning during the move, the 479 tests
will not catch it — the live probe is what does.

---

## Stage 2 — One grant

### What is broken today

**(a) The season's tuning is honoured only when a thing drops from a cell.**
You set heavy boots to «−4 cells, 3 rolls» in the wizard. A player who steps on
a penalty cell gets −4 for 3 rolls. A player hit by lead weights gets −2 for 1
roll — the catalog values — because that path never looks at the season config.
Same status, same name, same icon, different behaviour, no explanation anywhere.
The third path, a challenge reward, ignores the tuning too.

**(b) An attack can make its victim better off.** `slowed` is a `refresh`
status: granting it again restarts the timer instead of stacking. The code
writes the new expiry unconditionally, so "restart" really means "set the timer
to whatever the newest grant says" — including a *smaller* number. Combined with
(a): a season that tuned `slowed` to 5 rolls gives 5 from a penalty cell, and a
hex scroll from an enemy — which reads the catalog's 2 — **overwrites 5 with 2**.
Attacking a slowed rival shortens their slow.

### The change

1. **`lib/modules/game/service/grant.ts`**, two functions, each reading the
   season config in one place:

   ```ts
   /**
    * Grants an effect to a participant.
    *
    * Three callers reach this: a wheel drop, an item being used, and a
    * challenge reward. Only the first used to read the season's tuning, so a
    * host who set heavy boots to "-4 for 3 rolls" got that from a penalty cell
    * and the catalog's "-2 for 1" from lead weights. The tuning screen now
    * means the same thing whichever way the status arrives.
    */
   export async function grantEffect(tx, {
     seasonId, seasonPlayerId, effectKey, config, anchorRollSeq, source,
     sourceMoveId, appliedBySeasonPlayerId,
   }): Promise<{ row: PlayerEffectRow; refreshed: boolean }>

   export async function grantInventoryItem(tx, { ... }): Promise<PlayerInventoryRow>
   ```

   `anchorRollSeq` is the one number the callers legitimately differ on: the
   roll being resolved for a wheel drop, the player's last resolved roll for an
   item used between turns. Naming it forces each caller to state its clock,
   which is what session 22 was about.

2. **`refreshEffect`** (`lib/modules/iee/repository/effects.ts:52`) takes the
   later of the two expiries and the larger of the two charge counts:

   ```sql
   expires_after_roll_seq = greatest(coalesce(expires_after_roll_seq, 0), $new)
   ```

   with a comment saying that a refresh may never reduce what is already there.

3. Three call sites replaced: `service/iee.ts:120-200` (wheel),
   `service/use-item.ts:139-185` (item), `service/events.ts:180-215` (reward).

### Verified by

- Unit tests on `grantEffect`'s pure part: an entry with `paramOverrides` and
  `durationOverride` produces the tuned row; an entry absent from
  `config.entries` falls back to the catalog.
- A test that `refreshEffect` never shortens: seed 16, refresh with 13, expect 16.
- A source test that the three call sites all go through `grantEffect` — the
  same guard shape as stage 1, because this is the same failure mode.

### Risk

Low. The behaviour only becomes *more* faithful to what the wizard shows. The
one visible change for an existing season is that item-granted statuses may now
last longer or hit harder than they did — which is what the host asked for.

---

## Stage 3 — One "is this status alive"

### What is broken today

The board and the leaderboard draw a badge for every status a player is
carrying — deliberately, because that is the information PvP is played on: you
look at the board to decide who to throw a scroll at.

Those badges are wrong. Statuses die lazily (there is no scheduler anywhere in
the project — a status is only marked dead during that player's *next* move),
and the badge query asks the database only "is this row still marked active",
without checking whether its timer ran out or its charge was spent. So a shield
that has already absorbed its hit still shows as a shield; a player who has
stopped rolling keeps every badge they had, permanently.

This is the dashboard bug of session 22 — «0 бросков осталось» on a spent
status — in four more places: `/board`, `/leaderboard`,
`/seasons/[slug]/board`, `/seasons/[slug]/leaderboard`. The rule "is this
status still real" is currently written four times, and three of them are wrong.

### The change

1. **`getActiveEffectsBySeason`** (`lib/modules/iee/repository/effects.ts:227`)
   joins `season_players` and applies the predicate in SQL:

   ```sql
   (charges_left is null or charges_left > 0)
   and (expires_after_roll_seq is null or expires_after_roll_seq >= sp.roll_seq + 1)
   ```

   with a comment tying the `+ 1` to `isEffectActive` and to session 22: the
   comparison is against the roll that is *next*, never the one that finished.

2. **`getActiveEffectsWithCaster`** (same file) gets the same treatment, and the
   dashboard's manual `.filter(isEffectActive)` (`app/(public)/dashboard/page.tsx:207`)
   goes away — the repository is now the single place that knows the rule.

3. A one-line comment on `player_effects.state` in the schema saying that
   `active` means "not yet swept", not "in force", so the next person does not
   read the column the way these four pages did.

### Verified by

- A source test: no file outside `lib/engine/iee/resolve/hooks.ts` and the
  effects repository may re-implement the predicate — a scan for
  `chargesLeft` / `expiresAfterRollSeq` comparisons outside those two files.
- Live check: spend a shield, then load `/board` **without** making another
  move, and the badge is gone.

### Risk

Low, and it makes four pages agree with the one page that was already right.

---

## Stage 4 — Four contained fixes

### 4a — The ledger records points that were never taken (A5)

**Today:** a player with 0 points carrying `taxed` lands on a cell. Their
balance stays 0 — it cannot go negative — but the points ledger gets a `−1`
row. Nothing was taken and the history says something was. Sum the ledger and it
no longer matches the balance.

**Change:** `resolve.ts:277-279` computes the clamped balance first and writes
the *difference that actually happened*, exactly as `onOutcome` already does a
hundred lines below (`:380`). One of the two was right; it was not this one.

**Verified by:** a unit test on the arithmetic (balance 0, `taxed` −1 → ledger
delta 0), plus a live assertion that `sum(ledger_entries.delta)` equals
`balance_points` at the end of the probe run.

### 4b — Two shields burn on one hit (A6)

**Today:** shields stack — two drops are two shields. A single penalty landing
spends **both** charges and absorbs **one** landing. `iee-shield.test.ts:83`
records this as fact ("two shields both fire, so both charges are spent on one
hit"); it was never decided, it is what the reducer happens to do.

**Change:** a veto is satisfied by the first effect that supplies it. In
`reduceHookPatches` (`lib/engine/iee/resolve/hooks.ts:91`), once `skipCellEffect`
is already set, a later patch still contributes its `reason` but not its charge.
Effects are already sorted by priority, so "first" is deterministic.

**Verified by:** the existing shield test, rewritten to say what should happen —
two shields, one landing, one charge spent, one shield left. Plus a live check
that the second landing is absorbed too.

> **This is a rule change, not only a bug fix.** Two shields will now protect
> against two hits instead of one. It is what a player expects and what the
> catalog's own description implies, but if you want the old behaviour say so
> and it is one line back.

### 4c — `revealDropsInFeed: false` leaks the drop anyway (A11)

**Today:** a season that chose to hide drops from the feed still posts
`effect_expired` when the status ends (`service/iee.ts:235`) and
`effect_cleansed` when a shield absorbs (`resolve.ts:409`). The secret is kept
for a few rolls and then announced by its own ending.

**Change:** both gated behind the same flag as the grant. A partial secret is
not one.

### 4d — Two fields in the hook context lie (A12)

**Today:** every effect's hook receives a player snapshot in which
`moveCount` is actually the roll counter and `rank` is hardcoded `1`
(`service/iee.ts:296`). Elsewhere `moveCount` is `count(moves)` — with a comment
in `counters.ts` explaining precisely why it must not be `roll_seq` — and rank
is a real query. No catalog entry reads either field today, which is the only
reason nothing is broken, and exactly why the first one that does will be wrong
without anyone noticing.

**Change:** pass the real snapshot (`toPlayerSnapshot`), or delete the two
fields from `HookContext` until something needs them. Prefer passing the real
one — a catch-up effect keyed on rank is an obvious future entry.

---

## Stage 5 — The operational holes · **needs your decisions**

### 5a — Staff cannot touch items or effects at all (A8)

`revokeItem` and `cleanseEffects` are written, tested and **called by nothing**.
There is no screen where a judge can take back an item that dropped by mistake,
clear a status, or grant one as compensation. `adminAdjustPlayer` covers
position, balance and status and stops there. On event day this is the first
wall a referee hits.

**Proposal:** an "Items & effects" panel on the admin player page — the held
inventory and the active statuses, each with revoke/cleanse, plus a grant
control over the season's pool. Every action requires a reason and writes an
audit row, like every other staff mutation in this project.

Also in scope: `expireOverdueEvents` has zero call sites, so challenge deadlines
are decorative. Either call it when the moderation queue and the player's
challenge panel are read, or remove the deadline field from the template editor.

### 5b — Player status gates nothing, and nothing ever finishes (A9)

A player marked `finished`, `eliminated` or `withdrawn` keeps rolling, moving,
spinning the wheel and being targeted. The `finish` cell is a no-op, so reaching
the end of the board does nothing at all — a player parks on the last cell and
keeps playing. The winner is whoever happens to be first in the leaderboard
query when someone looks.

**Decision needed.** Two coherent answers:
- *Refereed*: keep it manual, but make status mean something — refuse a roll
  from a non-active player, and hide their badges. Small change.
- *Automatic*: landing on `finish` sets `status = finished`, stamps the time,
  writes a feed row, and the leaderboard orders finishers by arrival. Bigger,
  and it needs a rule for looping boards, which have no finish cell at all.

Which one it is changes what the leaderboard means, so it is yours to pick.

### 5c — Approvals can move players on a closed season (A10)

`approveCompletionRequest` and `approveRerollRequest` never check
`season.status`; the three player-facing paths all do. A request filed while the
season was active can be approved after it is finished, writing moves and ledger
entries onto a closed run. One guard each — no decision needed, listed here
because it belongs to the same file as 5a's work.

---

## Stage 6 — Content · **needs your decisions**

### 6a — The unused hook worth wiring (B1)

Nine hook points are declared, six are dispatched, five are used. Everything
built and unused is machinery; the one that would add something players notice
is **`beforeGameRoll`** — the only point that can touch *which game you are
handed*. "Your next game comes from horror only." "Your next roll ignores the
metacritic floor." "One free reroll." In an event whose entire substance is the
game you are given, that is the most interesting lever the platform owns, and
nothing pulls it.

### 6b — Items are wrappers around effects (B2)

Five of six items exist to grant an effect. Only `cleansing_salve` does anything
of its own — which is why the boots read as an artifact in session 20: at the
level a player experiences it, the item and the status are one thing with two
names and two icons. Either say so in the rules and stop drawing them as two
species, or give items verbs of their own: steal a point, swap places with the
player behind you, look at someone's next game, bank a move. They already
return intents, so no new machinery is needed — only content.

### 6c — Sniping an open roll (A7)

The usage window is checked against the *caster*, never the target. Offensive
items are `anytime`, and `/board` shows in-flight rolls, so you can wait until a
rival has rolled and drop boots on the move they are about to submit. It may be
a fine play — but right now it is accidental, unmentioned in `/rules` and
untested. Decide it, then either enforce it or document it.

---

## What is checked at every stage

Unchanged from the project's standing bar:

- `pnpm exec tsc --noEmit` clean;
- `pnpm lint` — 0 errors (5 pre-existing warnings);
- `pnpm test` — the suite grows, never shrinks;
- every new test **mutation-checked**: revert the fix, the test must fail;
- `pnpm build` succeeds;
- and for stages 1–4, the live probe, because every defect in this plan lives in
  the wiring between correct pure functions and no unit test can see it.
