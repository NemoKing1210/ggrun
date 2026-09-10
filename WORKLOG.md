# WORKLOG — project journal

> Running log of work sessions: what was done, what was decided, and what the
> next person (or agent) should pick up.
>
> **Not `CHANGELOG.md`.** The changelog records *released* user-facing changes
> under a version number, per Keep a Changelog. This file records *work* —
> including analysis, decisions and dead ends that never produce a release
> line. When a session ships something releasable, it goes in both.
>
> Newest entry first. Keep entries factual and short; link to the design doc
> instead of restating it.

---

## Current state

| | |
| --- | --- |
| Version | `0.5.0` |
| Branch | `main` |
| Active work | **IEE audit** — [`IEE_AUDIT.md`](./IEE_AUDIT.md) + [`IEE_FIX_PLAN.md`](./IEE_FIX_PLAN.md); stages 1–5 shipped and proved live, stage 6 (content) deferred. UX backlog waves 1 and 2 done; artwork pipeline in place, awaiting art |
| Design doc | [`ITEMS_EFFECTS_EVENTS.md`](./ITEMS_EFFECTS_EVENTS.md) |
| Behaviour | [`ITEMS_EFFECTS_SCENARIOS.md`](./ITEMS_EFFECTS_SCENARIOS.md) — 57 scenarios, generated from the table the tests run |
| Decisions | §12 answered by accepting every ★ recommendation (see 2026-09-07 s2) |
| Tests | **570 unit tests** (330 engine + 240 added in sessions 16–23) + 103 live assertions from session 15; tsc, eslint, `next build` and a browser pass against the live app all green |
| Uncommitted | Yes — everything below lives in the working tree only, by request |
| **Action needed** | Run `pnpm db:push` then `pnpm db:seed` — and note migration `0017` (`season_players.finished_at`) is new as of session 23. Verified end-to-end against a scratch Postgres, **not applied to your database** |
| Next step | **Yours**: run `pnpm db:push` + `pnpm db:seed`, then play a season through. Nothing is committed — see below. |

### Known repo issues

- **332 files show as modified with zero content change.** `git diff
  --ignore-all-space --stat` is empty — it is entirely CRLF/LF churn, the
  Windows issue `AGENTS.md` §6 warns about. **Consequence: `git add -A` would
  produce a 332-file line-ending commit.** Stage explicitly by path until this
  is normalised (`git add --renormalize .` in one dedicated commit).
- **Stale `.git/index.lock`** left behind by a tool that could not unlink it.
  Git reads fine; any write (`add`, `commit`) will fail with
  `Unable to create '.git/index.lock': File exists` until it is removed.
- **`node_modules/` is unusable from Linux.** pnpm's package links were created
  on Windows and do not resolve through the mount (`ls` reports
  `Input/output error`, link size 0), so `pnpm lint` / `tsc` / `vitest` cannot
  run against this checkout from a Linux shell. The real packages do exist as
  directories under `node_modules/.pnpm/`. Workaround used below: typecheck and
  test the engine in an isolated harness. Running `pnpm install` on Windows
  fixes it for Windows shells; it has not been re-run.

---

## 2026-09-10 — Session 23 · The IEE audit, and five stages of fixes

Asked for an audit of the items-and-effects subsystem: describe the project,
describe how a season actually runs, then say where the system can be improved.
The reading produced [`IEE_AUDIT.md`](./IEE_AUDIT.md) — twelve defects and seven
design notes, each read out of the tree with `file:line` rather than recalled
from the design document. [`IEE_FIX_PLAN.md`](./IEE_FIX_PLAN.md) turns it into
six stages. **Stages 1–4 are implemented and verified; 5 and 6 are waiting on
decisions.**

The audit's own finding about itself: the three worst defects are all one shape
— *one rule, several implementations, drifting* — which is exactly the shape of
both bugs fixed in session 22. So the first three stages are de-duplications,
and each ends with a test that states the rule rather than the symptom.

### Stage 1 — one turn

`approveCompletionRequest` was a second implementation of a resolved roll,
written before IEE existed and never taught about it. Switching on
`moderation.completionRequireApproval` — a checkbox in the wizard, with nothing
attached to it — silently produced a different game: no hook fired, no wheel
spun, no challenge was assigned, no charge was spent, nothing expired, and
`season_players.roll_seq` never advanced. That last one is the quiet half: a
status granted by an item or a challenge reward measures its life in that
counter, so with it frozen those statuses **never expired at all**. Meanwhile
the admin console kept showing the pool and `/rules` kept promising the list.

The turn moved to `lib/modules/game/service/turn.ts` as `applyResolvedTurn` —
transplanted, not rewritten — and both entry points now call it. The approval
path keeps its own guards and writes its request row through an `extraWrites`
seam so the approval and the move it authorised share one transaction.

`turn-parity.test.ts` states the rule: neither entry point may call the turn's
primitives or write `rollSeq`, and the turn must call all of them.

### Stage 2 — one grant

Three things grant a status and only one read the season's tuning. A host who
set heavy boots to "−4 cells for 3 rolls" got that from a penalty cell and the
catalog's "−2 for 1" from lead weights and from a challenge reward. The wizard
screen described one third of the game.

Worse in combination with `refreshEffect`, which wrote the new expiry flat:
a season that stretched `slowed` to five rolls handed out five from a cell, and
an enemy's hex scroll carrying the catalog's two **overwrote five with two**.
Attacking a slowed rival made them faster.

`grantEffect` / `grantInventoryItem` (`service/grant.ts`) now own it, over a
pure `resolveEffectGrant` in the engine; `refreshEffect` takes `greatest()` of
old and new. Two further bugs fell out of centralising it: `unique` stacking was
never enforced outside the wheel — an item could apply a second `unlucky` and
both rows fired, halving the dice twice — and a challenge reward ignored the
stacking policy entirely. A `unique` status already on the target now refuses
the *use*, before the charge is spent (`ieeTargetAlreadyAffected`, en/ru/uk).

### Stage 3 — one "is this status alive"

`state = 'active'` does not mean a status is in force: expiry is lazy, so a row
keeps that state until the player's next resolve sweeps it. The badge query
asked for the column and nothing else, so `/board`, `/leaderboard` and both
season-scoped copies drew badges for statuses that had already ended — a spent
shield stayed visible, and a player who stopped rolling kept every badge
permanently. Those badges are what PvP decisions are made on.

The rule is now `stillInForce()` in SQL, joined against the player's own
`roll_seq + 1`, and the dashboard's hand-written filter is gone. Four
implementations became one; a source test refuses a fifth.

### Stage 4 — four contained fixes

- **The ledger recorded points that were never taken.** `applyCellEffect`
  clamped the balance at zero and reported the full requested amount: a penalty
  of 9 against a balance of 5 left the player on 0 and wrote −9. The ledger is
  what explains a balance back to a player. Fixed in the engine and in the
  turn's `afterCellEffect`; `onOutcome` was already right.
- **Two shields burned on one hit.** Both returned a veto and both were charged.
  A veto is now satisfied by the first effect that supplies it, so two shields
  absorb two landings. Notably `SC-SHIELD-3` has said exactly that in its title
  and `then` clause since it was written — the assertion under it pinned the
  opposite, and the generated scenario reference has been promising players the
  correct behaviour all along.
- **`revealDropsInFeed: false` leaked anyway** — the feed still announced each
  status when it expired and each shield absorb. Both gated now. Item *use*
  stays public whatever the flag says: that is the deterrent, and deliberate.
- **The hook context carried two lies** — `moveCount: sp.rollSeq` and
  `rank: 1` hardcoded. No entry reads them yet, which is why nothing broke and
  why it needed fixing before something did.

### Verification

`tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing warnings ·
**531 tests / 28 files** (was 479 / 23) · `next build` succeeds.

Every new test mutation-checked — thirteen mutations, each caught. Three
characterization tests were rewritten rather than preserved, because each pinned
a behaviour nobody had chosen (the shield double-burn, the shield scenario, and
the ledger's `−9`); a test that records what the code does is not a decision.

Both live probes green, against the real built app in a real browser on a
scratch database:

```
probe-approval.mjs   (NEW — moderation.completionRequireApproval: true)
  marking an outcome files a request and moves nobody     PASS
  move 1: dice {7}  sum=7  · 0 → 7   · travelled 7    (baseline)
  the roll counter advanced — roll_seq=1                 PASS   ← the headline
  move 2: dice {14} sum=14 · 7 → 19  · travelled 12   expected 12
  move 3: dice {19} sum=19 · 19 → 38 · travelled 19   status expired on time
  move 4: dice {7}  sum=7  · 38 → 45 · travelled 7    the wheel granted lodestone
  ALL CHECKS PASSED

probe-boots.mjs      (immediate mode, unchanged)
  move 2: dice {1}  sum=1  · 15 → 15 · travelled 0    expected 0
  ALL CHECKS PASSED
```

The roll of 1 on move 2 exercised session 22's backward-move clamp again for
free.

**Not in the repo, as before.** Both Playwright probes and the scratch-database
fixture live in the verification harness only.

### Left for you *(answered the same day — see the section above)*

`IEE_FIX_PLAN.md` §5 and §6 were decisions, not work:

- **Staff cannot touch items or effects at all.** `revokeItem` and
  `cleanseEffects` are written, tested and called by nothing; there is no screen
  where a judge takes back a mis-dropped item or clears a status. First wall a
  referee hits on event day.
- **Nothing ever finishes.** The `finish` cell is a no-op, `player_status` is
  admin-only and gates nothing on the write path, and the winner is whoever the
  leaderboard query happens to put first. Refereed or automatic — that is a
  rules decision.
- **Sniping an open roll.** Offensive items are `anytime` and the window is
  checked against the caster, never the victim, so you can drop boots on a move
  someone is about to submit. Legal play or not, it should be decided rather
  than accidental.
- **Content.** `beforeGameRoll` is the one unwired hook worth having — it is the
  only point that can touch *which game you are handed*. And five of six items
  are wrappers that grant an effect, which is why the boots read as an artifact.

---

### Later the same day — stage 5, and three decisions

The host answered the three open questions, so the operational half of the plan
is done too.

**A judge can take an item or a status back.** `revokeItem` and `cleanseEffects`
had been written, tested and called by nothing — their own comments promised an
audit entry "by the caller" and there was no caller. There is now an "Items &
effects on participants" panel on the season's players page: what each
participant is carrying, a required reason per removal, an audit row and a feed
line. Removal only — granting is a different act and would have to answer to the
season's pool and its caps.

It sits beside the roster rather than inside it: the roster table is one row per
participant about position, balance and status, and this is two lines per entry
about the few who happen to hold something.

**Reaching the finish ends the run.** The `finish` cell was a `noOp`, so a player
who reached the last cell parked there and kept rolling, and the winner was
whoever the leaderboard query happened to put first. Now the landing that
reaches it sets `status = 'finished'` and a new `season_players.finished_at`
**in the same statement as the move** — a finish cannot be recorded without its
move — and posts `player_finished` to the feed. Migration `0017`.

Checked against the position the player *ends* on, not the one they landed on: a
teleport onto the last cell finishes them just as much. A looping board has no
finish cell at all, so nothing fires there and such a season still ends when the
host says so.

Two things fell out of it:

- **The leaderboard sorted the wrong way and always had.** Its comment said
  "finished players first"; the clause said `asc(status)`, which is the *enum's
  declaration order* — `active, finished, eliminated, withdrawn` — so active
  players outranked finishers. It only ever looked right because nothing set
  anyone to `finished`. Now: finishers first ordered by arrival time (the only
  thing that can separate players standing on the same cell), then the runners,
  then everyone out of the running.
- **Player status now gates the write path.** It was display-only: a
  `finished`, `eliminated` or `withdrawn` participant kept rolling, moving and
  drawing from the wheel, and the dashboard kept offering the button. All four
  write paths refuse them now, and the dashboard shows the run's end and when it
  happened. The two approval paths also learned to check the *season's* status,
  which they never had — a request filed while a season was active could be
  approved after it was finished.

**Sniping, decided.** Offensive items are `anytime` and the usage window was
checked against the caster, never the victim, so you could wait for a rival to
have a game in flight — `/board` shows it — and drop boots on the move they were
about to submit. They came back after a week, pressed "passed", travelled two
cells less than the dice said, and had never had a chance to answer.

Forbidding it was the wrong fix: in this format an open roll is the normal state,
so that would make offensive items dead weight. The rule is instead that **a
status never touches a move already in flight** — which is how a *cell* drop has
always behaved, since its status is granted at the end of a turn and bites the
next one. `grantAnchor` pushes the clock one roll out for a recipient who is
mid-game. The items stay as usable as they were, the ambush is gone, and the
victim gets the answering window §8.3 requires everywhere else. Written up as
`SC-HEXSCROLL-7`, so the generated reference says it too.

**Verification.** `tsc` clean · `eslint` 0 errors · **551 tests / 29 files** ·
`next build` succeeds. Four more mutations, all caught. A third live probe:

```
probe-finish.mjs
  position 59/59 · status finished · finished_at 2026-09-10 09:25:57+00
  they are standing on the finish cell               PASS
  the run is marked finished · the time is recorded  PASS
  the feed announced it                              PASS
  the roll button is gone — found 0                  PASS
  the status is revoked · the item is revoked        PASS
  the feed recorded both · and so did the audit log  PASS
  each with the reason the judge typed — 2/2         PASS
  ALL CHECKS PASSED
