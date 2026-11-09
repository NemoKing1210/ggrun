# IEE constructor — journal

> One entry per session, newest first. The contract is
> [`IEE_CONSTRUCTOR_SPEC.md`](./IEE_CONSTRUCTOR_SPEC.md); the order and the
> gates are in [`IEE_CONSTRUCTOR_PLAN.md`](./IEE_CONSTRUCTOR_PLAN.md). Every
> stage ends with `pnpm verify` green, an entry here and in
> [`WORKLOG.md`](./WORKLOG.md), and a stop until the owner gives the go-ahead.

---

## Status

| Stage | Status | Sessions | Gate evidence | Commit |
| --- | --- | --- | --- | --- |
| 0 Spec | **Done** | 1 of 1–2 | spec delivered; `pnpm verify` green | not committed |
| 1 Core | **Done** | 8 of 6–8 | `pnpm verify` green (272 files / 3259 tests); the 47 engine scenarios green on the new core with unchanged expected results; no `ITEMS` / `EFFECTS` / `player_inventory` / `player_effects` left in code; live check recorded (session 9: the plan's five checks and the 11 live scenarios) | not committed |
| 2 Library | **Done** | 4 of 3–4 | `pnpm verify` green (291 files / 3603 tests); live (session 13): a season plays published revisions of `core` and of an imported pack, drawn with its icon; export → import into an empty database → export gives the same manifest and the same icons, and `core` exports back as the committed file; the database refuses to delete a pinned revision and one a live instance holds | not committed |
| 3 Editor | **Done** | 6 of 5–7 | `pnpm verify` green (301 files / 3691 tests); live (session 19): «Болото», «Сапоги скорости» and «Отравление» built in the constructor without code, published, attached to the active season through the pack screen and the wizard, and working — dropped from the wheels, shortening and lengthening moves, counting moves and passed games, the boots handing out «Попутный ветер» | not committed |
| 4 Checks & balance | **Done** | 4 of 3–4 | `pnpm verify` green (315 files / 3841 tests); a red scenario refuses publishing in the constructor (session 21, live); a sandbox run is recorded as `iee_sandbox_run` (session 22, live); the 1000-spin simulator matches the drop table within chance on both of `core`'s wheels (`simulate.test.ts`; live in the wizard); power calibrated against the simulator for every primitive and `core` entry (`power-calibration.test.ts`) | not committed |
| A | **Done** (the owner's go-ahead 2026-10-17) | 5 of 5–7 | `pnpm verify` green (318 files / 4250 tests); 37 of 83 entries available (`core` holds 40, §17.1); live (session 29): «Свинцовые грузы» dropped by a bonus landing, used on the rival, planted «Тяжёлые ботинки» that took 2 off the rival's next passed roll and vanished; «Сломанный компас» dropped by a penalty landing and sent a passed 3 back 3 cells (24 → 21), then vanished | not committed |
| B | **Done** (the owner's go-ahead 2026-10-22) | 5 of 5–7 | `pnpm verify` green (327 files / 4715 tests); 59 of 83 entries available (`core` holds 63, §17.1); live (session 34): the core «Золотая монета» used in the reaction window — a second throw of 1, and the 4 stood; «Налог» left unanswered took its default at the next roll — the newest common item discarded | not committed |
| C | **Done** (the owner's go-ahead 2026-10-30; «Иммунитет» corrected in session 39) | 4 of 5–7 | `pnpm verify` green (333 files / 5088 tests); 77 of 83 entries available (`core` holds 87, §17.1); live (session 38): the core «Три двери» opened a choice of three at the next roll and the game taken became the roll; the core «Сложный режим» gave that game the condition "Play on Normal difficulty or higher", shown on the game card, and the condition ended with the game | not committed |
| D | **At the gate** (session 42) — awaiting the owner's go-ahead | 3 of 3–4 | `pnpm verify` green (336 files / 5220 tests); 81 of 83 entries available (`core` holds 91, §17.1); live (session 42): the core «Мина» stopped a pass of 4 on its cell and threw it 2 back, «Пружина» carried a pass of 1 on 2 cells, «Капкан» stopped a pass of 3 and spun the penalty wheel in place of the cell; «Корона» added 1 to its holder's pass, went to the rival whose move ended on the holder's cell, and added 1 to the rival's next pass | not committed |

Entries available: **81 of 83** — the starter set's core wave and waves A to
D (spec §17.1), in data as the system pack `seed/iee/core.ggpack`, which
holds 91 entries: those 81, the effect `heavy_boots` kept as «Тяжёлый шаг»,
and nine handouts (`magnet_pull`, `fate_roll`, `treasure_hunt` and wave C's
six, spec §6.6). «Чёрная карта» and «Белая карта» wait for events.

**The owner's decisions** on the open list (2026-10-09), carried out in
session 24:

1. A refresh in the turn a `passed_games` (or `triggers`) effect ticks lost one
   count → a renewal works as a fresh copy: the full count again, and whatever
   counts the effect down after it comes off the new count; the roll already
   underway stays with the old one (spec §7.10). The loss turned out wider than
   reported — a landing lost one count of every unit.
2. «Везение» and «Невезение» acted on drops too, against their character →
   they act on passed games only (`outcome: passed`).
3. A drop spends points backward as a pass spends them forward → the rule
   stays; the settings and the rules page now say so.
4. `core`'s rarities did not follow measured strength → reassigned by strength
   and uniqueness (spec §14).
5. The power model's 60 % pass rate → kept until a live season measures it.
6. The rarity thresholds → rarity marks how special an entry is, not three
   strengths of one effect; the thresholds guard the strength side only.

**Wave A's gate** (2026-10-17): the owner gave the go-ahead for wave B with no
corrections — the choices of session 29 stand until the owner changes them
(«Потом будем корректировать детали»).

**Wave B's gate** (2026-10-22): the owner gave the go-ahead for wave C with no
corrections — the choices of sessions 30–34 stand until the owner changes them.

**Wave C's gate** (2026-10-30): the owner gave the go-ahead for wave D and left
the one open question — «Иммунитет», which never met a condition in a
`core`-only season — to the recommendation: it waits for the first game that
would get conditions and is spent on it (session 39). The other choices of
sessions 35–38 stand until the owner changes them.

**Open for the owner** — found on the way, to be decided when convenient:

1. «Разгон» (+1 point a passed game) and «Пошлина» (−1 point a landing) are
   worth 0.4 and 0.2 of a cell under the points rule kept in decision 3 —
   hardly felt in play (session 24).
2. Re-measure the pass rate from the first live season's rolls and re-run the
   calibration (decision 5).
3. Wave A's choices, made to keep going (session 29; the owner said to correct
   details later): the boots as a cursed item with its own slug and the old
   effect kept as «Тяжёлый шаг»; «Камень времени» on a rival only; «Потерянное
   время» waiting for a passed game; the rarities kept by mechanic rather than
   strength («Кости судьбы» epic at 1.8 cells; «Крюк», «Быстрый путь»,
   «Сломанный компас», «Погоня» rare at 2 or less) — see session 29.
4. With wave A's wheels a penalty landing measures 1.7 cells against the play
   model's 1, a bonus one 0.8 against 1.1 — inside the tolerance; re-calibrate
   `landing` with the pass rate (session 29).
5. Wave B's choices, made to keep going (sessions 32–34): the defaults of the
   victim's choice, the reaction window without a timeout, the bots' use of a
   reaction item on a bad throw only, the rarities kept as provisional, the
   elixir on passed games only. Fifteen of wave B's entries — the protections,
   the item operations, the standing states — are valued off the pack: the
   simulator's rivals use nothing a run hands out, so only a live season can
   measure them.
6. Wave C's choices, made to keep going (sessions 35–38): the items that pick
   for the next game or offer a choice work through handouts and may be used
   at any time (during a game they shape the game after it); a choice of games
   waits for the player with no default; a set-aside game comes back on its own
   roll; «Старое железо» keeps to games of 2009 or earlier (a tunable `year`);
   the conditions' texts as written in session 38; the rarities kept as
   provisional. The wave's entries are valued by the play model's assumptions
   — the simulator plays no game pool — so only a live season can measure
   them.
7. ~~«Иммунитет» for the next game never meets a condition in a `core`-only
   season (session 38).~~ Decided at the wave C gate (session 39): it waits
   for the first game that would get conditions and is spent on it.
8. Wave D's choices, made to keep going (sessions 40–42): an object acts on
   whoever enters its cell first — its owner too, and a move back as well
   (a mine throws a drop 2 further back, a spring carries it 2 further); a
   mine's push lands without a cell; at most 2 standing objects a player
   (`boardObjectsPerPlayer`); objects are public, with their owner; «Капкан»
   rare as a mechanic of its own (1.4 by strength); «Корона» +1 on passed
   games only and taken only at the end of a regular move. The objects' worth
   rests on two assumptions — an object meets the one it was placed for three
   times in four (`object.aimed`), a rival ends a move on a player's cell one
   roll in ten (`sameCell`) — that only a live season can measure.

### How a session runs

1. Clone the checkout's commit into a clean Linux workspace,
   `pnpm install --frozen-lockfile`, baseline `pnpm verify`.
2. Implement the session's tasks from the plan, tests next to the code.
3. `pnpm verify` green; a live check against `pnpm dev` + scratch Postgres when
   behaviour changes.
4. Write the changed files back into the Windows checkout with CRLF endings
   (LF for `.gitattributes eol=lf` files). Read-only git from Linux uses
   `GIT_OPTIONAL_LOCKS=0`; never `git add -A` while the CRLF churn exists.
5. Entry here and in `WORKLOG.md`; at a stage gate, stop.

---

## 2026-11-01 — Session 42 · Wave D, part 3 (the wave's entries in `core`) — the gate

**Goal.** Plan §11 task D.3: the four wave-D entries in `core` with their
scenarios — then the wave's gate: 81 of 83, a live check of each object.

**Done.**

- **`seed/iee/core.ggpack`** holds 91 entries: «Мина» (`mine`), «Пружина»
  (`spring`), «Капкан» (`snare`) and «Корона» (`crown`) added, one revision
  each, with sixteen scenarios (`SC-MINE-1…5`, `SC-SPRING-1…4`,
  `SC-SNARE-1…3`, `SC-CROWN-1…4`); the fixture regenerated (`pnpm iee:core`)
  and the scenario reference — 289 scenarios, 269 in the documents.
- **The objects** — active, at any time, one use, a cell picked: the use
  places the item (`placeObject`); «Мина» `stopMove` and `push` −2,
  «Пружина» `extend` 2, «Капкан» `stopMove` and `spinInstead` penalty
  (spec §6.18). Their scenarios: placed on the cell picked and set off by a
  rival's move through it, then gone; the owner's own move, and one that
  ends on the cell; a move back (a drop meets a mine and is thrown 2 further
  back, a spring carries it 2 further); one that ends short of the cell
  leaves the object standing; an object on a spring's longer way acts too;
  a use with no cell, or a taken one, is refused and the item kept;
  «Капкан» spins the penalty wheel whatever cell the move would have ended
  on.
- **«Корона»** — passive, no charges, one in the season: +1 to a passed
  game's result (`afterDice`), taken at `onSameCell` (spec §6.19). Its
  scenarios: +1 on passes only; a rival who ends a move on the holder's cell
  takes it, it serves them from their next roll, and it comes back the same
  way; a move through the cell takes nothing, nor does an arrival out of turn
  («Свиток портала»); no second from the wheel or from staff.
- **Glyphs** — three new on the list (`glyphs.ts`, `IeeIcon.tsx`):
  `ChevronDoubleUpIcon` «Пружина», `StopCircleIcon` «Капкан», `TrophyIcon`
  «Корона»; «Мина» takes `FireIcon`. The glyph is what marks an object on
  the board, so the three objects each have their own.
- **Tags**: `board` and `movement` on the objects, `wheel` too on «Капкан»;
  `dice` on «Корона».
- **Power and rarity** (spec §14): «Мина» 1.9 and «Пружина» 1.0 common,
  «Капкан» 1.4 rare, «Корона» 6 epic — each at or below its provisional
  rarity. The objects are held to the play model (`HELD_TO_THE_MODEL`;
  `placeObject`, `stopMove`, `push`, `extend` and `spinInstead` join the
  model-valued primitives — the simulator places no objects); «Корона» is
  measured: 5.4 ± 0.2 on 1000 seeds against 6.
- **The pack-read play model** re-derived from the new `core` (four more
  bonus items; `model.ts` at its fixed point): the held items common 0.69 /
  1.29, rare 0.28 / 2.05, epic 0.03 / 4.4, legendary 0.002 / 12; a bonus
  spin 1.45; a harmful arrival 0.0136 a roll; a move back 2.1 at 0.0125; a
  bonus item arriving 1.62 at 0.0759, a bonus effect 0.92 at 0.0241;
  `shielded` 0.0569. Of `core`'s powers only «Налог» moved (1.1 → 1.2).
- Tests: the core documents' slugs, count and rule text (the four in
  English, two each in Russian and Ukrainian), the catalog's held items
  («Корона» the one without charges), the calibration's held-to-the-model
  set, a standing state's worth under the re-read model; the use-item test
  now places `core`'s own «Мина» (a local `mine` collided with it).
- Spec §14 (the re-read numbers, wave D's note) and §17.1 (wave D as
  shipped, `core` after wave D); plan D.3.

**Decided.**

- An object meets a move back as well as a move forward — the walk goes in
  the move's own direction (§6.18): the scenarios promise what a mine and a
  spring then do.
- «Капкан» rare: the penalty wheel in place of the cell is a mechanic of its
  own; by strength (1.4) it would be common. «Мина» and «Пружина» common.
- «Корона» measured, not held to the model: its +1 is the simulator's, and
  so is the rival who takes it — the measure lands under the model's 6, as
  the two-player duel starts side by side.

**Live** (`pnpm dev`, scratch Postgres, `run-1`; the boot imported the new
pack: 4 entries added, 4 revisions). The four core entries were attached to
the season and handed to player1; the players were put on 10 and 14, the
probe pack's leftovers ended. «Мина» placed from the dashboard's cell picker
on 15 (38 cells offered; the board marks it and the cell's details name it
and its owner): player2 passed a 4 from 14 — stopped on 15, thrown to 13
(`trigger_object` stopped, pushed −2; the feed: "Rival ran into Mine on cell
15 — the move stopped there, thrown to cell 13 (placed by player1)").
«Пружина» on 14: player2 passed a 1 — 13 → 16 (`extended` 2). «Капкан» on 17:
player2 passed a 3 from 16 — stopped on 17, and the penalty wheel spun in
place of the cell, dropping the cursed «Сломанный компас» (`spun` negative).
«Корона» (passive, no charges, on the dashboard with its text and the
trophy): player1 passed a 1 and moved 2 (`fire` `resultDelta` 1); with
player2 one cell ahead and a core mine one cell further, player2 passed a 4,
was stopped by the mine and thrown onto player1's cell, and took the crown
(`trigger_object`, `end`, then `fire` `take` and `move` to player2 counting
from their next roll; the feed: "Rival took Crown landing on the cell of
player1"); player2's next pass threw 5 and moved 6. No console errors on the
dashboards or the board.

**Verification.** `pnpm verify` green — **336 files / 5220 tests**; coverage 86.31 % statements / 79.94 % branches / 82.78 % functions / 87.67 % lines (86.3 / 79.92 / 82.74 / 87.66 before). The calibration measures «Корона» and holds the three objects to the model. Delivered to the checkout as s57.

**Files** (not committed): changed `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts`,
`docs/ITEMS_EFFECTS_SCENARIOS.md` (generated);
`lib/engine/iee/dsl/{glyphs,play-model}.ts`, `components/iee/IeeIcon.tsx`;
tests `lib/engine/iee/core-docs/core-docs.test.ts`,
`lib/engine/{iee-catalog,iee-filter}.test.ts`,
`lib/engine/iee/dsl/power.test.ts`,
`lib/modules/iee/sim/power-calibration.test.ts`,
`lib/modules/game/service/use-item.test.ts`; docs
`IEE_CONSTRUCTOR_{SPEC,PLAN,LOG}.md`, `WORKLOG.md`.

**Next.** Wave D's gate: stop; the owner's go-ahead or corrections. What is
left of the starter set — «Чёрная карта» and «Белая карта» — waits for events.

---

## 2026-10-31 — Session 41 · Wave D, part 2 (the same cell, one in the season)

**Goal.** Plan §11 task D.2: `onSameCell` and what «Корона» needs — taken by
the rival who ends a move on its holder's cell, one in the season (spec
§6.19).

**Done.**

- **The vocabulary**: the trigger `onSameCell` — an effect's, a passive or
  cursed item's moment (`held`) when a rival's regular move ends on the
  holder's cell; the action `takeEntry` (the rival takes the item as it is —
  offered to items only, `itemsOnly`, and refused in an effect, `take_item`);
  `balance`, `grantEffect`, `grantItem`, `cleanse`, `remove` and
  `transferItem` may stand there too, for the holder. `usage.unique:
  "season"` — one in the season, one per player too; its text closes with
  "There is one in the season." Lead: "When a rival's move ends on your
  cell, …".
- **The executor** (`sameCell`, after the move's objects and before the
  landing's wheel): every active player on the cell the move ended on, in
  seat order, has their entries' rules there run, the oldest first; what a
  rule asks is written as a lifecycle rule's is; `takeEntry` hands the item
  to the rival (`move`, `how: "taken"`, counting from their next roll; one
  they may not hold another of stays, `noop` `unique`); a firing counts down
  an effect of `triggers` and spends a held item's charge, unless the item
  went. A cancelled move, or one that ends where it began, arrives nowhere;
  an out-of-turn move never does (§7.3).
- **One in the season**: a grant of a second is refused (`blocked_unique`,
  `unique_season`) whoever would get it, even once the first is gone
  (`handedOut` in both stores); the wheel's gate `unique_season` reads the
  season's count of it. That count, and the cooldown's, no longer take an
  object on the board for a drop (`board_object` beside `roll_condition`).
- **Power**: `PLAY_MODEL.sameCell` 0.1 (an assumption: an arrival in about one
  roll in ten) — a rule at `onSameCell` fires that often, and an item a rival
  may take stays 1/`sameCell` rolls (its charges, when fewer). A crown, +1 on
  a pass while held: 6, epic.
- **The constructor**: «Один на сезон» beside «Один на игрока»; the moment
  «Когда соперник встаёт на вашу клетку» and «Соперник забирает». The feed:
  "Rival took Crown landing on the cell of player1".
- Tests: the vocabulary, the placement, the checks, the compiler, power, the
  rule text, the wheel's gate, the executor (`same-cell.test.ts`), the
  scenarios, the turn's write, the feed and the editor.

**Decided.**

- An arrival is a regular move's end — after its objects and its landing
  cell, a push included; no turn of the holder's runs, so what their rules
  pay out the executor writes as a lifecycle rule's.
- "Handed out once" counts any instance ever: a crown revoked by staff is not
  handed out again (spec §6.19's "once one has been handed out").

**Live** (`pnpm dev`, scratch Postgres, `run-1`; the probe pack's «Корона
(проба)»). player1, put back in the race on 33, held the crown; player2 on 34
placed a probe mine on 35 and passed with a 2: the mine stopped the move and
threw it to 33 — player1's cell — and the crown went to player2 (`fire`
`take`, `move` `taken`, counting from player2's next roll); the feed: "Rival
took Crown (probe) landing on the cell of player1"; the dashboard lists it
with its text. player2's next pass threw 2 and moved 3 (33 → 36, the crown's
`resultDelta` 1).

**Verification.** `pnpm verify` green — **336 files / 5187 tests**; coverage 86.3 % statements / 79.92 % branches / 82.74 % functions / 87.66 % lines (86.26 / 79.85 / 82.69 / 87.62 before).

**Files** (not committed): `lib/engine/iee/dsl/{doc,runtime,vocabulary,compile,check,placement,power,play-model,text}.ts`,
`lib/engine/iee/selection/gates.ts`, `lib/engine/iee/catalog.ts`;
`lib/modules/iee/executor/{index,store}.ts`, `lib/modules/iee/sim/{memory-store,season}.ts`,
`lib/modules/iee/registry/index.ts`, `lib/modules/iee/repository/instances.ts`,
`lib/modules/iee/library/draft.ts`, `lib/modules/game/service/turn.ts`;
`components/admin/constructor/entry/UsageBlock.tsx`,
`components/feed/feed-timeline-view.tsx`; dictionaries
(`{en,ru,uk}/{ieeEditor,feed}.ts`); tests next to each, new
`executor/same-cell.test.ts`; `docs/{IEE_CONSTRUCTOR_SPEC,IEE_CONSTRUCTOR_PLAN}.md`,
this journal, `docs/WORKLOG.md`.

**Next.** D.3: the wave's four entries in `core` — «Мина», «Пружина»,
«Капкан», «Корона» — with scenarios; then the wave D gate.

---

## 2026-10-31 — Session 40 · Wave D, part 1 (objects on the board)

**Goal.** Plan §11 task D.1: an item that places itself on a cell, and acts on
the first regular move that enters it — placement rules, one object per cell,
`boardObjectsPerPlayer`, shown on the board (spec §6.18, §7.7).

**Done.**

- **The vocabulary** (spec §6.18): `usage.pick: "cell"`; the action
  `placeObject` at the use; the trigger `onObjectEntered` and what an object
  does there — `stopMove` (no landing, the cells left are lost), `push`
  (after a stop; back when negative, no further than the start), `extend`
  (the move goes on and lands as usual) and `spinInstead` (after a stop, that
  wheel in place of the cell). Texts in three languages ("When a move passes
  through or ends on its cell, the move stops there without a landing and the
  player who entered is thrown 2 cells back."). Harm none: the board's.
- **The walk** (`playTurn`, step 7; `walkPath`): after the dice and the step
  modifiers, the move walks to where it ends, cell by cell in its direction,
  over a looping board's seam; the first object on the way acts, each once —
  a stop ends the walk (a push moves on from it, no cell, no object), a longer
  move goes on and may meet another. A cancelled move, an out-of-turn move, a
  push and a teleport pass no objects. The rules read the mover: `outcome`,
  `chance`, `hasEntry`, `diceShow`, `rank`, `itemCount`.
- **The executor**: `placeObject` (a `board_object` instance held by the cell —
  the item's revision and parameters, its user the owner; a cell taken
  meanwhile places nothing, `cell_taken`), `boardObjects` (what the walk asks,
  with each object's draws kept), `triggerObjects` (`trigger_object` with what
  it did — stopped, pushed and where to, extended, spun — then `end`
  `triggered`). The feed: `object_placed` on the owner's line,
  `object_triggered` on the mover's, the owner named.
- **The item path** (`decideItemUse`): the cell is the board's to offer — not
  the start, not the finish, not one taken (`ieeCellUnavailable`); past the
  season's `boardObjectsPerPlayer` the use is refused (`ieeObjectLimit`);
  nothing is spent either way. The dashboard's picker lists the free cells;
  the form sends `pickedCell`.
- **The board**: every board page marks the cells objects stand on (the
  item's glyph framed on the tile, and in the list view), the cell's details
  name the object, its rule text and its owner (`boardObjectsBySeason`,
  `BoardObjectView`); the dashboard's track marks them too.
- **The constructor**: the trigger and `placeObject` are offered only to an
  active item whose use asks for a cell (the scope's `places`,
  `placesOnly`, `TriggerDef.placed`); forms for `push`, `extend` (cells, a
  parameter or a range) and `spinInstead`; the pick «Клетка». Checks:
  `place_pick` (both ways), `object_unplaced`, `object_stop`, `object_idle`
  (a warning). Power: half of what the object does to the mover
  (`PLAY_MODEL.object.aimed` 0.75, an assumption — the simulator places no
  objects): a stop and a push back of 2 — 1.9, a stop and a penalty wheel —
  1.4, a longer move of 2 — 1.
- **Scenarios**: `given.objects` (up to 4: the item, its cell, whose), the
  check `objects`, a Given that cannot place broken (`object_cell`), the cell
  a use picks in `pick`; a new use step of an item that places itself picks
  cell 14 and promises the object. The play key includes the objects.
- **Bots** place an object that stops a move within a move past the nearest
  rival ahead (none when nobody is ahead) — an attack — and one that helps
  within a move ahead of themselves — a buff (`objectCellsFor`).

**Decided.**

- The trigger is offered by the use's pick, not by the actions: an author
  picks «Клетка» first, and the constructor then offers placing and the moment
  — so nothing it offers is refused (the promise `draft.test.ts` holds).
- A held item never stands on the board: `onObjectEntered` is not a moment of
  a passive or cursed item (`trigger_kind`), and `object_unplaced` speaks only
  of an active item, whose use can place it.
- Pack capabilities (`board_objects`, spec §2) stay stored and unenforced: an
  older engine has nothing to read them with, and this one has the feature.

**Live** (`pnpm dev`, scratch Postgres, `run-1`; a probe pack with «Мина
(проба)» — stop, back 2 — and «Пружина (проба)» — +2, imported from the
shell). player2 on 31 used the mine from the dashboard: the picker offered 38
cells (not 0, not 39), the mine stood on 32 (`use`, `place`), the board marked
cell 32 and its details read the rule text and "Placed by Rival". The next
pass threw 4: the move stopped on 32 and went back to 30 (`trigger_object`
`{stopped, pushed −2, to 30}`, `end` `triggered`); the feed: "Rival ran into
Mine (probe) on cell 32 — the move stopped there, thrown to cell 30 (placed by
player2)". The spring on 31, then a pass of 2: 30 → 34, the landing fired
(`extended` 2); the dashboard's track marked 31 before.

**Verification.** `pnpm verify` green — **335 files / 5163 tests**; coverage 86.26 % statements / 79.85 % branches / 82.69 % functions / 87.62 % lines (86.09 / 79.6 / 82.41 / 87.46 before).

**Files** (not committed): the engine (`lib/engine/types/iee.ts`,
`lib/engine/turn/index.ts`, `lib/engine/bots/items.ts`,
`lib/engine/feed/filters.ts`, `lib/engine/iee/dsl/{doc,runtime,vocabulary,compile,check,placement,text,text-kit,scenario-text,scenario-verdict}.ts`);
the modules (`iee/executor/{index,store}.ts`, `iee/sim/{memory-store,season,scenarios,sandbox}.ts`,
`iee/use/index.ts`, `iee/repository/instances.ts`, `iee/actions/inventory.ts`,
`iee/library/{draft,scenario-draft}.ts`, `game/service/{turn,use-item}.ts`, new
`game/service/objects.ts`, `bots/service.ts`, `catalog/repository/pool.ts`);
`lib/infrastructure/events/index.ts`; the UI (`components/board/board-view.tsx`,
`components/dashboard/InventoryPanel.tsx`, `components/feed/feed-timeline-view.tsx`,
`components/admin/constructor/{issue-text.ts,entry/{ops,UsageBlock,scenario-fields}.tsx}`,
`app/(public)/{board,seasons/[slug]/board,dashboard}/page.tsx`); dictionaries
(`{en,ru,uk}/{iee,ieeEditor,feed,core,board}.ts`); tests next to each, new
`executor/objects.test.ts` and `game/service/objects.test.ts`;
`docs/{IEE_CONSTRUCTOR_SPEC,IEE_CONSTRUCTOR_PLAN,DESIGN}.md`, this journal,
`docs/WORKLOG.md`.

**Next.** D.2: `onSameCell`, `takeEntry`, `usage.unique: "season"` and
«Корона» (spec §6.19).

---

## 2026-10-30 — Session 39 · The owner's decision at the wave C gate («Иммунитет»)

**Goal.** The wave C gate: the owner gave the go-ahead for wave D and left the
open question of session 38 — «Иммунитет», which never met a condition in a
season that plays only `core` — to the recommendation.

**Done.**

- **«Иммунитет» waits** (spec §6.17, §17.1): `triggers`, 1 — it holds until
  the first game that would get completion conditions, keeps them off, and is
  spent on it. Rule text: "Your games get no completion conditions. Works
  once."
- **The executor** (`spendImmunity`): an immunity that kept a game's
  conditions off spends a firing, as an answer to what arrives does (§6.13) —
  the oldest immunity that holds answers; one that waits (an effect of
  `triggers`, a passive or cursed item with charges) counts down (`tick`,
  `expire` at zero); one that lasts a span of rolls spends nothing, and a game
  that would get none spends nothing.
- **Power**: a firing of an immunity that waits is worth a condition kept off,
  0.6 cells (`PlayContext.waits`): «Иммунитет» 0.6, common. The pack-read
  model re-read at its fixed point: a bonus spin 1.43, a bonus effect 0.92.
- Three scenarios for «Иммунитет» (it is spent on a game that would get a
  condition; it waits through games that get none; once spent, the next
  conditions come through); the reference lists 273.

**Decided.** Of the two ways offered — a longer span, or an item that lifts
the conditions of the game in flight — a third: a span would still miss most
conditions, and an item would change the entry's kind. Waiting keeps the
Excel's "the next game gets no conditions" for the next game that would get
any, and always meets its target.

**Live** (`pnpm dev`, scratch Postgres, `run-1`). The boot imported the change
(1 entry updated, 1 revision added). The rival held «Иммунитет» and «Сложный
режим»; the next roll got no condition (`noop`, `immune`), «Иммунитет» was
spent on it (`tick` 1 → 0, `expire`), and the game card showed no conditions.

**Verification.** `pnpm verify` green — **333 files / 5090 tests**; coverage 86.09 % statements / 79.6 % branches / 82.41 % functions / 87.46 % lines (86.08 / 79.59 / 82.4 / 87.46 before). Delivered to the checkout as s54.

**Files** (not committed): changed `lib/modules/iee/executor/index.ts`,
`lib/engine/iee/dsl/{power,play-model,vocabulary}.ts`, `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts`; tests (`executor/conditions`,
`power`, `vocabulary`, `core-docs`, `sim/power-calibration`);
`docs/{IEE_CONSTRUCTOR_SPEC,ITEMS_EFFECTS_SCENARIOS}.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Wave D (plan §11): objects held by cells, `onSameCell` and
«Корона», and the wave's 4 entries.

---

## 2026-10-30 — Session 38 · Wave C, part 3 (the wave's entries in `core`) — the gate

**Goal.** Plan §10 task C.3: the 18 wave-C entries of the starter set (spec
§17.1) in `core` with their scenarios, the handouts their items need, the
calibration against the new pack; the wave's gate.

**Done.**

- **`core` holds 87 entries** (`seed/iee/core.ggpack`; the fixture
  regenerated). New items: `genre_veto` «Вето жанра», `favourite` «Любимчик»,
  `genre_pick` «Выбор жанра», `era_pick` «Выбор эпохи» (each asks its user
  for a genre, a game or a decade), `second_chance` «Второй шанс» and
  `three_doors` «Три двери» (a choice of two or three games), `game_reroll`
  «Переролл игры» and `postponed_game` «Отложенная игра» (on the game in
  flight). New effects: the six conditions — `hard_mode` «Сложный режим»,
  `no_guides` «Никаких гайдов», `clean_start` «Чистый старт», `no_dlc` «Без
  DLC», `main_story` «Основной сюжет», `greedy_explorer` «Жадный
  исследователь» — `immunity` «Иммунитет», and the pool's penalties
  `genre_trial` «Испытание жанром», `old_hardware` «Старое железо» and
  `uncharted_territory` «Незнакомая территория»; and six handouts the items
  hand out, each for the holder's next game: `vetoed_genre` «Жанр под вето»,
  `favoured_game` «Любимая игра», `chosen_genre` «Избранный жанр»,
  `chosen_era` «Избранная эпоха» (remembering the pick), `pick_of_two` «Выбор
  из двух» and `behind_doors` «За дверями». 63 new scenarios — every entry
  2–4, drawn from the scenario pool — all green at the first run; the scenario
  reference lists 272 (252 in the documents). Spec §17.1 lists the wave as
  shipped, §14 the re-read numbers.
- **Seventeen glyphs** for the new entries (`IEE_GLYPHS`, `IeeIcon`).
- **The play model re-read off the new pack** (spec §14), at a fixed point:
  held items (common 1.27, rare 2.09, epic 4), the strongest pick (rare 3.6),
  a spin (bonus 1.41, penalty −1), what arrives and how often (a harmful
  action 1.88 at 0.015 a roll, a move back 2.08 at 0.013, a bonus item 1.61 at
  0.074, a penalty effect 0.96 at 0.09), `shielded` 0.064 — and the
  conditions a game gets in a roll, 0.024 (`PLAY_MODEL.arrival.condition`, an
  assumption until now). A quarter of the penalty wheel is conditions worth
  0.6 each, so what it takes fell: a block of everything now nets less than a
  block of harm alone. The tests that restated the old numbers read the model
  now.
- **Calibration** (`power-calibration.test.ts`): the wave's eighteen are held
  to the model — the simulator plays no game pool, so they do nothing in play
  and are not measured, not even for their direction; a test holds that list
  to the next game's primitives, another the conditions' arrival to the pack,
  and the assumption block covers the choice, the reroll, the set-aside, the
  condition and the immunity. Every core entry sits at or below its rarity.

**Decided** — to keep going; the owner corrects at the gate:

1. The items that pick or offer a choice work through handouts, as «Магнит»
   does; each is used at any time — during a game it shapes the game after it.
2. «Старое железо»: "released before 2010" as "2009 or earlier", a parameter
   (`year`) a season may tune.
3. «Иммунитет» carries `game_condition`, so a season that switches conditions
   off switches it off too; the pool's penalties and the wave's items carry
   `game_pool`.
4. The provisional rarities stand: by strength every entry sits at or below
   them.
5. The conditions' texts: «Играть на нормальной сложности или выше», «Без
   прохождений, вики и подсказок — технические фиксы разрешены», «Начать с
   нового сохранения», «Без DLC и дополнений», «Засчитывается только основная
   кампания», «Пройти не меньше трёх побочных заданий или уровней».

**Found** (open for the owner, item 7): «Иммунитет» lasts the next game, as
the Excel says, but a condition comes with a penalty landing and acts on the
next game, as the immunity does from a bonus landing — in a season that plays
only `core` the two never meet, and its power reads 0.0.

**Live** (`pnpm dev`, scratch Postgres, `run-1`). The boot imported the new
pack into a database holding the old one: 24 entries added, 24 revisions.
With a game in flight, the rival used the core «Три двери» from the
dashboard: «За дверями» counted from the game after (`anchorRollSeq` 15); the
core «Сложный режим» was handed to the rival the same way by a scratch script.
The game passed; the next roll opened "Choose your game" with three games, and
the second, taken, became the roll (`game_choice` resolved, `pool` with the
three offered). «Сложный режим» gave it its condition (`grant`,
`roll_condition`), and the card read "Completion conditions · Play on Normal
difficulty or higher from «Hard Mode»". Passed, the condition ended with the
game (`expire`, `roll_ended`), and «Сложный режим» and «За дверями» with it.

**Verification.** `pnpm verify` green — **333 files / 5088 tests**; coverage 86.08 % statements / 79.59 % branches / 82.4 % functions / 87.46 % lines (86.06 / 79.55 / 82.4 / 87.43 before). The calibration runs the core entries the simulator can play, not the wave's eighteen, which it holds to the model. Delivered to the checkout as s53.

**Files** (not committed): changed `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts`, `lib/engine/iee/dsl/{glyphs,
play-model}.ts`, `components/iee/IeeIcon.tsx`; tests (`core-docs`,
`iee-catalog`, `iee-filter`, `play-model`, `power`, `vocabulary`,
`sim/power-calibration`, `game/service/use-item` — which now plays `core`'s
own «Вето жанра», «Любимчик», «Переролл игры» and «Отложенная игра» instead
of copies the new slugs shadowed — and `IeeStage`); `docs/{IEE_CONSTRUCTOR_SPEC,
IEE_CONSTRUCTOR_PLAN,ITEMS_EFFECTS_SCENARIOS}.md`, this journal,
`docs/WORKLOG.md`.

**Next.** The wave C gate: stop for the owner's go-ahead (and corrections).
Then wave D (plan §11): board objects and «Корона», and its 4 entries.

---

## 2026-10-26 — Session 37 · Wave C, part 2 (completion conditions)

**Goal.** Plan §10 task C.2: completion conditions held by the roll — the
trigger `onRollCreated`, `addCondition`, `conditionImmunity`, the
`roll_condition` instances, the season's switch for them (`disabledTags`) —
and where they show: the game card, the judge's completion request, the
game history.

**Done.**

- **The vocabulary**: the trigger `onRollCreated` — a game is assigned to the
  holder: a roll, a reroll, a game taken from a choice, a set-aside game come
  back — an effect's or a passive or cursed item's, run by the game service;
  `addCondition` (`text` in three languages, 1–200 characters each, Russian
  required) at it; `conditionImmunity` at `whileActive`. Rule text: "When you
  get a game, the game gets a completion condition: “Beat it on hard”." /
  "Your games get no completion conditions." Power: a condition takes 0.05 of
  the chance to pass (0.6 cells, `PLAY_MODEL.pool.condition`); immunity is
  worth the conditions a game would get — 0.03 a roll, an assumption until
  `core` holds the wave's conditions (`PLAY_MODEL.arrival.condition`).
- **The check** `condition_tag`: an entry that adds conditions carries the
  tag `game_condition`, the season's switch for them — publishing refuses it
  otherwise. The tag gates were there since stage 1: a season that disables
  it neither drops nor hands such entries out.
- **Held by the roll** (`addRollConditions`, `endRollConditions`, executor):
  every roll written — `startNextGame` for a roll, a reroll and a set-aside
  game come back, `takeGame` for a game taken from a choice — runs the
  holder's rules at `onRollCreated` (those taking part in that roll, as at
  `beforeGameRoll`); each condition is a `roll_condition` instance held by the
  roll — the adding entry's revision, whoever cast it, its text in `params` —
  journaled as a `grant` to the holder; under an immunity, a `noop`
  (`immune`). The game reported (the turn), rerolled or set aside
  (`endGameInFlight`) ends them (`expire`, `roll_ended`). A season none of
  whose entries gives conditions asks nothing and spends no query. The wheel's
  counters leave conditions out — they are no drops. Migration
  `0028_iee_roll_conditions`: an index on `iee_instances.holder_roll_id`.
- **Where they show** (`listRollConditions`, `RollConditions`): on the roll
  card under the game's chips, with a one-line hint; on each game of the
  history; in the judge's completion request — each condition in the reader's
  language (Russian where the entry has none) and "from «Entry»", the name of
  the revision that added it.
- **The constructor**: the trigger and both actions with their forms — the
  condition's text in three languages — and the scenario check "Conditions on
  the game".
- **The simulator**: the memory season gives every game it starts its
  conditions and ends them with it; a scenario step may check how many the
  holder's game holds (`conditions`); a game given in flight holds none.

**Decided** — to keep going; the owner corrects at the gate:

1. A condition's text lives in its instance's `params` — no new column.
2. An entry that adds conditions must carry `game_condition` (an error, not
   a warning), so the season's switch always reaches it.
3. A game taken from a choice gets its conditions as it is taken; while the
   choice waits there is no roll to hold them.

**Live** (`pnpm dev`, scratch Postgres, `run-1`; a pack `wavec37`: «Сложный
режим» — the next game gets "Beat it on hard difficulty" — and «Свобода»,
immunity for three rolls). «Сложный режим» put on the rival, a «Переролл
игры» under «Три двери» opened the choice; the game taken got the condition
on its roll (`grant`, `roll_condition`), and the card showed "Completion
conditions · Beat it on hard difficulty from «Hard Mode»". With completions
judged, the pass went to the moderation queue with the condition on the
request; approved, the condition ended with the game (`expire`,
`roll_ended`), «Сложный режим» with it, and the history kept the condition
on the passed game. With «Свобода» and «Сложный режим» together the next
roll got none (`noop`, `immune`).

**Verification.** `pnpm verify` green — **333 files / 4916 tests**; coverage 86.06 % statements / 79.55 % branches / 82.4 % functions / 87.43 % lines (85.95 / 79.43 / 82.24 / 87.34 before). The conditions' queries run against a database, which the unit suite does not have — they ran against the scratch one, above. Delivered to the checkout as s52.

**Files** (not committed): new `components/dashboard/RollConditions.tsx`,
`lib/modules/iee/executor/conditions.test.ts`,
`drizzle/0028_iee_roll_conditions.sql` (and its snapshot); changed
`db/schema/iee.ts`, `lib/engine/iee/dsl/{doc,runtime,vocabulary,compile,
check,text,text-kit,play-model,scenario-text,scenario-verdict}.ts`,
`lib/engine/iee/resolve/incoming.ts`, `lib/modules/iee/{executor/index,
executor/store,sim/memory-store,sim/season,sim/scenarios,repository/instances,
library/draft,library/scenario-draft}.ts`,
`lib/modules/game/service/{pick,decisions,resolve,use-item,turn}.ts`,
`app/(public)/dashboard/page.tsx`, `app/admin/moderation/page.tsx`,
`components/dashboard/{RollCard,GamesHistory}.tsx`,
`components/admin/constructor/entry/{ops,scenario-fields}.tsx`, the `iee` and
`ieeEditor` dictionaries; tests next to them;
`docs/{IEE_CONSTRUCTOR_SPEC,DESIGN}.md`, this journal, `docs/WORKLOG.md`.

**Next.** Session 38 (C.3): the wave's 18 entries in `core` with their
scenarios — and the handouts their items need — the calibration against the
new pack, and the wave's gate.

---

## 2026-10-24 — Session 36 · Wave C, part 1b (a choice of games, a game rerolled or set aside)

**Goal.** Plan §10 task C.1, second half: the choice of N games (`chooseOfN`,
the `game_choice` decision and its panel), «Переролл игры» and «Отложенная
игра» on an open roll (`rerollGame`, `postponeGame`,
`postponed_until_seq`), the dashboard's pickers for a use's pick, bots that
pick and choose, and a game pool in the simulator so the wave's entries get
scenarios.

**Done.**

- **The vocabulary**: `chooseOfN` (`n` 2–5) at `beforeGameRoll` — the draw
  offers that many games and the holder takes one (of several, the largest
  counts); `rerollGame` and `postponeGame` (`afterRolls` 2–4, default 2) at
  `onUse` of an item whose window is the open roll (`on_open_roll`; the check
  `open_roll_only` elsewhere). Rule text in three languages ("the draw offers 3
  games and you take one"; "your game in progress is set aside and comes back
  as your game 2 rolls later; a new game is picked now"). Power: a choice of
  2/3/4/5 is worth 1.19/1.79/2.14/2.38 cells (`PLAY_MODEL.pool.choice` ×
  `gameSwing`), a reroll 2.38, a set-aside 1.79.
- **A choice of games** (`pickNextGame`): a shape that asks for a choice draws
  that many different games — favour-weighted, of those the holder's rules
  leave (fewer when fewer are left, none with one) — and opens a `game_choice`
  decision instead of creating a roll. It has no default: it waits for the
  player, who can neither roll nor use items meanwhile (`ieeDecisionPending`).
  Taking one creates the roll in the same transaction as the answer
  (`settleGameChoice`); a game it did not offer is refused.
- **A game rerolled or set aside by an item** (`use-item.ts`): the item path
  picks the next game before anything is spent — nothing left refuses the use
  with `catalogAllPlayed` and the charge stays — then ends the roll in flight
  as rerolled (a set-aside one keeps `postponed_until_seq`: the roll counter it
  comes back at) and starts the next game at once, which may itself open a
  choice. A set-aside game that is due is the player's next game as it is: its
  own roll reopened — no draw, no rules, no choice; one blacklisted or gone
  from the catalog is dropped. Migration `0027_iee_game_choice` (the decision
  kind, the column).
- **Feed**: `game_rolled` says a game taken from a choice (of how many) or a
  set-aside game come back; `game_rerolled` names the item; the new
  `game_postponed` («set aside … — it comes back on roll 13; next: …») sits
  under the rolls tab.
- **Dashboard**: the choice panel (`GameChoicePanel`: cover, platform, year,
  rating, genres, and whether an item rerolled or set the game aside); the roll
  card points at it and offers no roll while it waits; the inventory's pick
  step for an item that asks for a genre (the pool's genres), a decade (the
  pool's decades) or a game (a search by title).
- **Bots**: a season's bots take a waiting choice at random, pick for an item
  that asks (at random, from what the pool offers them) and weigh a game
  rerolled or set aside as a small gain.
- **The constructor**: forms for `chooseOfN` and `postponeGame`; the scenario
  editor's new step "Pick the next game" (whose, the game a choice takes), the
  games given (in flight, passed), a use's pick and the game it takes, and the
  checks "Holder's game" and "Games offered".
- **The simulator**: a game pool in the memory season — draws, choices taken
  or waiting, rerolls, set-asides coming back, passes counted — as the game
  service does them. Scenarios draw from the fixed scenario pool of eight games
  (§5.5) with the step `draw`; the sandbox from 64 games (that pool eight times
  over), its bots drawing before their in-flight step, taking a choice at
  random and picking for an item that asks; the games drawn are a fourth
  stream of the seed, so an existing run plays as before.

**Fixed on the way.** A scenario's play key left out the last roll given
(wave A): two scenarios differing only in it shared a key, so the editor
could show one's last run for the other. Taking "drawn" or "choosing" for a
step's result now drops a stale refusal reason, as "used" did.

**Decided** — to keep going; the owner corrects at the gate:

1. A set-aside game comes back by reopening its own roll: the game's reroll
   count stays right, and nothing is drawn for it.
2. `afterRolls` is 2–4: "2 rolls later" counts the game picked now as the
   first, so the set-aside game is the one after it; 1 would be a plain
   reroll.
3. A choice has no default and no timeout: it waits for the player; a bot
   takes one at random.
4. An item that would replace the game with nothing left to pick is refused
   before its charge is spent.

**Live** (`pnpm dev`, scratch Postgres, `run-1`; a pack `wavec36` imported:
«Три двери» as an effect, «Переролл игры», «Отложенная игра» and a scroll
handing out «Три двери»). The rival, with a game in flight: «Переролл игры» —
the game replaced at once by one the favour of session 35 still weighed ×5,
journaled `use` then `pool`, the feed saying "rerolled the game with Game
Reroll → …". «Отложенная игра» — the game set aside
(`postponed_until_seq = 12`), a new one drawn; the feed: "set aside … — it
comes back on roll 13; next: …". That game passed, the next roll brought the
set-aside game back on its own roll — no `pool` rows — and the feed said so.
The scroll used with a game in flight, the game passed, the roll opened "Choose
your game" with three games and the inventory saying to choose first; the
second taken became the roll (`game_choice` resolved, `pool` with the three
offered, "took a game … of 3 offered"). With «Три двери» still in force,
another «Переролл игры» opened the choice from the item ("«Game Reroll»
rerolled your game — these came up instead"). One polish from it: the roll
card no longer says "hit Roll" while a choice waits.

**Verification.** `pnpm verify` green — **332 files / 4880 tests**; coverage 85.95 % statements / 79.43 % branches / 82.24 % functions / 87.34 % lines (85.78 / 79.16 / 82.07 / 87.2 before). The pool's choice and the set-aside queries run against a database, which the unit suite does not have — they ran against the scratch one, above. Delivered to the checkout as s51.

**Files** (not committed): new `components/dashboard/GameChoicePanel.tsx`,
`lib/engine/iee/dsl/scenario-games.ts`, `drizzle/0027_iee_game_choice.sql`
(and its snapshot); changed `db/schema/{enums,games}.ts`,
`lib/engine/types/iee.ts`, `lib/engine/iee/dsl/{vocabulary,placement,check,
doc,index,scenario-text,scenario-verdict}.ts`,
`lib/engine/iee/resolve/{pool,decisions}.ts`, `lib/engine/bots/items.ts`,
`lib/engine/feed/filters.ts`, `lib/modules/catalog/repository/{pool,rolls}.ts`,
`lib/modules/game/service/{pick,roll,resolve,decisions,use-item}.ts`,
`lib/modules/iee/{executor/index,actions/inventory,library/draft,
library/scenario-draft,sim/season,sim/scenarios,sim/sandbox}.ts`,
`lib/modules/player/actions/game.ts`, `lib/modules/bots/service.ts`,
`lib/infrastructure/events/index.ts`, `lib/api/realtime.ts`,
`lib/realtime/protocol.ts`, `app/(public)/dashboard/page.tsx`,
`components/dashboard/{RollCard,InventoryPanel}.tsx`,
`components/feed/feed-timeline-view.tsx`,
`components/admin/constructor/entry/{ops,scenario-fields,SandboxBlock}.tsx`,
the `core`, `feed`, `iee` and `ieeEditor` dictionaries; tests next to them;
`docs/{IEE_CONSTRUCTOR_SPEC,DESIGN,API}.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 37 (C.2): completion conditions held by the roll —
`onRollCreated`, `addCondition`, `conditionImmunity`, the `roll_condition`
instances and `disabledTags` (spec §6.17).

---

## 2026-10-22 — Session 35 · Wave C, part 1a (the pool rules)

**Goal.** Plan §10 task C.1, first half: the spec of the whole wave (§6.16,
§6.17, §7.12), then the pool rules — `beforeGameRoll`, `poolExclude`,
`poolRequire`, `poolFavor` — the user's pick on use remembered by what the use
hands them, and the pick of a game honouring the holder's rules and setting
them aside when nothing is left. Session 36 is the second half: the choice of
N, «Переролл игры» and «Отложенная игра», the dashboard's pickers, bots and a
game pool in the simulator.

**Done.**

- **The spec of wave C** (§6.16 the next game, §6.17 completion conditions,
  §7.12 the pick of a game step by step; §4 `iee_instances.chosen`,
  `game_rolls.postponed_until_seq`, the decision kind `game_choice`; §9.2 the
  journal op `pool`; §14 the costs) and the plan's C.1 row split in two.
- **The vocabulary** (`vocabulary.ts`): the trigger `beforeGameRoll` — an
  effect's or a passive or cursed item's, held, run by the game service rather
  than the turn; the actions `poolExclude` and `poolRequire` over genres (a
  list, or the holder's own sets: `"picked"`, `"lastPassed"`, `"passed"`), a
  span of release years (`"picked"`, or bounds — a literal or a parameter) and
  a rating, and `poolFavor` (×2–5 for the game the use picked). A set that
  reads nothing — no pick of its kind, no game passed yet — makes its rule say
  nothing at all. Rule text in three languages ("When a game is picked for
  you, games of the genre you picked cannot come up."); `usage.pick` reads
  ", picking a genre" after the window.
- **The pick on use**: `usage.pick` (`genre`, `years`, `game`) on an active
  item used on its user; the compiled use refuses one without a pick of its
  kind (`ieePickRequired`), the item path asks the season's pool whether it
  offers it (`ieePickInvalid` — a genre of its games, a decade it has games
  from, a game it could hand the user, with its title), and a grant to the user
  carries the pick (`chosen`) into the new effect — the column
  `iee_instances.chosen` (migration 0026). A renewal that picked again keeps
  the new pick.
- **Checks**: `pick_target` (a pick is made by the item's user, from the
  inventory), `pick_unused` (the use must hand its user an effect that
  remembers the pick), `pick_place` (`"picked"` and `poolFavor` stand in an
  effect's rules only — a held item never had a pick; the editor offers
  `poolFavor` in effects only), `year_range` (a year parameter bounded to
  1970–2100), `usage_field` for a pick on a passive or cursed item.
- **The pick of a game** (`pickNextGame`, `lib/modules/game/service/pick.ts`):
  every roll and instant or approved reroll asks the holder's effects and held
  items at `beforeGameRoll` (`poolSources` — oldest first, and only those
  taking part in the roll being picked: a status granted while the game it
  would replace was in flight sits a reroll of it out), resolves their sets
  (`poolShapeOf`, `lib/engine/iee/resolve/pool.ts`, with the holder's passed
  games), and hands the shape to `pickGameForRoll`. The season's pool is built
  once (`poolScope`); the holder's exclusions and requirements narrow it in SQL
  (`matchSql` — the same semantics as the engine's `gameMatches`), and when
  nothing is left they are set aside (`relaxed`) and the draw goes on; a
  favoured game the first candidates do not reach joins them, and weighs its
  factor in the draw (`drawWeighted`). Each rule that spoke is journaled as
  `pool` with the roll it went to, in the roll's transaction.
- **Power**: a pass instead of a drop is worth 11.9 cells
  (`PLAY_MODEL.gameSwing`); each primitive moves the chance to pass by an
  assumption (`PLAY_MODEL.pool`) — a picked genre required 1.2, a picked span
  0.8, a picked genre excluded 0.4, a picked game favoured ×3 0.2; genres the
  holder did not pick 0.5, a span 0.6, a rating 0.4 against them.
- **The constructor**: the trigger and the three actions with their forms —
  genre sets as chips, genres listed by name from the games catalog (a
  datalist), a span of years with numbers or a parameter, a rating — and the
  pick in the usage block.

**Decided** — to keep going; the owner corrects at the gate:

1. A rule naming several of genres, years and a rating names the games that
   match all of them; a game favoured by two rules weighs the larger factor.
2. Genres match in any case; a pick and a listed genre are kept lowercase.
3. A pick of years is a decade (1990–1999); a pick of a game is any game the
   season's pool could hand the user now.
4. The spec's `pick_missing` clause was dropped: an effect cannot know what its
   item will pick — it reads nothing without a pick of its kind.

**Live** (`pnpm dev`, scratch Postgres, `run-1`; a pack `wavec` imported with
three scrolls that ask for a genre, a decade and a game, the effects they hand
out, a «Испытание жанром»-like effect and a passive charm requiring a rating
of 4.5; the catalog given genres, years and ratings). The rival's «Свиток
вето» used from the dashboard: with no pick — "Pick what this item asks for
your next game"; with "jazz" — refused, the pool has none; with "Puzzle" —
used, the effect remembering `{ genre: "puzzle" }` and counting from the game
after the one in flight. Passing that game and rolling drew Hollow Knight
(platformer), journaled as `pool` (puzzle excluded, not relaxed); the veto
ended with that game. The charm required a rating nobody has: the next roll
was journaled `relaxed` and drawn anyway. «Свиток любимчика» picked «Live Check
Game 3» (its title remembered); an instant reroll of the game in flight was
shaped by the charm alone — the favour sat it out — and the roll after it by
both. Against the database, 120 draws a shape: no puzzle with puzzle excluded,
only 1995 with the 1990s required, only rating 3.5 with action excluded and
3.5 required, every draw relaxed with 4.5 required, a game favoured ×5 drawn
21 % of the time against 5 % plain. The constructor showed the forms, and the
rule text followed them.

**Verification.** `pnpm verify` green — **331 files / 4789 tests**; coverage 85.78 % statements / 79.16 % branches / 82.07 % functions / 87.2 % lines (85.85 / 78.96 / 82.14 / 87.2 before: the pool's queries run against a database, which the unit suite does not have — they were run against the scratch one, above). The pool's SQL is pinned where it runs by the catalog's syntax-tree guards, restated over the pool's one scope. Delivered to the checkout as s50.

**Files** (not committed): new `lib/engine/iee/resolve/pool.ts`,
`lib/modules/game/service/pick.ts`, `drizzle/0026_iee_instance_chosen.sql`
(and its snapshot); changed `db/schema/iee.ts`, `lib/engine/types/iee.ts`,
`lib/engine/iee/dsl/{doc,runtime,vocabulary,compile,check,placement,text,
tuning,play-model}.ts`, `lib/modules/catalog/repository/{pool,rolls}.ts`,
`lib/modules/game/service/{roll,resolve,use-item}.ts`,
`lib/modules/iee/{executor/index,executor/store,sim/memory-store,use/index,
actions/inventory,library/draft,library/screens}.ts`,
`components/admin/constructor/{EntryEditor,entry/UsageBlock,entry/ops,
entry/editor-context}.tsx`, the `core` and `ieeEditor` dictionaries; tests
next to them; `docs/{IEE_CONSTRUCTOR_SPEC,IEE_CONSTRUCTOR_PLAN}.md`, this
journal, `docs/WORKLOG.md`.

**Next.** Session 36 (C.1b): the choice of N (`chooseOfN`, the `game_choice`
decision and its panel), «Переролл игры» and «Отложенная игра» on an open roll
(`rerollGame`, `postponeGame`, `postponed_until_seq`), the dashboard's pickers
for a use's pick, bots that pick, and a game pool in the simulator so the
wave's entries get scenarios.

---

## 2026-10-21 — Session 34 · Wave B, part 4 (the wave's entries in `core`) — the gate

**Goal.** Plan §9 task B.4: the 22 wave-B entries of the starter set (spec
§17.1) in `core` with their scenarios, rarities by measured strength and
uniqueness; the wave's gate.

**Done.**

- **`core` holds 63 entries** (`seed/iee/core.ggpack`; the fixture
  regenerated). New items: the reaction items `speed_elixir` «Эликсир
  скорости», `lucky_coin` «Счастливая монета», `golden_coin` «Золотая монета»;
  the protections `shield` «Щит», `mirror_shield` «Зеркальный щит», `phoenix`
  «Феникс» (passive, one charge each); `trade_scroll`, `copy_scroll`,
  `joker`, `philosophers_stone`, `thief_glove`, `treasure_map`. New effects:
  `invisibility`, `chain`, `mark` (until the holder's next roll), `tax`,
  `pickpocket` (instant), `curse_of_greed`, `curse` (until the end of the next
  game), `overload` (its cap waits for a passed game), `curse_echo` (once),
  `one_chance` (the next game), and the handout `treasure_hunt` «Поиск
  сокровищ» that «Карта сокровищ» hands out. 68 new scenarios — every entry
  1–5, all green at the first run; the scenario reference lists 209 (189 in
  the documents). Spec §17.1 lists the wave as shipped.
- **Eleven glyphs** for the new entries (`IEE_GLYPHS`, `IeeIcon`).
- **The play model re-read off the new pack** (spec §14): what a held item of
  each rarity is worth and how often it drops (common 1.45, rare 2.35, epic
  4.1), the strongest pick (rare 3.7 — «Зеркальный щит»), a spin (bonus 1.55,
  penalty −1.2), and what arrives and how often (a harmful action 1.9 at
  0.018 a roll, a move back 2.1 at 0.018, a bonus item 1.8 at 0.072, a penalty
  effect 1.2 at 0.086) — iterated to a fixed point, since the powers read the
  model back. `shielded`, an assumption until now, is read off the pack too:
  the share of the bonus items held that block or turn one back, 0.08.
- **Calibration** (`power-calibration.test.ts`): the reaction items, the
  choices («Налог», «Перегруз»), «Эхо проклятия» and «Один шанс» are measured
  in play and agree; the entries whose worth lies in what players hold and aim
  at each other — items changing hands or picked from the catalog,
  protections, standing states, limits, the bonus wheel spun again — are held
  to the pack, listed, and checked in play for their direction only (the
  simulator's rivals use nothing a run hands out). A test holds the list to
  those primitives. Every core entry sits at or below its rarity.
- **Bots**: a pick of some rarities takes only an item of those rarities
  («Философский камень» passes a rare one over).

**Decided** — to keep going; the owner corrects at the gate:

1. The provisional rarities stand: by strength every entry is at or below
   them; the rarer ones mark what is special.
2. «Эликсир скорости» acts on passed games only (one more on a drop is a
   longer move back): the window does not offer it on a drop.
3. «Карта сокровищ» works through a handout, as «Магнит» does; «Перегруз»'s cap
   waits for a passed game; «Невидимость», «Цепь» and «Метка» last until the
   holder's next roll; «Эхо проклятия» answers once.
4. The protections are passive items with one charge; «Щит» and «Зеркальный
   щит» are ordinary protection, which «Метка» pierces.

**Live** (`pnpm dev`, scratch Postgres, the season `run-1`). The boot
imported the new pack into a database holding the old one: 23 entries added,
23 revisions. «Золотая монета» from `core`, attached switched off and handed
to the rival by a scratch script: reporting a passed game opened the window —
the throw (4), the move as it stands (19 → 23), the coin with "Use"; the
coin's second throw was a 1 and the 4 stood, and the feed said «Rival used
Golden Coin on the dice: 4, thrown again 1 — 4 stands». «Налог» came as the
reward of a challenge a judge approved on moderation ("Approving grants:
Tax"): the rival, holding «Сапоги скорости» and «Свиток порчи», got the
question on the dashboard; left unanswered, rolling the next game took the
default — the newest common item, «Свиток порчи», discarded
(`decision_default`), the boots kept. Every page smoked answered 200.

**Verification.** `pnpm verify` green — **327 files / 4715 tests**; coverage
85.85 % statements / 78.96 % branches / 82.14 % functions / 87.2 % lines (up
from 85.83 / 78.86 / 82.1 / 87.16). The calibration measures the entries held
to the pack one by one: measured all together, the direction check ran past
its minute under the full suite's load. Delivered to the checkout as s49.

**Files** (not committed): changed `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts`, `lib/engine/iee/dsl/{glyphs,
play-model}.ts`, `components/iee/IeeIcon.tsx`, `lib/engine/bots/items.ts`,
`lib/modules/bots/service.ts`, `lib/modules/iee/sim/sandbox.ts`; tests next to
them (`core-docs`, `iee-catalog`, `iee-filter`, `play-model`, `power`,
`vocabulary`, `bots/items`, `library/transfer`, `sim/power-calibration`,
`IeeStage`); `docs/{IEE_CONSTRUCTOR_SPEC,IEE_CONSTRUCTOR_PLAN,
ITEMS_EFFECTS_SCENARIOS}.md`, this journal, `docs/WORKLOG.md`.

**Next.** The wave B gate: stop for the owner's go-ahead (and corrections).
Then wave C (plan §10): the game pool and the completion conditions, and its
18 entries.

---

## 2026-10-21 — Session 33 · Wave B, part 3b (the reaction window)

**Goal.** Plan §9 task B.3, second half: reaction items and the reaction
window after the dice — the two-phase turn, the answer, the guards, the
approval mode, the bots, the simulations, the dashboard, the judge's
acceptance, the editor and the feed. Session 34 is task B.4 (the 22 entries)
and the wave's gate. Inside the wave: no gate.

**Done.**

- **Spec first**: §4.3 (the window's context), §5.5 (the roll step's `react`,
  the expectation `window`, the refusals `ieeItemReactionOnly` and
  `ieeTargetReacting`), §6.1, §6.3, new §6.15 (reaction items), §7.2 step 4,
  §7.4 rewritten (when it opens, the pause, two transactions, no timeout,
  approval mode, out of reach, journal and feed), §9.3 (`item_used` with
  `reaction`), §14 (checks, power, the executor's contract).
- **A reaction item** is an active item with `usage.window: "after_dice"`. Its
  `onUse` rules are read after the dice, as `afterDice` reads them, and hold
  reaction actions only: the new `reroll` (throw again, the new throw stands;
  allowed nowhere else), `bestOfTwo`, `rerollOn` and `resultModify`. Checks:
  `reaction_target` (it aims at its holder), `reaction_action`,
  `reaction_only`, `reaction_throws` (one throw-again action an item). It is
  never used from the inventory (`ieeItemReactionOnly`).
- **The engine**: `playTurn` takes a `react` callback at step 4
  (`lib/engine/turn/reaction.ts`): what a reaction does to the throw
  (`applyReaction`, `withReaction`), when it changes anything
  (`reactionActs`), what it is expected to gain (`reactionGain`, a bad throw
  being a move worse than an average one) and which one a bot takes
  (`chooseReaction`). A throw again is a new throw: the statuses' face
  rerolls act on it; a best- or worst-of-two of step 3 is not repeated.
- **The two-phase turn** (`lib/modules/game/service/turn.ts`): reporting a
  game plays the turn while recording every server draw; if the throw offers
  a reaction item, an `iee_decisions` row `reaction_window` stores the turn
  (the report, the throw shown, the move projected, the draws, the items
  offered) and nothing else is written. The answer
  (`answerReactionWindow`, through `answerDecision` / `judgeDecision`) plays
  the turn again on those draws — *Accept* replays them all, *Use* replays the
  throw and draws afresh after the item — and writes it in one transaction
  with the charge, the decision and the feed's `item_used` line (`reaction`:
  the faces before and after). With judge-approved completions the window
  opens at the approval.
- **Guards**: a second report or a reroll of the roll waits
  (`gameReactionPending`); rivals' items aimed at the player are refused
  (`ieeTargetReacting`); the player's own other items wait
  (`ieeDecisionPending`); only the player uses an item, a judge may only
  accept; a pick no longer offered is refused. The window does not open while
  the player is kept from items or a victim choice of theirs waits.
- **Bots** answer at once (`chooseReaction`): on a bad throw the item expected
  to gain the most, otherwise accept — live, in the sandbox and in the
  measurements. Scenarios: a roll step `react` (the entry used in the window)
  and the check `window` (none, accepted, used); the editor builds both.
- **The dashboard** shows the window above the game card (`ReactionPanel`:
  the throw, the move as it stands, the items offered with "Use", and
  "Accept"); the game card says the turn waits and holds its buttons; the
  inventory marks a reaction item «used after the dice» with no "Use".
  **Judges** accept on moderation's «Решения» tab. The feed says what the item
  did to the dice.
- **Power**: what one use gains its holder at the first bad throw it
  improves, a drop's gain with the streak multiplier: on a new season's dice a
  throw again is worth 2 cells, the better of two 2.2, +1 to the result 1,
  rerolling a 1 2.5 — checked against a 1500-seed measurement
  (`power-calibration.test.ts`).

**Decided** — to keep going; the owner corrects at the gate:

1. The window offers an item only when it would change the throw; at most one
   reaction item a turn.
2. A throw again is a new throw (the statuses' face rerolls act on it).
3. No timeout: the turn waits for the player; a judge may accept for them,
   never use an item.
4. *Accept* moves the token exactly as shown; after *Use* what follows the
   dice (the wheel included) is drawn afresh.
5. Bots use an item on a bad throw only — a pass below an average throw, a
   drop above one — and take the one expected to gain the most.

**Live** (`pnpm dev` on scratch Postgres; a test pack with two reaction
items — a lucky coin that throws again and a golden coin that keeps the
better of two — attached to the season switched off and handed out by a
scratch script). Reporting a passed game opened the window above the
inventory: the throw (4), the move as it stands (32 → 36), both coins with
"Use", and "Accept the dice"; the game card held its buttons and said the
turn waits; the inventory marked both coins as used right after the dice,
with no "Use". The golden coin's second throw came out no better and the 4
stood (32 → 36), journaled `decision_open`, `decision_resolve` (`react`) and
`use`. Accepting the next throw moved the token exactly as shown (36 → 39,
the finish). On the rival's turn a judge accepted from moderation's
«Решения» (the window listed under the reactions waiting, counted in the
menu, no "Use"), and «Тяжёлые ботинки» took their 2 off the replayed throw
(13 → 15). The lucky coin threw a 5 again into a 4 and the 4 stood
(15 → 19); the feed said «Rival used Lucky Coin (check) on the dice: 5 → 4».
**Found on the way**: the feed showed the golden coin's use as «4 → 4», as if
nothing had happened, and would show «+1 to the result» the same way — the
line now tells a second throw that lost («4, thrown again 2 — 4 stands») and
a change to the result as the result («on the dice result: 2 → 3»); the
`reaction` payload carries `thrown` and `result` (spec §7.4, §9.3). Every
public, player and admin page answered 200 (the dev server ran out of memory
twice during the smoke and was restarted).

**Verification.** `pnpm verify` green — **327 files / 4552 tests**; coverage
85.83 % statements / 78.86 % branches / 82.1 % functions / 87.16 % lines (up
from 85.55 / 78.54 / 81.78 / 86.9). Delivered to the checkout as s48.

**Files.** New: `lib/engine/turn/reaction.ts` (+ test),
`lib/modules/iee/turn/reaction.ts`, `components/dashboard/ReactionPanel.tsx`
(+ test). Changed: 76 files — the spec, the journal, the
movement pipeline, `playTurn`, the DSL (`vocabulary`, `runtime`,
`play-model`, `placement`, `check`, `compile`, `power`, `doc`, scenario text
and verdict), the use checks, the executor, the game services (turn, resolve,
decisions, use), bots, the sim season, scenarios, sandbox and measurements,
the decisions reads, the scenario draft and the entry draft, the dashboard and
moderation pages, the game card, the inventory, the feed, the editor's
scenario fields, the dictionaries and their tests.

---

## 2026-10-21 — Session 32 · Wave B, part 3a (the victim's choice)

**Goal.** Plan §9 task B.3, split in two: this session the decisions'
infrastructure and the victim's choice with its default, the judge's
resolution, the dashboard panel, the realtime event and the bots' policy;
session 33 the reaction window after the dice (the two-phase turn); session
34 task B.4 (the 22 entries) and the wave's gate. Inside the wave: no gate.

**Paused and resumed.** On 2026-10-20 the owner asked to record the progress
and stop: the code went to the checkout unfinished (s46) with this entry
marked paused. On 2026-10-21 the owner said to go on; the tests, the gate and
the live check below closed the session.

**Done.**

- **Spec first**: §4.3 (the table `iee_decisions`), §5.5 (the scenario step
  `decide`, the expectation `decision`, the refusal `ieeDecisionPending`),
  new §6.14 (`victimChoice`, `holdLimit`, when a question is asked, the check
  `or_keep_instant`, power), §7.6 rewritten (question, answer, default, one at
  a time, what it does, journal, feed, dashboard, bots), §9.1, §9.3
  (`decision_made`), §14.
- **Two actions.** `victimChoice {count 1–3, orKeep}` — the holder discards
  `count` bonus items of their choice, or, with `orKeep`, may discard them to
  be rid of the effect that asks (`or_keep_instant`: not in an instant
  effect). `holdLimit {max 1–3}` at `whileActive` — the holder keeps at most
  `max` bonus items; the strictest limit wins (`holdLimitBy`), and each time
  more arrive the holder chooses what to keep (`retain`).
- **The question is asked only when there is a choice**: without a way out
  and with `count` bonus items or fewer, they go at once; with a way out and
  fewer than `count`, nothing is asked and the holder endures. Bonus items
  only — passive ones count, cursed ones never.
- **The table** `iee_decisions` (migration `0025_iee_decisions`): one pending
  question per player and kind (a partial unique index), settled with how it
  was chosen. The pure part — options, defaults, checking an answer — is
  `lib/engine/iee/resolve/decisions.ts`; the executor opens, settles and
  defaults (`openVictimChoice`, `resolveDecision`, `applyPendingDefaults`,
  `enforceHoldLimit`), journals `decision_open`, `decision_resolve`,
  `decision_default` and an `end` row per item lost, and writes the feed line
  `decision_made` (chosen, judged, defaulted, forced).
- **The default** — the commonest, newest first, is discarded; with a way out
  the holder endures; a limit keeps the rarest, newest — applies when the
  player rolls the next game (`settleDecisionsBeforeRoll`), when a new
  question supersedes it, when the player presses "Default", or when a judge
  applies it. An answer is checked against what the player holds now; a way
  out whose effect is gone means enduring.
- **While a question is open** the player uses no items
  (`ieeDecisionPending`), in the game and in the sandbox.
- **Services**: `answerDecision`, `answerWithDefault`, `judgeDecision`
  (staff; `logAdminAction` `iee_decision_judged`) in
  `lib/modules/game/service/decisions.ts`, with the actions in
  `lib/modules/iee/actions/decisions.ts`; the reads and
  `announceDecisions` in `lib/modules/iee/decisions`.
- **The dashboard** shows the question above the inventory (`DecisionPanel`:
  pick the items, "Discard" / "Keep" / "Endure", the default named), greys the
  inventory's uses out while it is open, and refreshes on the realtime event
  `decisions:update` (`lib/api/realtime.ts`, `docs/API.md` regenerated). A
  notification `decision_opened` tells the player. **Judges** answer for a
  player on the moderation screen's new tab «Решения» (counted in the admin
  menu's badge). **Bots** take the default, live and in the sandbox.
- **Scenarios**: a step `decide` (the option and the items, or the default)
  and the check `decision` (pending or none); the editor builds both, and the
  two actions with their fields.
- **Power**: a discard is worth `count` × 1.5 (a common bonus item held),
  nothing with a way out; a limit is worth the bonus items held above it,
  plus what arrives in a roll, × 1.93.

**Decided** — to keep going; the owner corrects at the gate:

1. Ask only when there is a choice; otherwise act at once.
2. Only bonus items are asked for; cursed items never.
3. The defaults: the commonest item goes, the rarest stays, a way out means
   enduring; they apply at the next game's roll.
4. One question at a time: a new one settles the old one by its default.
5. An open question blocks the player's items until it is answered.
6. Bots never think about it: they take the default.

**Live** (`pnpm dev` on scratch Postgres, a test pack with a «Налог» of one
item attached to the season, handed out by a scratch script): the dashboard
showed the question above the inventory — the rule text, both bonus items
with their rarities, the default named — with the inventory's uses greyed
out and the notification bell lit; discarding «Curse» left «Boots of Speed»
and the feed said «TestPlayer: Tax (check) — discarded: Curse». A second
question showed on moderation's «Решения» tab (counted in the menu) and a
judge's "Apply the default" discarded the newest common item, audited as
`iee_decision_judged`. A third, left unanswered, took its default when the
player rolled their next game (`decision_default`, `why: next_game`). Every
public, player and admin page answered 200 (the dev server ran out of memory
once mid-smoke and was restarted).

**Verification.** `pnpm verify` green — **325 files / 4474 tests**; coverage
85.55 % statements / 78.54 % branches / 81.78 % functions / 86.9 % lines (up
from 85.4 / 78.3 / 81.5 / 86.8). Delivered to the checkout as s46 (paused
state) and s47.

**Files.** New: `lib/engine/iee/resolve/decisions.ts` (+ test),
`lib/modules/iee/executor/decisions.test.ts`,
`lib/modules/iee/decisions/index.ts`,
`lib/modules/game/service/decisions.ts` (+ test),
`lib/modules/iee/decisions/index.test.ts`,
`lib/modules/iee/actions/decisions.ts`,
`components/dashboard/DecisionPanel.tsx` (+ test),
`components/realtime/decisions-live.tsx`,
`drizzle/0025_iee_decisions.sql`, `drizzle/meta/0025_snapshot.json`.
Changed: 90 files — the journal, the DSL (`vocabulary`, `check`, `compile`, `runtime`,
`doc`, `play-model`, scenario text and verdict), `resolve/incoming.ts`, the
executor and its store, the use check, the sim season, scenarios and
sandbox, the game services (roll and its test, turn, use, events), bots, schema, realtime
protocol, notifications, feed, the dashboard and moderation pages, the admin
layout, the editor's forms, the dictionaries, `docs/API.md` and the spec.

---

## 2026-10-19 — Session 31 · Wave B, part 2 (what arrives, and protection)

**Goal.** Plan §9 task B.2: `onIncoming` for everything received, harm on
actions, tier against pierce, block, reflect, amplify and replace, chains of at
most two, «Невидимость» and «Цепь» (spec §6.13, §7.8). Inside the wave: no
gate.

**Done.**

- **Spec §6.13 first.** Two moments: `onIncoming` — something is about to
  reach the holder — and `whileActive` — not a moment: what holds for as long
  as the effect lasts or the item is held. A condition `incoming` (`harm`; an
  `entry` of a kind and character; a `moveBack`), four answers (`block`,
  `reflect`, `amplify` ×2 or ×3, `replace` by 0–6 cells forward) and three
  standing states (`untargetable`, `forbidItems`, `pierce` 1 or 2).
  `protection.tier` is accepted: 1 unless an entry says 2. Spec §5.1, §5.5,
  §6.1–6.3, §7.8, §9.3 and §14 follow.
- **Harm is marked where it is decided**: the compiler sets `harmTo` on what an
  aimed use's harmful actions do to the chosen player (D9); everything one use
  aims at one player arrives together and is answered once.
- **The executor** puts every arrival to its holder's entries: a rival's
  harmful use (`runIntents`), an entry that reaches a player through the game
  — a drop, a rule's grant (their own too), a copy, a pick (`grant` with
  `arrival`) — an item handed over (`moveItems`, `swapItems`) and a move back
  (`movePlayer`). What staff and rewards hand out is not answered; the rules
  of what they hand out act through the game, and what those do is. The
  oldest instance's first rule whose conditions hold and whose answer applies
  answers: a block (a harmful action only while the tier is above the pierce
  the holder's standing rules add up), a reflection (turned back on the
  sender — a swap is blocked instead — never turned back again, and the
  sender's own protection may still block it), an amplification (an instant
  effect acts again, a lasting one lasts longer, an item comes as copies, a
  move goes further), a replacement (a move forward instead). An answer is
  journaled (`block`, `reflect`, `amplify`, `replace`, with the tier and
  pierce compared), spends a held item's charge or an effect's `triggers`
  count, and shows in the feed — `intercepted` on the line of the player whose
  entry answered, public for a rival's use. Chains stop after two answers.
- **The use checks**: a user kept from their items (`ieeItemsForbidden`) or a
  rival out of reach (`ieeTargetUntargetable`) refuses the use before anything
  is spent. The pure part — what holds, who answers — is
  `lib/engine/iee/resolve/incoming.ts`.
- **The dashboard** greys the uses out while the player is kept from items and
  a rival out of reach in the target picker, as it does a newcomer. **Bots**
  (live and sandbox) aim at nobody out of reach and plan nothing while kept
  from items; what holds is read per season (`standingBySeason`).
- **Scenarios**: a `use` step may be the rival's (`by`), a `grant` step may
  hand out as a drop (`via: "wheel"`), which the recipient's entries answer.
- **The editor**: the two moments, the condition and the seven actions with
  their fields; the protection tier in the interaction block; the checks
  `incoming_twice` and `reflect_scope` and the warning `protection_unused`; an
  item that works while held may do it by answering or holding alone.
- **Power** (spec §14): what an arrival is worth and how often one comes in a
  roll — a harmful action 2 (0.024 a roll; 1.95 turned back), an entry by
  kind and character (a bonus item 1.9, a penalty effect 1.6, …), a move back
  2.5 (0.0185) — read off `core` (`PLAY_MODEL.arrival`) and held to the pack by
  `power-calibration.test.ts`: the simulator's rivals use nothing a run hands
  out, so it cannot measure a protection. `delayLoss` (0.5) and `shielded`
  (0.1) are assumptions. A shield reads 2, a mirror shield 4, a phoenix 3.5,
  «Эхо проклятия» 1.6, «Проклятие» 0.1.
- The sandbox counts an answer as a firing and names the four journal ops.

**Decided** — to keep going; the owner corrects at the gate:

1. Two moments, not one: answers at `onIncoming`, standing states at
   `whileActive` — «Невидимость», «Цепь» and «Метка» hold while they last;
   they do not wait for something to arrive.
2. Protection is ordinary unless an entry says it is reinforced.
3. Only an aimed use harms a player; everything harmful one use aims at one
   player is one arrival with one answer.
4. A reflection reaches the sender as the holder's answer: their own
   protection may block it.
5. Amplification: an instant effect acts again, a lasting one lasts that many
   times as long, an item comes as copies, a move goes further; anything else
   comes once.
6. Staff and rewards are not answered; what the rules of what they hand out do
   is.
7. The dashboard greys a rival out of reach, as it greys a newcomer, rather
   than hiding them.

**Live** (`pnpm dev` on scratch Postgres): every public, player and admin page
answers 200; a turn onto a bonus cell dropped «Свинцовые грузы» through the
new arrival path, and using them on the rival planted «Тяжёлые ботинки»
through the harm check — nothing in `core` answers yet, so both landed as
before. No `core` entry protects yet: the wave's entries (B.4) and its gate
check the answers live.

**Verification.** `pnpm verify` green — **320 files / 4385 tests**; coverage
85.4 % statements / 78.3 % branches / 81.5 % functions / 86.8 % lines (up from
85.2 / 77.8 / 81.1 / 86.6). Delivered to the checkout as s45.

---

## 2026-10-17 — Session 30 · Wave B, part 1 (item operations)

**Goal.** Plan §9 task B.1: items change hands, are copied and chosen from the
season's catalog, and a wheel spins once more (spec §6.12). The owner's
go-ahead for wave B came the same day.

**Done.**

- **Six actions, wave B** (`lib/engine/iee/dsl/vocabulary.ts`; spec §6.12):
  `stealItem` (an aimed use takes random bonus items of the chosen player),
  `transferItem` (random bonus items of the holder go to the chosen player or
  a random active rival), `swapItems` (one each, both picked first),
  `copyItem` (a fresh grant of the entry behind a rival's item), `grantChosen`
  (the user picks a bonus item of the season's catalog as they use the item)
  and `extraSpin` (the bonus or penalty wheel spins once more, at
  `afterCellEffect` or `onOutcome`); `remove` takes a `rarity` filter. Each
  with its sentence in three languages, cost, way and harm; the stage `B` is
  carried. «Философский камень» is `remove` (`pick: choice`, common) and
  `grantChosen` (common) in one rule; «Джокер» is `grantChosen`.
- **The executor** (`lib/modules/iee/executor`): `moveItems`, `swapItems`,
  `copyItem`. A moved item is the same instance — charges and parameters go
  with it, journal op `move`, its pickup rules not run again; a passive one
  counts from its new holder's next roll. Only bonus items move; an item never
  hands itself over (the intent carries the instance whose rule asked); a
  unique item never goes to a holder who has one, and the season's limits
  hold; a trade either side may not receive does not happen. The store gained
  `rehome` and `nameOf`.
- **The feed**: `item_moved` on the receiver's line — stolen, received, traded,
  from whom — under "Items & effects", named where the move is (en/ru/uk).
- **The item path**: a use that asks for a pick of the catalog is refused
  without one (`ieeEntryChoiceRequired`) or with one outside its filter
  (`ieeEntryChoiceInvalid`); what may be picked is one rule,
  `entryChoiceOptions` — bonus items attached and switched on, of the
  rarities and activation asked, never the item's own entry — used by the
  server, the dashboard and the bots. The form field is `chosenEntryId`.
- **The dashboard's inventory**: a use is a short flow — whom, what of one's
  own, what of the catalog — each step offered only when the item asks; the
  last one submits. The pick of one's own respects a rarity filter.
- **Extra spins**: `playTurn` returns `extraWheels`; the turn and the
  simulations spin them through `applyWheels` after the landing's own, each
  seeing what the spins before it handed out (`countedIn`). The dashboard
  animates the landing's own spin; one more shows in the inventory and the
  feed. The turn-parity and turn-clock invariants follow `applyWheels`.
- **Scenarios**: a `use` step may pick from the catalog (`chooseEntry`), a
  `roll` step may check the wheel a rule spun once more (`wheelAgain`); a
  step's play key now includes what it picks (`choose` was missing from it).
- **The editor**: forms for the six actions (count, rarities, whom, activation,
  wheel) and the rarity filter of `remove`; scenario fields for both new
  checks; the check `entry_choice_twice`.
- **Bots** (live ticker and sandbox): steal from a rival who holds something,
  copy as a buff, trade only with something of their own to give, never give
  their own away, pick an item of the catalog at random among what is offered.
  The sandbox's bots now pick their own instances too, as the live ones do.
- **Power** (spec §14): what a held item is worth by rarity, a pick's best and
  a spin's worth are read off `core` — the simulator uses the item under test
  and nothing a run hands out. `power-calibration.test.ts` holds them to the
  pack; the penalty wheel spun once more is measured too (3 spins: 4.5
  estimated, 4.9 measured).
- Spec §5.5 (the use step's picks and the refusals, both missing since wave A),
  §6.12, §9.3, §14.

**Decided** — to keep going; the owner corrects at the gate:

1. Rarity in the filters is the entry's own — its card's — not the rarity a
   season's row plays it at for the weights.
2. A pick from the catalog offers what the wheel drops (attached and switched
   on), never the item's own entry.
3. A steal is worth twice the item (both sides of the lead), a trade a third of
   an item for the choice of whom (an assumption, like the gaps).
4. A spin of the bonus wheel is worth 1.6 cells, of the penalty wheel 1.5 the
   other way — the pack's drops; the play model's `landing` stays as measured
   (its re-calibration is already open, status item 4).

**Not live-checked**: no `core` entry uses the new actions yet; wave B's gate
checks them live with the wave's entries (B.4).

**Verification.** `pnpm verify` green — **318 files / 4317 tests**; coverage
85.2 % statements / 77.8 % branches / 81.1 % functions / 86.6 % lines (up from
84.9 / 77.3 / 80.7 / 86.3). Delivered to the checkout as s43 (83 files).

---

## 2026-10-11 — Session 29 · Wave A, part 5 (the wave's entries in `core`) — the gate

**Goal.** Plan §8 task A.5: the 23 wave-A entries of the starter set (spec
§17.1) in `core` with their scenarios — «Тяжёлые ботинки» a cursed item that
«Свинцовые грузы» plant — rarities by measured strength and uniqueness; the
wave's gate.

**Done.**

- **`core` holds 40 entries** (`seed/iee/core.ggpack`; the fixture
  regenerated). New items: `teleport`, `portal_scroll`, `swap_scroll`,
  `teleport_ring`, `magnet`, `hook`, `time_stone`, `fate_dice`, `chaos_die`,
  `purifying_amulet` and the cursed `cursed_boots` «Тяжёлые ботинки»,
  `cursed_die`, `broken_compass`; new effects: `fortune`, `fast_track`,
  `back_teleport`, `burden`, `misfortune`, `lost_time`, `misfired_portal`,
  `pursuit`, `castling`, and two handouts — `magnet_pull` «Притяжение» and
  `fate_roll` «Бросок судьбы». «Свинцовые грузы» plant `cursed_boots`; the
  effect `heavy_boots` stays, renamed «Тяжёлый шаг» / Heavy Step. 64 new
  scenarios, two more for «Свинцовые грузы» (a second pair refused, a game in
  flight spared) — every entry 1–5, green at the first run; the scenario
  reference lists 141 (121 in the documents). Spec §17.1 lists the wave as
  shipped.
- **The tag `handout`** (spec §6.6): attaching an item attaches its handout
  switched off; the season presets never switch one on, nor do the sandbox's
  `core` wheels; the calibration measures it inside its item.
- **Power nets drawbacks** (spec §14). Each action goes one way for the holder
  (`sign`) and an entry is worth what its actions come to together — «Кости
  судьбы»'s die more less the move of a low sum. A rule's conditions say what
  its actions are worth on (`narrow`): a sum condition the throws it lets
  through; dice an entry's own rules add are the dice its later rules read.
  "No move when a pass shows 2 or less" counted a whole pass lost (2.1 against
  a measured 0.8 — it failed once the new wheels came in), «Кости судьбы» 0.7
  against 1.6.
- **Calibration** (spec §14): every `core` entry where the play model puts its
  players (aimed at 6 ahead, a last roll of 5 for «Магнит», the rival behind 4
  back, a rival's pass of 4 undone) and with what it works on (the amulet on a
  poisoned holder, «Бремя» with one item); the simulator's item use takes a
  pick when the item asks for one. All 38 played entries agree; none sits above
  its rarity or plays against its character; a spin is worth 1.58 cells on
  either wheel.
- **Found on the way**: the sandbox rolled for a bot that its own «Телепорт»
  had just taken to the finish (`player_not_active` with `core` on the wheels)
  — such a turn now shows the move and no result; the live bot ticker had the
  same flaw and now rolls nothing more after it; bots plant a cursed item on a
  rival as an attack and never hand one to themselves; the scenario reference
  called instant and next-game effects "permanent" and showed cursed items as
  used.
- **`stacking.group` moves to wave B** (spec §7.10): no wave-A entry needed it.
- The boots picture serves the cursed item too (`public/iee/items/
  cursed_boots.webp`).
- Spec §6.6, §7.10, §14, §17 (the wave-A table as shipped); plan §8 A.5.

**Decided** — to keep going; the owner corrects at the gate:

1. The boots: the cursed item has its own slug, `cursed_boots`; the effect
   `heavy_boots` stays as «Тяжёлый шаг». An entry keeps its kind and a pack its
   slugs, so `heavy_boots` could not become the item.
2. «Магнит» and «Кости судьбы» work through handout effects: an item acts when
   it is used, and the next roll is an effect's.
3. «Камень времени» aims at a rival only: on oneself it would undo one's own
   drop, ~7 cells — legendary.
4. «Потерянное время» waits for a passed game: staying put on a drop would
   spare the move back.
5. Every dice rule of the wave acts on passed games only, as «Везение» has
   since session 24; «Кости судьбы»'s "double the dice" is a die more on a pass
   (a new season's pass throws one).
6. Rarities: the spec's provisional ones held unless strength said otherwise —
   `teleport_ring` epic (5 cells), `castling` legendary (8); `lead_weights`
   stays common, as in `core`.

**Open for the owner**: the rarities kept by mechanic rather than strength
(«Кости судьбы» epic at 1.8 cells; «Крюк», «Быстрый путь», «Сломанный компас»,
«Погоня» rare at 2 or less); «Камень времени» on oneself; the landing worths
under wave A's wheels (status list, item 4); bots never use «Камень времени»
(they do not know a rival's last move).

**Live** (`pnpm dev`, scratch Postgres, the season `run-1`). The boot imported
the new pack into a database holding the old one: 24 entries added, 2 updated,
26 revisions, migration `0024` pushed. In the wizard: everything off, «Свинцовые
грузы» and «Сломанный компас» on — the weights came in at their newest
revision with «Тяжёлые ботинки» attached switched off. A bonus landing dropped
the weights; used on the rival from the dashboard, they planted «Тяжёлые
ботинки» (the inventory shows them cursed, "works by itself"); the rival's next
passed roll of 6 went 3 cells (−2 by the boots, −1 by a status) and the boots
were gone. A penalty landing dropped «Сломанный компас»; a passed 5 went
forward and used it up; dropped again, a passed 3 went back 3 cells, 24 → 21.
The feed showed each step (found, used, picked up the cursed…, shook off…);
no page errors. The scratch season had run out of games — 40 were added to its
catalogue.

**Verification.** `pnpm verify` green — **318 files / 4250 tests**; coverage
84.9 % st / 77.3 % br / 80.7 % fn / 86.3 % ln.

**Files** (not committed): changed `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts`, `lib/engine/iee/{catalog,
scenarios}.ts`, `lib/engine/iee/dsl/{vocabulary,power,play-model,check,
glyphs}.ts`, `lib/engine/bots/items.ts`, `lib/modules/iee/catalog/edit.ts`,
`lib/modules/iee/library/{draft,sandbox}.ts`, `lib/modules/iee/sim/{measure,
sandbox}.ts`, `lib/modules/bots/service.ts`, `components/admin/IeeStage.tsx`,
`components/admin/constructor/entry/SandboxBlock.tsx`,
`components/iee/{IeeIcon.tsx,art-manifest.ts}`, `scripts/scenarios-doc.ts`;
new `public/iee/items/cursed_boots.webp`; tests next to them (`core-docs`,
`power`, `vocabulary`, `check`, `bots/items`, `iee-catalog`, `iee-filter`,
`catalog/{edit,editor,views}`, `registry`, `library/{transfer,sandbox}`,
`sim/{power-calibration,sandbox,season}`, `bots/service`, `IeeStage`,
`SandboxBlock`); `docs/{IEE_CONSTRUCTOR_SPEC,IEE_CONSTRUCTOR_PLAN,
ITEMS_EFFECTS_SCENARIOS}.md`, this journal, `docs/WORKLOG.md`.

**Next.** The wave A gate: stop for the owner's go-ahead (and corrections).
Then wave B (plan §9): item operations, protection and interception, player
decisions with the reaction window, and its 22 entries.

---

## 2026-10-10 — Session 28 · Wave A, part 4 (the next game; standing, items held, the chosen player's roll)

**Goal.** Plan §8 task A.4: the duration `next_game`; wave A's conditions
(`rank`, `itemCount`, `targetRelative`, `compareLastRoll`) and value sources
(`diceSum`, `itemCount`, `targetLastRoll`); an effect that remembers whom its
item was aimed at («Магнит»).

**Done.**

- **`next_game`** (spec §6.4, §7.9): one game, passed or dropped — no count,
  nothing for a season to tune; counted down like a single roll, so it never
  touches the game it arrived during. The editor offers "Until the next game";
  the dashboard and the preview say "Until your next game is over"; the admin
  views name it (and now name an instant effect, which they showed as
  permanent).
- **Conditions** (§6.2, §6.11): `rank` — the leader, the last (nobody active
  behind) or within the first n, as the turn started; `itemCount` — the items
  the holder has, all or bonus or cursed, against a number; `targetRelative` —
  the chosen player ahead or behind; `compareLastRoll` — the dice of this roll
  against the chosen player's last one. The snapshot of a player now carries
  how many are behind and the dice sum of their last regular move (`moves`).
- **Value sources** (§6.5): the dice result, so many per item held (of a
  character), the chosen player's last roll — in the distance, points, the
  dice result and an out-of-turn move only (`source_action` elsewhere), and
  only where the moment knows them (`source_unavailable`); unreadable, they
  are worth 0. The sentences say what they count: "the dice result is lower
  by 1 for each item you hold".
- **The remembered player** (§6.11, «Магнит»): an effect an aimed item hands
  to its user keeps whom the item was aimed at (`iee_instances.aimed_player_id`,
  migration `0024`); at the turn's hooks its rules read that player — where
  they stand, their last roll — as the chosen player. A renewal aimed
  elsewhere follows the new player. The turn loads those players once, with
  the statuses.
- **Scenarios** can give a player's last roll; **the editor** offers the new
  conditions with their fields (a place's three shapes, items of a character,
  ahead or behind, lower or higher), a "From the game" mode for numbers that
  may read the game, a last roll in Given, and only what the checks accept
  where it is offered.
- **Power**: the next game is one roll; `rank` holds as one place of a field of
  8, `itemCount` as a Poisson count around 1 held item (a fifth cursed),
  `targetRelative` half the time, `compareLastRoll` exactly from the dice; a
  source is worth the play model's mean of what it reads. Five new calibration
  cases agree with the simulator: a pass longer by the dice result (2.1 / 2.0),
  a pass's result 1 lower per item on a holder with one (0.5 / 0.7), no move on
  a pass the next game (2.1 / 2.4), forward by the chosen player's last roll of
  5 (4.9 / 5.3), «Магнит» (0.7 / 0.8). The field and the held items are
  assumptions the two-player simulator cannot measure.
- Spec §4.3, §5.5, §6.2, §6.4, §6.5, §6.11 (new), §7.9, §14; DESIGN.md (the
  "From the game" mode, the next game's meter, a last roll in Given).

**Decided.**

- An effect remembers a player only when an item aimed at them hands it to its
  user; its rules read the player but never act on them (that would be
  harm without protection — wave B), and `hasEntry` on them stays at an
  item's use.
- What the remembered player is, is read when the rule runs: a roll they make
  in between counts.
- A source reads the faces that count — after rerolls and a better or worse
  of two; a cancelled move still has its dice.
- «Бремя»'s rule will act on passes only (wave A.5): measured, −1 a item on
  any roll is worth nothing (−0.1 ± 0.3), since on a drop a lower result is a
  shorter move back — the same finding as «Везение» in session 24.

**Verification.** `pnpm verify` green — **318 files / 4043 tests**; coverage
84.7 % st / 76.9 % br / 80.4 % fn / 86.1 % ln. «Магнит» plays end to end in a
memory season and in an entry scenario; the migration was generated with
`drizzle-kit generate` and is pushed by `pnpm dev`. Exercised live at the
wave's gate.

**Files** (not committed): changed `db/schema/iee.ts` (+ migration
`drizzle/0024_iee_instance_aimed.sql` and its snapshot),
`lib/engine/types/iee.ts`, `lib/engine/iee/dsl/{values,vocabulary,placement,
check,compile,runtime,tuning,power,play-model,doc,scenario-text}.ts`,
`lib/engine/iee/resolve/live.ts`, `lib/modules/iee/executor/{index,store}.ts`,
`lib/modules/iee/{turn/index,repository/counters}.ts`,
`lib/modules/iee/sim/{season,scenarios,measure,memory-store}.ts`,
`lib/modules/iee/library/{draft,scenario-draft}.ts`,
`lib/modules/game/service/iee.ts`, `components/dashboard/InventoryPanel.tsx`,
`components/admin/{IeeCatalogBrowser,RevisionDiff}.tsx`,
`components/admin/constructor/{issue-text.ts,entry/ops.tsx,
entry/DurationBlock.tsx,entry/RulesBlock.tsx,entry/SidePanel.tsx,
entry/scenario-fields.tsx}`, the `iee` and `ieeEditor` dictionaries (en, ru,
uk); tests next to them (`check`, `compile`, `placement`, `text`,
`vocabulary`, `executor`, `store`, `counters`, `instances`, `draft`,
`season`, `scenarios`, `power-calibration`, `game/service/{iee,turn,
use-item}`, `intervene`, `EntryEditor`); `docs/{IEE_CONSTRUCTOR_SPEC,
DESIGN}.md`, this journal, `docs/WORKLOG.md`. Also from session 27: the
orphaned comments of `cleanse` and `MoveIntent` put back in place.

**Next.** Sessions 29–30 (A.5): the 23 wave-A entries in `core` with their
scenarios — «Тяжёлые ботинки» becomes a cursed item that «Свинцовые грузы»
plants — rarities by measured strength and uniqueness, `pnpm iee:core`,
`pnpm scenarios:doc`; the live gate (a backward «Сломанный компас» move,
«Свинцовые грузы»); settle `stacking.group`.

---

## 2026-10-10 — Session 27 · Wave A, part 3 (cursed and passive items)

**Goal.** Plan §8 task A.3: items that work without being used — passive ones
while held, cursed ones by themselves — with their uniqueness, their removal
and an inventory cap that counts bonus items only (spec §6.10).

**Done.**

- **Activation** (`usage.activation`: `active` | `passive` | `cursed`, spec
  §5.1, §6.10). An active item is used as before. A passive or cursed one is
  never used: its rules sit at the turn's hooks (`afterDice`,
  `beforeMovement`, `afterMovement`, `beforeCellEffect`, `afterCellEffect`,
  `onOutcome`, `onTick`) and fire by themselves while it is held — the items'
  rules join the effects' at the same hooks (`liveSources`), anchored like an
  effect, so an item received during a game works from the next roll. Each
  turn a rule fires spends a charge; with none left the item is gone (`end`,
  `triggered`; `item_expired` in the feed where the season reveals it). A
  passive item without charges works for as long as it is held; a cursed one
  always has charges (one by default).
- **Cursed is a penalty, and a penalty item is cursed** (D3): the check refuses
  a mismatch (`cursed_character`), the editor turns the character with the
  activation. A cursed item is always unique; any item may be marked unique —
  a second copy is refused at the wheel (`duplicate_unique`) and by the
  executor (`blocked_unique`).
- **The inventory cap counts bonus items only**: a cursed item is dealt even
  into a full inventory.
- **`onPickup`** (items): fires once, as the item arrives — off the wheel, from
  a grant or planted by a rival.
- **`remove`** replaces the provisional `removeItem`: it takes effects, items
  or either — of a character or a named entry, from the holder or the chosen
  player — the newest, at random, or the one the user picks at use
  (`pick: choice`, only at `onUse`, once an item; the use form asks for it,
  bots pick the newest that fits). Planting a cursed item on a rival is
  `grantItem` to the target; `plantItem` is not a primitive.
- **Target filters** for aimed items (`usage.target.filter`: ahead, behind,
  nearest ahead or behind, the leader), judged on the standings at the moment
  of use (`ieeTargetNotEligible`); the dashboard offers only the players that
  pass, and bots keep to it.
- **Dashboard**: a cursed item is drawn in the penalty colours with a "Cursed"
  badge and no "Use"; a passive one is marked as working by itself; the
  item's text says how it works ("Cursed: it cannot be used and works by
  itself.", "Works once, then it is gone."). **Feed**: a cursed item picked up
  reads in red; one that fired its last charge is shaken off.
- **Editor**: activation chips (the moment of use and the target for active
  items only, the filter for aimed ones, "Fires" for held ones, the unique
  switch fixed on for cursed ones); `onPickup` and the hooks offered by
  activation; the `remove` fields; "Picks" in a scenario's use step.
  **Scenarios** pick at use (`choose`).
- **Power**: a held item is worth its rules times its charges, and those wait
  for their conditions like `triggers` do; a passive one without charges
  counts as permanent (10); `onPickup` counts once. `remove` costs the named
  entry's power, or 2 an instance when it names none, as an unknown grant does
  — measured, a poison taken off is worth 3 cells, and the 1 first written was
  too low. Four new calibration cases (two cursed, one passive, one removal on
  a poisoned holder) agree with the simulator.
- Spec §5.1, §6.1, §6.3, §6.10 (new), §7.5, §9.3, §14; DESIGN.md (cursed
  tiles, items that are never used).

**Decided.**

- `whileHeld` is not a `when`: a held item's rules use the turn's own hooks,
  so the dispatch, the text and the editor need nothing new for it.
- A charge is spent once a turn in which any of the item's rules fired,
  however many did.
- A held item is anchored like an effect: one received during a game starts
  working from the next roll.
- `remove` replaces `removeItem` and the cleansing of items; `plantItem` is
  `grantItem` to the target. `usage.choice` (a pick of anything at use) stays
  for wave C; the pick of what to remove belongs to the `remove` action.
- The inventory cap counts bonus items: a full inventory does not dodge a
  curse.

**Verification.** `pnpm verify` green — **318 files / 4003 tests**; coverage
84.6 % st / 76.8 % br / 80.2 % fn / 86.0 % ln. The first full run caught three
tests written for the old shapes (a bot test's registry stub without `get`, a
held item's missing charges read as 0, the usage preview without
`activation`) — fixed. The held items are exercised live at the wave's gate.

**Files** (not committed): changed `app/(public)/dashboard/page.tsx`,
`lib/engine/types/iee.ts`, `lib/engine/iee/dsl/{check,compile,doc,placement,
power,runtime,scenario-text,text,tuning,vocabulary}.ts`,
`lib/engine/iee/{catalog,use-guards,resolve/live,selection/gates,
selection/pick}.ts`, `lib/engine/bots/items.ts`,
`lib/modules/iee/executor/index.ts`, `lib/modules/iee/{use/index,turn/index,
registry/index,repository/counters,repository/instances,actions/inventory}.ts`,
`lib/modules/iee/sim/{season,scenarios,measure}.ts`,
`lib/modules/iee/library/{draft,scenario-draft}.ts`,
`lib/modules/game/service/{iee,use-item}.ts`,
`lib/modules/bots/{service,repository}.ts`,
`components/dashboard/InventoryPanel.tsx`, `components/iee/IeeArtTile.tsx`,
`components/feed/feed-timeline-view.tsx`,
`components/admin/{BotRoster,BotsRunCard,IeeCatalogBrowser}.tsx`,
`components/admin/constructor/entry/{UsageBlock,SidePanel,RulesBlock,ops,
scenario-fields}.tsx`, the `core`, `feed`, `iee` and `ieeEditor` dictionaries
(en, ru, uk); tests next to them (`check`, `compile`, `placement`, `power`,
`text`, `tuning`, `vocabulary`, `catalog`, `use-guards`, `gates`,
`bots/items`, `executor`, `registry`, `catalog/diff`, `draft`, `season`,
`scenarios`, `power-calibration`, `use-item`, `InventoryPanel`,
`feed-timeline-view`, `EntryEditor`); `docs/{IEE_CONSTRUCTOR_SPEC,DESIGN}.md`,
this journal, `docs/WORKLOG.md`.

**Next.** Session 28 (A.4): the duration `next_game`; wave A's conditions
(`rank`, `itemCount`, `targetRelative`, `compareLastRoll`) and value sources
(`diceSum`, `itemCount`, `targetLastRoll`); an effect that remembers the target
of the item that gave it («Магнит»).

---

## 2026-10-10 — Session 26 · Wave A, part 2 (out-of-turn moves)

**Goal.** Plan §8 task A.2: a position changed by an item or effect outside
the regular move (spec §7.3), and the primitives that make one.

**Done.**

- **The executor moves players** (`lib/modules/iee/executor`): `movePlayer`
  reads the season's positions as the move is carried out, so moves in a row
  see each other; it finds who moves — a participant, or the active rival
  nearest behind (a tie decided by the server rng, journaled) — and where:
  by a number of cells, onto or right before a player, a swap, back to where
  the last regular move started, half the gap. It writes the position and the
  finish (which still counts: `player_finished`, `outOfTurn: true`), a public
  `move_player` journal row and a feed row on the moved player's own line; it
  does nothing, with a `noop` and a reason, when nobody is behind, the player
  is out of the run or has not moved yet. Back never wraps — a penalty must
  not turn into a jump to the front of a loop; forward wraps on a loop and
  otherwise stops at the last cell. The store got `places`, `setPosition` and
  `lastMoveStart` (SQL and memory); the context reads the board once, when a
  move first needs it (`loadBoardInfo`), and the turn hands over the board it
  played.
- **Instant effects** (`duration: instant`, spec §6.4): rules on arrival only,
  no stacking; the instance is written and ended at once (`triggered`), so the
  wheel's caps and cooldowns count the drop; its rule text says only what it
  does — no "when it is applied", no duration.
- **Primitives** (stage A, spec §6.9): `move` (`by`, `who?`), `moveToTarget`
  (`at: cell | before` — only where a chosen player exists; the editor does not
  offer it elsewhere), `swapPositions` (`with: target | nearestBehind`),
  `rollbackLastMove` (`who`), `halveGap` («Погоня»); the value source `table` —
  a die rolled on rows («Кубик хаоса»), listed row by row in the rule text and
  worth its mean.
- **The wheel** does not offer an effect that moves the nearest rival behind
  as it arrives («Погоня», «Рокировка») to a player with nobody behind the cell
  they landed on: the compiler marks it (`needsBehind`), the pool context
  counts the rivals behind the landing cell, the gate says `nobody_behind`.
- **Feed**: `moved_out_of_turn` under "Moved" — "Ada: out of turn, cell 12 →
  15 (Pursuit)"; a rival moved by someone's drop or item gets the row on their
  own line; the entry is named where the season reveals drops, and always for a
  move an item's use made (the use is public anyway).
- **Power**: the five primitives cost what they move (`aimGap` 6, `behindGap`
  4 — assumptions, like the pass rate); what an effect does on arrival or at
  its end now counts once, however long it lasts (it was multiplied by the
  duration; no `core` entry had such a rule, so no power changed). The
  simulator can place the rival ahead or behind and give each a last move
  (`placing`); eleven new calibration cases all agree with it.
- **Scenarios**: a step checks where each player stands after it (`position`,
  `rivalPosition`). **Editor**: the "Instant" duration (no count, no
  stacking), the die-table input, the five actions' fields, the position
  checks. **Bots** take a move forward for themselves, push a rival back, and
  jump or swap only when it lands them ahead.
- Spec §5.1, §5.5, §6.3–§6.5, §6.9 (new), §7.3, §7.11, §9.3, §13, §14;
  DESIGN.md (the die table, the instant duration, the position checks).

**Decided.**

- An out-of-turn move is resolved when it is carried out, against the
  positions of that moment, and so is "the nearest rival behind".
- A move back never wraps on a loop board; forward does.
- An instant effect leaves an ended instance row rather than none: the wheel's
  per-season and per-player caps and its cooldowns count drops by instances.
- The out-of-turn primitives act where the executor runs rules (`onUse`,
  `onApply`, `onExpire`) — not at turn hooks, for now.
- Out-of-turn moves wrote nothing to `moves`, so «Камень времени» returns to
  where the last *regular* move started.

**Verification.** `pnpm verify` green — **318 files / 3953 tests**; coverage
84.5 % st / 76.5 % br / 80.1 % fn / 85.8 % ln. The full run on this two-core workspace pushed two of the
heaviest test files past vitest's 5-second limit (they pass alone in 1–4 s):
the architecture scans and the editor's scenario, sandbox and editor tests now
allow 30 s. The moves are exercised live at the wave's gate.

**Files** (not committed): changed
`lib/engine/types/iee.ts`, `lib/engine/iee/dsl/{values,vocabulary,compile,
runtime,tuning,check,placement,doc,play-model,power,text,scenario-text,
scenario-verdict}.ts`, `lib/engine/iee/{catalog,selection/gates,selection/
pick}.ts`, `lib/engine/bots/items.ts`, `lib/engine/feed/filters.ts`,
`lib/infrastructure/events/index.ts`, `lib/modules/iee/executor/{index,store,
context}.ts`, `lib/modules/iee/{use/index,turn/index,registry/index,
repository/counters}.ts`, `lib/modules/iee/sim/{season,memory-store,scenarios,
measure}.ts`, `lib/modules/iee/library/{draft,scenario-draft}.ts`,
`lib/modules/game/service/{turn,iee,use-item}.ts`,
`components/feed/feed-timeline-view.tsx`,
`components/admin/constructor/{issue-text.ts,entry/ops.tsx,
entry/DurationBlock.tsx,entry/RulesBlock.tsx,entry/scenario-fields.tsx}`, the
`feed` and `ieeEditor` dictionaries (en, ru, uk); tests next to them
(`executor`, `store`, `context`, `counters`, `season`, `scenarios`,
`power-calibration`, `compile`, `check`, `doc`, `placement`, `power`, `text`,
`vocabulary`, `scenario-verdict`, `gates`, `pick`, `bots/items`, `draft`,
`scenario-draft`, `game/service/{turn,iee,use-item}`, `feed-timeline-view`,
`EntryEditor`, plus the timeout of `architecture`, `ScenariosBlock`,
`SandboxBlock`); `docs/{IEE_CONSTRUCTOR_SPEC,DESIGN}.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 27: cursed and passive items (A.3). To settle at the wave's
gate: `stacking.group` is marked "wave A" in the checks, but no wave-A entry
needs it — it may move to wave B.

---

## 2026-10-09 — Session 25 · Wave A, part 1 (the dice pipeline)

**Goal.** The owner's go-ahead for wave A (2026-10-09: «Начинай волну А,
потом будем корректировать детали»). Plan §8 task A.1: the turn's dice in the
seven steps of spec §7.2, the `afterDice` hook and the roll primitives.

**Wave A, by session** (plan §8; the gate stays the plan's):

| Session | Task | What |
| --- | --- | --- |
| 25 | A.1 | the dice pipeline: `afterDice`; `diceShow`, `rerollOn`, `bestOfTwo`, `worstOfTwo`, `resultModify`, `direction` |
| 26 | A.2 | out-of-turn moves: the `instant` duration, the executor's `movePlayer` (the finish still counts), `move`, `moveToTarget`, `swapPositions`, `rollbackLastMove`, `halveGap`, a die table as a value source; the feed |
| 27 | A.3 | cursed and passive items: `whileHeld`, firing by themselves and vanishing, `onPickup`, uniqueness, `plantItem`, `removeItem`, target filters, bonus-only counting; the dashboard |
| 28 | A.4 | `next_game`; the conditions `rank`, `itemCount`, `targetRelative`, `compareLastRoll`; the value sources `diceSum`, `itemCount`, `targetLastRoll`; an effect that remembers whom its item was aimed at («Магнит») |
| 29–30 | A.5 | the 23 wave-A entries in `core` with scenarios — `heavy_boots` a cursed item that `lead_weights` plants — rarities by measurement; the live gate |

**Done.**

- **The turn's dice in seven steps** (`lib/engine/turn`, `lib/engine/board/
  movement`): composition at `beforeMovement`; the first throw; `afterDice`
  on it (new turn hook — it knows the outcome and the faces, not the cell);
  `finishThrow` — every die showing a listed face thrown again once, a
  best- or worst-of-two thrown a second time with the same rerolls and kept by
  what is better *for the player* (the higher sum on a pass, the lower on a
  drop; a tie keeps the first; the two together cancel out); `diceResult` —
  additions, then the lowest cap, then at least 1, and a direction rule that
  sends the lower half of the range back and the upper half forward, on either
  outcome; then the move, its points and streak in whichever direction it
  goes, the step modifiers that never reverse a move, the cell. `PlayedTurn`
  reports every throw, the result and the direction.
- **Primitives** (`vocabulary.ts`, stage A): condition `diceShow` (`of: sum |
  any`, `cmp: eq | lte | gte`, a fixed value — the first throw at `afterDice`,
  the faces that counted from `afterMovement` on); actions `rerollOn`,
  `bestOfTwo`, `worstOfTwo`, `resultModify` (`delta?`, `cap?`), `direction`
  (`lowerHalf: back`), all at `afterDice`. The hook reducer joins faces, keeps
  the lowest cap and ORs the rest. `AVAILABLE_STAGES` now carries wave A; what
  wave A has not delivered yet still refuses itself in the checks
  (`not_available`).
- **Power** (`play-model.ts`): the dice exactly — a fair die, a die with
  rerolled faces, sums of `n` dice, the better or worse of two throws —
  so each roll primitive costs what it changes in a pass's forward and a drop's
  backward move; `diceShow` holds as often as a new season's dice show it,
  given a pass or a drop. Seven calibration cases join the simulator's test.
- **Scenarios**: a turn's step may list the faces the server draws after the
  first throw (`then`: the dice thrown again, a second throw, in order — the
  last repeats); the editor's step gets the input; the scenario text says
  "the dice show 4, then 1".
- **The editor** offers `afterDice` ("Right after the dice"), the condition and
  the five actions with their fields (faces as chips, a result's add and cap as
  switches); the check `extreme_value` covers a result above 6. Spec §5.5,
  §6.2, §6.3, §6.8 (new), §7.2; DESIGN.md (the step's inputs).

**Decided.**

- Every roll primitive acts on drops too, where the holder wants a *lower*
  result; an entry that should act on a pass only says so with an `outcome`
  condition — the owner's call of 2026-10-09 for the dice statuses, applied to
  the whole pipeline.
- `diceShow` replaces the spec's provisional condition name `dice`, which the
  stage-1 action already holds.
- `outcomeTable` is a value source (a die and its rows), not an action; it
  lands with the out-of-turn moves that need it («Кубик хаоса»).

**Verification.** `pnpm verify` green — **318 files / 3888 tests**; coverage
84.3 % st / 76.1 % br / 79.8 % fn / 85.6 % ln. The pipeline is exercised live
at the wave's gate (a backward «Сломанный компас»).

**Files** (not committed): new `lib/engine/board/movement/pipeline.test.ts`,
`lib/engine/iee/dsl/play-model.test.ts`. Changed
`lib/engine/{turn/index,board/movement/index,types/iee,types/player}.ts`
(+ `turn/index.test.ts`), `lib/engine/iee/resolve/{hooks,live}.ts`
(+ `hooks.test.ts`), `lib/engine/iee/dsl/{vocabulary,runtime,compile,doc,
placement,check,power,play-model,scenario-text,scenario-verdict}.ts`
(+ `vocabulary`, `placement`, `check` tests);
`lib/modules/iee/library/{draft,scenario-draft}.ts`,
`lib/modules/iee/sim/scenarios.ts`, `.../power-calibration.test.ts`;
`components/admin/constructor/entry/{ops,scenario-fields}.tsx`
(+ `EntryEditor.test.tsx`, `issue-text.test.ts`); the `ieeEditor` dictionaries
(en, ru, uk); `docs/{IEE_CONSTRUCTOR_SPEC,DESIGN}.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 26: out-of-turn moves (A.2).

---

## 2026-10-09 — Session 24 · The owner's decisions (between stage 4 and wave A)

**Goal.** Carry out the owner's answers to the six open questions before wave
A: refreshes, the dice statuses, the points texts, `core`'s rarities, the pass
rate and what a rarity means.

**The owner's answers.** (1) A repeated grant renews the effect; whatever
counts it down after the grant counts — the details of the trigger left to us.
(2) Option a: the dice statuses act on passed games only. (3) Option b: points
keep riding on drops; fix the texts. (4) Rarities by measured strength, on our
recommendation. (5) No live seasons yet — explained in plain words, kept at
60 %. (6) A season should not run too fast; mechanics should be fun, not only
maths; rarity marks how unique and how unbalancing an entry is, never three
strengths of the same effect; rare rewards for hard challenges come later.

**Done.**

- **A renewal is a fresh copy** (spec §4.3, §7.9, §7.10). New column
  `iee_instances.count_from_roll_seq` (migration
  `0023_iee_instance_count_from`, one nullable integer): where a renewed
  counter counts from, while the rules keep taking part from
  `anchor_roll_seq`. `refreshCounter` (`lib/engine/iee/resolve/live.ts`)
  replaces `refreshRemaining`: the incoming count, counted from the roll a
  fresh copy counts from — or the old copy, untouched, when it has more left.
  `countingFrom` decides which rolls a counter counts, in `tick` and, for
  `triggers`, in `fire` (which now takes the roll it settles). The stores got
  `renew`; the grant anchors lost `holderRollSeq`, which nothing read any more.
  - Probing the memory season showed the loss was wider than reported: a
    landing that hands out a status the player already holds lost one count
    of **every** unit, and the 1-roll «Тяжёлые ботинки» and 1-move «Попутный
    ветер» ran out in the very turn the wheel renewed them; during a game in
    flight only `passed_games` lost one. Every case now leaves what a fresh
    copy would.
  - Tests: `live.test.ts` (the arithmetic), `executor.test.ts` (a renewal
    during a game in flight, a landing's passed game, a firing on the
    renewal's roll and on a later one, the longer old copy, an ended
    instance), `season.test.ts` (the wheel renewing «Тяжёлые ботинки» and
    «Отравление»), `store.test.ts` (the guarded `renew`); the parity invariant
    pins `refreshCounter` and `countingFrom`. Scenario `SC-POISON-5`: a copy
    that arrives during a game in flight counts after it.
- **The dice statuses act on passed games only**: «Везение» and «Невезение»
  got `if: outcome = passed`; their rule text reads "If the game was passed,
  your dice have 2 more sides. Lasts 2 rolls." Scenarios `SC-LUCKY-4` (a drop
  rolls the season's dice and still spends a roll) and `SC-UNLUCKY-5`. The
  calibration test's list of `core` entries that work against their character
  is now held empty.
- **The points texts** (mechanics unchanged): the season settings — "Points
  add to the move", both directions, spent on the move it lengthened; the
  movement line built from dictionary pieces instead of hard-coded English
  (`+ balance`, `× streak`); the rules page — the formulas (`pass → + dice +
  pts`, `drop → − dice × (streak + 1) − pts`), the drop and points sentences,
  the points badges and line; the settings' rules preview (dice and points
  lines). The old `bonusOn` / `resetOn` / `resetOff` keys are gone. New
  `components/rules/AutoRulesView.test.tsx`.
- **Rarities by strength and uniqueness** (spec §14 has the table): common —
  the everyday nudges of a cell or two; rare — a mechanic of its own or
  clearly stronger; epic — swings a race or bends a rule; legendary — the
  rewards of hard challenges. `core`: `cleansing_salve`, `ward` and `poison`
  rare, the other thirteen common (`jinx`, `spare_die`, `momentum` from epic;
  `lead_weights`, `heavy_boots`, `lucky`, `unlucky` from rare); nothing epic.
  With the new weights a bonus spin is worth 1.65 cells and a penalty spin
  1.64 (before: 1.88 and 1.54) — the wheels give as much as they take, which
  keeps a season from running fast. The editor's power line reads "By power
  alone: …" and its hint says rarity also marks uniqueness; nothing flags an
  entry weaker than its rarity. Spec §14 (with the pass-rate note), §17.1 (the
  core table; the waves' rarities provisional); DESIGN.md; AGENTS.md.

**Measured** (`core` on the wheels, 1000 seeds, after the dice change):

| Entry | Character | Rarity (new) | Power | Measured |
| --- | --- | --- | --- | --- |
| cleansing_salve | bonus | rare | 3.0 | +3.2 ± 0.2 |
| hex_scroll | bonus | common | 2.0 | +2.0 ± 0.2 |
| jinx | bonus | common | 1.8 | +1.7 ± 0.2 |
| lead_weights | bonus | common | 2.0 | +1.8 ± 0.2 |
| spare_die | bonus | common | 1.2 | +1.2 ± 0.1 |
| speed_boots | bonus | common | 2.0 | +2.0 ± 0.2 |
| acceleration | bonus | common | 2.0 | +2.0 ± 0.2 |
| heavy_boots | penalty | common | 2.0 | −1.9 ± 0.2 |
| lucky | bonus | common | 1.2 | +1.3 ± 0.1 |
| momentum | bonus | common | 0.4 | +0.4 ± 0.1 |
| poison | penalty | rare | 3.0 | −3.2 ± 0.2 |
| swamp | penalty | common | 2.0 | −2.0 ± 0.2 |
| tailwind | bonus | common | 2.0 | +1.9 ± 0.2 |
| toll | penalty | common | 0.2 | −0.1 ± 0.1 |
| unlucky | penalty | common | 1.8 | −2.1 ± 0.2 |
| ward | bonus | rare | 1.0 | +1.4 ± 0.2 |

**Decided.**

- A renewal counts from a roll number rather than adding the underway roll's
  tick to its count: when a renewal arrives during a game in flight, nobody
  knows yet whether that game will be passed, or whether a rule will fire.
- A firing on the roll a renewal arrived in belongs to the old copy, like that
  roll's tick — a fresh copy would not have taken part in it; firings on later
  rolls come off the renewed count (the owner's "after the grant").
- `ward` stays rare for its mechanic though its power reads common; `poison`
  stays rare for its strength.

**Found.** «Разгон» and «Пошлина» are hardly felt under the kept points rule
(open for the owner, 1). The rules page still hard-codes English HUD badges
outside points and movement (`pass 1×`, `streak ×`, `LOOP`, `actual cells`),
and the settings' preview its board and pool lines — older, not touched here.

**Verification.** `pnpm verify` green — **316 files / 3853 tests**; coverage
84.2 % st / 75.9 % br / 79.6 % fn / 85.5 % ln. Live (dev server, `ggrun_s3`):
`db:push` added the column and `iee:import` added eight revisions; the editor
shows «Везение» at 1.2 "By power alone: Common" with its new rule text in all
three languages, «Оберег» at 1.0 — rare, no badge — «Отравление» 5 of 5 green,
«Сглаз» 1.8; the rules page, in English and Russian, shows the new formulas
and sentences, and the season settings the new labels; a renewal through the
SQL store (a rolled-back transaction on the live season) keeps the full count
across the landing's roll and counts down on the next; migration `0023`
applies to a database built by migrations; no console errors.

**Files** (not committed): new `drizzle/0023_iee_instance_count_from.sql`
(+ `drizzle/meta/0023_snapshot.json`, `_journal.json`),
`components/rules/AutoRulesView.test.tsx`. Changed `db/schema/iee.ts`;
`lib/engine/iee/resolve/live.ts` (+ test); `lib/modules/iee/executor/
{index,context,store}.ts` (+ `executor`, `store`, `context` tests);
`lib/modules/iee/sim/{memory-store,season,scenarios}.ts` (+ `season.test.ts`,
`power-calibration.test.ts`); `lib/modules/iee/turn/index.ts`;
`lib/modules/game/grant-parity.test.ts` and the tests that build instance rows
or anchors (`game/service/{iee,turn,use-item,events}.test.ts`,
`iee/{scenarios,repository/counters,repository/instances,service/intervene}.test.ts`,
`season/service/seasons.test.ts`); `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts` (+ `core-docs.test.ts`);
`components/rules/AutoRulesView.tsx`, `components/admin/SeasonSettingsForm.tsx`;
the `rules`, `admin` and `ieeEditor` dictionaries (en, ru, uk);
`docs/{IEE_CONSTRUCTOR_SPEC,DESIGN,ITEMS_EFFECTS_SCENARIOS}.md`, `AGENTS.md`,
this journal, `docs/WORKLOG.md`.

**Next.** Wave A, after the owner's go-ahead.

---

## 2026-10-09 — Session 23 · Stage 4, part 4 (power, the drop table; stage gate)

**Goal.** Plan §7 tasks 4.3–4.4: the power estimate per primitive calibrated
with the simulator, the suggested rarity, the season's power ceiling; the
drop table and the 1000-spin simulator held to each other. The stage gate.

**Done.**

- **The simulator measures** (`lib/modules/iee/sim/measure.ts`): two players
  for twelve turns (thirty for an effect that waits for its trigger) on a long
  board with a new season's share of cells, `core` on the wheels; every seed is
  played with and without the entry on the same dice, games and wheel draws
  (per-turn streams, `wheelRng` on a memory-season turn), and the difference
  — position, plus points at what a point is worth — is the entry's worth.
  First measurements showed what had to change: drop streaks drove both plays
  onto cell 0 on a short board and erased every difference, so the board is
  long and the players start in its middle.
- **Power, in cells** (`lib/engine/iee/dsl/play-model.ts`, `vocabulary.ts`,
  `power.ts`): each action's cost is what one firing is worth on the turns its
  rule fires on — the rule's `outcome` and `cellType` conditions pass that to
  the cost; dice help a pass and hurt a drop (drops weigh 0.48 of the turns
  with their streak multiplier); a point is 0.2 of a cell, a lost one only when
  there is one to take; a skipped cell is what its landing would have done; a
  grant is the power of what it hands out (`powerTable` resolves them,
  `powerOf` threads them to the editor, the library screens and the wizard); a
  `cellType` condition holds as often as a new season's board has those cells;
  an effect that lasts triggers is not discounted by its conditions.
  `power-calibration.test.ts` holds the estimate to the simulator for twelve
  primitives and all sixteen `core` entries.
- **Suggested rarity**: `suggestedRarity` (common up to 2.5, rare 4, epic 6,
  then legendary); the editor's panel shows "Reads as …" and, above the
  entry's rarity, an amber badge; the check `power_above_rarity` warns at the
  rarity, translated with the rarities' names. The wizard's `powerCeiling`
  warning now reads the calibrated power.
- **The drop table and the 1000 spins** (`lib/engine/iee/selection/
  simulate.ts`): `simulateSpins` (the picker's own spins) and `spinGaps` (each
  slice within four standard deviations of its share); the wizard uses them
  and says the largest gap and whether chance explains it; `simulate.test.ts`
  holds the picker to the table on both of `core`'s wheels.
- Spec §14 (power and the cost table), §15; DESIGN.md (panel, drop table);
  AGENTS.md.

**Measured** (`core` on the wheels, twelve turns; the salve on a poisoned
holder, the ward over thirty):

| Entry | Character | Rarity | Power (estimate) | Measured (1000 seeds) | Suggests |
| --- | --- | --- | --- | --- | --- |
| cleansing_salve | bonus | rare | 3.0 | +2.9 ± 0.2 | rare |
| hex_scroll | bonus | common | 2.0 | +2.0 ± 0.2 | common |
| jinx | bonus | epic | 1.1 | −1.5 ± 0.2 | common |
| lead_weights | bonus | rare | 2.0 | +1.8 ± 0.2 | common |
| spare_die | bonus | epic | 0.7 | −0.5 ± 0.2 | common |
| speed_boots | bonus | common | 2.0 | +2.0 ± 0.2 | common |
| acceleration | bonus | common | 2.0 | +2.2 ± 0.2 | common |
| heavy_boots | penalty | rare | 2.0 | −1.8 ± 0.2 | common |
| lucky | bonus | rare | 0.7 | −0.5 ± 0.2 | common |
| momentum | bonus | epic | 0.4 | +0.4 ± 0.1 | common |
| poison | penalty | rare | 3.0 | −2.9 ± 0.2 | rare |
| swamp | penalty | common | 2.0 | −2.0 ± 0.2 | common |
| tailwind | bonus | common | 2.0 | +2.0 ± 0.2 | common |
| toll | penalty | common | 0.2 | −0.2 ± 0.1 | common |
| unlucky | penalty | rare | 1.1 | +1.3 ± 0.2 | common |
| ward | bonus | rare | 1.0 | +0.7 ± 0.2 | common |

**Decided.**

- Power is net advantage in cells, not "how much happens": an entry that moves
  a lot both ways is weak. The model's assumptions — a pass rate of 60 %, a
  new season's dice and board — are the defaults; a season that differs plays
  its own odds, and the estimate stays a guide.
- `core`'s documents are not changed here: the findings (open for the owner,
  2–4) change gameplay, which is the owner's call.

**Verification.** `pnpm verify` green — **315 files / 3841 tests**; coverage
84.1 % st / 75.5 % br / 79.5 % fn / 85.4 % ln. Live (dev server, `ggrun_s3`): «Болото» shows power 2.0 "Reads as
Common", raising its step to −3 shows 6.0 "Reads as Epic", the amber badge
and the warning in the checks; «Сглаз» shows 1.1; the wizard's 1000 spins: "largest
gap 0.9 points — within chance"; no console errors.

**Stage 4 gate.** A red scenario refuses publishing (session 21, live); a
sandbox run is recorded (session 22, live); the simulated shares match the
analytical ones within tolerance (this session, test and live). Stage 4 is
done; stopping for the owner's go-ahead.

**Files** (not committed): new `lib/engine/iee/dsl/play-model.ts`,
`lib/engine/iee/selection/simulate.ts` (+ test),
`lib/modules/iee/sim/measure.ts`, `lib/modules/iee/sim/power-calibration.test.ts`.
Changed `lib/engine/iee/dsl/{vocabulary,power,check,index}.ts`,
`.../{vocabulary,check,set}.test.ts`, `lib/engine/iee/index.ts`;
`lib/modules/iee/sim/season.ts`; `lib/modules/iee/library/{draft,screens}.ts`;
`lib/modules/iee/catalog/views.ts`; `components/admin/IeeStage.tsx` (+ test);
`components/admin/constructor/{EntryEditor.tsx,issue-text.ts,issue-text.test.ts,
fixtures.test-helpers.tsx}`, `.../entry/SidePanel.tsx`; the `ieeEditor` and
`iee` dictionaries (en, ru, uk); `docs/{IEE_CONSTRUCTOR_SPEC,DESIGN}.md`,
`AGENTS.md`, this journal, `docs/WORKLOG.md`.

**Next.** Wave A, after the owner's go-ahead and decisions on the open list.

---

## 2026-10-09 — Session 22 · Stage 4, part 3 (the sandbox)

**Goal.** Plan §7 task 4.2: play a draft before it is published — bots in a
temporary season, N rounds, a trace.

**Done.**

- **The runner** (`lib/modules/iee/sim/sandbox.ts`): a season kept in memory
  (the memory season of session 20) with a new season's defaults — the board
  laid out by the season generator, now from a caller's random stream
  (`generateBoardCells(config, rng)`, `Math.random` by default), the default
  dice and points — items and effects on, targeting allowed, nobody protected.
  It attaches the draft on its wheel at its rarity's weight, what its rules
  hand out off the wheels, and optionally `core` on the wheels (one entry per
  slug, the draft first). 2–4 bots, each starting with the entry unless asked
  otherwise; a round is one turn of each bot still in the run: before rolling
  and with the game in flight a bot may use an item (the bots' 60 % chance,
  `planBotItemUse`, the item path's guards), then it passes (70 %) or drops
  (30 %). One seed, three streams (board, game, bots): the same seed plays the
  same run. At most 50 rounds, fewer when everyone has finished.
- **The trace and the summary:** the grants before the first round, every turn
  (bot, item uses, passed or dropped, dice, from → to, cell, wheel, points, the
  journal rows it wrote — each with its entry named), each bot's end state, and
  per entry: dropped, handed out, used, fired, ran out, cells moved.
- **The library and the action** (`lib/modules/iee/library/sandbox.ts`,
  `runSandboxAction`): the draft against the latest revisions of what it names
  and, when asked, `core`'s latest revisions; bounds enforced; every run is the
  audit row `iee_sandbox_run` (slug, draft hash, bots, rounds, seed, the two
  switches, the summary — or why the entry did not play), with its label in
  the audit log in three languages.
- **The editor's Sandbox block** (`components/admin/constructor/entry/
  SandboxBlock.tsx`): bots, rounds, seed (kept after a run, so Play repeats
  it; a button empties it for a new one), the two switches, Play; the run line,
  the bots and entries tables, and the turns by round with "only where it took
  part"; a change to what the entry plays marks the run "Changed since the
  run". The entry-name lookup the scenarios block used moved to
  `editor-context` (`useEntryNames`).
- Spec §10.5 rewritten to what was built; DESIGN.md (the block); AGENTS.md.

**Decided.**

- A bot reaches for an item before each of its two steps, as the season's bots
  do (one before the roll, one with the game in flight) — the spec's "may first
  use an item" made exact.
- Three random streams from one seed, so changing what the entry draws does
  not reshuffle the board or the bots' choices: two drafts compared on one seed
  differ by the entry, not by luck.
- The summary counts every entry the run saw, not just the one under test; the
  entry leads the table.

**Verification.** `pnpm verify` green — **313 files / 3800 tests**; coverage
84.0 % st / 75.4 % br / 79.4 % fn / 85.3 % ln. Live (dev server, `ggrun_s3`):
«Болото» in the block — 3 bots, 15 rounds, seed 7 — and again with the same
seed: the same tables; `core` on the wheels with a new seed: core entries drop,
the trace shows 45 turns with the filter off; three `iee_sandbox_run` audit
rows with the seed, bots, rounds and the summary; no console errors.

**Files** (not committed): new `lib/modules/iee/sim/sandbox.ts`,
`lib/modules/iee/library/sandbox.ts`,
`components/admin/constructor/entry/SandboxBlock.tsx` (+ tests for each).
Changed `lib/modules/catalog/pool/board-generator.ts` (+ test);
`lib/modules/iee/library/{index,scenarios}.ts`;
`lib/modules/iee/actions/library.ts` (+ test);
`components/admin/constructor/{EntryEditor.tsx,EntryEditor.test.tsx}`,
`.../entry/{editor-context,ScenariosBlock}.tsx`, `.../ScenariosBlock.test.tsx`;
the `ieeEditor` and `admin` dictionaries (en, ru, uk);
`docs/{IEE_CONSTRUCTOR_SPEC,DESIGN}.md`, `AGENTS.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 23 — power calibrated with the simulator, the suggested
rarity and `power_above_rarity`, the season's power ceiling, the drop table
and its 1000-spin check; the stage gate.

---

## 2026-10-09 — Session 21 · Stage 4, part 2 (scenarios in the editor; `core`'s scenarios as data)

**Goal.** Plan §7 task 4.1, the rest: scenarios written and run in the
editor, `core`'s promises moved from the test table into its documents, the
scenario reference generated from them.

**Done.**

- **`core`'s scenarios are data.** 52 scenarios in the documents of the 16
  entries of `seed/iee/core.ggpack` (titles and notes in ru / en / uk), run by
  `lib/modules/iee/sim/core-scenarios.test.ts` (every entry has scenarios,
  every one green, codes well formed and unique across the pack and the
  table). The subsystem table `lib/engine/iee/scenarios.ts` keeps only what
  no single entry can say: one engine scenario, the rules across the
  subsystem (`SC-PVP-*`, `SC-POOL-*`) and the live tier — 20 rows, 52 data
  rows gone from it. `pnpm scenarios:doc` builds
  `docs/ITEMS_EFFECTS_SCENARIOS.md` from both (72 scenarios: 52 in the
  documents, 8 more by `pnpm test`, 12 live), the data rows written by the new
  describer.
- **Scenarios in words** (`lib/engine/iee/dsl/scenario-text.ts`): Given and
  every step's When / Then as sentences in ru, en and uk, the season's
  defaults unsaid, the generic noun carrying the case before a quoted name in
  ru / uk. The editor reads each card back with it; the reference prints it.
- **The editor's Scenarios block** (`components/admin/constructor/entry/
  ScenariosBlock.tsx`, `scenario-fields.tsx`; model
  `lib/modules/iee/library/scenario-draft.ts`): cards with code, promise and
  note, Given (holder and rival — cell, points, a game in flight, left the
  run, what each carries — and the season's sides, loop and draws), steps of
  three kinds with their typed When and their checks, duplicate / move /
  remove, the checks' findings at their fields. **Run scenarios** plays the
  draft as it is in the form (`runScenariosAction`, nothing saved); the editor
  also runs them when it opens an entry that has some, after a save and after
  a publish. Each step keeps what it observed, so the verdict beside every
  check is recomputed as the author edits it (`scenarioVerdict`, the
  comparison moved to `lib/engine/iee/dsl/scenario-verdict.ts`); only a change
  to Given, When or what the entry plays needs a new run (`scenarioPlayKey`,
  `draftPlayKey`). A missed check offers **Take what happened**; a new check
  starts from what the step did; **What happened** lists all of it. The
  panel's checks count the scenarios and say in `danger` when they are red.
- Checks' sentences for scenario shapes (title, note, code, steps, entries,
  numbers) and for `scenario_failed` / `scenario_broken` in the forms' words.
- Spec §10.4 (the block, the run, re-checking), DESIGN.md (the block), AGENTS.md
  (scenarios in "Build an item or effect" and "Change the system item pack").

**Decided.**

- The editor's verdicts are recomputed in the browser from the last run's
  observations: an expectation never changes what happens, so the author sees
  a changed expectation hold or miss at once; the server is asked again only
  when what plays changes.
- A draft that does not parse is not run ("does not read yet"): the checks
  already point at what is missing.
- Importing the new `core` gives every installation one new revision of each
  core entry (the documents now carry scenarios). Seasons keep the revisions
  they pin; the revision diff says nothing a player sees changes.

**Verification.** `pnpm verify` green — **310 files / 3780 tests**; coverage
83.7 % st / 75.3 % br / 79.0 % fn / 85.0 % ln. Live (dev server, scratch
database `ggrun_s3`): on boot the importer added 16 core revisions; in
«Болото» (pack `gate`) a scenario built in the block, run — red, "Expected 4,
got 3"; **Publish refused** ("Not published: fix the errors first", still one
revision); Take what happened → green → published as r2 with the scenario in
the stored document; «Попутный ветер» (core, read-only) opens with 4 of 4
green, in en and in ru; no console errors.

**Files** (not committed): new `lib/engine/iee/dsl/scenario-text.ts`,
`scenario-verdict.ts` (+ tests); `lib/modules/iee/library/scenario-draft.ts`
(+ test); `lib/modules/iee/sim/core-scenarios.test.ts`;
`components/admin/constructor/entry/{ScenariosBlock,scenario-fields}.tsx`
(+ `ScenariosBlock.test.tsx`). Changed `seed/iee/core.ggpack`,
`lib/engine/iee/core-docs/core.generated.ts`, `lib/engine/iee/scenarios.ts`,
`lib/engine/iee/dsl/{doc,check,index}.ts`, `.../check.test.ts`;
`lib/modules/iee/sim/scenarios.ts`; `lib/modules/iee/library/{draft,index,
publish,scenarios,service}.ts` and the tests `{draft,ggpack,publish,
scenarios,screens.loaders,service,transfer}.test.ts`;
`lib/modules/iee/scenarios.test.ts`; `lib/modules/iee/actions/library.ts`
(+ test); `components/admin/constructor/{EntryEditor.tsx,issue-text.ts}`,
`.../{EntryEditor.test.tsx,issue-text.test.ts}`,
`.../entry/{SidePanel,editor-context}.tsx`; the `ieeEditor` dictionaries
(en, ru, uk); `scripts/scenarios-doc.ts`; `docs/{ITEMS_EFFECTS_SCENARIOS,
IEE_CONSTRUCTOR_SPEC,DESIGN}.md`, `AGENTS.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 22 — the sandbox (spec §10.5): a season in memory around the
draft, bots, a seed, the trace and its summary, audited `iee_sandbox_run`.

---

## 2026-10-08 — Session 20 · Stage 4, part 1 (plan; one turn; entry scenarios)

**Goal.** Plan §7 task 4.1: entry scenarios — Given / When / Then — stored in
the revision document and run on publish; a red one blocks.

**Stage plan** (sessions 20–23): 20 — the turn as one function, a season in
memory, entry scenarios and the publish gate; 21 — scenarios in the editor,
`core`'s scenarios as data, `pnpm scenarios:doc` from `core`; 22 — the
sandbox; 23 — power and the suggested rarity, the drop table and the
simulator, the gate.

**Done.**

- **One turn.** The arithmetic of a resolved turn — dice, move, landing cell,
  the points each moves, the wheel it spins, the finish — is the engine's
  `playTurn` (`lib/engine/turn`); `applyResolvedTurn` plays through it and
  writes what it returns, in the order it always did. The store-agnostic half
  of the turn moved to `lib/modules/iee/turn` (`hooksOver`, `settleTurnHooks`,
  `applyWheel`), and the item path's decision to `lib/modules/iee/use`
  (`decideItemUse`, `carryOutItemUse`). Behaviour unchanged: the turn, wheel
  and item suites pass as they were; the source invariants
  (`turn-parity`, `grant-parity`, `run-lifecycle`) follow the new addresses
  and gain one rule — the simulations play the game's turn.
- **A season in memory** (`lib/modules/iee/sim/season.ts`): participants'
  rows over the executor's in-memory store (promoted from a test helper);
  turns, the wheel, item uses and grants through the functions above.
- **Entry scenarios** (spec §5.5): `ScenarioDoc` in the document schema —
  a localized title and note, Given (holder, rival, the season's dice, server
  draws), steps `roll` / `use` / `grant`, each with its expectations (distance,
  dice, whether the cell fires, the wheel, the use's result and refusal, the
  grant's result, balances, who holds what). The runner
  (`lib/modules/iee/sim/scenarios.ts`) plays them in a fixed scenario season;
  a missed expectation is `scenario_failed`, a step that cannot run
  `scenario_broken`, each at its step with what was expected and what
  happened. Static checks: names resolve (`missing_ref`), a use step uses an
  item (`scenario_item`), ids are unique (`scenario_id_taken`). The
  `scenarios_ignored` warning is gone.
- **Publish and import run them.** `planWithScenarios` runs every draft that
  passes the checks; a red one refuses the draft and whatever in the set
  references it. An import runs the scenarios of the revision each entry will
  play and refuses the file on a red one. `latestDocs` loads what a run plays
  besides the entry; `runDraftScenarios` runs an unsaved draft for the editor.
- **References.** `referencedEntries` (rules: what the entry needs to play),
  `scenarioEntries`, `mentionedEntries` (both: what the pack depends on and
  exports declare). A season attaches only the first; its registry neither
  checks nor runs scenarios, so a scenario may name an entry the season does
  not attach.
- Spec: §5.1 and §5.5 (the scenario document), §7.1 (`playTurn`), §8, §10.1,
  §10.3, §10.5 (the sandbox — designed here, built in session 22), §11, §14.

**Decided.**

- Scenarios are data in the entry document, not test code: they travel with
  the revision, the hash covers them, an admin writes them in the editor.
- The scenario season is fixed and small (spec §5.5) so a scenario reads the
  same everywhere; a step chooses the dice's total and the cell the move ends
  on; the wheel never hands anything out in a scenario.
- The sandbox is a season in memory, not a temporary database season: a draft
  can be tried before it has a revision, nothing has to be cleaned up, and a
  seed makes a run repeat. It plays the same code (`playTurn`, the executor,
  the wheel, the item path).
- Import checks only the latest revision's scenarios; older revisions are
  history.

**Verification.** `pnpm verify` green — **305 files / 3767 tests**; coverage
83.2 % st / 74.7 % br / 78.2 % fn / 84.6 % ln.

**Files** (not committed): new `lib/engine/turn/index.ts` (+ test);
`lib/modules/iee/turn/index.ts`; `lib/modules/iee/use/index.ts`;
`lib/modules/iee/sim/{memory-store,season,scenarios}.ts` (+ `season.test.ts`,
`scenarios.test.ts`); `lib/modules/iee/library/scenarios.ts` (+ test). Changed
`lib/engine/index.ts`; `lib/engine/iee/dsl/{doc,check,set}.ts`,
`.../check.test.ts`, `.../set.test.ts`;
`lib/modules/game/service/{turn,iee,use-item}.ts`;
`lib/modules/game/{turn-parity,grant-parity,run-lifecycle}.test.ts`;
`lib/modules/iee/executor/memory-store.test-helpers.ts`;
`lib/modules/iee/library/{publish,refs,service,transfer,index}.ts`,
`.../{publish,service,transfer}.test.ts`; `lib/modules/iee/catalog/views.ts`;
`docs/IEE_CONSTRUCTOR_SPEC.md`, this journal, `docs/WORKLOG.md`.

**Next.** Session 21 — the scenarios block in the editor and its run, `core`'s
scenarios as data, `pnpm scenarios:doc` from `core`.

---

## 2026-10-08 — Session 19 · Stage 3, part 6 (tests, docs, live gate)

**Goal.** Plan §6 task 3.5 and the stage-3 gate: «Болото», «Сапоги
скорости» and «Отравление» built in the constructor without code, published,
attached to a live season and working.

**Done.**

- Component tests for the three screens (`components/admin/constructor/*.test.tsx`:
  the editor builds «Болото» from a skeleton and the panel follows; save,
  publish-after-save, a refused save; item usage and a hand-out picker that
  offers only effects; what a moment offers; parameters; read-only) and for the
  check sentences (`issue-text.test.ts`); read models with the memory store
  (`screens.test.ts`, `screens.loaders.test.ts`); actions
  (`actions/library.test.ts`); `copyEntry` in the service suite; the wizard's
  diff (`catalog/diff.test.ts`, `IeeStage.test.tsx`).
- `DESIGN.md` — the constructor's three screens, the revision diff, the
  flavor line; `AGENTS.md` — "Build an item or effect"; spec §10.4 (the
  constructor), §13 (flavor on player cards), §14 (findings carry `params`).
- `next build` (webpack) passes; `/admin/catalog` is 75.9 kB / 271 kB first
  load.

**Live gate** (scratch Postgres `ggrun_s3`, `pnpm dev`, Playwright driving the
UI as an admin; no code, no SQL for the entries):

1. Library → New pack `gate` («Проверка»), switched to "Offered to seasons".
2. Three entries built in the editor: `bog` «Болото» (effect, penalty,
   common, `movement`; After the roll → Change the distance −1, switched to a
   parameter `steps` −1 within −6…−1; 2 moves; refreshes), `venom`
   «Отравление» (the same rule, rare, 2 passed games), `swift_boots` «Сапоги
   скорости» (item, bonus, before a roll, on the holder, 1 charge; When used →
   Give an effect «Попутный ветер» from `core` to the holder). Each draft checked
   clean in the panel and saved; the published documents equal `core`'s
   `swamp`, `poison` and `speed_boots` apart from slug and names, and the pack
   depends on `core` (the reference).
3. Publish pack → r1 of each, audited (`iee_pack_created`,
   `iee_entry_created`, `iee_entry_draft_saved`, `iee_entry_published`).
4. Pack → "Attach to a season" → the wizard of the active «Run #1» opened on
   the IEE stage filtered to the pack; everything else switched off, the
   three switched on, saved (`season_catalog_updated`: attached `bog`,
   `venom`, `swift_boots` and, switched off, `tailwind`).
5. Play (penalty board, then bonus board): player2 landed on a penalty cell —
   the wheel dropped «Болото» (71.4 %: 100 against «Отравление»'s 40); the next
   move was 1 shorter from it (and 1 from `core`'s swamp held from before);
   the next landing dropped «Отравление», which then shortened a move and
   counted down on a passed game; player1 landed on a bonus cell — «Сапоги
   скорости» dropped, used before the roll it handed out «Попутный ветер», and
   the next move was 2 cells longer. The dashboard, the wheel and the status
   panel show the new entries by name with their generated rule text.

**Found** (not fixed — not the editor's, reported for the owner):

- **A refresh in the turn a `passed_games` effect ticks loses one.** Player2
  held «Отравление» with 2 passed games left, passed a game and landed on a
  penalty cell that dropped it again: the refresh kept 2 (`max(2, 2)`), then
  the end-of-turn tick counted the passed game — 1 left, where a fresh grant
  in the same turn keeps 2 (its anchor skips the roll in flight).
  `refreshRemaining` (`lib/engine/iee/resolve/live.ts`) compares end positions
  for `rolls` and `moves` only; `passed_games` and `triggers` take a plain
  maximum. Proposed: compare what remains after the turn's tick for those
  units too, with a scenario; a behaviour change, so it waits for the owner.

**Verification.** `pnpm verify` green — **301 files / 3691
tests**; coverage 82.8 % st / 74.4 % br / 77.9 % fn / 84.2 % ln. Live gate as above.

**Files** (not committed) — stage 3 in total: new
`lib/engine/iee/dsl/placement.ts` (+ test);
`lib/modules/iee/library/{draft,screens}.ts` (+ `draft.test.ts`,
`screens.test.ts`, `screens.loaders.test.ts`);
`lib/modules/iee/actions/library.ts` (+ test);
`lib/modules/iee/catalog/diff.ts` (+ test);
`components/admin/constructor/{LibraryBrowser,PackEditor,EntryEditor,parts,issue-text,use-library-action}.tsx|ts`,
`components/admin/constructor/entry/{editor-context,BasicsBlock,UsageBlock,DurationBlock,LimitsBlock,InteractionBlock,RulesBlock,ops,SidePanel}.tsx`
(+ tests, `fixtures.test-helpers.tsx`);
`components/admin/RevisionDiff.tsx`; `components/iee/PlayerEntryCard.tsx`;
`lib/i18n/dictionaries/{en,ru,uk}/ieeEditor.ts`. Changed
`lib/engine/iee/dsl/{check,index}.ts`;
`lib/modules/iee/library/{service,index}.ts`, `.../service.test.ts`;
`lib/modules/iee/actions/index.ts`;
`lib/modules/iee/catalog/{repository,index}.ts`;
`app/admin/catalog/page.tsx`; `app/admin/seasons/[id]/page.tsx`;
`components/admin/{IeeCatalogTabs,IeeStage,SeasonSettingsForm}.tsx`,
`components/admin/IeeStage.test.tsx`;
`components/dashboard/InventoryPanel.tsx`;
`lib/i18n/dictionaries/index.ts`, `lib/i18n/dictionaries/{en,ru,uk}/{iee,admin}.ts`;
`AGENTS.md`, `docs/DESIGN.md`, `docs/IEE_CONSTRUCTOR_SPEC.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Stage 3 is done. Stop; on the owner's go-ahead, stage 4 — entry
scenarios, the sandbox, power and suggested rarity, the drop table and the
simulator (plan §7).

---

## 2026-10-08 — Session 18 · Stage 3, part 5 (publish, export, import, the revision diff)

**Goal.** Plan §6 task 3.4.

**Done.**

- **Publish** from the editor (the draft is saved first when it has unsaved
  work; a refused publish is an error toast with the checks, not a success)
  and from the pack screen, which lists beforehand what publishing would do —
  ready drafts, and blocked ones with their checks — from `planInStore`, the
  planning half of `publishInStore` split out so the preview and the publish
  cannot disagree. A draft equal to an older revision is neither offered nor
  published (the content hash already exists).
- **Export** — a server action returns the `.ggpack` (base64), the browser
  saves it; "Full history" exports every revision. **Import** — a `.ggpack`
  upload with a report (pack added / updated / unchanged, entries, revisions
  added, local drafts kept) and a link to the pack. No new HTTP route.
- **Copy** — `copyEntry` (library use case, audited `iee_entry_copied`): any
  entry, `core`'s included, into a pack that may be changed, from its latest
  revision, references unchanged, the icon shared. Offered on the pack screen
  and in the editor ("Copy to my pack" on a read-only entry).
- **The diff before a switch** (spec §4.2): `revisionDiff` compares two
  revisions' views — name, rule text, flavor per locale, character, rarity,
  tags, usage, duration, stacking, power — and says when nothing a player sees
  changes. The wizard's newer-revision block shows it above "Switch to the
  latest"; the revision picker opens it in a modal and switches only on
  confirmation.
- **Attach to a season** — the pack screen picks a season and opens
  `/admin/seasons/<id>?stage=iee&pack=<id>`: the wizard opens on the IEE stage
  with the pack filter set (`initialStage`, `initialPack`). A pack hidden from
  seasons says so instead.

**Decided.**

- Export goes through a server action, not a route handler: the pack is small,
  the action reuses the library's admin check and audit, and `lib/api` needs
  no new endpoint.
- The pack form sends only the fields that changed, so `iee_pack_updated`
  lists what a save touched.

**Verification.** Unit and component tests for the above; the full suite in
session 19.

---

## 2026-10-08 — Session 17 · Stage 3, part 4 (the right-hand panel)

**Goal.** Plan §6 task 3.3: the card as a player sees it, the rule text in
three languages, the power, the checks.

**Done.**

- `analyzeDraft` (`lib/modules/iee/library/draft.ts`) — the same `checkEntry`
  the server runs on save and publish, against what publishing resolves
  references to (latest revisions); then a readable copy of the draft — the
  frame repaired, every rule that does not check left out, a reference to an
  unpublished packmate kept and named — for the rule text, each rule's
  sentence, the power and whether an action harms the chosen player. A draft
  that does not parse still reports every finding: the repaired frame's own
  checks join the shape errors, pointed back at their rules.
- The panel (`entry/SidePanel.tsx`): the **dashboard's own card** — the
  inventory card for an item, the status card with its duration meter for an
  effect (`components/iee/PlayerEntryCard.tsx`, extracted from
  `InventoryPanel`) — with a RU/EN/UK switch; the rule text in all three
  languages; power; checks — errors and warnings in the reader's language,
  each a button that scrolls to its block or rule; revisions (UTC, so the
  first paint hydrates) and the seasons that attach the entry, at which
  revision.
- Findings carry **`params`** (`Issue.params` in `check.ts`): the operation,
  trigger, parameter, entry, locale or limit they are about. The editor builds
  its sentence from the code and the params (`ieeEditor.issues`), shape errors
  from the field (`issue-text.ts`); the English `message` stays for logs.
- The flavor line now shows on player cards (the inventory and status panels
  and the preview) under the rule text — it was in the view and drawn nowhere.

**Decided.**

- Suggested rarity stays with stage 4 (plan task 4.3): the panel shows the
  power only; the costs are not calibrated yet.
- The preview never goes blank: a half-built rule drops out of the text with an
  amber note on its card, the rest still reads.

---

## 2026-10-08 — Session 16 · Stage 3, part 3 (rules: When · If · Do)

**Goal.** Plan §6 task 3.2, the rules block.

**Done.**

- `lib/engine/iee/dsl/placement.ts` — what an entry of a kind may have rules
  on (`triggersFor`), what a trigger may check and run (`conditionsAt`,
  `actionsAt`), and whether a rule has a chosen player (`hasTargetAt`,
  `recipientsAt`); `AVAILABLE_STAGES` moved here. `checkEntry` uses the same
  helpers.
- The rule card (`entry/RulesBlock.tsx`): order (early / normal / late), move,
  remove; **When** — the kind's triggers with a hint; **If** — conditions with
  typed fields (result chips, cell-type chips, a percent value, "has an item or
  effect" by entry, tag or character, the holder or the chosen player), "Add
  condition…" offering only what the moment can check; **Do** — actions with
  typed fields (distance, dice count and sides, points and recipient, an
  entry picker grouped by pack that offers only the right kind, cleanse by
  character, tags and count), "Add action…" offering only what the moment can
  run; **Reads** — the rule's sentence.
- Values (`entry/ops.tsx`): Number / Parameter / Random. Switching to
  Parameter declares one from the current number (`declareParam`: named after
  the field, bounds that keep the sign); a parameter is renamed or removed in
  Limits, the rules following (`renameParam`, `removeParam` — removal leaves the
  default as a plain number).
- A test holds the editor to its promise: for every kind and aim, every
  trigger, every condition and action offered there, in its default shape,
  passes the checks.

**Decided.**

- A rule whose trigger changes keeps its conditions and actions; what no
  longer fits is marked with the check's sentence, not silently dropped.
- New actions lean the entry's way (a penalty's distance starts at −1); one
  that hands something out waits for the entry to be picked.

---

## 2026-10-08 — Session 15 · Stage 3, part 2 (the entry editor's forms)

**Goal.** Plan §6 task 3.2: basics, usage, duration and stacking, limits,
interaction; saving a draft.

**Done.**

- `lib/modules/iee/library/draft.ts` (client-safe): `editableDraft` keeps
  whatever has the right shape in a stored draft and fills the rest;
  `cleanDraft` is what is saved (trimmed, no empty translations or flavor, no
  default priority, tags once, the other kind's blocks dropped) — a `core`
  document survives the round trip unchanged; `withKind` before the first
  publish; `skeletonDraft` moved here from the service.
- Blocks (`components/admin/constructor/entry/`): **Basics** — kind (fixed
  after the first publish), slug, names and flavor in three languages,
  character, rarity, glyph picker, icon upload (stored at once — icons belong
  to the entry, spec §12); **Usage** (items) — activation, window, target,
  charges; **Duration and stacking** (effects) — unit and count, a second one
  refused / refreshes / stacks, the maximum; **Limits** — the parameters a
  season may tune with their bounds and uses; **Interaction** — tags (the base
  taxonomy, the library's, one's own), whether protection will react, what the
  entry hands out and what hands it out. What a later wave brings is not
  offered; a hint says when it comes.
- Save (button, Ctrl/Cmd+S), an unsaved-changes badge, a warning on leaving.

**Decided.**

- Item uniqueness, target filters, passive and cursed items, protection tiers
  and the `instant` / `next_game` units are not offered until their waves:
  "incompatible options are not offered at all" (the approved proposal).
- "Limits" holds the parameters — the entry's bounds on what a season may
  tune; there is no per-entry drop limit in DSL v1 (those are the season's).

---

## 2026-10-08 — Session 14 · Stage 3, part 1 (plan; the library and pack screens)

**Goal.** Plan §6 task 3.1: `/admin/catalog` gets the constructor — tabs
Library, Pack, Entry editor — admin-only.

**Stage plan** (sessions 14–19): 14 — tabs, the library and pack screens,
actions; 15 — the editor's forms; 16 — rules; 17 — the right-hand panel; 18 —
publish, export, import, the revision diff; 19 — tests, docs, the live gate.

**Done.**

- `/admin/catalog` tabs: admins get **Library**, and **Pack** / **Entry** while
  one is open, before the browse tabs (Items, Effects, Events); judges keep
  the browse tabs and events, and a library tab in the URL sends them there.
  The page reads `?tab=library|pack|entry` with `pack=` / `entry=`; an unknown
  id is a 404.
- Read models (`lib/modules/iee/library/screens.ts`): `buildLibraryModel` —
  each entry's state against its latest revision (never published / published
  as it is / changed since rN), its draft's checks, rule text and power, the
  facts other drafts resolve it by, each pack's counts, dependencies and
  dependents, what may be changed; loaders `libraryScreen`, `packScreen`,
  `entryScreen` (admin-only).
- Server actions (`lib/modules/iee/actions/library.ts`) over the library's use
  cases, which check the admin and audit: packs (create, update, archive,
  icon), entries (create, copy, archive, icon, save a draft, publish), packs
  published, imported, exported. Results are `ActionState` with a translated
  message and the data the screen needs.
- The library screen (`LibraryBrowser`): pack cards, entries with the shared
  filter bar (kind, character, rarity, state, pack), a new pack, an import.
  The pack screen (`PackEditor`): metadata and icon, entries with revisions,
  new entry, archive and restore, dependencies.
- Strings: a new dictionary namespace `ieeEditor` (en/ru/uk).

**Decided.**

- Tabs on one page (`?tab=`), as the catalog already did, rather than new
  routes; the editor is keyed by entry, so opening another entry starts fresh.
- Drafts are saved explicitly, not on every keystroke: each save is an audit
  row.

---

## 2026-10-08 — Session 13 · Stage 2, part 4 (icons; stage gate)

**Goal.** Plan §5 task 2.6 — the `iee_icon` file category and the icon
fallback chain — then the stage-2 gate.

**Done.**

- **File category `iee_icon`** (spec §12): PNG or WebP, square, 64–512 px,
  ≤ 256 KB, public, admin uploads, removed by the library only. Categories
  can require a square image now (`fileImageNotSquare`, en/ru/uk). The files
  module finds a live file by checksum, and lets the code that owns a file
  remove it without an actor.
- **`lib/modules/iee/library/icons.ts`** — icons behind an interface
  (`IconFiles`): one stored copy per content (by checksum), read back for
  export, removed once no pack or entry points at it (`iconUsers` in the
  library store), with a memory double for tests.
- **Library use cases** `setEntryIcon` / `setPackIcon` — admin, the system
  pack read-only, audited (`iee_entry_icon_set`, `iee_pack_icon_set`); the
  picture is stored first and removed again if the change is refused; the one
  it replaces goes when nothing uses it. The editor's UI arrives in stage 3.
- **`.ggpack` icons** (§11): export writes `icons/<slug>.<ext>` and
  `icons/_pack.<ext>` (`_pack_icon` beside an entry called `_pack`); import
  stores the file's icons before its transaction, refuses an icon the
  category refuses (naming its path), removes what it stored if the import is
  refused, reuses a stored copy of the same bytes, and leaves an installed
  icon alone when the file names none. `pnpm iee:import <file>` imports any
  pack (the shell stands in for the admin; `core` stays read-only);
  `pnpm iee:export` writes the icons and compares them too before rewriting a
  file.
- **The view draws** (`EntryView.art: { iconUrl, packIconUrl, system }`): the
  registry and the library views fill it from the entries, their packs and
  the live icon files; `coreRegistry()` draws as the system pack.
  **Fallback chain** in `iconSource` (`components/iee/IeeIcon.tsx`): the
  entry's icon → the artwork shipped in `public/iee`, for the system pack only
  → the entry's glyph → the pack's icon → the kind's glyph. `IeeIcon` and
  `IeeArtTile` take `art`; the catalog page, the wizard, the wheel, the rules
  page, the inventory and status panels and the bots roster pass it.
- Docs: spec §8 (`art` in the view), §11 (icons in a pack file), §12 (one copy
  per content; icons belong to the entry, not a revision; the use cases);
  `AGENTS.md` (the two kinds of picture, the CLI); `DESIGN.md` (the chain).

**Decided.**

- An icon belongs to the entry, not to a revision: a held older revision draws
  with the entry's current icon. The spec's "deleted only when no published
  revision references it" becomes "removed once no pack or entry points at
  it" — no revision references a file.
- Icons are stored before the import's transaction (the files module writes
  outside it), and an import cleans up after itself instead.
- Shipped artwork is the system pack's: another pack's entry with the same key
  does not borrow it.
- A file that names no icon for an entry leaves the installed one alone, so a
  boot re-import of `core` can never wipe an icon.
- The schema needed nothing new — the `icon_file_id` columns came with
  session 1 — so migration `0022` stands as the stage's one migration.

**Verification.** `pnpm verify` green — **291 files / 3603 tests** (+38);
coverage 82.5 % st / 74.4 % br / 77.7 % fn / 83.7 % ln. **Stage-2 gate, live**
(scratch Postgres, `pnpm dev`, Playwright): a test pack with a pack icon and an
entry icon (`spooky`, its `curse` hands out `core`'s `swamp`) imported through
`pnpm iee:import <file>` — two files stored, a second import changes nothing;
exported, imported into an empty database (push → `core` → the file), exported
again: the same manifest and byte-identical icons; `core` exports back as
`seed/iee/core.ggpack` ("already holds this content"). The catalog page draws
`curse` with its icon; attached in the wizard and alone on the bonus wheel, a
turn drops it — the wheel and the inventory draw the uploaded icon, served by
`/api/files`. The database refuses to delete the revision the season pins and
the revision a live instance holds.

**Files** (not committed): new `lib/modules/iee/library/icons.ts` (+ test,
`memory-icons.test-helpers.ts`), `lib/modules/iee/catalog/art.ts`; changed
`lib/modules/files/{service/categories,service/storage,repository/files}.ts`,
`lib/modules/iee/library/{index,service,store,transfer,memory-store.test-helpers}.ts`,
`lib/modules/iee/catalog/{library,repository,views,fixtures.test-helpers}.ts`,
`lib/modules/iee/registry/{index,catalog.test-helpers}.ts`,
`lib/engine/types/iee.ts`, `lib/engine/iee/dsl/tuning.ts`,
`components/iee/{IeeIcon,IeeArtTile}.tsx`, `components/iee/art.ts`,
`components/admin/{BotRoster,IeeCatalogBrowser,IeeStage}.tsx`,
`components/dashboard/InventoryPanel.tsx`, `components/game/WheelOverlay.tsx`,
`components/rules/AutoRulesView.tsx`, `scripts/iee-pack.ts`, the tests next to
them, `lib/i18n/dictionaries/{en,ru,uk}/{core,admin}.ts`, `AGENTS.md`,
`docs/DESIGN.md`, `docs/IEE_CONSTRUCTOR_SPEC.md`, this journal,
`docs/WORKLOG.md`.

**Stage 2 is done; stop — waiting for the go-ahead for stage 3 (the editor).**

---

## 2026-10-08 — Session 12 · Stage 2, part 3 (the season catalog)

**Goal.** Plan §5 tasks 2.1 (the rest), 2.5 and 2.7: the season catalog
replaces `seasons.config.iee.entries`; the registry is built from the database;
the wheel and every grant play the catalog; the season-wide limits; the
instances' foreign keys; the wizard stage; the stage's one migration.

**Done.**

- **Engine.** `SeasonCatalogEntry` and its strict schema (≤ 500 rows; pool,
  rarity override, weight 0–10 000, the gates, parameter, duration and target
  overrides). `IeeConfig` loses `entries` and gains the limits of spec §4.5
  (`maxActiveEffectsPerPlayer`, `tagLimits`, `disabledTags`, `powerCeiling`,
  `boardObjectsPerPlayer`); a stored config that still has `entries` parses
  and drops it on the next save. `lib/engine/iee/catalog.ts` folds a row into
  what the wheel reads (pool → wheel, rarity tier, tags, stacking) — one
  function for the registry and the wizard's preview. New gates
  `disabled_tag`, `effect_limit`, `tag_limit` (a `refresh` effect the player
  holds is exempt: refreshing adds no instance); the picker reads the
  season's tuning by key and the player's active instances per tag.
- **`lib/modules/iee/catalog/`.** `store.ts` — the only writer of
  `season_catalog` (architecture test). `library.ts` — the library as a season
  sees it (entries with a published revision, whether the library still
  offers them). `normalize.ts` — the checks of every save: shape, unknown
  entry, an entry twice, an entry the library no longer offers (unless the
  season already plays it), a revision of another entry or one that no longer
  reads; then the closure — what an attached revision references, the keys
  the season's challenges reward, and what the revisions live instances hold
  reference, attached switched off at their latest revisions; keys unique in a
  season; the diff. `service.ts` — `saveSeasonCatalog` inside the settings
  transaction (writes only the difference), `auditCatalogSave` →
  `season_catalog_updated` by key, after the commit. `repository.ts` — the
  play set (the catalog with its documents plus the revisions only live
  instances hold), held revision ids, usage per entry. `views.ts` — every
  revision compiled for the wizard with its power, the latest views for the
  catalog page, the keys a reward may name. `edit.ts` — the wizard's pure
  edits, shared with the client: attach (with what it hands out), detach
  (kept, switched off, while something hands it out), pin a revision, tune,
  prune what nothing hands out any more. `editor.ts` — the server's read
  models.
- **Registry.** `getSeasonRegistry(seasonId)` compiles the play set, cached by
  revision ids (LRU, 64 sets); the tuning is applied per call from the rows. A
  key or an entry id finds only what the catalog attaches; a revision id also
  finds the revisions live instances hold, and `instanceView` draws an
  instance from its own revision. `pool()` feeds the rules pages.
  `coreRegistry()` stays the fixture for tests and tools;
  `catalogRegistry()` (tests) closes over references the way the server does.
- **Executor.** `blocked_limit`: a disabled tag refuses a grant from any
  source; the effect cap and the tag limits refuse a new instance, never a
  refresh; refusals are journaled as no-ops with their reason. The wheel
  shows "nothing" if a stale context lets one through. A challenge reward that
  does not land is logged (`iee.event.reward_not_granted`) and the rest of the
  reward still lands. Reward keys are checked against the library
  (`assertRewardKeys`) instead of the code fixture.
- **Wizard** (IEE stage, rewritten). One row per library entry in the pool it
  drops from; the switch means "drops"; a pack filter when the library has
  more than one pack; badges for the pack, the pinned revision and power over
  the season's ceiling; a "r{n} is available" block with "Switch to the
  latest"; "Handed out by … — attached, does not drop" and "no longer
  offered" notes; advanced: revision, pool, weight and the gates; a limits
  card; presets and bulk switches attach at the rarity weight; the drop table
  and the simulation call the wheel's own functions over the rows being
  edited. `SeasonSettingsForm` keeps the rows, counts them as edits of the
  stage, empties them on a stage reset and sends them as `ieeCatalog`; the
  action passes them on and `updateSeasonSettings` saves them in the settings
  transaction together with the challenge reward keys.
- **Pages.** The rules pages print each entry's drop slot from the catalog;
  the dashboard draws items and statuses from the revision they hold; the
  catalog page browses the library (usage per entry id); moderation reads the
  reward keys from the library; the bots page takes the season's views.
- **Schema.** `iee_instances.entry_id` → `iee_entries`, `revision_id` →
  `iee_entry_revisions`, both `RESTRICT`. **Migration
  `drizzle/0022_iee_constructor_library.sql`** — the whole stage-2 schema
  (library tables, the catalog, the instance keys), generated against 0021,
  plus two hand-written statements: delete instances that predate the library
  (only a database that ran the stage-1 code has any) and drop
  `config.iee.entries`.
- Seed: the demo season attaches a tracer catalog (`hex_scroll`, `swamp`).
- i18n (en/ru/uk): errors `ieeCatalogInvalid`, `ieeCatalogUnavailable`,
  `ieeCatalogMissingDependency`, `ieeCatalogDuplicateSlug`; the reward key
  errors name the library; audit action `season_catalog_updated` and its
  fields; the stage's strings.
- Scenarios: SC-POOL-5 (live: switching a revision changes later drops only),
  SC-POOL-6 (a limit holds for an item as for the wheel), SC-POOL-7 (a
  disabled tag takes an entry out) — 72 in all, 60 run by `pnpm test`.
- Docs: spec §4.2 (what a catalog holds), §4.5 (how the limits hold), §7.11,
  §8 (lookups, `instanceView`), §10.3; `AGENTS.md` (the catalog module, a
  recipe); `DESIGN.md` (catalog rows).

**Decided.**

- `enabled = false` is "attached, does not drop": dependencies and reward
  entries are attached that way. The client closes over references for
  display; the server re-checks and closes over everything, and the settings
  and the catalog save together or not at all.
- What the revisions live instances hold hand out stays attached, even from an
  archived pack — otherwise switching a revision could leave a held item that
  no longer compiles.
- A lookup by key or entry id never reaches an entry the season does not play,
  so a stale reward or reference is refused (journaled and logged) instead of
  granting something the season never attached.
- The limits live in two places on purpose: the gates keep the wheel honest
  (no slice that cannot be granted), the executor holds the line for items,
  rules and rewards.
- No data migration (spec §4): after the upgrade a season's catalog is empty
  until an admin attaches entries in the wizard; stage-1 instances are deleted
  by the migration (dev databases only — production never ran stage 1).
- The stage's migration is generated now: the schema is final (icons use the
  `icon_file_id` columns that exist). Should session 4 need a column, 0022 is
  regenerated, not followed by a 0023.

**Verification.** `pnpm verify` green — **290 files / 3565 tests** (+144);
coverage 82.3 % st / 74.2 % br / 77.4 % fn / 83.6 % ln. Migration: a database
built from the 23 migrations equals one built by `db:push` (columns,
constraints, indexes, enums); a database at 0021 with a stage-1 instance and an
`entries` map upgrades through 0022 cleanly. Live, against a fresh database
(push → import → seed) and `pnpm dev`, driven by Playwright: the wizard
attaches Ward and Jinx (Unlucky comes along switched off, with its note) and
writes the audit row; a bonus turn drops Ward from the catalog, at the 25.8 %
the wizard's drop table showed; the database refuses to delete the pinned
revision, and the revision a live instance holds even after its catalog row is
gone — while the instance still shows on the dashboard; a second `swamp`
revision appears as "r2 is available", the switch is audited as `switched`,
the rules page shows 4 moves and the status a player already had keeps "Lasts
2 moves" (SC-POOL-5); board, leaderboard, players, bots and season rules pages
render without errors.

**Files** (not committed): new `lib/engine/iee/catalog.ts`,
`lib/modules/iee/catalog/{index,store,library,normalize,service,repository,views,edit,editor}.ts`
(+ tests, `fixtures.test-helpers.ts`, `fakes.test-helpers.ts`),
`lib/modules/iee/registry/catalog.test-helpers.ts`,
`drizzle/0022_iee_constructor_library.sql`, `drizzle/meta/0022_snapshot.json`;
changed `db/schema/iee.ts`, `drizzle/meta/_journal.json`,
`lib/engine/{types/iee,config/iee,config/defaults}.ts`,
`lib/engine/iee/{index,scenarios}.ts`, `lib/engine/iee/dsl/tuning.ts`,
`lib/engine/iee/selection/{gates,pick}.ts`,
`lib/modules/iee/{registry/index,executor/index,repository/counters,repository/events,service/catalog}.ts`,
`lib/modules/game/service/{iee,events}.ts`,
`lib/modules/catalog/pool/season-setup.ts`,
`lib/modules/season/{service/seasons,actions/seasons/index,actions/seasons/form}.ts`,
`components/admin/{IeeStage,SeasonSettingsForm,IeeCatalogBrowser}.tsx`,
`components/rules/AutoRulesView.tsx`, `app/(public)/{dashboard,rules}/page.tsx`,
`app/(public)/seasons/[slug]/rules/page.tsx`,
`app/admin/{catalog,moderation}/page.tsx`,
`app/admin/seasons/[id]/{page,bots/page}.tsx`, `scripts/seed-demo.ts`,
`lib/architecture.test.ts`, the tests next to every changed module,
`lib/i18n/dictionaries/{en,ru,uk}/{core,admin,iee}.ts`, `AGENTS.md`,
`docs/DESIGN.md`, `docs/IEE_CONSTRUCTOR_SPEC.md`,
`docs/ITEMS_EFFECTS_SCENARIOS.md` (regenerated), this journal,
`docs/WORKLOG.md`.

**Next.** Session 4 of stage 2 — icons: the `iee_icon` file category, the
fallback chain in `IeeIcon` / `IeeArtTile`, `iconUrl` in the view, icons in
`.ggpack` export and import (task 2.6); the gate's live check (a season playing
published revisions; export → import into an empty database → export gives the
same manifest; a pinned revision cannot be deleted); `pnpm verify`; then stop
at the stage-2 gate.

---

## 2026-10-07 — Session 11 · Stage 2, part 2 (`.ggpack`, the `core` pack, curation)

**Goal.** Plan §5 tasks 2.3–2.4: packs move between installations as
`.ggpack` files; `seed/iee/core.ggpack` becomes the source of the system pack,
loaded by the seed and on boot; `core` is curated to the starter set's core
wave.

**Done.**

- **Zip** (`lib/infrastructure/zip/`), no dependency: CRC-32, deflate through
  `node:zlib`, deterministic output (fixed DOS timestamps, UTF-8 names, stored
  when deflate does not help). Reading refuses encryption, unknown methods,
  unsafe names, CRC mismatches and anything past the caps (2 000 files, 16 MB
  each, 64 MB in total); checked against an archive written by Python's
  `zipfile`.
- **`ggpack.ts`** — the manifest of spec §11 as a strict schema; encode and
  decode, icon paths checked both ways; `manifestContent` (the manifest
  without its export time); **revision ids**: UUID v5 of the entry id and the
  content hash.
- **`transfer.ts`** — export: the latest revision of each published, active
  entry (or the whole history), and as dependencies the packs the exported
  documents reach. Import: frame checks (versions, hashes, order, kinds,
  slugs) and every refusal — missing dependency, `core` read-only, a slug
  owned by another pack or entry, an entry of another pack, a change of kind,
  the publish checks over every revision, references outside the pack and its
  dependencies, the set checks together with the pack's installed entries —
  before the first write; then the pack, entries (renamed when the file
  renames them), revisions numbered after the local ones with derived ids,
  the latest pointer, drafts (replaced unless they hold unpublished work,
  which the report lists) and dependencies. Use cases: `importPack` (admin,
  audited `iee_pack_imported`), `importSystemPack` (no actor, a log line),
  `exportPack` (admin, audited `iee_pack_exported`).
- **`seed/iee/core.ggpack`** — 16 entries. `pnpm iee:core` renders
  `lib/engine/iee/core-docs/core.generated.ts` from it (`core-fixture.ts`);
  `core-docs/index.ts` re-exports it with the same shape as before, so pure
  tests, the scenario document and the registry read the pack;
  `core-pack.test.ts` fails when the two drift apart.
- **Curation** (spec §17, task 2.4). Renamed, ids kept: `speed_boots`
  «Сапоги скорости» (was `lodestone`), `swamp` «Болото» (was `slowed`),
  `toll` «Пошлина» (was `taxed`), `ward` «Оберег» (was the effect `shield`).
  Movement statuses count **moves** now, as their rule says: `swamp` 2,
  `toll` 3, `tailwind` 1 (were rolls). New: `acceleration` «Ускорение» (+1 cell
  for 2 moves, refresh) and `poison` «Отравление» (−1 cell until 2 passed
  games; dropped games do not count; refresh). New glyphs `ForwardIcon`,
  `EyeDropperIcon`. The set compiles with no errors and no warnings.
- **Scenarios** follow the renames (SC-SWAMP, SC-TOLL, SC-WARD,
  SC-SPEEDBOOTS) and grow from 58 to 69: SC-SWAMP-6 (a cancelled move does not
  count), SC-TOLL-5 (exactly three moves), SC-TAILWIND-4 (exactly one move),
  SC-ACCEL-1…4, SC-POISON-1…4 (dropped games do not count). 58 run in
  `pnpm test`, 11 are live.
- **Commands.** `pnpm iee:import` (core, idempotent), `pnpm iee:export <slug>
  [file] [--history]` (leaves the file alone when its content is unchanged),
  `pnpm iee:core`; `pnpm db:seed` is defined at last (`db:setup`, the
  entrypoint and the docs called it). `pnpm dev` imports `core` right after
  `db:push`, the container entrypoint likewise, and the seed imports it first.
  `.gitattributes`: `*.ggpack binary`.
- Error codes `ieePackInvalid`, `ieePackTooNew`, `ieePackDependencyMissing`,
  `ieeEntryInOtherPack`; audit labels `iee_pack_imported`,
  `iee_pack_exported` — en/ru/uk. Comments and docs that named the old keys
  follow the renames; `lib/engine/iee-shield.test.ts` became
  `iee-ward.test.ts`.
- Spec §4.2, §10.2, §11 record the derived revision ids and the import rules;
  `AGENTS.md` gains the commands, a recipe for changing `core` and the
  library in the codebase map.

**Decided.**

- Revision ids are derived (UUID v5 of entry id and content hash). A pack file
  carries no revision ids, yet every installation — and the engine's
  fixture — agrees on them; revision numbers stay local.
- The committed pack carries the latest revision of each entry; history lives
  in the installations that played it.
- An import refuses everything it can before writing. The transaction would
  undo a half import anyway; an import that cannot succeed should not start.
- A slug held by another entry of the pack refuses the import even when the
  same file renames that entry: renames are applied one at a time.
- The duration units follow the rule text: statuses that change a move count
  moves (a cancelled move does not use them up), dice statuses and `momentum`
  keep counting rolls, `heavy_boots` keeps its one roll until wave A.
- Seasons configured before this session name the old keys in
  `config.iee.entries`, which drops those entries from their pool; no data
  migration (spec §4), and session 3 replaces that config with the season
  catalog anyway. Instances granted under the stage-1 fixture's revision ids no
  longer resolve.

**Verification.** `pnpm verify` green — **281 files / 3421 tests** (+100);
coverage 81.7 % st / 73.5 % br / 76.1 % fn / 83.0 % ln. Against a scratch
database built by `db:push`: `pnpm iee:import` adds the pack, 16 entries and
16 revisions with the derived ids, a second run adds nothing; `pnpm iee:export
core` gives the committed manifest (`seed/iee/core.ggpack` "already holds this
content"); `pnpm db:seed` and `pnpm dev` (push → import → server ready) run
through.

**Files** (not committed): new `lib/infrastructure/zip/index.ts` (+ test),
`lib/modules/iee/library/{ggpack,transfer,core-fixture}.ts` (+ tests
`ggpack`, `transfer`, `core-pack`), `lib/engine/iee/core-docs/core.generated.ts`,
`seed/iee/core.ggpack`, `scripts/{iee-core,iee-pack}.ts`,
`scripts/lib/iee-core-pack.ts`, `lib/engine/iee-ward.test.ts` (was
`iee-shield.test.ts`, deleted); changed `lib/engine/iee/core-docs/{index,core-docs.test}.ts`,
`lib/engine/iee/scenarios.ts`, `lib/modules/iee/scenarios.test.ts`,
`lib/modules/iee/library/{index,service,publish}.ts`,
`lib/engine/iee/dsl/glyphs.ts`, `components/iee/{IeeIcon,IeeArtTile}.tsx`,
`lib/modules/game/service/turn.ts`, `lib/engine/config/iee.ts`,
`lib/engine/iee/resolve/hooks.ts`, the tests that named the old keys (17
files), `lib/i18n/dictionaries/{en,ru,uk}/{core,admin}.ts`, `package.json`,
`scripts/{dev,seed-demo,scenarios-doc}.ts`, `docker/entrypoint.sh`,
`.gitattributes`, `vitest.config.mts`, `AGENTS.md`, `docs/DESIGN.md`,
`docs/IEE_CONSTRUCTOR_SPEC.md`, `docs/ITEMS_EFFECTS_SCENARIOS.md`
(regenerated), this journal, `docs/WORKLOG.md`.

**Next.** Session 3 of stage 2 — the season catalog (attach revisions with
their dependencies, per-entry tuning), the registry built from the catalog and
the live instances' revisions, the wheel reading `season_catalog`,
`seasons.config.iee.entries` removed, the season-wide limits, the instances'
foreign keys, the wizard stage; the stage's one migration (tasks 2.1, 2.5,
2.7).

---

## 2026-10-07 — Session 10 · Stage 2, part 1 (library schema and service)

**Goal.** Plan §5 tasks 2.1–2.2: the definition tables and the library that
writes them — packs, entries, drafts, revisions, publish, archive, pack
dependencies, all admin-only and audited.

**Done.**

- **Schema** (`db/schema/iee.ts`, `enums.ts`): enums `iee_entry_kind`,
  `iee_character`, `iee_rarity`, `iee_pack_visibility`; tables `iee_packs`,
  `iee_pack_dependencies`, `iee_entries`, `iee_entry_revisions`,
  `season_catalog` exactly as spec §4.2 — `RESTRICT` from entries to packs,
  from revisions to entries and from the catalog to revisions, unique
  `(entry_id, number)` and `(entry_id, content_hash)`, slug and locale checks
  in the database.
- **`lib/modules/iee/library/`** — `store.ts` (the only writer of the four
  definition tables; no update or delete of a revision exists),
  `service.ts` (create, update and archive packs; create and archive
  entries; save drafts; publish an entry or a whole pack; overview),
  `publish.ts` (the publish plan and the content hash), `refs.ts` (entry
  references read out of rules), `context.ts` (the admin guard, one
  transaction per use case, `IEE_CORE_EDITABLE`).
- **Rules held.** Admin only (D1; a judge is refused with `ieeAdminRequired`).
  A draft may be any JSON object up to 64 KB and is saved as it is; its slug
  and, until the first publish, its kind carry over to the entry, and the
  save returns the checks the editor will show. Publish runs the engine's
  checks (§14) over every draft published together, so drafts may reference
  each other; a failing draft takes the ones that reference it down with it,
  and the loop runs until nothing else drops out. A revision is new only when
  its canonical-JSON sha-256 differs from every earlier one — the same
  content twice, or a return to an older content, is a no-op. A published
  entry cannot change kind. Pack dependencies follow the references in the
  active entries' drafts and latest revisions. The system pack is read-only
  unless `IEE_CORE_EDITABLE=1` and is never archived. Every mutation writes
  `logAdminAction` (nine new action types, labelled in en/ru/uk).
- **Invariants** in `lib/architecture.test.ts`: only the library's store
  writes the definition tables; nothing updates or deletes a revision; only
  the library opens its store.
- Error codes `ieeAdminRequired`, `ieePackNotFound`, `ieeEntryNotFound`,
  `ieeCoreReadOnly`, `ieeArchived`, `ieeSlugInvalid`, `ieeSlugTaken`,
  `ieeKindLocked`, `ieeDraftInvalid`, `ieeDraftTooLarge` in en/ru/uk.

**Decided.**

- The game is untouched this session: the registry still serves the code
  fixture, and the instances' foreign keys to entries and revisions arrive
  with the switch to the catalog (session 3), once `core` is imported with
  its fixed ids (session 2). Removing `seasons.config.iee.entries` and the
  season-wide limits go with that switch too.
- One migration for the stage, generated when its schema is final; dev
  databases follow through `db:push` meanwhile, as in stage 1.
- Grant cycles are checked inside the set being published plus the rest of
  the pack; a cycle across packs would need packs that depend on each other,
  and is left to the registry's load-time check.

**Verification.** `pnpm verify` green — **277 files / 3321 tests** (+62);
coverage 81.1 % st / 73.2 % br / 75.6 % fn / 82.5 % ln. The new tables were
pushed onto a scratch database built from the 22 migrations; the generated SQL
was reviewed.

**Files** (not committed): `db/schema/{enums,iee}.ts`, new
`lib/modules/iee/library/{index,context,store,service,publish,refs}.ts` (+
tests and `memory-store.test-helpers.ts`), `lib/architecture.test.ts`,
`lib/i18n/dictionaries/{en,ru,uk}/{core,admin}.ts`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 2 of stage 2 — `.ggpack` export and import,
`seed/iee/core.ggpack` loaded by seed and boot, and `core` curated to the
starter set's core wave (tasks 2.3–2.4).

---

## 2026-10-07 — Session 9 · Stage 1, part 8 (live check; stage gate)

**Goal.** Plan §4 task 1.12: the game on the new core against a real
database and the real UI — wheel drops, «Свиток порчи» on a bot, expiry,
staff intervention, season reset — plus the 11 `live` scenarios the unit
suite cannot run.

**Setup.** A scratch PostgreSQL 16 database built from the 22 migrations
(so `0021_iee_constructor_core` ran for real), `scripts/seed-demo.ts`, `pnpm dev
--no-bots`, and a Playwright driver clicking through the pages as a player
would: the dev admin and dev player, a second player registered through
`/register`, one bot created in the bots console. Landings were steered by
retyping the board between turns (every cell bonus, penalty, normal or event)
and the wheel pool was tuned through the season editor's Items & Effects
stage. The points rule `bonusAddsToRollOnPass` was switched off so balance
changes stay visible; the catalog got 60 extra scratch games once the second
player had been dealt all eight.

**Checked — the plan's five.**

- **Wheel drops.** Penalty cells dropped `slowed`, then `heavy_boots` and
  `taxed`; bonus cells dropped `hex_scroll`, `cleansing_salve`, `shield`,
  `momentum`, `lodestone` and `spare_die`, each from a one-entry pool. The
  wheel showed the entry view (name, generated rule text, "100.0% chance");
  each drop is one `grant` journal row with its source, move and the wheel's
  draw, and a public feed row.
- **«Свиток порчи» on a bot.** Used from the inventory on "Test bot 1": the
  scroll ended (`used`), the bot got `slowed` owned by the caster, the feed
  row names item, status and target. Two console ticks per roll: the bot's
  next two moves were one cell short (`fire` + `tick` rows), then the status
  ended `expired` with a public `effect_expired`.
- **Expiry.** The same on a player (5→6 and 6→7 on dice of 2, then
  `expire`), and for `tailwind`, `momentum`, `taxed` and the spent `shield`.
- **Staff intervention.** From the players page: `momentum` and a held
  `spare_die` removed with a reason — instance `ended / revoked`, an `end`
  journal row carrying the staff user and the note, `effect_revoked` /
  `item_revoked` in the feed, `iee_effect_revoked` / `iee_item_revoked` in
  the audit log.
- **Season reset** (the overview's Reset with its confirmation): every
  instance and journal row of the season cleared, one `reset` row by staff
  left, the assigned challenge gone, all three participants back at 0 and
  active; the next turn dropped normally.

**Checked — the 11 live scenarios.** SC-SLOWED-5 (penalty → `slowed`, next
move one short, both in the feed); SC-BOOTS-4 (salve clears the boots, next
move full length); SC-TAXED-4 (shield absorbs the landing, the tax still
takes 1); SC-MOMENTUM-3 (+1 on a pass, ledger row `effect:momentum` tied to
the move); SC-SHIELD-4 (shield spent, no status, balance untouched);
SC-SHIELD-5 (the next landing hits in full: `slowed` and −2); SC-HEXSCROLL-5
(the victim's dashboard says "from player1"); SC-HEXSCROLL-6 (three tabs
submitted one scroll at once: one `use`, one "This item has already been
used"); SC-SALVE-3 (consumed, nothing else changes); SC-POOL-3 (a held
lodestone works after its entry is switched off, and the next bonus landing
pays the cell's plain points instead); SC-POOL-4 (the reset above). Every
public page and the admin catalog, season, players, bots, moderation and
audit pages answered 200 without console errors.

**Fixed.** The wheel's random draws were not journaled with the grant they
decided (spec §4.3: `rng` holds every server draw a change used). The
executor's `grant` takes `draws` and writes them to the journal row —
granted, refreshed or refused — and `applyWheel` records its picker's draws.
Two tests.

**Noted, not changed** (they predate the constructor): feed rows of one
turn share one timestamp, so their order within the turn is not guaranteed;
the status meter reads "1 rolls left"; the after-cell tax is folded into the
cell's ledger row rather than written as its own. The dashboard hides the
inventory while it is empty — by design.

**Verification.** `pnpm verify` green — **272 files / 3259 tests**; coverage
80.6 % st / 72.9 % br / 74.8 % fn / 82.1 % ln. The dev server was OOM-killed
once by the container while Playwright compiled every route — an environment
limit; restarted, the remaining pages passed.

**Files** (not committed): `lib/modules/iee/executor/index.ts`,
`lib/modules/iee/executor/executor.test.ts`, `lib/modules/game/service/iee.ts`,
`lib/modules/game/service/iee.test.ts`, this journal, `docs/WORKLOG.md`.

**Gate (plan §4).** verify green; the scenarios green with unchanged
expected results; no reference to `ITEMS`, `EFFECTS`, `player_inventory`,
`player_effects` in code; the live check recorded. **Stage 1 is done —
waiting for the owner's go-ahead for stage 2 (library and icons).**

---

## 2026-10-07 — Session 8 · Stage 1, part 7 (scenarios on the new core; the old catalog removed)

**Goal.** Plan §4 tasks 1.10–1.11: the scenarios run against the compiled
core and the executor; the static catalog, `grant.ts`, the old repositories
and tables go; the stage's one migration.

**Done.**

- **Scenarios on the new core.** New `lib/modules/iee/scenarios.test.ts` runs
  every `engine`-tier scenario of `lib/engine/iee/scenarios.ts` (47) on the
  compiled core entries through the executor over the memory store: grants
  with the season's numbers, rules through `runLiveHook`, counters settled
  per turn, items through their compiled `use`, the use guards, the wheel's
  gates. Expected results are the table's, unchanged. The catalogue checks
  moved with it (every engine scenario implemented, no implementation without
  a scenario, every entry the season plays has one). The static-catalog
  runner `lib/engine/iee-scenarios.test.ts` is gone.
- **Removed:** `lib/engine/iee/items/*` and `effects/*` (`ITEMS`, `EFFECTS`,
  the hand-written entries, `runHook` and the lazy-expiry helpers),
  `lib/engine/iee/grant.ts` (`resolveEffectGrant`; `grantAnchor` moved to
  `resolve/live.ts` with its tests), `lib/modules/game/service/grant.ts`,
  `lib/modules/iee/repository/{inventory,effects}.ts`,
  `lib/i18n/dict-text.ts`, `core-docs/parity.test.ts`, and the catalog's types
  (`ItemDef`, `EffectDef`, `ActiveEffectLike`, `ItemUsage`, `ItemUseResult`
  and its intents, `EffectDuration`, `HookContext`, `HookFn`).
  `checkItemUse` takes its own `UseGuardUsage`.
- **Tests on the compiled core.** The structural and counter-play invariants
  (`lib/engine/iee-catalog.test.ts`) now run over the compiled set the
  registry serves, and assert consequences by running rules: a universal
  cleanse exists, every movement hook a negative uses has a positive answer,
  some rule vetoes a penalty landing. The shield suite runs through
  `runLiveHook`; the tracer item's guards use its compiled usage; the
  registry's candidates and defaults and the core documents' keys are pinned
  per entry. The grant-arithmetic tests went with `grant.ts` — the same rules
  are covered by `tuning.test.ts` and the executor tests.
- **Schema.** `player_inventory`, `player_effects`, `iee_item_state` and
  `iee_effect_state` are gone from `db/schema`. The stage's one migration,
  `drizzle/0021_iee_constructor_core.sql`, drops them and creates the six new
  enums, `iee_journal` and `iee_instances` with their keys, checks and
  indexes.
- `pnpm scenarios:doc` reads the compiled core (names from the documents,
  compiled usage, duration and stacking); regenerated — 58 scenarios, only
  the header and the shield's "1 trigger" changed.
- Stale comments fixed (`runHook`, `dict-text`); two test helpers named `use`
  renamed (React's hook rule flags them).

**Decided.**

- The migration was generated in two passes — the new tables alongside the
  old ones, then the drops — so drizzle-kit never asks whether a new table is
  a renamed old one, and the passes were merged into one file with the final
  snapshot. Checked: `drizzle-kit check` clean, a second `generate` finds no
  changes, and the 22 migrations apply to an empty PostgreSQL with exactly the
  new tables and types. (`drizzle-kit push` still re-issues the `bot_runs`
  default and `seasons_single_active_uq` on every run — a known push quirk
  with jsonb defaults and expression indexes, not this migration.)
- Engine tests use `compileSet(CORE_DOCS)`; module tests use
  `coreRegistry()` — the layer direction holds in tests too.
- `PickInput.catalogDefaults` keeps its name: the defaults still come from
  the season's catalog.
- The `live` tier (11 scenarios) is checked against `iee_instances` and the
  journal in the stage's live check (task 1.12); the harness probe is not in
  the repository.

**Verification.** `pnpm verify` green — **272 files / 3257 tests** (13
static-catalog test files removed, the scenario runner added); coverage
80.6 % st / 72.9 % br / 74.7 % fn / 82.1 % ln. No `ITEMS`, `EFFECTS`,
`player_inventory` or `player_effects` left in `app/`, `components/`, `db/`,
`lib/` or `scripts/`.

**Files** (not committed): new `lib/modules/iee/scenarios.test.ts`,
`drizzle/0021_iee_constructor_core.sql`, `drizzle/meta/0021_snapshot.json`;
changed `drizzle/meta/_journal.json`, `db/schema/{enums,iee}.ts`,
`lib/engine/types/iee.ts`, `lib/engine/iee/{index,scenarios,use-guards}.ts`
(+ test), `lib/engine/iee/resolve/{hooks,live}.ts` (+ tests),
`lib/engine/iee/core-docs/core-docs.test.ts`,
`lib/engine/{iee-catalog,iee-hooks,iee-selection,iee-shield,iee-use-guards}.test.ts`,
`lib/modules/iee/executor/context.ts`, `lib/modules/iee/repository/index.ts`,
`lib/modules/iee/registry/registry.test.ts`,
`lib/modules/iee/service/catalog.test.ts`,
`lib/modules/iee/effect-activity.test.ts`,
`lib/modules/game/{hook-context.test,service/turn}.ts`,
`components/admin/IeeCatalogBrowser.test.tsx`,
`components/iee/EntryDescription.tsx`, `scripts/scenarios-doc.ts`,
`docs/ITEMS_EFFECTS_SCENARIOS.md`, this journal, `docs/WORKLOG.md`. Deleted:
`lib/engine/iee/{items,effects}/*` (14 files),
`lib/engine/iee/grant{,.test}.ts`, `lib/engine/iee/core-docs/parity.test.ts`,
`lib/engine/{iee-grant,iee-scenarios}.test.ts`,
`lib/modules/game/service/grant{,.test}.ts`,
`lib/modules/iee/repository/{inventory,effects}.ts`,
`lib/i18n/dict-text{,.test}.ts`.

**Next.** Session 9 of stage 1 — the live check on a scratch database (task
1.12): wheel drops, «Свиток порчи» on a bot, expiry, admin intervention,
season reset; then the stage-1 gate.

---

## 2026-10-07 — Session 7 · Stage 1, part 6 (entry views for the client)

**Goal.** Plan §4 task 1.9: the client renders items and effects from
serializable entry views; entry texts leave the dictionaries.

**Done.**

- **`EntryView`** (spec §8) gains `usage.activation` and `triggers` (the
  triggers an entry's rules listen to); the registry adds `viewsByKey`.
  `EffectBadge` carries the entry's `name` in every language; the staff
  panel's rows carry `name` and `glyph`.
- **Pages build views, components render them.** Dashboard (inventory and
  status cards, the wheel, challenge rewards), both leaderboards and the
  board (badges), both rules pages (the season's tuned rule text), the admin
  catalog, the season stage (views plus the wheel's candidates and defaults
  from the server), the staff panel, the bots console, moderation. No
  component reads `getItem` / `getEffect`, the static catalog's `heroIcon` or
  an entry path in the dictionaries any more; `IeeIcon` / `IeeArtTile` take
  the entry's `glyph`.
- **Feed.** Item and effect lines render the names snapshotted in the payload
  (falling back to the key), so history reads the same after a rename; the
  shield's absorb line now records which status absorbed the landing.
- **Dictionaries.** `iee.items` / `iee.effects` removed in en/ru/uk; labels
  for move- and passed-game-counted durations and for the `onApply` /
  `onExpire` / `onUse` triggers added. The core documents now carry the only
  copy of the names — a test checks every entry is named in all three
  languages and no two share a name.
- AGENTS §7 and spec §8 / §9.3 updated.

**Decided.**

- Views carry all three languages; components pick `[locale]`. A language
  switch re-renders on the server anyway, and the spec's view is
  locale-complete.
- The admin catalog and the season stage show untuned views (the stage is
  where tuning is made); the dashboard, the wheel and the rules show the
  season's.
- The static catalog keeps its `i18n` paths until it is removed in the next
  session (task 1.11); its dictionary-path tests went with the texts.
  `lib/i18n/dict-text.ts` is unused now and goes with it.

**Verification.** `pnpm verify` green — **284 files / 3445 tests**
(dictionary-path tests removed, view tests added); coverage 80.3 % st /
72.7 % br / 74.2 % fn / 81.8 % ln. A production build (webpack; Google Fonts
is blocked by the egress policy, so the font CSS was mocked through
`NEXT_FONT_GOOGLE_MOCKED_RESPONSES`) passed, and the build served against the
scratch PostgreSQL with two live statuses: leaderboard (en and ru names on
the badges), board, rules, admin catalog (three tabs), season settings,
players with the staff panel, bots console, moderation, and a player's
dashboard (the shield card with its generated rule text and "1 triggers
left") — all 200, names and rule text from the entries. Scratch data removed
afterwards.

**Files** (not committed): `app/(public)/{dashboard,leaderboard,rules}/page.tsx`,
`app/(public)/seasons/[slug]/{leaderboard,rules}/page.tsx`,
`app/admin/{catalog,moderation}/page.tsx`,
`app/admin/seasons/[id]/{page,players/page,bots/page}.tsx`,
`components/admin/{BotRoster,BotsConsole,BotsRunCard,IeeCatalogBrowser,IeeIntervention,IeeStage,SeasonSettingsForm}.tsx`
(+ tests), `components/board/board-view.tsx`,
`components/dashboard/{InventoryPanel,RollCard}.tsx` (+ test),
`components/feed/feed-timeline-view.tsx` (+ test),
`components/game/WheelOverlay.tsx`, `components/iee/{EffectBadges,IeeArtTile,IeeIcon}.tsx`,
`components/iee/art.ts` (+ tests), `components/rules/AutoRulesView.tsx`,
`lib/engine/types/iee.ts`, `lib/engine/iee/dsl/tuning.ts` (+ test),
`lib/engine/iee/core-docs/{core-docs,parity}.test.ts`,
`lib/engine/{iee-catalog,iee-filter}.test.ts`,
`lib/i18n/dictionaries/{en,ru,uk}/iee.ts`, `lib/modules/game/service/turn.ts`
(+ test), `lib/modules/iee/registry/index.ts`,
`lib/modules/iee/repository/{instances,effects}.ts` (+ test), `AGENTS.md`,
`docs/IEE_CONSTRUCTOR_SPEC.md`, this journal, `docs/WORKLOG.md`.

**Next.** Session 7 of stage 1 — the 57 scenarios on the new core; remove the
static catalog, `grant.ts`, the old repositories and tables; the stage's one
migration; drop the parity test (tasks 1.10–1.11).

---

## 2026-10-07 — Session 6 · Stage 1, part 5 (writers and readers on the executor)

**Goal.** Plan §4 task 1.8: every writer and reader of IEE state goes through
the executor and the season registry; the old tables are no longer read or
written by the game.

**Done.**

- **Writers.** The turn (`game/service/turn.ts`, `iee.ts`): the wheel grants
  through `grant`, anchored at the roll being resolved; the hooks run the
  compiled rules of the live instances that take part in the roll
  (`participates`); the settlement journals every firing, spends the
  `triggers` that were asked for, carries out the rules' intents and counts
  the roll's durations down. Item use (`use-item.ts`): the charge is spent by
  `useCharge`, the item's intents run with the use as their cause, a `unique`
  status already on the target is refused before anything is spent. Challenge
  rewards (`events.ts`), the staff revoke (`iee/service/intervene.ts`) and the
  season reset (`season/service/seasons.ts`) — all executor operations.
- **Readers.** `lib/modules/iee/repository/instances.ts`: held items, effects
  with their caster, season badges (one per key), the staff panel's instances,
  the wheel's counters per entry. Switched: the dashboard, both boards, both
  leaderboards, the admin roster, the bots (roster, targets, planner), the
  wheel's pool context, reward-key validation (`iee/service/catalog.ts`).
- **Bots.** `planBotItemUse` plays the revision an instance holds through a
  `BotCatalog` (the season registry) and scores the item's intents.
- **Journal.** Each rule firing records the server draws it made
  (`FiredRule.draws` → the `fire` row's `rng`), so a chance roll can be
  replayed from the journal.
- **Compiler.** `compileSet` reports every format problem of a document with
  its path, not only the first one without it.
- **Invariants.** "One writer of IEE state" is now true and lives in
  `lib/architecture.test.ts` (plan 1.11 had it; nothing in it waits for the
  removal). `grant-parity` checks each caller uses executor operations; the
  activity invariant is rewritten for eager counters (only `participates()`
  compares an anchor; the badge pages read instances); `turn-clock` covers
  the hook dispatch, the wheel and the settlement.

**Decided.**

- Durations count down at the end of every resolved turn even in a season with
  IEE switched off, as the old expiry sweep did: time passes, statuses only
  stop acting.
- A season reset clears IEE state whether or not the roster is empty
  (instances held by cells arrive in wave A).
- Reward keys are checked against the core entries in stage 1 (the library in
  stage 2) — keys only, never ids, since a template stores what a person reads.
- The dashboard keeps showing `rolls` and `triggers` durations as before; the
  other units get a display with the entry views (session 6).

**Verification.** `pnpm verify` green — **284 files / 3456 tests** (+28);
coverage 80.3 % st / 72.6 % br / 74.2 % fn / 81.7 % ln. Against the scratch
PostgreSQL: grants through the executor, an item used through the real
service (`activateInventoryItem`) on another participant — a second use
refused — and every new reader (held items, effects with caster, season
badges, staff panel, counters, pool context, bot targets) read back as
expected; cleaned up afterwards. The full live run against `pnpm dev` is
session 8 (task 1.12).

**Files** (not committed): new `lib/modules/iee/repository/instances.ts`
(+ test); changed `app/(public)/{dashboard,board,leaderboard}/page.tsx`,
`app/(public)/seasons/[slug]/{board,leaderboard}/page.tsx`,
`app/admin/seasons/[id]/players/page.tsx`, `lib/engine/bots/items.ts`
(+ test), `lib/engine/iee/use-guards.ts`, `lib/engine/iee/dsl/set.ts`
(+ test), `lib/engine/iee/resolve/live.ts` (+ test),
`lib/i18n/dictionaries/{en,ru,uk}/admin.ts`, `lib/modules/bots/{service,repository}.ts`
(+ test), `lib/modules/game/service/{turn,iee,use-item,events}.ts` (+ tests),
`lib/modules/game/{grant-parity,turn-parity,turn-clock}.test.ts`,
`lib/modules/iee/{effect-activity.test.ts,executor/index.ts,executor/executor.test.ts}`,
`lib/modules/iee/repository/{counters,index}.ts` (+ test),
`lib/modules/iee/service/{catalog,intervene}.ts` (+ test),
`lib/modules/season/service/seasons.ts` (+ test), `lib/architecture.test.ts`,
this journal, `docs/WORKLOG.md`.

**Next.** Session 6 of stage 1 — serializable entry views for the client; the
components switch; entry texts leave the dictionaries (task 1.9).

---

## 2026-10-06 — Session 5 · Stage 1, part 4 (executor and journal)

**Goal.** Plan §4 task 1.7: the one writer of IEE state, with eager counters,
the journal and the feed projection.

**Done.**

- `lib/modules/iee/executor/store.ts` — the only code that writes
  `iee_instances` and `iee_journal`, as guarded statements (state changes carry
  their guard in the WHERE: a double submit matches nothing).
- `lib/modules/iee/executor/index.ts` — `grant` (unique / refresh / stack with
  `maxStacks`, tuning applied, `onApply`), `useCharge`, `fire` (journals every
  rule that fired, spends `triggers`), `tick` (rolls / moves / passed games of
  the instances that took part in the roll), `endInstance`, `cleanse`,
  `applyBalance` (the ledger records what moved), `runIntents` (chains capped
  at depth 2), `resetSeason`, `journalCompileFailures`. Feed rows are returned
  in the existing event types, with the entry's names snapshotted.
- `lib/modules/iee/executor/context.ts` — builds a context for a service call
  (registry, season clock, snapshots, the anchor of a grant: one roll later
  while the recipient has a game in flight).
- `lib/engine/iee/resolve/live.ts` — pure: running compiled rules over live
  instances (`runLiveHook`), the anchor rule (`participates`), what a turn
  counts down (`tickAmount`), the never-shorter refresh (`refreshRemaining`).
- Spec §7.9 (anchor; `onExpire` only on running out), §9.1 (`use`; wave
  markers), §9.3 (the executor returns the feed, the caller publishes it).

**Decided.**

- `onExpire` fires when an effect runs out, not when it is cleansed, revoked
  or reset — removal must not set off a rule.
- Refresh compares where the two durations *end* in the holder's history, so a
  refresh during a game in flight still covers the rolls after it.
- The executor gets a participant's snapshot and anchor through the context,
  so the IEE slice does not import the game slice.

**Verification.** `pnpm verify` green — **283 files / 3428 tests** (+50);
coverage 80.1 % st / 72.4 % br / 74.1 % fn / 81.6 % ln. The executor was also
run against the scratch PostgreSQL inside a rolled-back transaction: grant,
use (and a second use refused), refresh, unique refusal, shield spent by
`fire`, two `tick`s expiring a status, a balance clamped at zero, a cleanse, a
staff removal — rows, end reasons and the journal sequence as expected.

**Files** (not committed): new `lib/modules/iee/executor/*`,
`lib/engine/iee/resolve/live.ts` (+ test); changed
`lib/modules/iee/repository/counters.ts` (+ test: `getSeasonPlayerRow`,
`hasOpenRoll`), `docs/IEE_CONSTRUCTOR_SPEC.md`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 5 of stage 1 — switch the writers and readers to the
executor and the registry (task 1.8).

---

## 2026-10-06 — Session 4 · Stage 1, part 3 (runtime tables, season registry)

**Goal.** Plan §4 tasks 1.5–1.6: the tables the executor will write, and the
registry every reader and writer will ask.

**Done.**

- `db/schema/enums.ts`, `db/schema/iee.ts` — enums `iee_instance_kind`,
  `iee_holder_kind`, `iee_instance_status`, `iee_end_reason`,
  `iee_duration_unit`, `iee_visibility`; tables `iee_journal` (bigserial,
  append-only, self-referencing `cause_id`) and `iee_instances` (one holder
  enforced by a check constraint, `ended` ⇔ `end_reason` by another, the three
  indexes of spec §4.3). Pushed to a scratch PostgreSQL 16 cluster: applies
  cleanly.
- `lib/engine/iee/dsl/tuning.ts` — `instanceStart` (the numbers a grant hands
  out under a season's tuning) and `entryView` (the serializable view, rule
  text printed with the season's numbers); `EntryView` type in
  `lib/engine/types/iee.ts`.
- `lib/modules/iee/registry/` — `getSeasonRegistry(seasonId)`: lookup by key,
  entry id or revision id, wheel candidates, defaults, instance starts and
  views. Stage 1 serves the core fixture to every season, compiled once.

**Decided.**

- The old tables stay until the readers are switched; the **single** stage-1
  migration (create the new tables, drop `player_inventory`, `player_effects`
  and their enums) is generated in the session that removes the old code, so
  no intermediate migration is shipped. Development databases follow the
  schema through `db:push` meanwhile.
- `iee_instances.entry_id`/`revision_id` carry no foreign key until the library
  tables exist (stage 2); the journal's `instance_id`/`revision_id` never will.
- Added to the spec's model: `anchor_roll_seq` (the fix for SC-HEXSCROLL-7)
  and `source_move_id`; removed `stacks`.

**Verification.** `pnpm verify` green — **279 files / 3378 tests**; coverage
79.7 % st / 72.0 % br / 73.4 % fn / 81.2 % ln. Schema pushed with
`drizzle-kit push` to a scratch database; the generated SQL reviewed.

**Files** (not committed): `db/schema/enums.ts`, `db/schema/iee.ts`,
`lib/engine/types/iee.ts`, new `lib/engine/iee/dsl/tuning.ts` (+ test),
`lib/engine/iee/dsl/index.ts`, new `lib/modules/iee/registry/*`,
`docs/IEE_CONSTRUCTOR_SPEC.md` (§4.3), this journal, `docs/WORKLOG.md`.

**Next.** Session 4 of stage 1 — the executor and the journal (task 1.7).

---

## 2026-10-06 — Session 3 · Stage 1, part 2 (the 14 entries as documents)

**Goal.** Plan §4 task 1.4: today's catalog written as entry documents with
the same keys and behaviour, and proof that the documents behave like the code
they replace.

**Done.**

- `lib/engine/iee/core-docs/index.ts` — the 14 entries as documents with fixed
  entry and revision ids (D11: the entry id is the identity references and
  exports keep). Names are the dictionaries' names in ru/en/uk; descriptions
  are generated now, so none are carried over.
- `lib/engine/iee/dsl/set.ts` — `compileSet`: compiles a season's catalog as
  a whole. A broken entry disables itself and everything that references it,
  loops disable every member, a duplicate keeps its first occurrence, older
  revisions still held by live instances compile against the same catalog
  and are reachable by revision id only (spec §8).
- `core-docs/parity.test.ts` — both implementations side by side: every
  effect at every hook × both outcomes × every cell type, every item against a
  rival / no one / itself / a rival who left; durations, stacking, pools,
  glyphs, priority order inside each hook, names. All equal.

**Decided.**

- Mapping of the old numbers: priorities 10/50 → `early`, 100/150 → `normal`,
  200 → `late` (the order inside every hook is unchanged — asserted);
  `charges` → `triggers`; params are signed with bounds (`slowed.steps` −1
  in −6…−1, `tailwind.steps` +2 in 1…6, …).
- Tags for the 14: `movement`, `dice`, `directed`, `protection` where they
  apply; `taxed`, `momentum` and the salve carry none (the base taxonomy has
  no tag for points).

**Verification.** `pnpm verify` green — **277 files / 3365 tests** (+100);
coverage 79.6 % st / 71.8 % br / 73.2 % fn / 81.1 % ln.

**Files** (not committed): new `lib/engine/iee/core-docs/*`,
`lib/engine/iee/dsl/set.ts` (+ test); changed `lib/engine/iee/dsl/check.ts`
(a grant loop is reported once per member), `dsl/compile.ts` (target checks
only for items that reach a target), `dsl/index.ts`, this journal,
`docs/WORKLOG.md`.

**Next.** Session 3 of stage 1 — schema (`iee_instances`, `iee_journal`) and
the season registry (tasks 1.5–1.6).

---

## 2026-10-06 — Session 2 · Stage 1, part 1 (DSL, vocabulary, compiler, rule text)

**Goal.** Plan §4 tasks 1.1–1.3: the entry document as data, the stage-1
vocabulary, the compiler to runtime entries, the rule-text generator and the
load-time checks — engine only, nothing in the game switched yet.

**Done.**

- `lib/engine/iee/dsl/` (new, pure, alias-free):
  - `doc.ts` — Zod schema of `EntryDoc` v1 (frame only: ops are loose and are
    validated against their own primitive), locales, units, limits.
  - `values.ts` — literal / `param` / `random` values; parameter overrides
    applied against their declarations, with problems reported, never applied.
  - `vocabulary.ts` — the stage-1 primitives, each one object with schema,
    placement, harm, behaviour, power cost and ru/en/uk template: triggers
    `onUse`, `onApply`, `onExpire` and the six turn hooks; conditions
    `outcome`, `cellType`, `chance`, `hasEntry`; actions `steps`, `dice`,
    `balance`, `skipCellEffect`, `noMove`, `grantEffect`, `grantItem`,
    `cleanse`.
  - `compile.ts` — document → `CompiledItem` / `CompiledEffect`: per-rule hook
    closures that return `HookPatch`es for the existing reducer, `onApply` /
    `onExpire` rules that return intents, an item `use()` that returns intents
    and the refusal codes of the hand-written catalog.
  - `text.ts`, `text-kit.ts` — rule text in three languages (plurals, cell
    names in two cases, punctuation per language).
  - `check.ts` — blocking errors and warnings per entry (spec §14 subset that
    stage 1 can know) and across a set (grant cycles, duplicates,
    counter-play).
  - `power.ts`, `canonical.ts`, `upgrade.ts`, `glyphs.ts`.
- `lib/engine/types/iee.ts` — `IeeIntent`; `HookPatch.cancelMove`/`intents`;
  the reducer treats `cancelMove` as a veto and collects intents in order;
  `applyMovementModifiers` honours a cancelled move.
- Spec: `glyph` in `EntryDoc`; signed params and override validation (§5.1);
  §6.7 — parameters and placement of every stage-1 primitive, frozen; `stack`
  = one instance per grant up to `maxStacks` (§7.10); where templates live and
  the shape of rule text (§13). `AGENTS.md` §7 notes the template exception.

**Decided.**

- Rule-text templates live with the primitives in the engine, not in the
  dictionaries; three-language parity is enforced by `Record<Locale, …>`
  types and tests.
- Parameters are signed with bounds (`steps: -1, min -6, max -1`); an override
  that breaks its declaration is ignored and reported. The old free-form
  `effectKey` param of items goes: what an item hands out is its rule, not a
  season knob (no UI ever set it).
- `stack` keeps one instance per grant (today's shield behaviour, SC-SHIELD-3)
  instead of a stack counter; the `stacks` column is dropped from the model.
- `noMove` cancels the regular move entirely: no cell, no wheel.
- Found while reading the turn: **SC-HEXSCROLL-7 is not what the code does.**
  `grantAnchor` pushes the *end* of a status granted during an open roll one
  roll out, but nothing delays its *start*, so the in-flight move is touched
  after all and the status lasts N + 1 rolls; the scenario's test only checks
  the arithmetic. The new core fixes it (an instance records the holder roll it
  counts from); the fix lands with the executor and is journaled there.

**Verification.** `pnpm verify`: lint 0 errors (3 pre-existing warnings),
typecheck clean, **274 files / 3265 tests** green (+113), coverage 79.5 % st /
71.8 % br / 73.0 % fn / 81.0 % ln — all above the ratchet.

**Files** (not committed): new `lib/engine/iee/dsl/*`; changed
`lib/engine/types/iee.ts`, `lib/engine/iee/resolve/hooks.ts` (+ test),
`lib/engine/board/movement/index.ts` (+ `modifiers.test.ts`),
`components/iee/IeeIcon.test.tsx`, `docs/IEE_CONSTRUCTOR_SPEC.md`, `AGENTS.md`,
this journal, `docs/WORKLOG.md`.

**Next.** Session 2 of stage 1 — the 14 current entries as documents with the
same keys (task 1.4) and a parity suite: every engine scenario run against the
compiled entries.

---

## 2026-10-06 — Session 1 · Stage 0 (spec and contract)

**Goal.** Turn the approved proposal into a normative contract and a delivery
plan, so the code stages start without open design questions.

**Done.**

- `docs/IEE_CONSTRUCTOR_SPEC.md` — decisions D1–D12; glossary; data model
  (`iee_packs`, `iee_pack_dependencies`, `iee_entries`, `iee_entry_revisions`,
  `season_catalog`, `iee_instances`, `iee_decisions`, `iee_journal`; dropped
  `player_inventory`, `player_effects`, `seasons.config.iee.entries`); the
  entry document (DSL v1) with examples; the vocabulary, each primitive tagged
  with the stage that delivers it; execution rules (dice pipeline, out-of-turn
  moves, reaction window, cursed items, victim choice, board objects,
  interception, eager lifecycle, stacking, drops); registry, executor and
  journal contracts; library rules; `.ggpack` format; icons; rule text; publish
  checks; weights; «Погоня»; the starter set — 83 entries with slugs, rarity,
  wave and origin.
- `docs/IEE_CONSTRUCTOR_PLAN.md` — ground rules, stages 0–4 and waves A–D with
  tasks, files and gates.
- This journal.
- `docs/ITEMS_EFFECTS_EVENTS.md` — status banner; the §2.1 verdicts against a
  constructor and a DB catalog are marked superseded (text kept for history).
- `AGENTS.md` §11 — the three new documents in the docs map.

**Decided in this session** (within the approved design):

- Stage 1 is a pure port: the 14 current entries keep their keys (`slowed`,
  `taxed`, `shield`, `lodestone`, …) and behaviour, so the 57 scenarios keep
  their expected results. Renames and merges of the starter set happen when
  `core` becomes a pack in stage 2; scenario keys follow then.
- Names of stage-1 primitives are frozen by the spec; names of wave A–D
  primitives are provisional until their wave starts, and any change goes into
  the spec first.
- Every action declares `harm` in code; protection reacts to harm, not to the
  sender entry's character (closes the «Щит» vs bonus-item contradiction).

**Verification.** `pnpm verify` in a clean Linux clone of `fa5c14a` with the
stage-0 changes: lint, typecheck, 268 test files / 3152 tests green, coverage
thresholds held. Documentation-only change; no behaviour touched.

**Files** written into the checkout (not committed):

- new — `docs/IEE_CONSTRUCTOR_SPEC.md`, `docs/IEE_CONSTRUCTOR_PLAN.md`,
  `docs/IEE_CONSTRUCTOR_LOG.md`;
- changed — `docs/ITEMS_EFFECTS_EVENTS.md`, `AGENTS.md`, `docs/WORKLOG.md`.

**Repo hygiene.** A `git status` from Linux left a new `.git/index.lock`; it was
moved aside to `.git/index.lock.stale-from-claude` (deleting needs a permission
the session did not have). Read-only git from Linux now runs with
`GIT_OPTIONAL_LOCKS=0`.

**Next.** On the owner's go-ahead: stage 1, session 1 — `EntryDoc` schema, the
primitive contract and the first stage-1 primitives with the compiler for two
reference entries (`slowed`, `hex_scroll`); plan §4, tasks 1.1–1.3.