```

`probe-boots.mjs` and `probe-approval.mjs` re-run green afterwards.

**Before this reaches players:** migration `0017` adds
`season_players.finished_at` — `pnpm db:push`.

**Still open:** stage 6 of the plan — `beforeGameRoll` (the one unwired hook,
and the only point that can touch *which game you are handed*) and the fact that
five of six items are wrappers around an effect. Deferred by the host.

---

### Same evening — a bug report: "no games in the catalog"

Rolled several games, finished them, rolled again, got **«В каталоге нет
доступных игр. Добавьте игры или проверьте фильтры»**. The catalog was fine.

The cause was not a crash — the pool had run out — but three things about how
that state is handled were wrong.

**One `null`, four situations.** `rollRandomGame` returned `CatalogGame | null`,
so the caller could only say the one sentence above. It is the right sentence
for exactly one of the four ways a pool comes up empty:

| what actually happened | what the host should do |
| --- | --- |
| the catalog holds nothing un-blacklisted | add games |
| this participant has been handed all of them | add games, or their season is over |
| unplayed games exist, the pool filters exclude every one | widen the filters — also what per-cell genre locking does when it lands someone on a genre they have exhausted |
| an API-sourced season whose provider returned nothing | check the key |

The picker is now `pickGameForRoll`, returning `{ game, reason }`, with
`PoolEmptyReason` and its error-code map in the engine (pure, so the mapping is
testable without a database). Four codes, four sentences, en/ru/uk. The reason
is computed only on the failing path — two counts that cost nothing on the path
that matters.

**The same exhaustion silently repeated a game.** For a catalog-sourced season
the old code never reached the error at all: after the filtered query and the
unfiltered fallback both came up empty, one more step handed back *any*
non-blacklisted game — played or not, in silence. The README promises that
already-played games never come up, and `notInArray(playedIds)` is in every
other query in the file. So depending on `gamePool.source`, a setting no player
can see, running out either broke that promise quietly or failed with a message
naming the wrong cause. The step is gone; running out is reported.

**A reroll could create a roll with no game.** Both reroll paths did
`gameId: game?.id ?? null`, so an exhausted pool left the player holding an open
roll that named no game and could not be resolved — with their reroll allowance
already spent on it. Both refuse now, and the approval path leaves the request
pending so a judge can reject it with a reason. (Audit item #9.)

Two dead checks in the provider branch went with it: `external.filter(() =>
true)` under the name `unplayedExternal`, and a comparison of the provider's own
id against a list of catalog UUIDs, which was always true.

**Verified.** `tsc` clean · `eslint` 0 errors · **570 tests / 30 files** ·
`next build` succeeds · five mutations, all caught (including one that put the
silent replay back on a single line, which the first version of the scan missed
— it reads the syntax tree now, not the text).

Live, reproducing the report exactly — every game in the catalog handed to the
player, then a roll:

```
probe-exhausted.mjs
  the catalog is not empty — 12 games
  and the player has had all of them — 12/12
  message: "You have already been given every game in this season's pool"
  says they have had them all            PASS
  does NOT blame the filters             PASS
  no empty roll was created              PASS
  and no roll was left open              PASS
  an empty catalog says something different, and the two differ   PASS
  ALL CHECKS PASSED
```

**Not changed, worth knowing.** For a catalog-sourced season the pool filters are
advisory: when they exclude everything, the fallback hands out an unfiltered
(but unplayed) game rather than failing. That is what `fallbackToCatalog` is
for, so it stays — but it does mean `filters_exclude_all` is only reachable for
API-sourced seasons.

---

## 2026-09-09 — Session 22 · Two clocks in one turn

**The request.** Reproduce it for real: add a player to an active season, make a
move, grant heavy boots, make another move, and check that the boots do what
they promise and stop when they should.

Done against the built app in a real browser on a scratch database, so every
step went through the actual turn transaction rather than a re-implementation of
it. The fixture is deliberately sterile — every inner cell `normal`, balance 0,
`bonusAddsToRollOnPass` off, IEE on with an empty pool — so the only things that
can change how far a player travels are the dice and the effect under test.

The boots did not work. Two bugs, both in the game loop, both invisible to 474
passing tests.

### Bug 1 — a one-roll effect lasted two rolls

`resolveGameRoll` compares a roll number against `expiresAfterRollSeq` in four
places, and they were not the same number. The activity filters used
`sp.rollSeq` — the roll that had already finished — while the expiry sweep used
`sp.rollSeq + 1`, the roll being resolved. Two ends of one rule, one apart, so a
status was still active throughout the roll that was meant to be its last.

Fix: one clock. `const turnRollSeq = sp.rollSeq + 1`, computed once at the top of
the turn and passed to `loadTurnHooks`, into `turnBase.rollSeq` and into
`expireEffectsFor`. `sp.rollSeq` appears in none of them now.

This was never about `heavy_boots`. **Every** duration counted in rolls was a
roll long: `slowed` 2→3, `heavy_boots` 1→2, `unlucky` 3→4, `taxed` 3→4, plus
`tailwind`, `lucky` and `momentum`.

**Why the suite could not see it.** Both halves are individually correct pure
functions — `isEffectActive` and `expiredEffects` agree with each other for any
roll number you hand them. Only the wiring was wrong, and the wiring lives in a
service that needs a request and a database. `SC-BOOTS-2` exercised the helper
with the turn number the runtime never passed it, and it jumped from roll 4 to
roll 6: roll 5, the one that broke, was never asserted.

### Bug 2 — the boots moved the player backwards

Seen in the probe: cell 18, dice 1, player finishes on 17. `applyMovementModifiers`
clamped the *destination* — `Math.max(0, newPosition + stepsDelta)` — which
guards cell 0 and nothing else. Anywhere further along the board, a roll shorter
than the penalty walked past the starting cell and kept going.

A modifier that shortens a move must never reverse it. The clamp is now against
the cell the player started on, and the direction comes from the move itself, so
a backward move is shortened toward the start instead of flipped forward:

```ts
const shifted  = result.newPosition + modifiers.stepsDelta;
const moved    = result.newPosition - fromPosition;
const directed = moved >= 0 ? Math.max(fromPosition, shifted) : Math.min(fromPosition, shifted);
const target   = modifiers.forcedPosition ?? Math.max(0, directed);
```

**Why the suite could not see it.** `SC-BOOTS-3` only ever placed the player on
cell 0 — the one cell where the old clamp gave the right answer — and it states
the rule as a position ("stays on cell 0") rather than as travel. Session 16
fixed the wrap-around half of this same line and stopped there.

### And a third thing, on the dashboard

The player's panel carried its own copy of the activity predicate, filtered with
`seasonPlayer.rollSeq`. A spent status therefore lingered on screen showing
"0 rolls left" — present to the player, inert to the game, which is worse than
either alone. That was the third copy of the predicate in the codebase;
`isEffectActive` now takes a `Pick<…>` so a database row goes straight in, and
the dashboard calls it at `rollSeq + 1` exactly like the turn does.

### What now stops them coming back

- **`SC-BOOTS-6`** — the effect lasts exactly the declared number of rolls,
  asserting every roll in the window, the last one included.
- **`SC-BOOTS-5`** — cancelled, not reversed: from cell 18 with a roll of 1 the
  player stays on 18.
- **`lib/modules/game/turn-clock.test.ts`** — a source guard: the three call
  sites must receive the same expression, and it must never be `sp.rollSeq`. It
  reads source rather than behaviour on purpose, and that is a stated trade — it
  cannot prove the turn is right, only that the four clocks are still one clock.

All three were mutation-tested: restoring either old line fails them.

### The run, after the fixes

It happened to roll a 1 on the shortened move, so one run exercised both fixes at
once — under the old clamp that move would have gone 5 → 4.

```
move 1: dice {5}  sum=5  · 0 → 5   · travelled 5    (baseline)
granted at roll_seq=1, expires_after_roll_seq=2
move 2: dice {1}  sum=1  · 5 → 5   · travelled 0    expected 0
move 3: dice {6}  sum=6  · 5 → 11  · travelled 6    full sum would be 6
move 4: dice {19} sum=19 · 11 → 30 · travelled 19   full sum would be 19
ALL CHECKS PASSED
```

The status ends `expired`, `ended_at` is set, and an `effect_expired` row reaches
the feed.

**Verification.** `tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing
warnings · **479 tests, 23 files** · `next build` succeeds.

**Files touched.** `lib/modules/game/service/resolve.ts`,
`lib/modules/game/service/iee.ts`, `lib/engine/board/movement/index.ts`,
`lib/engine/iee/resolve/hooks.ts`, `app/(public)/dashboard/page.tsx`,
`lib/engine/iee/scenarios.ts` (+ `iee-scenarios.test.ts`, `iee-hooks.test.ts`,
`iee-shield.test.ts`), `lib/modules/game/turn-clock.test.ts` (new),
`ITEMS_EFFECTS_SCENARIOS.md` (regenerated — 57 scenarios, 15 entries).

**Not in the repo, as before.** The Playwright probe and its database fixture
live in the verification harness only, as session 15's did.

**Flagged, not changed.**

- `heavy_boots` applies `stepsDelta: -2` to a *drop* as well, which makes a
  backward move worse rather than shorter. A design question, not a bug — the
  effect promises "your moves are two cells shorter", and that is what it does.
- "1 rolls left" in `expiresIn` — the same plural bug as "1 CHALLENGES" from
  session 12.
- «СГЛАЗ … ПОЛОЖИТЕЛЬНЫЙ»: polarity means which cell pool the entry drops from,
  not whether it is good for you. The label does not say so.

---

## 2026-09-09 — Session 21 · The player's panel, redesigned

Two more complaints against the dashboard, both fair, and one of them exposed a
layout bug I had introduced myself.

**The bug first.** "Осталось бросков: 1" had wrapped onto its own line and sat
floating right. Cause: it kept `ml-auto` inside a `flex-wrap` row that had just
gained a larger title, so it pushed itself to a second line and then to the far
edge. Visible in one screenshot, invisible to every checker in the repo.

**"The admin descriptive text is still small — all of it."** The size ladder
had grown a tone per audience and neither was the point. It is now **one prose
size wherever a description is the content of its card** — player surfaces and
admin cards alike at `base` — with `dense` (`sm`) kept only for rows in a
scannable list: the wizard's pools and the event-template table. Measured after:
catalog description 14 → 16px, fact values 12 → 14px, the page's own
explanatory paragraph 12 → 14px. Stamped 10px `dt` labels stay, because those
are HUD chrome and the invariant test already draws that line.

**"The player's statuses and items look weak."** They did: a tinted box with a
loose stack of text in it. Rebuilt around one `EntryCard` shell — polarity
accent stripe down the left edge, artwork tile, name at `lg`, the sentence, and
a hairline-separated footer carrying the facts a player acts on.

Three things came out of that footer that are worth more than the styling:

- **A duration meter, not a number.** "1 roll left" reads the same whether it
  is one of one or one of five, and those are very different situations. The
  catalog definition supplies the denominator, so the pips show spent against
  remaining. Falls back to the plain string when there is no total or the total
  is long enough that pips would become a comb.
- **When an item may be used, and on whom.** `usage.window` and `usage.target`
  were reachable only by pressing Use and seeing what happened. They are on the
  card now. The strings come from the `iee.admin` block — that namespace is an
  organisational accident; they are catalog vocabulary, not admin-screen copy.
- **An empty state that says what the panel is for.** A single grey sentence in
  a tall panel reads as a page that failed to load. It now draws empty slots —
  squares for the inventory, hexes for statuses, matching the real tiles — and
  the sentence explains them underneath.

**Verified in the browser.** Status card: art 54px, title 18px, description
16px, footer on one line with the meter and the source. Empty inventory: four
ghost slots at tile size. No overflow, no wrap, no floating right edge.

**Not verified visually: the item card.** This account's inventory is empty, so
only the status card could be looked at. The item card shares the same
`EntryCard` shell and typechecks, but it has not been seen — it will appear on
the next bonus drop, and that is where to look first.

**Verification.** `tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing
warnings · **474 tests, 22 files**.

**Files touched.** `components/dashboard/InventoryPanel.tsx` (rewritten),
`components/iee/EntryDescription.tsx` (+ its test; tones are now
`default`/`dense`), `components/iee/IeeArtTile.tsx` (polarity glow, clips
exported), `components/admin/IeeCatalogBrowser.tsx`,
`components/admin/{IeeStage,EventTemplatesManager}.tsx`,
`app/admin/catalog/page.tsx`.

---

## 2026-09-09 — Session 20 · The picture leads

Three complaints against the first real artwork, all fair.

**"The boots look like an artifact, not an effect."** Agreed, but the cause is
not the drawing — the drawing *does* show the effect (tiles, red arrow, a
shortened step); none of that survives at 16 px. The structural problem sits
underneath: the catalog pairs items and effects almost one to one —
`lead_weights` grants `heavy_boots`, `lodestone` grants `tailwind`, `spare_die`
grants `lucky`, `jinx` grants `unlucky` — so *any* "heavy object" reads
identically in both roles. No amount of care from an artist carries that
distinction. It has to be structural, so it now is:

| | Frame | Tint |
|---|---|---|
| Item — a thing in your bag | 4px clipped square, the house cut: an inventory slot | amber |
| Effect — a state you are in | **hexagon** | polarity |

The hexagon is the one shape in the interface that is deliberately not the
house cut, because its whole job is to not look like a slot. It stays angular,
so §1.3 holds; `DESIGN.md` records it as the single documented exception. Cost:
an effect's art is hex-cropped, so the safe-area rule (content inside the
central ~75%) is now stated rather than assumed.

**"The pictures have to be clearly visible — the player meets the image first,
then the name, then reads the effect."** The hierarchy was inverted: an
uppercase title carrying no information led, and the picture and the sentence
were footnotes. `components/iee/IeeArtTile.tsx` now leads every surface where a
reader *meets* an entry, and the split that decides its size is **discovery vs
tuning**:

- discovery — `lg` 96px on the wheel result, `md` 56px in the inventory, the
  status panel and the catalog card, `sm` 40px on the rules page;
- tuning — `IeeIcon` stays the bare 16-20px glyph in the season wizard's pool
  rows and drop table, where a dozen entries are scanned to adjust numbers and
  a picture per row would be noise.

**"The descriptions are still tiny."** Also fair, and the honest reason is that
the nominal size flatters the face: the body font is **Barlow Condensed**, so
14px carries a visibly smaller x-height than 14px in a normal face. Player
prose `sm → base`, admin prose `xs → sm`. The regression test no longer asserts
a specific step but that the description is never smaller than `sm` — the
inversion that started all this was a `text-sm` name over 11px prose.

**Verified in the browser, not asserted.** Status card: art 54×54, description
16px computed. Catalog: eight effect hexes tinted by polarity beside six item
squares in amber — the grammar reads at a glance, and the entry with artwork
sits in the same frame as the seven still on glyphs.

**Still open, for the user to decide.** A full-bleed illustration with its own
background works at `md`/`lg` and collapses to a coloured square below that;
flat transparent art in the glyph idiom works at every size. Mixing the two
across one catalog looks accidental. That choice should be made before the
remaining thirteen are drawn, and `DESIGN.md` says so.

**Noticed while looking, not acted on.** The items catalog shows «СГЛАЗ …
ПОЛОЖИТЕЛЬНЫЙ» and «СВИНЦОВЫЕ ГРУЗЫ … ПОЛОЖИТЕЛЬНЫЙ». That is correct per §12
B7 — polarity means *which cell pool a thing drops from*, not whether it helps
its holder — but the label does not say so, and an offensive item marked
"positive" reads as a bug to anyone who has not read the design doc. Worth a
better label.

**Verification.** `tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing
warnings · **474 tests, 22 files**.

**Files touched.** New: `components/iee/IeeArtTile.tsx`. Modified:
`components/iee/EntryDescription.tsx` (+ its test),
`components/dashboard/InventoryPanel.tsx`,
`components/admin/IeeCatalogBrowser.tsx`, `components/rules/AutoRulesView.tsx`,
`components/game/WheelOverlay.tsx`, `DESIGN.md`.

---

## 2026-09-09 — Session 19 · The first person to add artwork could not

The artwork pipeline shipped in session 18 with a hand-maintained key list. The
first real use of it failed at step 3: *"А что это вообще `IEE_ART_KEYS.item`?
Где это?"* — the recipe named a **symbol** where it needed to name a **file**,
and its worked example used `.item` while the artwork being added was an
effect. The file was in the right place, correctly named, and nothing rendered.

**Two separate faults, and neither was the user's.**

1. **The code was never synced.** Everything from session 18 lived in the
   container harness; the session ended before it reached the disk, so the
   working tree still had the old `art.ts` with two empty sets. No amount of
   editing that file would have helped — `ieeArtSrc` returned null and the
   glyph rendered. Diagnosed by reading the device, not by guessing.
2. **The manual step was the design defect.** A list you have to find and edit
   by hand, in a file you have never opened, is a step that will keep costing
   whoever adds the fourteenth icon as much as it cost the first.

**So the list moved out of the way.** `scripts/iee-art.ts` scans `public/iee/`
and generates `components/iee/art-manifest.ts`; `art.ts` reads it. Adding
artwork is now two steps — save the file, `pnpm iee:art` — and no list is
edited by hand. This is the repo's existing generated-artifact shape, the same
as `pnpm scenarios:doc`.

**A mutation caught a real bug in the generator.** With the manifest
hand-broken to the wrong formatting, the staleness test *passed*. Cause: the
script called `main()` at module scope, so the test's own
`import { renderManifest } from "@/scripts/iee-art"` **ran the generator and
rewrote the file**, then compared it to itself. Every run silently regenerated
a repo file, and the test could never fail. Now guarded with
`import.meta.url === pathToFileURL(process.argv[1]).href`, and the mutation
fails as it should — verified, including that the manifest is left untouched by
a test run.

**Verified live.** The `<img>` renders with the derived path; the file serves
`200 image/webp`, 3552 bytes, valid RIFF. A first check reported
`naturalWidth: 0` — that was `loading="lazy"` on a panel below the fold, not a
failure; scrolled into view it is 128×128 natural at 16 CSS px. Across the
effects catalog exactly one of eight entries shows art and seven show glyphs,
which is the intended half-drawn-proof behaviour.

**What looking at it revealed, and what it is not.** The pipeline is right; the
*size* is the open question. At 16–24 px a full-bleed illustration with its own
background reads as a coloured tile next to the bare amber line glyphs it sits
among — the boots are unrecognisable at that scale, and the card looks
inconsistent beside the seven glyph entries. Two ways out, and this is a
decision, not a bug: give artwork more room where the layout allows (catalog
card 40–48 px, inventory and status thumbnails 32–40 px, wheel result 48 px),
or draw in the glyph idiom (flat, transparent, two or three colours) so it
survives at 16 px. `DESIGN.md` now states the constraint and warns against
mixing the two styles in one list.

**Docs rewritten to name paths, not symbols.** `AGENTS.md` §5 leads with a
copy-pasteable two-line block, `public/iee/README.md` says the same in four
lines, and the size guidance moved from 128 px to 256 px (512 ceiling) —
though the 128 px file the user produced is well within spec and renders fine.

**Verification.** `tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing
warnings · **472 tests, 22 files** · the artwork invariants mutation-checked in
both directions plus the generator-guard case.

**Files touched.** New: `scripts/iee-art.ts`,
`components/iee/art-manifest.ts` (generated). Modified:
`components/iee/art.ts` (reads the manifest), `components/iee/IeeArt.test.tsx`
(staleness check replaces the hand-registry checks), `package.json`
(`iee:art`), `AGENTS.md`, `DESIGN.md`, `public/iee/README.md`.

---

## 2026-09-09 — Session 18 · Looked at it, then made artwork a code change

Two things closed: the visual gap sessions 16 and 17 both ended on, and the
decision about item images.

### The app was already running, and the browser pane can reach it

`device_bash` cannot — its egress allowlist answers `403 blocked-by-allowlist`
for every route to the host. The in-app browser runs on the user's machine and
reaches `http://localhost:3000` directly, signed in, against the real database.
The dev server picks up the working tree, so what was inspected is what is on
disk.

**Findings are measurements, not impressions.** The useful ones came from
querying the DOM rather than looking at a screenshot:

- **The original report is closed.** `ЗАВЕРШЁН` renders neutral with a check
  glyph. Red now appears exactly once on `/admin/seasons` — on the reset
  button, which is the one genuinely destructive control there.
- **Drop table**: names rendered, keys preserved in `title`, and a regex sweep
  for `snake_case` labels returns **zero**. Slices sum to 100%.
- **Hooks**: a sweep for the nine raw `HookName` identifiers in visible text
  returns **zero**; the cards read "Меняет длину хода", "Может отменить клетку".
- **Type sizes, measured via `getComputedStyle`** rather than by class name.
  On `/rules` and `/dashboard`, non-mono non-uppercase prose is 12/14/16 px and
  **nothing is below 12 px**. The status card that started this — "Следующий
  ход короче на две клетки." — is 14 px where it was 11.
- Zero rendered dictionary paths (the session-11 trap), zero nested anchors
  (the session-13 trap) on every page checked.
- The catalog filter narrows 6 → 1 on a key search and reveals its reset
  control; the events tab correctly hides the bar at one template while keeping
  its per-row hidden forms.

**One content bug, visible only by looking.** The item card printed
`ЗАРЯДЫ` as a label and `Зарядов: 1` as its value — the `charges` string
carries its own noun, which under a "Charges" heading is a stutter. It renders
the bare count now. Fourth time this class of defect has been found by reading
the rendered page rather than the source ("1 CHALLENGES", "from a cell", the
single-outcome wheel).

### Artwork: hardcoded, by decision

Per the user: images ship in the repo and change only in code. No upload, no
`iee_assets` table — which also sidesteps the objection recorded in the plan,
that data URLs cannot be cached separately and would re-send megabytes on every
render of a list.

**The rule is that the file name is the catalog key.**

    public/iee/items/<item_key>.webp
    public/iee/effects/<effect_key>.webp

Character for character. Keys are already `[a-z0-9_]`, a legal file name
everywhere, so there is no transformation to get wrong and no second name to
keep in sync. The path is *derived* in `components/iee/art.ts`, never typed.

What a derived path cannot do is tell the browser whether the file exists, so a
key is also registered in `IEE_ART_KEYS` — and the registry is checked against
the folder **in both directions**. This is the answer to why the old
`icon: "/iee/xxx.webp"` field was deleted in session 11: a path to a file
nobody drew is worse than no field; a path a test proves points at a real file
is not.

`components/iee/IeeArt.test.tsx` enforces: registered key with no file, file
with no registered key, key that is not a catalog entry, wrong case or
extension, non-square, oversized, and a PNG renamed to `.webp` — the last via a
WebP container parse, so no image library is needed. An entry with no art keeps
its `heroIcon`, so the catalog is never half-drawn while art is in progress.

**Seven mutations, and the seventh improved the test.** Six failed as intended.
The oversize case *passed*: a flat 2048×2048 graphic compresses to a few KB and
sailed through a byte-only budget, while still costing a full-resolution decode
for something drawn at 16–24 px. A 512 px hard ceiling was added and the
mutation then failed correctly. The full path was proven end to end with a
temporary fixture — registered, rendered as `<img src="/iee/items/…">`, then
deleted. **No placeholder artwork was committed**; the registry ships empty and
the folders hold only `.gitkeep`.

The recipe is `AGENTS.md` §5 ("Add artwork for an item or effect"), with the
visual spec — square webp, 128 px, ≤ 24 KB, readable as a silhouette at 16 px —
in `DESIGN.md`.

**Verification.** `tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing
warnings · **471 tests, 22 files** · `next build` succeeds · sub-xs scan 0
offenders · en/ru/uk parity across 12 namespaces · and, this time, the pages
themselves opened and measured in a browser against the live database.

**Files touched.** New: `components/iee/art.ts`,
`components/iee/IeeArt.test.tsx`, `public/iee/{README.md,items,effects}`.
Modified: `components/iee/IeeIcon.tsx` (art wins, glyph covers), the five
`IeeIcon` call sites (now pass `entryKey`),
`components/admin/IeeCatalogBrowser.tsx` (the charges stutter), `AGENTS.md`
(§5 recipe), `DESIGN.md` (artwork spec), `CHANGELOG.md`.

---

## 2026-09-09 — Session 17 · A harness that runs, and wave 2

Asked to test what I could myself. The honest first step was to stop guessing:
`node_modules` does not resolve from a Linux shell, so sessions 15 and 16 shipped
without ever running `tsc`. This session built the harness instead — the source
tarred out of the mount, `pnpm install` in the container — and then everything
below was verified rather than asserted.

**Wave 1, checked at last.** `tsc --noEmit` clean, `eslint` 0 errors (the same
5 pre-existing warnings), 330 tests green, `next build` succeeds. A green run
proves nothing on its own, so three mutations were injected and all three were
caught: dropping `kind=` from one call site (TS2322 naming the file), deleting
one key from `ru/admin.ts` (TS2741 via `Widen`), removing `finished` from
`SEASON_STATUS_VARIANT` (TS2741 naming the property). Every compile-time
guarantee session 16 claimed is now demonstrated.

`next build` needs the three Google fonts, which the sandbox cannot reach. The
harness copy of `app/layout.tsx` is stubbed for the build and restored
afterwards; the project file is untouched, the same workaround session 4 used.

### The new tests, and the three defects they found

**112 new tests, all generated from the enums and the catalog** rather than
listed by hand, so a new status or entry is covered the moment it exists.

- `components/ui/status.test.tsx` — every value of `season_status` and
  `player_status`, rendered. A finished season never paints `bg-danger`; every
  season status carries a *distinct* glyph (which is the whole reason
  `finished` is not simply `dim`); player badges carry none; the two maps must
  keep disagreeing about `finished`. Mutation-checked ×4, including one where
  my own mutation was broken and the test looked stronger than it was — the
  file is CRLF and I searched for the LF form, so nothing was patched and it
  "passed". Re-run properly, it failed 4 assertions.
- `components/iee/IeeIcon.test.tsx` — every catalog entry declares an icon the
  map can actually render. `iee-catalog.test.ts` already asserted the *shape*
  of `heroIcon`; matching a regex is not rendering.
- `lib/engine/iee-filter.test.ts` — 44 cases over the real catalog resolved
  through the real dictionary. The facet tests are partitions: each polarity
  and rarity must return only its own, **and the parts must add back up to the
  whole**, so a predicate that quietly drops an entry fails even when each
  filter looks right on its own. Mutation-checked ×4.
- `components/iee/EntryDescription.test.tsx` — the render tones, plus a source
  scan described below.

**The scan found what my eyes missed.** Rather than assert "these six files
contain no 11px", it states the actual rule: *sub-`xs` type is legal only as
HUD chrome* — mono counters, stamped display headers, small buttons, uppercase
tracking-widest labels — **never for a sentence**. Across `components/` that
describes 297 of 301 sub-xs classes, which is good evidence it is the design
system's real rule and not one I invented. The four it did not describe were
all genuine, and none was in a file I had touched:

- `ChallengesPanel` set a **moderator's rejection reason** — the single most
  important sentence on that panel — at 11px grey;
- `IeeStage` set a simulator caption as prose with no mono marker;
- `GlobalSettingsForm` set both registration-mode explanations at 11px;
- `GamesCatalogManager` carried a `text-[10px]` on a cover placeholder that
  holds an icon and no text at all.

Each fix stands on its own merits rather than merely satisfying the rule, which
is the test I applied before making them.

### Wave 2

- **The drop table showed database keys.** `hex_scroll`, `heavy_boots` — while
  the switches six inches above showed the same entries by name, so nothing
  connected the two lists an admin tunes against each other. Names now, icon
  included, raw key kept as a `title`.
- **`heroIcon` renders.** Declared on all 14 entries since session 11
  *"so that every entry renders today"*, and rendered nowhere:
  `grep heroIcon components app` returned one hit and it was for game-pool
  templates. `components/iee/IeeIcon.tsx` now maps the names, with icons on the
  catalog, the season wizard, the inventory, the statuses, the rules page and
  the wheel result. Icons are hand-listed, not `import * as`, because
  `optimizePackageImports` is exactly what a namespace import defeats — and
  the new test is what forces a new entry's icon to be registered.
- **Hook names are phrases.** The catalog printed raw `HookName` identifiers
  (`afterMovement`, `beforeCellEffect`) untranslated into a staff UI, a live
  §7 violation. Nine phrases in en/ru/uk, raw name kept as a `title`.
- **The two browsers are a card grid.** They were `min-w-[52rem]` tables
  scrolling sideways for 6 and 8 rows on a page that was otherwise mostly
  empty. Fourteen entries are a gallery, not a spreadsheet.
- **One filter bar, three lists.** `IeeFilterBar` is state-free and takes its
  chip groups from the host, so the event templates (admin-authored,
  unbounded — where a filter genuinely earns its keep), the catalog grid and
  the season wizard's pools share one control instead of growing three.
  The predicate is **not** in the components: `lib/engine/iee/filter.ts` holds
  it, for the same reason `use-guards.ts` was extracted — a rule buried in a
  component can only be tested through a browser, and it was about to be
  written twice.

**A claim I had to walk back.** I wrote in `IeeCatalogBrowser` that making it a
client component "costs nothing extra" because the engine catalog is already
bundled. True of `/dashboard` and the season editor; **false of this page**,
which had no client catalog before. `next build` puts `/admin/catalog` at
13.6 kB / 315 kB first load against a 224 kB baseline. The comment now states
the trade instead of denying it, and notes that the same filter runs
server-side off `?q=` with no other change — precisely because the predicate
lives in the engine.

**Verification.** `tsc --noEmit` clean · `eslint` 0 errors, 5 pre-existing
warnings · **442 tests, 21 files** · `next build` succeeds · the sub-xs scan
reports 0 offenders across `components/` · en/ru/uk key parity holds across all
12 namespaces.

**Still not verified: how any of it looks.** No page was rendered in a browser
this session. The card grid, the icons, the filter bar and the new type sizes
are exactly the class of change `tsc` cannot see, and this project's record
(sessions 7, 8, 12) is that those are found by looking.

**Files touched.** New: `components/iee/IeeIcon.tsx`,
`components/admin/IeeFilterBar.tsx`, `lib/engine/iee/filter.ts`,
`vitest.config.mts`, and four test files
(`components/ui/status.test.tsx`, `components/iee/{EntryDescription,IeeIcon}.test.tsx`,
`lib/engine/iee-filter.test.ts`). Modified: `app/admin/catalog/page.tsx`,
`components/admin/{IeeCatalogBrowser,IeeStage,EventTemplatesManager,GlobalSettingsForm,GamesCatalogManager}.tsx`,
`components/dashboard/{InventoryPanel,ChallengesPanel}.tsx`,
`components/game/WheelOverlay.tsx`, `components/rules/AutoRulesView.tsx`,
`lib/engine/iee/index.ts`, `lib/i18n/dictionaries/{en,ru,uk}/iee.ts`,
`AGENTS.md`, `CHANGELOG.md`, `UX_BACKLOG_PLAN.md`.

---

## 2026-09-09 — Session 16 · UX backlog, wave 1

Six reported items were analysed against the code before anything was built;
the verdicts and the phased plan are in [`UX_BACKLOG_PLAN.md`](./UX_BACKLOG_PLAN.md).
**Wave 1 (items 1, 5, 6) is done. Waves 2 and 3 are not started.**

Two of the six were argued down rather than built as asked, and that is
recorded in the plan: filters over a **6-row** items table are furniture (wave
2 builds one shared filter bar and puts it where the list is actually
unbounded), and item images should start by rendering the `heroIcon` every
entry already declares rather than by building an upload.

**One status map, split in two, because `finished` is a homonym.** Three copies
of status → colour existed and disagreed: `/admin/seasons` painted a finished
season `danger` (the report), while `StatusBadge` and the roster painted it
`amber`. Deduplicating them exposed the real defect underneath —
`components/ui/status.tsx` took a `SeasonStatus | PlayerStatus` union and looked
it up in **one** map, and both enums contain `finished`:

- a finished *season* is over — idle, nothing to act on;
- a finished *player* completed the run — an achievement.

No single colour is right for both, so `lib/shared/ui/status-variants.ts` holds
two total `Record`s (a new enum value is now a compile error rather than a
silently grey badge) and `StatusBadge` takes a required `kind`. Required, not
optional: it makes `tsc` name all 28 call sites instead of letting one be
missed.

`finished` is `neutral` + a check glyph. Not `danger` — `DESIGN.md` §1.2
reserves red. Not `dim` — `draft` and `archived` are already dim and three
identical grey plaques on one page defeat the badge's purpose. Not `military` —
green is `active`, and those two are precisely the pair that must not be
confused. The glyph carries the distinction so the palette does not have to
grow a sixth colour; season badges get glyphs, player badges do not, because
player badges appear thirty at a time down a leaderboard.

**19 numeric settings, 0 explanations.** The season wizard explained every one
of its 13 switches (`description=`) and none of its 19 `Field`s — and the
unexplained ones were the unguessable ones: *Cache TTL* (unit?), *Max
candidates* (of what?), *Distribution*, *Ordering*. `Field` has had a `hint`
prop the whole time; it was used zero times in that file. 16 hints added (the
`max` half of each min/max pair is covered by the hint under `min`), plus 6 for
the IEE per-entry Advanced drawer, in en/ru/uk.

Two of the hints say something the UI had never disclosed and that has already
cost a bug: `cooldownRolls` counts **season-wide** resolved rolls, not the
player's own (session 3), and `maxPerSeason` is advisory rather than absolute
under READ COMMITTED (session 6).

**`diceHint` and `boardHint` were written and rendered nowhere.** Only
`templatesHint` and `poolHint` reached a screen. Both now render at the top of
their stage.

**Descriptions were 11px under a 14px name.** The sentence that says what an
item or status *does* was set at `text-[11px] text-dim` on five surfaces, below
a `text-sm` uppercase name that carries no information — the hierarchy was
inverted. Contrast was never the problem (`#9a958a` on `#1a1a1a` measures
**5.83:1**, AA clear); size and rank were, and `DESIGN.md` §2 has no 11px step
at all.

The fix is deliberately **six lines, not a sweep**: `text-[11px]` appears 261
times and `text-[10px]` 188 times across `components/` and `app/`, and nearly
all of them are `font-mono uppercase tracking-widest` HUD labels that must not
change. `components/iee/EntryDescription.tsx` now owns the two prose tones
(`sm`/zinc-300 for players, `xs`/zinc-400 for dense admin tables) so the six
copies cannot drift apart again — the same lesson `lib/i18n/dict-text.ts`
recorded in session 12.

**Verification, and its limits — read this before trusting the above.**
`node_modules` still does not resolve from a Linux shell, so `tsc`, `eslint`,
`vitest` and `next build` **were not run**. What was run, against the real
TypeScript 5.9.3 under `node_modules/.pnpm/`:

- **Syntax**: all 34 touched files parse clean via `ts.createSourceFile`
  (`parseDiagnostics` empty).
- **Dictionary parity**: an AST walk comparing every key path across
  `en`/`ru`/`uk` — **12 namespaces agree**, which is what the `Widen`
  conformance type would otherwise catch at compile time.

Neither of those is a type check. **`pnpm exec tsc --noEmit`, `pnpm lint` and
`pnpm build` still have to be run on Windows**, and the `kind` prop is designed
so that a missed call site fails there loudly.

No unit test was added for the status maps on purpose: `Record<SeasonStatus,
StatusVariant>` already makes a missing key a compile error, and a test
re-asserting what the type system enforces is exactly the decorative kind
sessions 12 and 14 caught and threw out.

**Not verified at all: how any of it looks.** Nothing here was rendered. The
badge glyphs, the hint density in the wizard and the new description sizes are
the class of change `tsc` cannot see — and this project's own record (the
single-outcome wheel in session 7, the "from a cell" placeholder in session 8,
"1 CHALLENGES" in session 12) is that these are found by looking at the page.

**Files touched.** New: `lib/shared/ui/status-variants.ts`,
`components/iee/EntryDescription.tsx`, `UX_BACKLOG_PLAN.md`. Modified:
`components/ui/status.tsx` (rewritten), 16 files carrying the 28 `StatusBadge`
call sites, `app/admin/seasons/page.tsx` and
`app/admin/seasons/[id]/players/page.tsx` (local maps deleted),
`components/admin/{SeasonSettingsForm,IeeStage,IeeCatalogBrowser,EventTemplatesManager}.tsx`,
`components/dashboard/{InventoryPanel,ChallengesPanel}.tsx`,
`components/rules/AutoRulesView.tsx`,
`lib/i18n/dictionaries/{en,ru,uk}/{admin,iee}.ts`, `DESIGN.md`, `CHANGELOG.md`.

---

## 2026-09-08 — Session 15 · A scenario reference that runs

Asked for a reference of what every item and effect does, and for those
scenarios to be tested. Built so the two cannot disagree: **one table
generates the document and drives both test suites.**

- **`lib/engine/iee/scenarios.ts`** — 55 scenarios over the 6 items, 8 effects
  and 7 cross-cutting rules, each `id / entry / given / when / then / tier`.
- **`ITEMS_EFFECTS_SCENARIOS.md`** — generated by `pnpm scenarios:doc`. Hand
  edits are pointless; the next run overwrites them.
- **`lib/engine/iee-scenarios.test.ts`** — the 44 pure ones, each named by its
  id, so `pnpm test` covers them on any machine.
- **`probe/scenarios.mts`** — the 11 that need the turn transaction, the
  database or a browser, in the harness.

Both suites check the table against themselves: a scenario with no
implementation fails, and so does an implementation with no scenario. Two more
meta-tests: every catalog entry must have at least one scenario, and no `then`
may be phrased as a property of the catalog ("declares", "is registered") —
that phrasing is exactly what let the last two bugs through.

**It found a real one on the first run.** `SC-BOOTS-3` expected 0, got **39**:

> a player on cell 0 of a looping board who rolls a 1 while wearing heavy
> boots (-2) lands on cell -1, and `normalizePosition` wraps that to the LAST
> cell of the board.

A two-cell *penalty* at the start of a loop season teleports the player to the
far end — and since the leaderboard sorts by position, straight into first
place. `applyMovementModifiers` now clamps a negative step modifier at zero.
Forward wrapping is the point of a loop board and is untouched, and
`forcedPosition` is left alone because it is an explicit instruction rather
than a nudge. `SC-SLOWED-4` had passed only because slowed is -1 and lands
exactly on the boundary.

**A dishonest scenario, caught while writing it.** `SC-POOL-4` first called
`resetSeason()` directly with a `catch` that fell back to the same DELETE
statements. `resetSeason` calls `requireStaff()` and cannot run outside a
request, so the fallback always ran — the scenario was testing the probe's own
SQL and reporting PASS. It now drives the reset through the admin console and
throws if the control is missing. A fallback that silently substitutes your
own implementation for the one under test is worse than no test.

**Two decisions documented rather than defended**, because a reference should
say what happens even when it is arguable:

- `SC-TAXED-4` — a shield absorbs the *cell*; `taxed` still bleeds on an
  absorbed landing, because it is a status, not the cell. Its answer is the
  salve.
- `SC-SALVE-3` — a salve used with nothing to clear is still consumed. Adding
  a "would this do anything" check would let a player probe their own hidden
  status list for free.

**Verification.** 330 unit tests (was 281; 49 new). `tsc`, `eslint` (0 errors),
`next build` clean. Live: **103 assertions** (28 acceptance · 24 scenarios ·
21 public surfaces · 11 catalog/wizard · 10 shield · 9 modal lock) plus the
23-page nested-anchor crawl — all green.

**Files touched.** New: `lib/engine/iee/scenarios.ts`,
`lib/engine/iee-scenarios.test.ts`, `scripts/scenarios-doc.ts`,
`ITEMS_EFFECTS_SCENARIOS.md`. Modified:
`lib/engine/board/movement/index.ts` (the loop-wrap fix),
`lib/engine/iee/index.ts`, `package.json` (`scenarios:doc`), `AGENTS.md`
(docs map).

---

## 2026-09-08 — Session 14 · The shield absorbed half a landing

Reported from a real playthrough: bonus cell → shield; penalty cell → shield
gone, **and the penalty status applied anyway**. The charge was spent and the
protection was not delivered.

**Cause.** A penalty landing has two consequences, and only one of them asked
the shield for permission. `beforeCellEffect` vetoed the cell's own effect
(`skipCellEffect` → `cellAbsorbed = true`), but forty lines later the wheel
computed its polarity straight from the cell type:

```ts
const wheelPolarity = polarityForCell(landedType);   // never looked at cellAbsorbed
```

so the negative pool was still spun and the status still granted. A veto that
one consumer honours and another ignores is worse than no veto at all: the
player pays the cost and keeps the damage. The wheel now skips an absorbed
landing, which also saves the context query it no longer needs.

**The test that should have caught it was decorative.**

```ts
it("a penalty landing can be prevented outright", () => {
  const vetoes = listEffects().filter((d) => "beforeCellEffect" in d.hooks);
  expect(vetoes.length).toBeGreaterThan(0);
});
```

It asserted that *some effect declares a hook*. It would pass if the hook
returned `{}`, and it passed happily while the shield was half-broken —
declaring a hook is not counter-play, returning a veto is. It now **calls** the
hook with a penalty context and requires a real `skipCellEffect`, and fails if
the shield stops vetoing (mutation-checked). The end-to-end half cannot live in
the engine, because the wiring that was broken is in the service layer.

**`probe/shield.mjs` — the shield's whole contract, 10 assertions.** Bonus
grants it with one charge; the penalty landing spends it and leaves **no
negative status**, no balance loss, an absorption entry in the feed and no drop
logged; and with the shield gone the next penalty lands normally, so the probe
also proves it is not simply suppressing everything. Mutation-checked by
restoring the old line: 3 assertions fail, reproducing the report exactly
(`the shield is spent by the penalty landing  slowed`).

**The pattern worth remembering.** This is the second bug in two sessions where
an invariant tested a *declaration* rather than a *consequence* — the catalog
said counter-play existed, the code did not deliver it. When a rule spans two
consumers, the only honest test is the one that walks the whole path.

**Verification.** 281 unit tests, `tsc`, `eslint` (0 errors), `next build`
clean. Live: **79 assertions** (28 acceptance · 21 public surfaces · 11
catalog/wizard · 10 shield · 9 modal lock) plus the 23-page nested-anchor
crawl — all green.

**Files touched.** `lib/modules/game/service/resolve.ts` (absorbed landings
skip the wheel), `lib/engine/iee-catalog.test.ts` (the veto invariant now runs
the hook).

---

## 2026-09-08 — Session 13 · Bug report from the first real playthrough

The user created a season, landed on a cell, saw "you got an effect" — and the
app froze. Two bugs, both found by reproducing rather than reading.

**1. The page stayed scroll-locked forever after a turn resolved.** This is the
freeze.

`Modal` locked body scroll per instance: on mount it saved
`document.body.style.overflow` and on unmount put that value back. That is
correct for one modal at a time, and this feature broke the assumption —
**the wheel opens while the confirmation dialog is still playing its 160ms
exit animation**, so for a moment two modals are mounted:

1. confirm dialog mounts, saves `""`, sets `hidden`
2. wheel mounts, saves **`hidden`** — the confirm dialog's lock, not the
   original — and sets `hidden`
3. confirm dialog unmounts, restores `""` → *the page unlocks while the wheel
   is still open*
4. wheel closes, restores the `hidden` it captured → **the page is locked for
   the rest of the session**

Fixed with a module-level lock counter: the first lock records the real
original style, the last unlock restores it, and the order of mounts stops
mattering. Both halves of the bug are now asserted, including the one nobody
would have reported (scrolling behind an open wheel).

**Why the 60 existing live assertions missed it.** Every probe navigates with
`page.goto` between steps, and a fresh document resets `document.body`. The
acceptance scenario resolved thirteen turns through the real UI and never once
asked whether the page was still usable *afterwards* — it asked whether the
database was right. A probe that reloads between assertions cannot see a state
bug that survives in the DOM. `probe/modal-lock.mjs` (9 assertions) now
resolves turns and then interacts with the same page; mutation-checked by
restoring the old lock, which fails 4 of them.

**2. `<a>` inside `<a>` on `/admin/users`** — the hydration error in the
report. `UsersManager` wraps each row in a `Link` and also passed `href` to
`AvatarWithPresence`, which renders its own `Link` to the same URL. Pre-existing
and unrelated to this feature, but it is a real hydration error, so it is fixed
(the redundant inner link is gone).

Rather than eyeball twelve call sites, `probe/nested-links.mjs` crawls 23 pages
and asks the DOM — `document.querySelectorAll("a a")` — reporting the outer and
inner `href` of anything it finds. `/admin/users` was the only offender; it now
reports **0 across 23 pages**.

**Two probes of mine were lying, and are fixed.**

- `probe/scenario.mjs` counts rows as it goes, so a second run against a used
  season reports leftovers as failures. It cost me ten minutes chasing a
  phantom regression before I realised I had simply run it twice. It now aborts
  with `fixture is not clean (N leftover rows)`.
- `probe/nested-links.mjs` reported "0 nested anchors" when **every page had
  failed to load** because the server was down. A crawl that reached nothing
  must not report a clean bill of health; it now aborts unless at least half
  the pages responded.
- `probe/modal-lock.mjs` was itself flaky: after `slowed` lands, a die roll of
  1 moves the player zero steps, so no wheel opens and the probe fails for a
  reason unrelated to what it tests. Its fixture now clears statuses first.

**Verification.** 281 unit tests, `tsc`, `eslint` (0 errors), `next build`
clean. Live: **69 assertions** (28 acceptance · 21 public surfaces · 11
catalog/wizard · 9 modal lock) plus a 23-page nested-anchor crawl — all green,
and the lock probe run three times to confirm it is stable.

**Files touched.** `components/ui/Modal.tsx` (shared scroll lock),
`components/admin/UsersManager.tsx` (redundant inner link removed).

---

## 2026-09-08 — Session 12 · IEE phase 12 (public surfaces) — feature complete

**Feed filter tabs, built as a mechanism rather than a note.** `AGENTS.md` §10
carried a standing warning that the tabs are fixed and new event types "render
under All until a filter is added" — an instruction nobody reads at the moment
they add a type. The tab list and the matcher now come from one table,
`lib/engine/feed/filters.ts`, and `lib/infrastructure/events` holds a
compile-time check that every `EventType` is filed under a tab; an unfiled one
is a type error that names the offender. Writing the check found two
pre-existing gaps: **`season_reset` and `player_left` were reachable only under
"All"**, and three `completion_*` types were being written by direct
`db.insert(eventLog)` calls that bypassed the typed `logEvent`, so the union
had never listed them. Both fixed.

Two tabs, not one. §12 H2(a) says "add an *Items & effects* tab", but events
are new types too, and one tab covering all eleven under that heading would be
a lie in the UI. **Items & effects** (7 types) and **Challenges** (4) — the
decision's stated purpose, honestly labelled.

**Status badges on the leaderboard and the board.** `getActiveEffectsBySeason`
is one query for the whole table — the leaderboard renders a badge per row, and
asking per row would be a query per participant on a page whose point is to
list all of them. `player_effects.season_id` is denormalised for exactly this.
The badge component is deliberately **not** the `Badge` component: that one is
`"use client"`, and thirty players would open thirty client boundaries to
render text that never changes.

**The rules page now generates the IEE section** from the same config the
engine runs on. It lists every armed entry split into "Can help you" / "Can
hurt you" with rarity read back from the *tuned* weight (§9.3 — a season that
made a legendary common must not advertise the old odds), the inventory size,
whether a cell can pay out nothing, the PvP switch and protection window, and
**the catch-up rule when it is on** (§9.5: hidden rubber-banding is worse than
none). A key left in the config after leaving the catalog is filtered out, so
the page cannot advertise a drop that can never happen.

**`dictText` deduplicated.** The same nine-line dictionary walker existed
**five times, byte for byte** — admin catalog page, season stage, catalog
browser, wheel overlay, inventory panel. Now `lib/i18n/dict-text.ts`, with the
fallback behaviour documented where it lives: it returns the path itself when
a key is missing, which is right (a half-rendered screen is worse) but means a
typo renders as text. That is why the probes assert against it.

**Verification — 21 more live assertions.** `probe/public-surfaces.mjs` drives
the real built app: the two new tabs exist; every row rendered under a tab
belongs to it (a `data-event-type` on the feed row makes the filter checkable
against what actually rendered, not against the query that fed it); an existing
tab still filters correctly; "all" is a superset; the badge appears on both the
leaderboard row and the board roster and reads as a name; the rules section
lists the full armed catalog, discloses catch-up, and **loses the disclosure
when catch-up is switched off and the whole section when the subsystem is** —
proving the page is generated, not decorated.

Mutation-checked: making `matchesFeedFilter` permissive for one prefix fails
the per-tab invariant; removing `season_reset` from the table fails `tsc` with
the type named in the error.

**One content bug caught by looking at it.** The screenshot read
"1 CHALLENGES IN THE POOL". `format` has no plural rules, so the English string
is now phrased as a counter — "Challenges in the pool: {count}" — which is
grammatical at every count.

**A probe fragility, fixed.** `probe/scenario.mjs` counts rows as it goes, so a
second run against a used season reports failures that are really leftovers. It
cost me ten minutes chasing a phantom regression. It now aborts with
`fixture is not clean (N leftover rows)` instead of misleading its reader.

**Docs.** `AGENTS.md` §10 rewritten (the warning became the mechanism above),
§11 docs map now lists `ITEMS_EFFECTS_EVENTS.md` and this file. `README.md` and
both translations gained the player-facing feature and the admin stage.
`CHANGELOG.md` has the full Unreleased entry, including the two bugs this work
uncovered in existing code (the `db:seed` cast and non-idempotent board insert,
and the two `/admin` pages that rendered their content into a redirect
response).

**Totals.** 281 unit tests (was 269; 12 cover the filter table). `tsc`,
`eslint` (0 errors) and `next build` clean. Live: 28-assertion acceptance
scenario + 11-assertion catalog/wizard probe + 21-assertion public-surfaces
probe, **60 assertions, all passing**.

**Files touched.** New: `lib/engine/feed/filters.ts`,
`lib/engine/feed-filters.test.ts`, `lib/i18n/dict-text.ts`,
`components/iee/EffectBadges.tsx`. Modified:
`lib/infrastructure/events/index.ts`, `lib/engine/types/iee.ts`,
`lib/modules/iee/repository/effects.ts`, `app/(public)/feed/page.tsx`,
`app/(public)/leaderboard/page.tsx`, `app/(public)/board/page.tsx`,
`app/(public)/seasons/[slug]/{leaderboard,board}/page.tsx`,
`components/{board/board-view,rules/AutoRulesView,feed/feed-list}.tsx`,
`components/{dashboard/InventoryPanel,game/WheelOverlay,admin/IeeStage,admin/IeeCatalogBrowser}.tsx`,
`app/admin/catalog/page.tsx`, `lib/i18n/dictionaries/{en,ru,uk}/{feed,rules}.ts`,
`AGENTS.md`, `README.md`, `translations/README.{ru,uk}.md`, `CHANGELOG.md`.

---

## 2026-09-08 — Session 11 · IEE phase 11 (the real catalog)

**Two fixes first, because the catalog would have inherited both.**

- **`onOutcome` was dispatched and its patch thrown away.** The hook ran, the
  reducer returned a `balanceDelta`, and nothing read it — exactly the
  misleading half-state I refused to ship for `onRollCreated` in session 9.
  Its delta now flows into the balance and through `ledger_entries` like every
  other point. Had this shipped, `momentum` below would have been a status that
  displays, logs, expires and does nothing.
- **`icon: "/iee/xxx.webp"` → `heroIcon`.** The field pointed at artwork nobody
  has drawn and I cannot produce. It now holds a Heroicon export name, the
  convention `GAME_POOL_TEMPLATES` already uses, so every entry renders today.
  Commissioned art can be added alongside later; a path to a missing file is
  worse than no field at all. A test asserts the name resolves.

**The catalog — 6 items, 8 effects** (was 1 item, 2 effects of tracer).

| | Effects |
| --- | --- |
| negative | `heavy_boots` (rare, `afterMovement` −2 steps, 1 roll, refresh) · `unlucky` (rare, `beforeMovement` −2 dice sides, 3 rolls, unique) · `taxed` (common, `afterCellEffect` −1 balance, 3 rolls, unique) · `slowed` (tracer) |
| positive | `tailwind` (common, `afterMovement` +2, refresh) · `lucky` (rare, `beforeMovement` +2 sides, unique) · `momentum` (epic, `onOutcome` +1 balance on a pass — the only entry that exercises that hook) · `shield` (session 9) |

Items are all `positive` and all `active`, deliberately: an item is a tool, so
a cell that hands you one is a reward (§12 B7). The negative pool carries
effects — things that happen *to* you — which is what makes a penalty cell a
penalty. `cleansing_salve` (rare, self, anytime) clears every negative;
`lodestone` (common) and `spare_die` (epic) grant `tailwind`/`lucky` to
yourself and are `before_roll` so they cannot be used after seeing the dice;
`lead_weights` (rare) and `jinx` (epic) put `heavy_boots`/`unlucky` on someone
else.

**Counter-play is now an invariant, not a review note.** §8.3 says every curse
needs a cure. `iee-catalog.test.ts` fails the build if a negative effect shapes
movement and no positive effect answers on the same hook, if no universal
cleanse exists, or if nothing can prevent a penalty landing outright. Adding a
curse with no answer breaks the suite instead of reaching a season.

**A UI acceptance probe for the phase — 11 assertions, all passing.**
Everything above is reachable only if the season wizard actually offers it, and
that was the one claim I would otherwise have made from reading source. The
probe signs in as an admin, opens the Items & Effects stage, and checks the
pools split 10 positive / 4 negative, that the Standard preset arms all
fourteen rows, that the drop-table preview shows computed percentages, and that
a save puts all fourteen entries in the database with the event selection
intact. Mutation-checked: dropping `taxed` from the registry fails four
assertions.

Its sharpest assertion is that **no row renders a dictionary path**. `IeeStage`
resolves labels through `dictText()`, which falls back to *the path itself* when
a key is missing — so a typo in an entry's `i18n.name` renders as
`iee.items.jinx.name` and looks like a label. `tsc` cannot catch it: the path is
a plain string. The probe can.

**Three mistakes worth recording.**

1. **I probed a stale build.** The first run reported a two-entry catalog and I
   nearly went hunting for a registry bug — `.next` predated the catalog files
   by four minutes. `next build` before any UI probe, every time.
2. **The uppercase trap, fourth occurrence.** The dictionary-path assertion
   passed against a deliberately broken build because `innerText` returns
   CSS-transformed text and the design uppercases row titles: the rendered
   string was `IEE.ITEMS.JINX.NAM`, and my regex was case-sensitive. It only
   became a real assertion after the `i` flag. Compare case-insensitively
   against rendered text — this keeps costing time.
3. **A tautological assertion in my own test.** `expect(opposite || true)
   .toBe(true)` cannot fail. Rewritten as a per-hook invariant that does.

**Balance pass.** `probe/balance.ts` builds the drop table with the same
`dropTable()` the admin preview calls, then draws 20,000 times through the real
picker and compares. Worst gap across the Standard and Chaos pools, both
polarities: **0.89 pp**. The preview cannot drift from reality because it is
not a second implementation.

**`scripts/seed-demo.ts` left narrow on purpose.** It still seeds only
`hex_scroll` + `slowed` at weight 100 with `nothingWeight: 0`. That is the
§15 *tracer* fixture and the 28-assertion acceptance scenario depends on the
guaranteed drop; widening it would trade a deterministic acceptance run for a
slightly richer demo. The full catalog is one click away in the wizard — the
Standard preset arms all fourteen, which is what the new probe proves.

**Verification.** 269 unit tests (was 244; 25 new). `tsc`, `eslint` (0 errors)
and `next build` clean. The §15.6 acceptance scenario re-run after the catalog
fill: **28/28**. Five mutations caught (removing the positive movement effects,
dropping the universal cleanse, an item pointing at a nonexistent effect, an
effect using an undispatched hook, a literal name instead of a dictionary key).

**Files touched.** New: `lib/engine/iee/effects/catalog-effects.ts`,
`lib/engine/iee/items/catalog-items.ts`, `lib/engine/iee-catalog.test.ts`.
Modified: `lib/engine/types/iee.ts` (`icon` → `heroIcon`),
`lib/engine/iee/effects/registry.ts`, `lib/engine/iee/items/registry.ts`,
`lib/engine/iee/index.ts`, `lib/modules/game/service/resolve.ts` (`onOutcome`),
`lib/engine/iee/effects/{shield,slowed}.ts`, `lib/engine/iee/items/hex-scroll.ts`,
`lib/i18n/dictionaries/{en,ru,uk}/iee.ts`.

---

## 2026-09-08 — Session 10 · IEE phase 10 (events) + the full acceptance run

**Done — the events lifecycle.**

- **`lib/engine/iee/events.ts`** — the pure parts: `pickEventKey` (excludes what
  a player already has, so §12 F6 is honoured *before* the unique index has to
  catch it — the index is the backstop, not the rule), `parseEventReward`
  (anything malformed reads as no reward) and `isEventOverdue` (a submission
  already waiting on a judge never expires).
- **`lib/modules/game/service/events.ts`** — assignment on an `event` cell,
  proof submission (guarded, so a double submit cannot re-open a row), and the
  staff verdict. On approval the reward — points, an item, an effect, or any
  combination — is granted **in the same transaction as the status change**, so
  an approved challenge can never be left unpaid. Points go through
  `ledger_entries` like every other point in the game.
- **UI**: a challenges panel on the dashboard with the proof form, and a third
  tab in the existing moderation queue (`?tab=events`) showing the proof, what
  approving will grant, and Approve/Reject. The admin nav badge counts them.
- An event cell whose pool is empty or exhausted behaves like a plain cell
  rather than failing the turn.

**The §15.6 acceptance table, automated.** `probe/scenario.mjs` drives all
thirteen rows through a real browser against the built app and the scratch
database — **28 assertions, all passing**. It walks: a bonus landing granting an
item, a reload failing to re-spin, using the item on the other player, a slowed
player moving one step fewer for two rolls and then expiring, a penalty landing
re-applying it, an event cell assigning a challenge with its deadline, the
player submitting proof, the judge approving it and the reward landing, an
admin disabling an entry mid-season, and a reset clearing everything.

Rows 4 and 5 are *not* faked there — a UI double-click cannot be raced reliably
from a script and the picker never offers you yourself, so the scenario points
at where they are actually proved (`probe/use-item.ts`, eight concurrent uses →
one charge; and the use-guard unit tests).

**Three test bugs found, no code bugs.**

1. The scenario asserted "refresh stacking keeps one row" by counting *all*
   rows and found two. The code was right: one expired row (history, which
   §5.4 says to keep) plus one new active one. A drop after expiry is a new
   status, not a refresh. The assertion now counts active rows and separately
   checks the expired one survives.
2. A modal's submit button was selected as `form button[type="submit"]`, which
   matched a form behind the dialog; the backdrop then intercepted the click.
   Scoped to `[role="dialog"]`.
3. `innerText` returns CSS-transformed text and this design uppercases titles
   and badges, so a case-sensitive `includes` failed on a queue that was
   rendering perfectly. Third time this trap has come up in this feature —
   compare case-insensitively when asserting against rendered text.

**Verification.** 244 unit tests (was 228; 16 new cover the event helpers,
mutation-checked: ignoring what a player already has fails 2, sloppy reward
parsing fails 1, expiring a non-assigned row fails 4). `tsc`, `eslint`
(0 errors) and `next build` clean.

**Files touched.** New: `lib/engine/iee/events.ts`,
`lib/engine/iee-events.test.ts`, `lib/modules/game/service/events.ts`,
`lib/modules/iee/actions/events.ts`,
`components/dashboard/ChallengesPanel.tsx`,
`components/admin/EventModerationList.tsx`. Modified:
`lib/modules/game/service/resolve.ts`, `app/admin/moderation/page.tsx`,
`app/admin/layout.tsx`, `app/(public)/dashboard/page.tsx`,
`lib/modules/iee/repository/events.ts`, `lib/engine/iee/index.ts`,
`lib/modules/game/index.ts`, `lib/i18n/dictionaries/{en,ru,uk}/{iee,core}.ts`.

---

## 2026-09-08 — Session 9 · IEE phase 9 (hooks in the game loop)

**Done.**

- **`loadTurnHooks` / `settleTurnHooks`** in `service/iee.ts` — a player's
  statuses are loaded **once** per turn and then queried synchronously at each
  hook point. Loading per hook would run half a dozen statements for one move
  and, worse, let the set change midway through it. Charges asked for across
  every hook are accumulated and spent once, inside the turn transaction.
- **Six hooks dispatched in `resolveGameRoll`**: `beforeMovement` (dice) →
  `afterMovement` (steps, via `applyMovementModifiers`) → `beforeCellEffect`
  (veto) → `afterCellEffect` (balance) → `onOutcome` → `onTick`.
- **New tracer effect `shield`** — positive, rare, one charge, absorbs the next
  `penalty` landing. It exists for two reasons: it is the counter-play §8.3
  demands (a run of penalty cells with no answer is pure frustration), and it
  is the only entry that exercises the `beforeCellEffect` veto, so the
  reducer's boolean-OR path is covered by something real.
  §15 sketched it as a *passive item*; hooks belong to effects, and building a
  parallel dispatch for items would have been duplicate machinery for the same
  behaviour, so it ships as an effect a bonus cell can grant.

**Scope, stated honestly.** Three of the nine hooks are declared but not
dispatched:

- `passive` is a read-time category by design — other hooks query it; there is
  no point in the loop where it "fires".
- `beforeGameRoll` would have to thread pool-filter overrides through
  `rollRandomGame` in the catalog module. No effect uses it yet, so wiring it
  now would be speculative plumbing in a module this feature has not touched.
- `onRollCreated` is dispatchable in one line, but with nothing it can change,
  running it would only let an effect burn a charge for no result — which is
  worse than not running it, because it would mislead whoever writes the first
  effect for that hook.

The contract still declares all nine (§12 D3), so adding either later is an
edit to one call site rather than to `HookName`.

**Verification.**

- 228 unit tests (was 210); 17 new ones cover the shield. Mutation-checked:
  firing on any cell fails 6, never spending the charge fails 3, not absorbing
  fails 4.
- One pre-existing test broke because it compared `catalogDefaults()` to an
  exact snapshot of the whole catalog — it would break on every new entry.
  Rewritten to assert per entry, plus a new test that every catalog entry has
  defaults at all.
- **12-assertion live probe**: no statuses is a genuine no-op; the subsystem
  switched off never loads hooks; `slowed` shortens a real `resolveMovement`
  result; a shield ignores a bonus landing, absorbs a penalty one, and its
  charge is actually spent in the database; a spent shield stops absorbing
  while `slowed` keeps working; an expired status is not loaded at all.
- **The acceptance criterion, through the browser on the built app**: a player
  carrying `slowed` resolved a roll — `moves.dice_results` recorded `{2}` and
  the player travelled **1**. The status then expired on the same turn:
  `state=expired`, `ended_at` set, and an `effect_expired` row in the feed. The
  shield survived untouched, because that landing was a plain cell.

**Files touched.** New: `lib/engine/iee/effects/shield.ts`,
`lib/engine/iee-shield.test.ts`. Modified:
`lib/modules/game/service/{iee,resolve}.ts`,
`lib/engine/iee/{index,effects/registry}.ts`,
`lib/engine/iee-selection.test.ts`, `lib/i18n/dictionaries/{en,ru,uk}/iee.ts`.

---

## 2026-09-08 — Session 8 · IEE phase 8 (inventory, statuses, targeting)

**Done.**

- **`lib/modules/game/service/use-item.ts`** — `activateInventoryItem`: loads the
  row, asks the pure guard, calls the catalog's `apply`, then executes the
  returned intents in one transaction (effects, items, ledger, cleanse) and
  writes the public feed row.
- **`lib/engine/iee/use-guards.ts`** — every rule that decides whether an item
  may be used, extracted as a pure function. Timing window, target resolution
  and all of §8.3 (season switch, protection window, active-only targets,
  no self-targeting for an `other` item) now testable without a database or a
  browser. The service composes it; it does not re-implement it.
- **`components/dashboard/InventoryPanel.tsx`** — held items with charge counts
  and a Use button, active statuses with polarity, remaining duration and who
  cast them, and a target picker that only offers players the server would
  accept.
- Action, target-list repository query, and the `iee.panel` strings in en/ru/uk.

**Two defects caught, both by tooling I would otherwise have skipped.**

1. **`eslint` refused `useInventoryItem`** — a server function whose name starts
   with `use` trips React's rules-of-hooks. Renamed to
   `activateInventoryItem`, which is also the better word: the catalog already
   calls that mode `active`.
2. **The victim could not see who hit them.** The status panel rendered
   "from a cell" for every status because the dashboard passed
   `castByUsername: null` as a placeholder. §8.3 promises the opposite — the
   public record is the main deterrent — so `getActiveEffectsWithCaster` now
   joins the caster through and the panel reads "FROM VICTIM_E2E". Found by
   looking at the rendered panel, not by any check.

**Verification.**

- 210 tests (was 187): 23 new ones cover the use guards exhaustively.
  Mutation-checked — removing the PvP switch fails 2, removing the protection
  window fails 1, allowing self-targeting fails 1, allowing inactive targets
  fails 3, ignoring the timing window fails 1. All reverted.
- **Concurrency probe against the real database:** eight simultaneous
  `consumeItemCharge` calls on a one-charge item — exactly one wins. That is a
  stronger statement than the double-click of §15.6 step 4. A three-charge item
  spends one at a time and flips to `used` on the last; a fourth attempt
  returns null.
- The target-list query excludes the actor and withdrawn participants, and
  flags a player with too few moves as protected.
- **Full browser run** on the built app: the inventory panel renders, Use opens
  the picker, picking a target completes — and the database then shows the item
  `used` with 0 charges, a `slowed` effect on the target carrying
  `applied_by_season_player_id` and `source=item`, and an `item_used` feed row
  carrying the target's username.

**Files touched.** New: `lib/modules/game/service/use-item.ts`,
`lib/engine/iee/use-guards.ts`, `lib/engine/iee-use-guards.test.ts`,
`components/dashboard/InventoryPanel.tsx`,
`lib/modules/iee/actions/inventory.ts`. Modified:
`app/(public)/dashboard/page.tsx`, `lib/modules/game/index.ts`,
`lib/modules/iee/repository/{counters,effects}.ts`,
`lib/engine/iee/index.ts`, `lib/i18n/dictionaries/{en,ru,uk}/{iee,core}.ts`.

---

## 2026-09-08 — Session 7 · IEE phase 7 (the wheel UI)

**Done.**

- **`components/game/WheelOverlay.tsx`** — the wheel, mounted from `RollCard`
  when a resolve returns a `wheel`. It never decides anything: the outcome
  arrives already persisted, and the component only animates a strip that stops
  on it.
- **A reel, not a disc.** `DESIGN.md` §1 is square, cut and stamped; a spinning
  circle would have been the one round thing in the interface. The strip is
  clipped cells sliding past an amber centre marker, with the hazard tape above.
- **`lib/engine/iee/reel.ts`** — the strip builder, pulled out of the component
  so it is pure, rng-injected and testable under the house rule that tests live
  in `lib/engine`. Filler cells are sampled from the real slice weights, so a
  rare entry really does scroll past rarely; the marker cell is then overwritten
  with the server's outcome.
- Reduced motion is honoured, and the result card shows the entry, its polarity,
  its true odds and where it went (inventory or statuses).

**A flaw only visible by looking at it.** With the tracer set, the positive pool
has exactly one entry, so the wheel spun for 2.2 seconds showing the same word
at 100% — theatre with no information in it. A pool with a single possible
outcome now reveals immediately, on the same path as `prefers-reduced-motion`.
Neither `tsc`, `eslint`, the tests nor the build could have caught this.

**Verification.**

- 187 tests (was 172): 15 new ones cover the reel. Mutation-checked — removing
  the forced marker cell fails 3, sampling uniformly instead of by weight fails
  the proportion test, and an unstable seed fails 2. All reverted.
- **Driven through a real browser** (Playwright + the container's Chromium)
  against the built app and the scratch database: signed in with a session
  cookie, opened the pass modal, submitted, watched the wheel spin and settle,
  and screenshotted both states. The database then showed exactly one held item
  from `cell_bonus`, `roll_seq` incremented, one `item_granted` feed row and one
  move — the whole path, through the real UI.
- The single-outcome fix was verified the same way: a screenshot 120 ms after
  the overlay appears already shows the result with the button enabled, which
  is impossible if a 2.2 s spin were running.
- One false alarm worth recording: a run produced no wheel at all because the
  test player still had `balance_points` from an earlier run and
  `bonusAddsToRollOnPass` carried them into the roll, landing them past the
  cells the fixture had set. The fixture was wrong, not the code.

**Files touched.** New: `components/game/WheelOverlay.tsx`,
`lib/engine/iee/reel.ts`, `lib/engine/iee-reel.test.ts`. Modified:
`components/dashboard/RollCard.tsx`, `lib/engine/iee/index.ts`,
`lib/i18n/dictionaries/{en,ru,uk}/iee.ts`.

---

## 2026-09-08 — Session 6 · IEE phase 6 (the wheel, server side)

**Done.**

- **`lib/modules/game/service/iee.ts`** — grants for a landing cell, kept out of
  `resolve.ts` on purpose (that file is the turn transaction and was already the
  longest in the repo). `polarityForCell` maps `bonus → positive` and
  `penalty → negative`; `applyWheel` picks, persists and returns the outcome
  plus the feed rows; `expireEffectsFor` ends statuses whose duration ran out.
- **Wired into `resolveGameRoll`.** Order inside the single transaction:
  move → ledger → `season_players` (now including `roll_seq`) → grant →
  lazy expiry → the feed batch. A grant can never be persisted without its
  move, or the other way round.
- **The outcome travels to the client.** `resolveGameRoll` returns `wheel`, and
  `resolveGameAction` passes it through as `PlayerActionState.wheel`. Phase 7
  animates onto a decision that is already finished — the client never picks.
- **Feed.** Eleven new `EventType` members, rendering cases and icons in
  `feed-list.tsx`, and action strings in en/ru/uk. Catalog names are resolved
  from the dictionaries (`ieeName`), because the log only ever stores keys.
- Grants respect `revealDropsInFeed`: with it off, the row is written but no
  feed entry is emitted.

**A smell fixed before it became a bug.** `expireEffectsFor` first read active
rows through the pool (`db`) while running *inside* a transaction — a stale
snapshot that would not see the effect `applyWheel` had just inserted. Correct
by luck here (a fresh effect can never be due for expiry in the same call), but
wrong in principle, so `getActiveEffectRows` now takes the transaction handle.

**Known limitation, deliberate.** The pool context is read *before* the
transaction, like the board and cell reads already are. Under READ COMMITTED
two players resolving in the same instant could each pass a `maxPerSeason`
check that only one should. The caps are advisory, not invariants; making them
hard would need SERIALIZABLE or a row lock, which is not worth it for a
seasonal event with a handful of participants. Documented in the service.

**Verification.**

- `tsc`, `eslint` (0 errors), 172 tests, `next build --turbopack` — all clean.
- **19-assertion live probe** against the scratch database, driving the real
  grant path. The ones that matter:
  - a grant is **rolled back with its transaction** — the probe throws after
    `applyWheel` and the inventory count is unchanged, which is the property
    that makes a page refresh unable to re-spin the wheel;
  - the row is linked to its `move`, its `source` records which cell it came
    from, and its params are snapshotted;
  - `refresh` stacking keeps one row and pushes the deadline out (6 → 8 → 11);
  - expiry is lazy: active before the clock passes the deadline, then marked
    `expired` rather than deleted;
  - an empty pool and a disabled subsystem both fall back without writing.
- **Live feed render**: one row of each new event type was inserted and
  `/feed` rendered all five, resolving `hex_scroll` → "Hex Scroll" and
  `slowed` → "Slowed" through the dictionaries.

**Files touched.** New: `lib/modules/game/service/iee.ts`. Modified:
`lib/modules/game/service/resolve.ts`, `lib/modules/player/actions/game.ts`,
`lib/modules/iee/repository/effects.ts`, `lib/infrastructure/events/index.ts`,
`components/feed/feed-list.tsx`, `lib/i18n/dictionaries/{en,ru,uk}/feed.ts`.

---

## 2026-09-08 — Session 5 · IEE phase 5 (season wizard stage)

**Done.**

- **`iee` is now a wizard stage**, sitting between `pool` and `rules` in
  `SEASON_STAGES`. `resetStage` clears the season's pool and event list without
  touching the catalog (which is code), and `stageSlice` gained its case so the
  dirty-tracking bar and the reset button agree on scope.
- **`components/admin/IeeStage.tsx`** — the stage body: master switch,
  inventory size, `nothingWeight`, PvP switches with the protection window,
  catch-up with its multiplier, then one section per polarity listing every
  catalog entry with a rarity chip row and an "Advanced" disclosure (raw
  weight, per-season and per-player caps, cooldown, `minPosition`,
  `unlockAfterMove`). Event pool selected as chips from the active templates.
- **Four presets** (Off / Light touch / Standard / Chaos) fill the whole block
  in one click, mirroring how the game-pool templates already work.
- **The drop table is live and honest**: it calls `dropTable()` — the same pure
  function `pickWheelOutcome` draws from — so the percentages an admin sees
  cannot drift from what players get. The "Simulate 1000 spins" button runs the
  real picker with `Math.random` and shows observed vs expected side by side.
  This is only possible because the engine takes its generator as an argument.
- i18n: the `iee.stage` block and the new wizard tab label in en/ru/uk.

**Two data-loss hazards closed.**

1. **A save without the `iee` field would have wiped the pool.**
   `updateSeasonSettings` replaces the whole config, and `SeasonConfigSchema`
   fills an absent `iee` with the empty default — so any caller that did not
   send the field would silently clear a tuned season. `parseSeasonSettingsForm`
   now omits the key entirely when the form did not carry it, and
   `updateSeasonSettings` carries the stored value over in that case. Absent
   means "leave it alone", never "clear it".
2. `entries` is keyed by catalog key, so it cannot be flattened into named form
   inputs at compile time. It travels as one JSON field. That is the wire
   format only — every control in the stage is visual, per `DESIGN.md` §1.4 —
   and `IeeConfigSchema` validates it server-side.

**The exhaustive switch earned its keep.** Adding the stage produced
`Type '"iee"' is not assignable to type 'never'` at `stageSlice`'s `default`
branch — a second switch I had not noticed. Without the `never` guard the
stage would have silently reported itself as never edited.

**Verification.**

- `tsc --noEmit` clean; **172 tests pass** (was 120 — the engine suite plus the
  season-setup suite, now including four new `resetStage(cfg, "iee")` cases).
- Two pre-existing tests hardcoded "5 stages" and broke on the sixth. Fixed by
  deriving from `SEASON_STAGES.length` rather than by patching the numbers, so
  the next stage will not break them again.
- `eslint`: 0 errors (the same five pre-existing warnings).
- `next build --turbopack` succeeds; `/admin/seasons/[id]` grew 93.4 kB → 101 kB.
- **Live round-trip probe** against the scratch database: the JSON field
  survives `parseSeasonSettingsForm` → `SeasonConfigSchema` → the `jsonb`
  column and back losslessly; per-entry defaults fill in; an omitted field is
  left out of the parsed config, Zod alone *would* have wiped the pool, and the
  carry-over guard preserves it. Nine assertions, all passing.
- **Live page render** as an authenticated admin: the season editor serves the
  new tab, both catalog entries, the seeded event template, the drop table, the
  simulator and the presets. An anonymous request gets the redirect and no
  season data.

**Files touched.** New: `components/admin/IeeStage.tsx`. Modified:
`lib/modules/catalog/pool/season-setup.ts` (+ its test),
`lib/modules/season/actions/seasons/form.ts`,
`lib/modules/season/service/seasons.ts`,
`components/admin/SeasonSettingsForm.tsx`, `app/admin/seasons/[id]/page.tsx`,
`lib/i18n/dictionaries/{en,ru,uk}/{iee,admin}.ts`.

---

## 2026-09-07 — Session 4 · IEE phase 4 (admin catalog)

**Done.**

- **`/admin/catalog`** — new staff page with three tabs (`?tab=items|effects|events`),
  wired into the admin nav. Items and effects are **read-only** browsers over
  the code catalog, showing polarity, rarity, usage mode, target, duration,
  stacking, hooks and how many seasons list each key. Events get full CRUD.
- **Service + actions** — `lib/modules/iee/service/catalog.ts` and
  `actions/catalog.ts`. Every mutation goes through `requireStaff` and writes
  `logAdminAction` (`iee_event_template_{create,update,enable,disable,delete}`).
- **Reward editing is three visual fields** (points / item / effect), never a
  JSON textarea — `DESIGN.md` §1.4. The item and effect selects are built from
  the hardcoded catalog and validated server-side against it, so an unknown key
  cannot be submitted at all.
- **i18n** — a full `iee.admin` block in en/ru/uk, plus seven new IEE error
  codes in `core.ts` for all three languages.
- Repository gained `getIeeUsageByKey` / `getEventUsageByKey`, which read
  `seasons.config` directly rather than adding a join table.

### Security: two authorization leaks found by running the app

`app/admin/layout.tsx` redirects non-staff, but **layout and page render in
parallel in the App Router**. The layout's `redirect()` cannot un-send a
streaming response, so a page that queries the database without its own guard
still runs those queries, and their output lands in the RSC payload of the
200 response that carries the redirect. A browser follows the redirect and
shows nothing — `curl` keeps the payload.

- **`/admin/catalog` (mine, fixed before it ever ran for a user).** An
  anonymous request returned the seeded event template's key and title.
- **`/admin/page.tsx` (pre-existing, fixed).** An anonymous request returned
  the active season's title from the dashboard.

Both now guard themselves, matching what `app/admin/users/page.tsx` already
did:

```ts
const actor = await getCurrentUser();
if (!actor) redirect("/login");
if (!isStaff(actor)) redirect("/");
```

**Rule for every future admin page: if it reads data, it guards itself.** The
layout is defence in depth, not the lock. Verified by an anonymous sweep of all
ten admin routes — zero database strings in any payload, while an authenticated
admin still gets every page.

### Verification

A full harness was built in the sandbox: the whole app extracted, real
dependencies installed, plus the scratch PostgreSQL from session 3b.

- `tsc --noEmit` clean over all 303 files. Proven live by injecting four
  defects — a missing key in `ru/iee.ts` (caught by the `Widen` conformance
  type), a nonexistent dictionary path, a wrong `Switch` prop, and a wrong
  `searchParams` type. The first three were caught; the fourth was not,
  because Next's route types are generated at build time — so the signature
  was instead checked against `app/admin/users/[id]/page.tsx`, which uses the
  identical `?tab=` pattern.
- `eslint` with the project's own flat config: **0 errors**. Five warnings, all
  in files that predate this work (`app/layout.tsx`, `board-view.tsx`,
  `RollCard.tsx`, `feed-list.tsx`, `db/schema/moderation.ts`). Proven live by
  adding a `drizzle-orm` import to `lib/engine` and watching
  `no-restricted-imports` fire.
- **`next build --turbopack` succeeds**, `/admin/catalog` compiling to 7.9 kB.
  This is what validates the server/client boundaries, the server-action
  signatures and the `form=`-per-row pattern. (Google Fonts are unreachable
  from the sandbox, so the harness copy of `app/layout.tsx` had its three
  `next/font/google` calls stubbed — the project file was not touched.)
- The built app was served against the seeded database and every tab was
  rendered over HTTP as an authenticated admin, which is how both leaks above
  were found.

**Files touched.** New: `app/admin/catalog/page.tsx`,
`components/admin/{IeeCatalogTabs,IeeCatalogBrowser,EventTemplatesManager}.tsx`,
`lib/modules/iee/{service,actions}/**`. Modified: `app/admin/layout.tsx` (nav),
`app/admin/page.tsx` (guard), `lib/modules/iee/repository/events.ts`,
`lib/modules/iee/index.ts`, `lib/i18n/dictionaries/{en,ru,uk}/{iee,core}.ts`.

---

## 2026-09-07 — Session 3b · seed fixes + live DB verification

**Trigger.** `pnpm db:seed` failed with `column "status" is of type season_status
but expression is of type text` (SQLSTATE 42804).

**Three bugs fixed in `scripts/seed-demo.ts`.**

1. **Pre-existing, blocking (not from this feature).** The season insert picks
   its status with `(select case ... then 'paused' else 'active' end)`. Inside
   a scalar subquery the CASE branches resolve to `text`, and Postgres has no
   implicit `text -> season_status` cast, so the statement failed *every* time
   regardless of whether the row already existed. Verified identical in `HEAD`.
   Fixed with an explicit `::season_status`.
2. **Introduced by me, caught by running it.** The explanatory comment I added
   used markdown backticks around a word — **inside the SQL template
   literal**, which terminated the string and broke the file. Never put a
   backtick in a comment that lives inside a template literal.
3. **Pre-existing idempotency bug.** `boards` has no uniqueness on
   `season_id`, and the script inserted unconditionally — so every run added a
   second board plus 40 more cells (confirmed: 2 boards / 80 cells after two
   runs). `AGENTS.md` advertises this script as idempotent. Now it looks
   before inserting; three consecutive runs leave 1 board / 40 cells / 8 games
   / 1 event template.

**Live verification against a scratch PostgreSQL 16.**

A throwaway cluster was created in the sandbox, `drizzle-kit push` applied the
schema, and the real seed script ran against it. Then two probes exercised the
actual SQL — not just the types:

- **Repositories (25 assertions, all passing).** `consumeItemCharge` spends
  exactly one charge and the second call returns null (§15.6 step 4 proven at
  the SQL level, not by inspection); `refreshEffect` updates in place instead
  of adding a row; `assignEvent` twice returns null on the second call via the
  unique index (F6); `submitEventProof` is guarded the same way; a live
  `player_effects` row drives the engine hook to `stepsDelta -1`;
  `loadPoolContext` + `pickWheelOutcome` yield the tracer item from the seeded
  pool; `maxPerPlayer: 2` then closes the gate and falls back; deleting a user
  cascades participants and their IEE rows away.
- **Season reset.** The exact statements `resetSeason` now runs wipe
  inventory, effects and events, reset `roll_seq` from 11 to 0, and leave the
  participant row intact.

Nothing was run against the project's own database.

**Files touched.** `scripts/seed-demo.ts` only.

---

## 2026-09-07 — Session 3 · IEE phase 3 (persistence)

**Scope.** Schema, migration and repositories. The database itself was **not**
touched — `pnpm db:push` is yours to run.

**Done.**

- **Schema.** `db/schema/iee.ts`: `player_inventory`, `player_effects`,
  `player_events`, `event_templates`. Three enums in `enums.ts`
  (`iee_item_state`, `iee_effect_state`, `iee_event_status`).
  `season_players` gains `roll_seq` (the effect-duration clock);
  `moves` gains an index on `season_player_id`.
- **Migration `drizzle/0016_iee_items_effects_events.sql`** generated offline
  with the project's pinned drizzle-kit 0.31.10 and committed with its
  snapshot and journal entry. 97 statements, **purely additive** — no `DROP`,
  no `TRUNCATE`, no `ALTER COLUMN`, no `DELETE`. Safe on a populated database.
- **Repositories** under `lib/modules/iee/repository/`: `inventory.ts`,
  `effects.ts`, `events.ts`, `counters.ts`. Dumb by design — they return null
  or a count and let the service decide what is an error.
- **`scripts/seed-demo.ts`** seeds the `screenshot_of_the_day` event template
  and enables the tracer pool on `run-1`, both idempotently. The season config
  is only written when it has no `iee` key, so a tuned pool is never clobbered.

**Two design bugs found and fixed during implementation.**

1. **`resetSeason` would have left inventories behind.** It UPDATEs
   `season_players` rather than deleting them, and clears children with
   explicit `delete` calls — so `ON DELETE CASCADE` never fires there. The
   three new tables are now in that list, and `roll_seq` is reset with the
   rest. Without this, decision **D4-a** (statuses die with a reset) would
   have been silently false.
2. **Cooldowns compared two different clocks.** `cooldownRolls` is specified
   in season-wide resolved rolls, but the first implementation compared it
   against a single player's `roll_seq`. Fixed by storing `season_roll_seq` on
   each grant row, so the cooldown reads back the same clock it was written
   with.

**One migration hazard avoided.** `ALTER TABLE season_players ADD COLUMN
roll_seq ... DEFAULT 0` backfills zero for existing participants. Since the
gates `unlockAfterMove` and `pvpProtectionMoves` are measured in moves, a
season already in flight would have treated every veteran as a brand-new
player the moment IEE was switched on. `getMoveCount` therefore counts `moves`
rows instead of reading the new column — accurate with no backfill script.
`roll_seq` remains the expiry clock, where a 0 baseline is harmless because
durations are relative.

**Also worth knowing.**

- `consumeItemCharge` guards on `state = 'held' AND charges_left > 0` **inside
  the WHERE clause**, so a double-submitted form spends exactly one charge and
  the second call returns null. Never read-then-write here.
- The same pattern guards `submitEventProof` and `resolveEvent`.
- `assignEvent` relies on the unique index `(season_player_id, event_key)` plus
  `onConflictDoNothing` for F6, rather than a prior SELECT.
- Deleting an event template nulls the FK but keeps the assignment's
  snapshotted title, description and reward — history never rewrites.
- An IEE grant row carries `season_id` next to `season_player_id`, the same
  denormalization `event_log` already uses, so per-season counters are
  single-table.

**Verification.**

- `tsc --noEmit` clean over the engine, the schema and the repositories.
  Confirmed tsc really checks them by injecting a bad enum literal and a wrong
  return type — both caught, then reverted.
- The `resetSeason` edit was typechecked via a replica probe against the real
  schema (its own dependency tree is too large to stage), and the probe was
  itself proven live by breaking `rollSeq`.
- 120 engine tests still pass.
- The seed's hand-written IEE JSON was parsed through `SeasonConfigSchema` to
  confirm it validates and fills per-entry defaults.
- Migration checked for destructive statements: zero.

**Files touched.** New: `db/schema/iee.ts`, `lib/modules/iee/**` (6 files),
`drizzle/0016_iee_items_effects_events.sql` + its snapshot. Modified:
`db/schema/{enums,index,players,moves}.ts`,
`lib/modules/season/service/seasons.ts` (reset), `scripts/seed-demo.ts`,
`drizzle/meta/_journal.json`.

---

## 2026-09-07 — Session 2 · IEE phases 0–2 (pure engine)

**Scope agreed.** Accept every ★ recommendation in §12; implement phases 0–2
only (nothing touching the database, the UI or the existing turn flow); do not
commit — working tree only.

**Done.**

- **Phase 0 — contracts.**
  - `lib/engine/types/iee.ts` (314 lines): `ItemDef`, `EffectDef`, the nine
    `HookName`s, `HookPatch` / `IeeModifiers`, `IeeConfig` / `IeeEntryConfig`,
    `WheelOutcome` / `WheelSlice`, `RARITY_WEIGHT`.
  - `SeasonConfig` gains `iee`; `DEFAULT_SEASON_CONFIG.iee` added with the
    subsystem **off** by default.
  - `lib/engine/config/iee.ts`: `IeeConfigSchema` + `IeeEntryConfigSchema`,
    wired into `SeasonConfigSchema`.
  - i18n namespace `iee` in en/ru/uk, registered in `dictionaries/index.ts`.
    Catalog entries carry dictionary **keys**, never literal text.
- **Phase 1 — selection.** `iee/selection/gates.ts` (ten gate reasons) and
  `iee/selection/pick.ts` (`buildPool`, `buildSlices`, `catchUpMultiplier`,
  `dropTable`, `pickWheelOutcome`). Pure, rng injected.
- **Phase 2 — hooks + tracer.** `iee/resolve/hooks.ts` (patch reducer with
  additive / override-by-priority / veto semantics, lazy expiry helpers,
  `runHook`); tracer effect `slowed` and tracer item `hex_scroll` with their
  registries; `MovementInput.modifiers` (optional, so every existing call site
  still compiles), `modifiedDice`, `applyMovementModifiers`.

**Verification.**

- `tsc --noEmit` clean, also under `--noUnusedLocals --noUnusedParameters`.
- **120 tests pass** (50 before). The 50 pre-existing tests were untouched and
  still pass — which is the actual proof that adding a config key breaks no
  existing season.
- **Mutation-checked.** Five deliberate defects were injected to confirm the
  suite has teeth; each was caught: flipping the tracer effect's sign (3
  failures), making overrides last-writer-wins (3), removing the
  inventory-full gate (1), making catch-up ignore polarity (1), allowing
  self-targeting (1). All reverted.
- Removed a `as IeeConfig` cast from a test to prove the Zod output type *is*
  structurally `IeeConfig` rather than merely assignable to it.

**Deviation from the ★ set — one, deliberate.**

- **§12 B6** (`unique` effect already active) said "re-pick once, then
  nothing". Implemented instead as a **gate**: such an entry never reaches the
  wheel. Reason: §7.1 promises the client an *honest* wheel whose slices are
  outcomes that can really happen, and a re-pick means showing a slice that
  cannot be granted. The excluded weight is redistributed across the remaining
  slices. Revisit only if you want the wheel to display impossible slices.

**Notes for the next phase.**

- `runHook` deliberately skips effect keys missing from the registry, so a
  catalog entry deleted in a later release leaves old rows readable instead of
  crashing a turn.
- `pickWheelOutcome` never throws on an empty or fully-gated pool — it returns
  `kind: "fallback"` and the caller applies the cell's legacy numeric amount.
- Dice modifiers clamp (`count ≥ 0`, `sides ≥ 2`) rather than letting
  `rollDice` throw in the middle of a turn.
- `dropTable()` is the same function the picker draws from, so the admin
  probability preview cannot drift from real behaviour.

**Files touched.** New: `lib/engine/types/iee.ts`, `lib/engine/config/iee.ts`,
`lib/engine/iee/**` (8 files), `lib/i18n/dictionaries/{en,ru,uk}/iee.ts`,
`lib/engine/iee-{config,selection,hooks}.test.ts`. Modified:
`lib/engine/types/{index,season,player}.ts`,
`lib/engine/config/{defaults,index}.ts`, `lib/engine/board/movement/index.ts`,
`lib/engine/index.ts`, `lib/i18n/dictionaries/index.ts`,
`lib/engine/movement.test.ts` (its `configWith` helper enumerates every
`SeasonConfig` key, so a new key is a compile error there by design).

---

## 2026-09-07 — Session 1 · IEE design

**Goal.** Turn a verbal concept (items, effects, events) into a reviewable
design and a phased plan. No code.

**Done.**

- Read the codebase: `AGENTS.md`, all of `db/schema/**`, `lib/engine/**`,
  `lib/modules/**`, the season wizard and the turn flow
  (`rollNewGame → resolveGameRoll → resolveMovement → applyCellEffect`).
- Wrote [`ITEMS_EFFECTS_EVENTS.md`](./ITEMS_EFFECTS_EVENTS.md) — 15 sections:
  concept, critique, storage model, catalog/runtime shapes, hook model, wheel
  mechanics, tuning surface, admin and player surfaces, logging, risks, a
  13-phase plan, a 33-item decision menu (§12) and a tracer-bullet trio (§15).

**Decisions proposed (all still unconfirmed — §12).**

- Three-tier storage: catalog behaviour in **TypeScript** (`lib/engine/iee/`),
  season tuning in **JSONB** `seasons.config.iee`, runtime state in **four new
  tables**. Rationale: adding an item costs no migration; retuning a live
  season costs no deploy.
- The proposed "JSON instead of DB" was rejected in favour of TS modules — a
  repo-resident JSON file still needs a deploy but loses types and cannot hold
  the implementation function.
- Items/effects stay developer-authored; **events are admin-authored content**
  and get a real table with CRUD. That asymmetry is the spine of the design.
- Effects fire on a **closed set of nine hooks** with a deterministic patch
  reducer (additive / override-by-priority / veto). Freezing this before any
  item is written is the single highest-leverage decision (§12 D3).
- Wheel outcome is decided, persisted and returned **inside the existing
  `resolveGameRoll` transaction**; the client animates a decision already made.
- `polarity` means *which cell pool a thing drops from*, not *good or bad for
  the holder* (§12 B7) — the distinction breaks on the first offensive item.

**Notable findings in the existing code.**

- `CELL_EFFECTS` and `GAME_POOL_TEMPLATES` already prove the hardcoded-registry
  pattern twice; the new catalog should look like them.
- `SeasonConfigSchema` defaults per branch, so old seasons parse against a new
  config key with **no migration** — this is what makes tier 2 free. Needs a
  regression test in Phase 0.
- `cellTypeEnum` already has `bonus`, `penalty`, `event` → **no enum
  migration**. `event_log.event_type` is `text` → new feed types need no
  migration either.
- `GAME_POOL_TEMPLATES` hardcodes English labels, violating the i18n golden
  rule. Existing debt — do not copy it; the IEE catalog stores i18n keys.
- `resolveGameRoll` is ~250 lines and is where every new mechanic wants to
  live. Grant logic goes in a separate `lib/modules/game/service/iee.ts`.

**Not done / next.**

1. Answer §12 (or accept all ★ recommendations, which are mutually consistent).
2. Phase 0 — contracts + config schema + i18n namespace + the "old season still
   parses" regression test.
3. Normalise line endings in a dedicated commit before any feature commit.

**Files touched.** `ITEMS_EFFECTS_EVENTS.md` (new), `WORKLOG.md` (new).
No source files, no schema, no migrations.
