# Items & effects — scenario reference

> **Generated file — do not edit.** `pnpm scenarios:doc` rebuilds it from the
> scenarios in the documents of the system pack `core`
> ([`seed/iee/core.ggpack`](../seed/iee/core.ggpack), via its generated fixture) and from the
> subsystem table [`lib/engine/iee/scenarios.ts`](../lib/engine/iee/scenarios.ts). An entry's
> scenarios are data (spec §5.5): publishing and importing run them and refuse a red one,
> and `lib/modules/iee/sim/core-scenarios.test.ts` runs core's. The table's scenarios cannot
> appear here without an implementation: `lib/modules/iee/scenarios.test.ts` and
> `probe/scenarios.mts` each fail if one of their tier is unimplemented.

289 scenarios across 92 entries — 269 in the entries' documents, 8 more run by `pnpm test`, 12 live (need the turn transaction, the database and a browser).

Every scenario is phrased as an observable consequence rather than a property of
the catalog. Two bugs reached a real playthrough because a test asserted that an
effect *declared* a hook and never that the hook *did* anything.

Entry scenarios play in the scenario season (spec §5.5): a 40-cell board, one d6 on a
pass and two on a drop, points never ride on a roll, and the wheel hands nothing out.
The holder starts on cell 10 with 5 points, the rival on cell 12 with 5 points.

## Contents

- [Broken Compass](#broken-compass) — 5
- [Chaos Die](#chaos-die) — 2
- [Cleansing Salve](#cleansing-salve) — 3
- [Copying Scroll](#copying-scroll) — 2
- [Crown](#crown) — 4
- [Heavy Boots](#heavy-boots) — 4
- [Cursed Die](#cursed-die) — 3
- [Era Pick](#era-pick) — 3
- [Dice of Fate](#dice-of-fate) — 3
- [Favourite](#favourite) — 3
- [Game Reroll](#game-reroll) — 4
- [Genre Pick](#genre-pick) — 3
- [Genre Veto](#genre-veto) — 4
- [Golden Coin](#golden-coin) — 3
- [Hex Scroll](#hex-scroll) — 7
- [Hook](#hook) — 3
- [Jinx](#jinx) — 2
- [Joker](#joker) — 3
- [Lead Weights](#lead-weights) — 4
- [Lucky Coin](#lucky-coin) — 4
- [Magnet](#magnet) — 4
- [Mine](#mine) — 5
- [Mirror Shield](#mirror-shield) — 3
- [Philosopher's Stone](#philosopher-s-stone) — 3
- [Phoenix](#phoenix) — 3
- [Portal Scroll](#portal-scroll) — 2
- [Postponed Game](#postponed-game) — 3
- [Amulet of Purification](#amulet-of-purification) — 4
- [Second Chance](#second-chance) — 2
- [Shield](#shield) — 4
- [Snare](#snare) — 3
- [Spare Die](#spare-die) — 2
- [Boots of Speed](#boots-of-speed) — 2
- [Elixir of Speed](#elixir-of-speed) — 4
- [Spring](#spring) — 4
- [Scroll of Exchange](#scroll-of-exchange) — 2
- [Teleport](#teleport) — 2
- [Ring of Teleportation](#ring-of-teleportation) — 2
- [Thief's Glove](#thief-s-glove) — 3
- [Three Doors](#three-doors) — 4
- [Time Stone](#time-stone) — 2
- [Scroll of Trade](#scroll-of-trade) — 3
- [Treasure Map](#treasure-map) — 3
- [Acceleration](#acceleration) — 4
- [Backward Teleport](#backward-teleport) — 3
- [Behind the Doors](#behind-the-doors) — 2
- [Burden](#burden) — 5
- [Castling](#castling) — 2
- [Chain](#chain) — 2
- [Chosen Era](#chosen-era) — 2
- [Chosen Genre](#chosen-genre) — 3
- [Clean Start](#clean-start) — 2
- [Curse](#curse) — 3
- [Curse Echo](#curse-echo) — 3
- [Curse of Greed](#curse-of-greed) — 3
- [Fast Track](#fast-track) — 2
- [Roll of Fate](#roll-of-fate) — 2
- [Favoured Game](#favoured-game) — 2
- [Fortune](#fortune) — 2
- [Genre Trial](#genre-trial) — 3
- [Greedy Explorer](#greedy-explorer) — 2
- [Hard Mode](#hard-mode) — 3
- [Heavy Step](#heavy-step) — 6
- [Immunity](#immunity) — 3
- [Invisibility](#invisibility) — 2
- [Lost Time](#lost-time) — 2
- [Lucky](#lucky) — 4
- [Magnetic Pull](#magnetic-pull) — 1
- [Main Story Only](#main-story-only) — 2
- [Mark](#mark) — 2
- [Misfired Portal](#misfired-portal) — 2
- [Misfortune](#misfortune) — 2
- [Momentum](#momentum) — 3
- [No DLC](#no-dlc) — 3
- [No Guides](#no-guides) — 2
- [Old Hardware](#old-hardware) — 2
- [One Chance](#one-chance) — 2
- [Overload](#overload) — 5
- [Pick of Two](#pick-of-two) — 3
- [Pickpocket](#pickpocket) — 2
- [Poison](#poison) — 5
- [Pursuit](#pursuit) — 3
- [Swamp](#swamp) — 6
- [Tailwind](#tailwind) — 4
- [Tax](#tax) — 5
- [Toll](#toll) — 5
- [Treasure Hunt](#treasure-hunt) — 1
- [Uncharted Territory](#uncharted-territory) — 2
- [Unlucky](#unlucky) — 5
- [Vetoed Genre](#vetoed-genre) — 2
- [Ward](#ward) — 5
- [Rules that span the subsystem](#rules-that-span-the-subsystem) — 10

## Broken Compass

`broken_compass` — item · cursed · rare · 1 firing

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-COMPASS-1` | A low passed roll moves the holder back by the result | The holder carries “Broken Compass”. | The holder passes a game, the dice show 2. | The move goes 2 cells back; the holder is on cell 8; the holder does not carry “Broken Compass”. | publish · `pnpm test` |
| `SC-COMPASS-2` | A high passed roll moves forward as usual | The holder carries “Broken Compass”. | The holder passes a game, the dice show 4. | The move goes 4 cells forward; the holder does not carry “Broken Compass”. | publish · `pnpm test` |
| `SC-COMPASS-3` | A 3 on a d6 is still the lower half | The holder carries “Broken Compass”. | The holder passes a game, the dice show 3. | The move goes 3 cells back. | publish · `pnpm test` |
| `SC-COMPASS-4` | Backwards stops at the first cell | The holder is on cell 1 and the holder carries “Broken Compass”. | The holder passes a game, the dice show 3. | The move goes 1 cell back; the holder is on cell 0; the holder does not carry “Broken Compass”. | publish · `pnpm test` |
| `SC-COMPASS-5` | A dropped game is left alone, and the compass waits | The holder is on cell 20 and the holder carries “Broken Compass”. | The holder drops a game, the dice show 6. | The move goes 6 cells back; the holder carries “Broken Compass”. | publish · `pnpm test` |

- **SC-COMPASS-3** — The middle of 1–6 is 3.5: a 1, 2 or 3 goes back, a 4, 5 or 6 forward (spec §6.8).

## Chaos Die

`chaos_die` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CHAOS-1` | A 1 on the d20 throws the holder five cells back | The holder carries “Chaos Die”. | The holder uses “Chaos Die”. | The item is used; the holder is on cell 5. | publish · `pnpm test` |
| `SC-CHAOS-2` | A 20 on the d20 sends the holder eight cells forward | The holder carries “Chaos Die” and random draws come out high. | The holder uses “Chaos Die”. | The item is used; the holder is on cell 18. | publish · `pnpm test` |

## Cleansing Salve

`cleansing_salve` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SALVE-1` | Clears every negative status the holder carries | The holder carries “Cleansing Salve”, “Swamp”, “Poison” and “Toll”. | 1. The holder uses “Cleansing Salve”.<br>2. The holder passes a game, the dice show 5. | 1. The item is used; the holder does not carry “Swamp”, “Poison”, “Toll” or “Cleansing Salve”.<br>2. The move goes 5 cells forward; the holder's points do not change. | publish · `pnpm test` |
| `SC-SALVE-2` | Leaves positives alone | The holder carries “Cleansing Salve”, “Ward” and “Swamp”. | The holder uses “Cleansing Salve”. | The item is used; the holder carries “Ward”; the holder does not carry “Swamp”. | publish · `pnpm test` |
| `SC-SALVE-3` | Used with nothing to clear, it still costs its charge | a clean player holding a salve | they use it | the item is consumed and nothing else changes | live probe |

- **SC-SALVE-3** — Documented rather than defended: the guard layer has no 'would this do anything' check, and adding one would let a player probe their own status list for free.

## Copying Scroll

`copy_scroll` — item · rare · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-COPY-1` | A copy of the chosen player's common item; they keep theirs | The holder carries “Copying Scroll” and the rival carries “Boots of Speed”. | The holder uses “Copying Scroll”. | The item is used; the holder carries “Boots of Speed”; the holder does not carry “Copying Scroll”; the rival carries “Boots of Speed”. | publish · `pnpm test` |
| `SC-COPY-2` | Only common items are copied | The holder carries “Copying Scroll” and the rival carries “Cleansing Salve”. | The holder uses “Copying Scroll”. | The holder does not carry “Cleansing Salve”; the rival carries “Cleansing Salve”. | publish · `pnpm test` |

## Crown

`crown` — item · passive · epic · while held

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CROWN-1` | While held, every passed game moves 1 cell further; a drop moves as it would | The holder carries “Crown”. | 1. The holder passes a game, the dice show 3.<br>2. The holder passes a game, the dice show 3.<br>3. The holder drops a game, the dice show 3. | 1. The move goes 4 cells forward; the holder carries “Crown”.<br>2. The move goes 4 cells forward.<br>3. The move goes 3 cells back; the holder carries “Crown”. | publish · `pnpm test` |
| `SC-CROWN-2` | A rival who ends a move on your cell takes it; it serves them from their next roll and comes back the same way | The holder carries “Crown” and the rival is on cell 7. | 1. The rival passes a game, the dice show 3.<br>2. The rival passes a game, the dice show 3.<br>3. The holder passes a game, the dice show 4. | 1. The rival is on cell 10; the holder does not carry “Crown”; the rival carries “Crown”.<br>2. The move goes 4 cells forward; the rival is on cell 14.<br>3. The move goes 4 cells forward; the holder is on cell 14; the holder carries “Crown”; the rival does not carry “Crown”. | publish · `pnpm test` |
| `SC-CROWN-3` | A move through your cell takes nothing, nor does an arrival out of turn | The holder carries “Crown”, the rival is on cell 7 and the rival carries “Portal Scroll”. | 1. The rival passes a game, the dice show 5.<br>2. The rival drops a game, the dice show 5.<br>3. The rival uses “Portal Scroll” on the holder. | 1. The rival is on cell 12; the holder carries “Crown”; the rival does not carry “Crown”.<br>2. The rival is on cell 7.<br>3. The item is used; the rival is on cell 10; the holder carries “Crown”; the rival does not carry “Crown”. | publish · `pnpm test` |
| `SC-CROWN-4` | There is one in the season: no other is handed out, whoever would get it | The holder carries “Crown”. | 1. The wheel drops “Crown” to the rival.<br>2. “Crown” is handed to the holder. | 1. It is refused; the rival does not carry “Crown”.<br>2. It is refused; the holder carries “Crown”. | publish · `pnpm test` |

- **SC-CROWN-3** — «Свиток портала» puts the rival on the holder's cell out of turn: such a move arrives nowhere (spec §7.3, §6.19).

## Heavy Boots

`cursed_boots` — item · cursed · common · 1 firing

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CURSEDBOOTS-1` | The next passed game moves two cells less, then the boots are gone | The holder carries “Heavy Boots”. | The holder passes a game, the dice show 5. | The move goes 3 cells forward; the holder does not carry “Heavy Boots”. | publish · `pnpm test` |
| `SC-CURSEDBOOTS-2` | Never below 1 | The holder carries “Heavy Boots”. | The holder passes a game, the dice show 2. | The move goes 1 cell forward; the holder does not carry “Heavy Boots”. | publish · `pnpm test` |
| `SC-CURSEDBOOTS-3` | A dropped game is left alone, and the boots wait | The holder carries “Heavy Boots”. | 1. The holder drops a game, the dice show 6.<br>2. The holder passes a game, the dice show 4. | 1. The move goes 6 cells back; the holder carries “Heavy Boots”.<br>2. The move goes 2 cells forward; the holder does not carry “Heavy Boots”. | publish · `pnpm test` |
| `SC-CURSEDBOOTS-4` | Cannot be used | The holder carries “Heavy Boots”. | The holder uses “Heavy Boots”. | The use is refused: `ieeItemNotUsable`; the holder carries “Heavy Boots”. | publish · `pnpm test` |

- **SC-CURSEDBOOTS-3** — A lower result on a drop would be a shorter move back — it would help — so the boots bite on passed games only.

## Cursed Die

`cursed_die` — item · cursed · common · 1 firing

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CURSEDDIE-1` | The next passed game is thrown twice and the worse throw counts | The holder carries “Cursed Die”. | The holder passes a game, the dice show 5, then 2. | The move goes 2 cells forward; the holder does not carry “Cursed Die”. | publish · `pnpm test` |
| `SC-CURSEDDIE-2` | A lower first throw stands | The holder carries “Cursed Die”. | The holder passes a game, the dice show 2, then 6. | The move goes 2 cells forward; the holder does not carry “Cursed Die”. | publish · `pnpm test` |
| `SC-CURSEDDIE-3` | A dropped game is left alone, and the die waits | The holder carries “Cursed Die”. | The holder drops a game, the dice show 6, then 6. | The move goes 6 cells back; the holder carries “Cursed Die”. | publish · `pnpm test` |

## Era Pick

`era_pick` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-ERAPICK-1` | The next game comes from the decade picked | The holder carries “Era Pick”. | 1. The holder uses “Era Pick”, picking the years 2010–2019.<br>2. The holder's next game is picked. | 1. The item is used; the holder carries “Chosen Era”; the holder does not carry “Era Pick”.<br>2. The holder is playing “Iron Tide”. | publish · `pnpm test` |
| `SC-ERAPICK-2` | Asks which decade | The holder carries “Era Pick”. | The holder uses “Era Pick”. | The use is refused: `ieePickRequired`; the holder carries “Era Pick”. | publish · `pnpm test` |
| `SC-ERAPICK-3` | Only a decade the season has games from | The holder carries “Era Pick”. | The holder uses “Era Pick”, picking the years 1980–1989. | The use is refused: `ieePickInvalid`; the holder carries “Era Pick”. | publish · `pnpm test` |

## Dice of Fate

`fate_dice` — item · epic · target: self · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-FATEDICE-1` | A passed game is rolled with two dice | The holder carries “Dice of Fate”. | 1. The holder uses “Dice of Fate”.<br>2. The holder passes a game, the dice show 8. | 1. The item is used; the holder carries “Roll of Fate”; the holder does not carry “Dice of Fate”.<br>2. The move goes 8 cells forward; 2 dice are thrown; the holder does not carry “Roll of Fate”. | publish · `pnpm test` |
| `SC-FATEDICE-2` | A sum of 4 or less means no move | The holder carries “Dice of Fate”. | 1. The holder uses “Dice of Fate”.<br>2. The holder passes a game, the dice show 4. | 1. Nothing is checked.<br>2. The move goes nowhere; 2 dice are thrown. | publish · `pnpm test` |
| `SC-FATEDICE-3` | Cannot be used once the game is rolled | The holder has a game in flight and the holder carries “Dice of Fate”. | The holder uses “Dice of Fate”. | The use is refused: `ieeItemWrongWindow`; the holder carries “Dice of Fate”. | publish · `pnpm test` |

## Favourite

`favourite` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-FAVOURITE-1` | The game picked is favoured in the next draw | The holder carries “Favourite”. | 1. The holder uses “Favourite”, picking “Sky Garden”.<br>2. The holder's next game is picked. | 1. The item is used; the holder carries “Favoured Game”; the holder does not carry “Favourite”.<br>2. The holder is playing “Sky Garden”. | publish · `pnpm test` |
| `SC-FAVOURITE-2` | Only a game the season could hand out | The holder has passed “Sky Garden” and the holder carries “Favourite”. | The holder uses “Favourite”, picking “Sky Garden”. | The use is refused: `ieePickInvalid`; the holder carries “Favourite”. | publish · `pnpm test` |
| `SC-FAVOURITE-3` | Asks which game | The holder carries “Favourite”. | The holder uses “Favourite”. | The use is refused: `ieePickRequired`; the holder carries “Favourite”. | publish · `pnpm test` |

- **SC-FAVOURITE-1** — A favoured game stands ahead of the rest in the scenario pool, so a low draw takes it (spec §5.5); in a season it is three times as likely as any other game.
- **SC-FAVOURITE-2** — A game the holder has passed is not drawn again, so it is not on offer.

## Game Reroll

`game_reroll` — item · rare · target: self · window: on_open_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-REROLL-1` | The game in progress is replaced by a new one | The holder is playing “Starfall” and the holder carries “Game Reroll”. | The holder uses “Game Reroll”. | The item is used; the holder is playing “Old Keep”; the holder does not carry “Game Reroll”. | publish · `pnpm test` |
| `SC-REROLL-2` | Only while a game is in progress | The holder carries “Game Reroll”. | The holder uses “Game Reroll”. | The use is refused: `ieeItemWrongWindow`; the holder carries “Game Reroll”. | publish · `pnpm test` |
| `SC-REROLL-3` | Nothing left to roll: refused, and the item stays | The holder is playing “Sky Garden”, the holder has passed “Starfall”, “Old Keep”, “Quiet House”, “Gear Run”, “Tiny Planet”, “Iron Tide” and “Night Shift” and the holder carries “Game Reroll”. | The holder uses “Game Reroll”. | The use is refused: `catalogAllPlayed`; the holder is playing “Sky Garden”; the holder carries “Game Reroll”. | publish · `pnpm test` |
| `SC-REROLL-4` | Under a choice of games, the choice opens instead | The holder is playing “Starfall” and the holder carries “Game Reroll” and “Behind the Doors”. | The holder uses “Game Reroll”. | The item is used; the holder has no game in flight; a choice of 3 games waits. | publish · `pnpm test` |

## Genre Pick

`genre_pick` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-GENREPICK-1` | The next game comes from the genre picked | The holder carries “Genre Pick”. | 1. The holder uses “Genre Pick”, picking the genre “strategy”.<br>2. The holder's next game is picked. | 1. The item is used; the holder carries “Chosen Genre”; the holder does not carry “Genre Pick”.<br>2. The holder is playing “Iron Tide”. | publish · `pnpm test` |
| `SC-GENREPICK-2` | Asks which genre | The holder carries “Genre Pick”. | The holder uses “Genre Pick”. | The use is refused: `ieePickRequired`; the holder carries “Genre Pick”. | publish · `pnpm test` |
| `SC-GENREPICK-3` | Only a genre the season's games have | The holder carries “Genre Pick”. | The holder uses “Genre Pick”, picking the genre “jazz”. | The use is refused: `ieePickInvalid`; the holder carries “Genre Pick”. | publish · `pnpm test` |

## Genre Veto

`genre_veto` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-VETO-1` | The genre picked cannot come up for the next game | The holder carries “Genre Veto”. | 1. The holder uses “Genre Veto”, picking the genre “action”.<br>2. The holder's next game is picked. | 1. The item is used; the holder carries “Vetoed Genre”; the holder does not carry “Genre Veto”.<br>2. A game comes up; the holder is playing “Old Keep”. | publish · `pnpm test` |
| `SC-VETO-2` | Used during a game, it is the game after it | The holder is playing “Starfall” and the holder carries “Genre Veto”. | 1. The holder uses “Genre Veto”, picking the genre “rpg”.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked.<br>4. The holder passes a game, the dice show 3. | 1. The item is used.<br>2. The holder has no game in flight; the holder carries “Vetoed Genre”.<br>3. The holder is playing “Quiet House”.<br>4. The holder does not carry “Vetoed Genre”. | publish · `pnpm test` |
| `SC-VETO-3` | Asks which genre | The holder carries “Genre Veto”. | The holder uses “Genre Veto”. | The use is refused: `ieePickRequired`; the holder carries “Genre Veto”. | publish · `pnpm test` |
| `SC-VETO-4` | Only a genre the season's games have | The holder carries “Genre Veto”. | The holder uses “Genre Veto”, picking the genre “jazz”. | The use is refused: `ieePickInvalid`; the holder carries “Genre Veto”. | publish · `pnpm test` |

- **SC-VETO-1** — Starfall, the first game of the scenario pool, is an action game: vetoed, the draw passes it over (spec §5.5).

## Golden Coin

`golden_coin` — item · rare · target: self · window: after_dice

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-GOLDCOIN-1` | Thrown a second time, the better throw counts | The holder carries “Golden Coin”. | The holder passes a game, the dice show 2, then 5, the holder answers the dice with “Golden Coin”. | The move goes 5 cells forward; the reaction window opens and the item is used; the holder does not carry “Golden Coin”. | publish · `pnpm test` |
| `SC-GOLDCOIN-2` | A worse second throw: the first stands | The holder carries “Golden Coin”. | The holder passes a game, the dice show 5, then 2, the holder answers the dice with “Golden Coin”. | The move goes 5 cells forward; the reaction window opens and the item is used; the holder does not carry “Golden Coin”. | publish · `pnpm test` |
| `SC-GOLDCOIN-3` | On a dropped game the shorter way back counts | The holder is on cell 20 and the holder carries “Golden Coin”. | The holder drops a game, the dice show 12, then 1, the holder answers the dice with “Golden Coin”. | The move goes 2 cells back; the reaction window opens and the item is used. | publish · `pnpm test` |

## Hex Scroll

`hex_scroll` — item · common · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-HEXSCROLL-1` | Puts “Swamp” on the chosen target | The holder carries “Hex Scroll”. | 1. The holder uses “Hex Scroll” on the rival.<br>2. The rival passes a game, the dice show 5. | 1. The item is used; the holder does not carry “Hex Scroll” or “Swamp”; the rival carries “Swamp”.<br>2. The move goes 4 cells forward. | publish · `pnpm test` |
| `SC-HEXSCROLL-2` | Refuses to be used with no target | The holder carries “Hex Scroll”. | The holder uses “Hex Scroll” with no target. | The use is refused: `ieeTargetRequired`; the holder carries “Hex Scroll”. | publish · `pnpm test` |
| `SC-HEXSCROLL-3` | Refuses to be used on yourself | The holder carries “Hex Scroll”. | The holder uses “Hex Scroll” on themselves. | The use is refused: `ieeTargetSelfNotAllowed`; the holder carries “Hex Scroll”. | publish · `pnpm test` |
| `SC-HEXSCROLL-4` | Refuses a target who has left the run | The holder carries “Hex Scroll” and the rival has left the run. | The holder uses “Hex Scroll” on the rival. | The use is refused: `ieeTargetNotActive`; the holder carries “Hex Scroll”. | publish · `pnpm test` |
| `SC-HEXSCROLL-7` | Cannot reach a move that is already in flight | The holder carries “Hex Scroll” and the rival has a game in flight. | 1. The holder uses “Hex Scroll” on the rival.<br>2. The rival passes a game, the dice show 5.<br>3. The rival passes a game, the dice show 5. | 1. The item is used.<br>2. The move goes 5 cells forward.<br>3. The move goes 4 cells forward. | publish · `pnpm test` |
| `SC-HEXSCROLL-5` | The victim learns who hit them | two players in one season with targeting allowed | one uses the scroll on the other | the status names its caster and the feed records who, what and on whom | live probe |
| `SC-HEXSCROLL-6` | One charge, however many clicks | a single scroll in the inventory | several uses are submitted at once | exactly one succeeds | live probe |

- **SC-HEXSCROLL-7** — The rule for every offensive item, not just this one. A penalty cell has always worked this way — its status is granted at the end of a turn and bites the next — and an item timed at an open roll used to bite the move already underway, with no window in which the victim could answer.
- **SC-HEXSCROLL-6** — The charge guard is in the UPDATE's WHERE clause, not a preceding SELECT.

## Hook

`hook` — item · rare · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-HOOK-1` | Pulls the chosen player two cells back | The holder carries “Hook”. | The holder uses “Hook”. | The item is used; the holder is on cell 10; the rival is on cell 10; the holder does not carry “Hook”. | publish · `pnpm test` |
| `SC-HOOK-2` | Stops at the first cell | The holder carries “Hook”, the rival is on cell 1 and the board loops. | The holder uses “Hook”. | The item is used; the rival is on cell 0. | publish · `pnpm test` |
| `SC-HOOK-3` | Refuses to be used on yourself | The holder carries “Hook”. | The holder uses “Hook” on themselves. | The use is refused: `ieeTargetSelfNotAllowed`; the holder is on cell 10; the holder carries “Hook”. | publish · `pnpm test` |

## Jinx

`jinx` — item · common · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-JINX-1` | Puts “Unlucky” on the chosen target | The holder carries “Jinx”. | 1. The holder uses “Jinx” on the rival.<br>2. The rival passes a game, the dice show 3. | 1. The item is used; the rival carries “Unlucky”.<br>2. The dice have 4 sides. | publish · `pnpm test` |
| `SC-JINX-2` | Refuses a target who has left the run | The holder carries “Jinx” and the rival has left the run. | The holder uses “Jinx” on the rival. | The use is refused: `ieeTargetNotActive`; the holder carries “Jinx”. | publish · `pnpm test` |

## Joker

`joker` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-JOKER-1` | Becomes the common item picked from the season's catalog | The holder carries “Joker”. | The holder uses “Joker”, picking “Boots of Speed” from the catalog. | The item is used; the holder carries “Boots of Speed”; the holder does not carry “Joker”. | publish · `pnpm test` |
| `SC-JOKER-2` | Asks which | The holder carries “Joker”. | The holder uses “Joker”. | The use is refused: `ieeEntryChoiceRequired`; the holder carries “Joker”. | publish · `pnpm test` |
| `SC-JOKER-3` | Only a common item | The holder carries “Joker”. | The holder uses “Joker”, picking “Cleansing Salve” from the catalog. | The use is refused: `ieeEntryChoiceInvalid`; the holder carries “Joker”. | publish · `pnpm test` |

## Lead Weights

`lead_weights` — item · common · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-WEIGHTS-1` | Plants “Heavy Boots” on the chosen player | The holder carries “Lead Weights”. | 1. The holder uses “Lead Weights”.<br>2. The rival passes a game, the dice show 5. | 1. The item is used; the holder does not carry “Lead Weights”; the rival carries “Heavy Boots”.<br>2. The move goes 3 cells forward; the rival does not carry “Heavy Boots”. | publish · `pnpm test` |
| `SC-WEIGHTS-2` | Refuses to be used on yourself | The holder carries “Lead Weights”. | The holder uses “Lead Weights” on themselves. | The use is refused: `ieeTargetSelfNotAllowed`; the holder carries “Lead Weights”. | publish · `pnpm test` |
| `SC-WEIGHTS-3` | Cannot plant a second pair | The holder carries “Lead Weights” and the rival carries “Heavy Boots”. | The holder uses “Lead Weights”. | The use is refused: `ieeTargetAlreadyAffected`; the holder carries “Lead Weights”; the rival carries “Heavy Boots”. | publish · `pnpm test` |
| `SC-WEIGHTS-4` | A game already in flight is spared | The holder carries “Lead Weights” and the rival has a game in flight. | 1. The holder uses “Lead Weights”.<br>2. The rival passes a game, the dice show 5.<br>3. The rival passes a game, the dice show 5. | 1. The item is used; the rival carries “Heavy Boots”.<br>2. The move goes 5 cells forward; the rival carries “Heavy Boots”.<br>3. The move goes 3 cells forward; the rival does not carry “Heavy Boots”. | publish · `pnpm test` |

- **SC-WEIGHTS-3** — A player holds at most one of each cursed item: the use is refused before the weights are spent (spec §6.10).
- **SC-WEIGHTS-4** — A cursed item bites from its holder's next roll on, never the game in flight (spec §6.10).

## Lucky Coin

`lucky_coin` — item · common · target: self · window: after_dice

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-LUCKYCOIN-1` | The dice are thrown again and the new throw stands | The holder carries “Lucky Coin”. | The holder passes a game, the dice show 2, then 5, the holder answers the dice with “Lucky Coin”. | The move goes 5 cells forward; the reaction window opens and the item is used; the holder does not carry “Lucky Coin”. | publish · `pnpm test` |
| `SC-LUCKYCOIN-2` | Even when the new throw is worse | The holder carries “Lucky Coin”. | The holder passes a game, the dice show 5, then 2, the holder answers the dice with “Lucky Coin”. | The move goes 2 cells forward; the reaction window opens and the item is used. | publish · `pnpm test` |
| `SC-LUCKYCOIN-3` | On a long drop it may save the way back | The holder is on cell 20 and the holder carries “Lucky Coin”. | The holder drops a game, the dice show 12, then 1, the holder answers the dice with “Lucky Coin”. | The move goes 2 cells back; the reaction window opens and the item is used; the holder does not carry “Lucky Coin”. | publish · `pnpm test` |
| `SC-LUCKYCOIN-4` | The dice accepted, the coin stays | The holder carries “Lucky Coin”. | The holder passes a game, the dice show 2. | The move goes 2 cells forward; the reaction window opens and the dice are accepted; the holder carries “Lucky Coin”. | publish · `pnpm test` |

## Magnet

`magnet` — item · common · target: other (ahead) · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MAGNET-1` | A pass lower than the chosen player's last roll goes two cells further | The holder carries “Magnet” and the rival's last roll was 5. | 1. The holder uses “Magnet”.<br>2. The holder passes a game, the dice show 3. | 1. The item is used; the holder carries “Magnetic Pull”; the holder does not carry “Magnet”.<br>2. The move goes 5 cells forward; the holder does not carry “Magnetic Pull”. | publish · `pnpm test` |
| `SC-MAGNET-2` | A roll as high as theirs gets nothing | The holder carries “Magnet” and the rival's last roll was 5. | 1. The holder uses “Magnet”.<br>2. The holder passes a game, the dice show 5. | 1. Nothing is checked.<br>2. The move goes 5 cells forward; the holder does not carry “Magnetic Pull”. | publish · `pnpm test` |
| `SC-MAGNET-3` | Compares against the chosen player's last roll as it is when the dice are thrown | The holder carries “Magnet” and the rival's last roll was 2. | 1. The holder uses “Magnet”.<br>2. The rival passes a game, the dice show 6.<br>3. The holder passes a game, the dice show 4. | 1. Nothing is checked.<br>2. The rival is on cell 18.<br>3. The move goes 6 cells forward. | publish · `pnpm test` |
| `SC-MAGNET-4` | Only a player ahead can be chosen | The holder carries “Magnet”, the rival is on cell 5 and the rival's last roll was 5. | The holder uses “Magnet”. | The use is refused: `ieeTargetNotEligible`; the holder carries “Magnet”. | publish · `pnpm test` |

- **SC-MAGNET-3** — The pull remembers whom the magnet was aimed at, not their roll: a roll they make in between counts (spec §6.11).

## Mine

`mine` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MINE-1` | A rival's move through its cell stops there and is thrown 2 cells back; the mine is gone | The holder carries “Mine”. | 1. The holder uses “Mine”, picking cell 14.<br>2. The rival passes a game, the dice show 5.<br>3. The rival passes a game, the dice show 5. | 1. The item is used; 1 object on the board; the holder does not carry “Mine”.<br>2. The cell does not fire; no wheel spins; the rival is on cell 12; no object stands on the board.<br>3. The cell fires; the rival is on cell 17. | publish · `pnpm test` |
| `SC-MINE-2` | It acts on whoever enters first — its owner too, and a move that ends on its cell | The holder's “Mine” stands on cell 13. | The holder passes a game, the dice show 3. | The move goes 1 cell forward; the cell does not fire; the holder is on cell 11; no object stands on the board. | publish · `pnpm test` |
| `SC-MINE-3` | A move back meets it too and goes 2 cells further back | The rival's “Mine” stands on cell 8. | The holder drops a game, the dice show 3. | The move goes 4 cells back; the cell does not fire; the holder is on cell 6; no object stands on the board. | publish · `pnpm test` |
| `SC-MINE-4` | A move that ends short of it leaves it standing | The holder's “Mine” stands on cell 16. | The holder passes a game, the dice show 5. | The cell fires; the holder is on cell 15; 1 object on the board. | publish · `pnpm test` |
| `SC-MINE-5` | Asks for a free cell; refused, it stays in the inventory | The holder carries “Mine” and the rival's “Spring” stands on cell 14. | 1. The holder uses “Mine”.<br>2. The holder uses “Mine”, picking cell 14. | 1. The use is refused: `ieePickRequired`; the holder carries “Mine”.<br>2. The use is refused: `ieeCellUnavailable`; 1 object on the board; the holder carries “Mine”. | publish · `pnpm test` |

- **SC-MINE-1** — The holder starts on cell 10, the rival on 12; a pass moves by one d6, a drop by two, back (spec §5.5).
- **SC-MINE-3** — A drop of 3 from cell 10 would end on 7; the mine on 8 stops it there and throws it to 6 (spec §6.18).

## Mirror Shield

`mirror_shield` — item · passive · rare · 1 firing

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MIRROR-1` | Turns a rival's harmful item back on them | The holder carries “Mirror Shield” and the rival carries “Hex Scroll”. | The rival uses “Hex Scroll”. | The item is used; the holder does not carry “Mirror Shield” or “Swamp”; the rival carries “Swamp”; the rival does not carry “Hex Scroll”. | publish · `pnpm test` |
| `SC-MIRROR-2` | A swap of places cannot turn back: it is stopped | The holder carries “Mirror Shield”, the rival is on cell 5 and the rival carries “Scroll of Exchange”. | The rival uses “Scroll of Exchange”. | The item is used; the holder is on cell 10; the rival is on cell 5; the holder does not carry “Mirror Shield”. | publish · `pnpm test` |
| `SC-MIRROR-3` | «Метка» pierces it | The holder carries “Mirror Shield” and “Mark” and the rival carries “Hex Scroll”. | The rival uses “Hex Scroll”. | The item is used; the holder carries “Mirror Shield” and “Swamp”; the rival does not carry “Swamp”. | publish · `pnpm test` |

- **SC-MIRROR-2** — Turning a swap back would be the same swap, so the mirror stops it instead (spec §6.13).

## Philosopher's Stone

`philosophers_stone` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-STONE-1` | Turns the common item picked into the common one chosen | The holder carries “Philosopher's Stone” and “Boots of Speed”. | The holder uses “Philosopher's Stone”, picking “Boots of Speed”, picking “Hex Scroll” from the catalog. | The item is used; the holder carries “Hex Scroll”; the holder does not carry “Philosopher's Stone” or “Boots of Speed”. | publish · `pnpm test` |
| `SC-STONE-2` | Leaves rarer items alone | The holder carries “Philosopher's Stone” and “Cleansing Salve”. | The holder uses “Philosopher's Stone”, picking “Cleansing Salve”, picking “Hex Scroll” from the catalog. | The use is refused: `ieeChoiceInvalid`; the holder carries “Philosopher's Stone” and “Cleansing Salve”. | publish · `pnpm test` |
| `SC-STONE-3` | Asks which item to turn | The holder carries “Philosopher's Stone” and “Boots of Speed”. | The holder uses “Philosopher's Stone”, picking “Hex Scroll” from the catalog. | The use is refused: `ieeChoiceRequired`; the holder carries “Philosopher's Stone” and “Boots of Speed”. | publish · `pnpm test` |

## Phoenix

`phoenix` — item · passive · rare · 1 firing

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PHOENIX-1` | A move back becomes a step forward, then the phoenix is gone | The holder carries “Phoenix”. | The wheel drops “Backward Teleport” to the holder. | The holder is on cell 11; the holder does not carry “Phoenix”. | publish · `pnpm test` |
| `SC-PHOENIX-2` | A rival's «Крюк» too | The holder carries “Phoenix” and the rival carries “Hook”. | The rival uses “Hook”. | The item is used; the holder is on cell 11; the holder does not carry “Phoenix”; the rival does not carry “Hook”. | publish · `pnpm test` |
| `SC-PHOENIX-3` | A dropped game's move back is a regular move: it stays | The holder is on cell 20 and the holder carries “Phoenix”. | The holder drops a game, the dice show 6. | The move goes 6 cells back; the holder carries “Phoenix”. | publish · `pnpm test` |

## Portal Scroll

`portal_scroll` — item · epic · target: other (ahead) · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PORTAL-1` | Takes the holder onto the chosen player's cell | The holder carries “Portal Scroll” and the rival is on cell 20. | The holder uses “Portal Scroll”. | The item is used; the holder is on cell 20; the rival is on cell 20; the holder does not carry “Portal Scroll”. | publish · `pnpm test` |
| `SC-PORTAL-2` | Only a player ahead can be chosen | The holder carries “Portal Scroll” and the rival is on cell 5. | The holder uses “Portal Scroll”. | The use is refused: `ieeTargetNotEligible`; the holder is on cell 10; the holder carries “Portal Scroll”. | publish · `pnpm test` |

## Postponed Game

`postponed_game` — item · rare · target: self · window: on_open_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-POSTPONE-1` | Set aside now, the game comes back two rolls later | The holder is playing “Starfall” and the holder carries “Postponed Game”. | 1. The holder uses “Postponed Game”.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. The item is used; the holder is playing “Old Keep”; the holder does not carry “Postponed Game”.<br>2. The holder has no game in flight.<br>3. A game comes up; the holder is playing “Starfall”. | publish · `pnpm test` |
| `SC-POSTPONE-2` | Only while a game is in progress | The holder carries “Postponed Game”. | The holder uses “Postponed Game”. | The use is refused: `ieeItemWrongWindow`; the holder carries “Postponed Game”. | publish · `pnpm test` |
| `SC-POSTPONE-3` | Nothing left to play meanwhile: refused, and the item stays | The holder is playing “Sky Garden”, the holder has passed “Starfall”, “Old Keep”, “Quiet House”, “Gear Run”, “Tiny Planet”, “Iron Tide” and “Night Shift” and the holder carries “Postponed Game”. | The holder uses “Postponed Game”. | The use is refused: `catalogAllPlayed`; the holder is playing “Sky Garden”; the holder carries “Postponed Game”. | publish · `pnpm test` |

- **SC-POSTPONE-1** — Two rolls later counts the game picked now as the first: the set-aside game is the one after it (spec §6.16).

## Amulet of Purification

`purifying_amulet` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-AMULET-1` | Removes the cursed item the holder picks | The holder carries “Amulet of Purification”, “Swamp” and “Heavy Boots”. | The holder uses “Amulet of Purification”, picking “Heavy Boots”. | The item is used; the holder carries “Swamp”; the holder does not carry “Amulet of Purification” or “Heavy Boots”. | publish · `pnpm test` |
| `SC-AMULET-2` | Removes the penalty effect the holder picks | The holder carries “Amulet of Purification”, “Swamp” and “Heavy Boots”. | The holder uses “Amulet of Purification”, picking “Swamp”. | The item is used; the holder carries “Heavy Boots”; the holder does not carry “Swamp”. | publish · `pnpm test` |
| `SC-AMULET-3` | Asks which one to remove | The holder carries “Amulet of Purification” and “Swamp”. | The holder uses “Amulet of Purification”. | The use is refused: `ieeChoiceRequired`; the holder carries “Amulet of Purification” and “Swamp”. | publish · `pnpm test` |
| `SC-AMULET-4` | Leaves bonuses alone | The holder carries “Amulet of Purification” and “Tailwind”. | The holder uses “Amulet of Purification”, picking “Tailwind”. | The use is refused: `ieeChoiceInvalid`; the holder carries “Amulet of Purification” and “Tailwind”. | publish · `pnpm test` |

## Second Chance

`second_chance` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SECOND-1` | The next draw offers two games to choose from | The holder carries “Second Chance”. | 1. The holder uses “Second Chance”.<br>2. The holder's next game is picked. | 1. The item is used; the holder carries “Pick of Two”; the holder does not carry “Second Chance”.<br>2. A choice of games opens; the holder has no game in flight; a choice of 2 games waits. | publish · `pnpm test` |
| `SC-SECOND-2` | The game taken is the game | The holder carries “Second Chance”. | 1. The holder uses “Second Chance”.<br>2. The holder's next game is picked; if a choice opens, the holder takes “Old Keep”. | 1. The item is used.<br>2. A game comes up; the holder is playing “Old Keep”; no choice of games waits. | publish · `pnpm test` |

## Shield

`shield` — item · passive · common · 1 firing

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SHIELD-1` | Stops a rival's harmful item, then it is gone | The holder carries “Shield” and the rival carries “Hex Scroll”. | The rival uses “Hex Scroll”. | The item is used; the holder does not carry “Shield” or “Swamp”; the rival does not carry “Hex Scroll”. | publish · `pnpm test` |
| `SC-SHIELD-2` | A bonus from the wheel passes, and the shield waits | The holder carries “Shield”. | The wheel drops “Tailwind” to the holder. | It is granted; the holder carries “Shield” and “Tailwind”. | publish · `pnpm test` |
| `SC-SHIELD-3` | «Метка» pierces it | The holder carries “Shield” and “Mark” and the rival carries “Hex Scroll”. | The rival uses “Hex Scroll”. | The item is used; the holder carries “Shield” and “Swamp”. | publish · `pnpm test` |
| `SC-SHIELD-4` | Cannot be used | The holder carries “Shield”. | The holder uses “Shield”. | The use is refused: `ieeItemNotUsable`; the holder carries “Shield”. | publish · `pnpm test` |

## Snare

`snare` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SNARE-1` | A rival's move through its cell stops there; the penalty wheel spins instead of the cell; the snare is gone | The holder carries “Snare”. | 1. The holder uses “Snare”, picking cell 14.<br>2. The rival passes a game, the dice show 5.<br>3. The rival passes a game, the dice show 5. | 1. The item is used; 1 object on the board; the holder does not carry “Snare”.<br>2. The move goes 2 cells forward; the cell does not fire; the penalty wheel spins; the rival is on cell 14; no object stands on the board.<br>3. No wheel spins; the rival is on cell 19. | publish · `pnpm test` |
| `SC-SNARE-2` | Whatever cell the move would have ended on — the penalty wheel all the same, its owner's own move included | The holder's “Snare” stands on cell 13. | The holder passes a game, the dice show 5, the move ends on a bonus cell. | The cell does not fire; the penalty wheel spins; the holder is on cell 13; no object stands on the board. | publish · `pnpm test` |
| `SC-SNARE-3` | A move that ends short of it leaves it standing | The rival's “Snare” stands on cell 16. | The holder passes a game, the dice show 3. | No wheel spins; the holder is on cell 13; 1 object on the board. | publish · `pnpm test` |

- **SC-SNARE-1** — The holder starts on cell 10, the rival on 12; a pass moves by one d6, a drop by two, back (spec §5.5).
- **SC-SNARE-2** — The move would end on a bonus cell: stopped on the snare's cell, it never lands there (spec §6.18).

## Spare Die

`spare_die` — item · common · target: self · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SPAREDIE-1` | Grants “Lucky” to the holder | The holder carries “Spare Die”. | 1. The holder uses “Spare Die”.<br>2. The holder passes a game, the dice show 3. | 1. The item is used; the holder carries “Lucky”.<br>2. The dice have 8 sides. | publish · `pnpm test` |
| `SC-SPAREDIE-2` | Cannot be used once the dice are out | The holder has a game in flight and the holder carries “Spare Die”. | The holder uses “Spare Die”. | The use is refused: `ieeItemWrongWindow`; the holder carries “Spare Die”. | publish · `pnpm test` |

## Boots of Speed

`speed_boots` — item · common · target: self · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SPEEDBOOTS-1` | Grants “Tailwind” to the holder | The holder carries “Boots of Speed”. | 1. The holder uses “Boots of Speed”.<br>2. The holder passes a game, the dice show 5. | 1. The item is used; the holder carries “Tailwind”; the holder does not carry “Boots of Speed”.<br>2. The move goes 7 cells forward. | publish · `pnpm test` |
| `SC-SPEEDBOOTS-2` | Cannot be used once the dice are out | The holder has a game in flight and the holder carries “Boots of Speed”. | The holder uses “Boots of Speed”. | The use is refused: `ieeItemWrongWindow`; the holder carries “Boots of Speed”. | publish · `pnpm test` |

- **SC-SPEEDBOOTS-2** — `window: before_roll` — using them after seeing the dice would be free hindsight.

## Elixir of Speed

`speed_elixir` — item · common · target: self · window: after_dice

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-ELIXIR-1` | Used on a passed throw, the move is one cell longer | The holder carries “Elixir of Speed”. | The holder passes a game, the dice show 3, the holder answers the dice with “Elixir of Speed”. | The move goes 4 cells forward; the reaction window opens and the item is used; the holder does not carry “Elixir of Speed”. | publish · `pnpm test` |
| `SC-ELIXIR-2` | The dice accepted, the elixir stays | The holder carries “Elixir of Speed”. | The holder passes a game, the dice show 3. | The move goes 3 cells forward; the reaction window opens and the dice are accepted; the holder carries “Elixir of Speed”. | publish · `pnpm test` |
| `SC-ELIXIR-3` | Not offered on a dropped game | The holder is on cell 20 and the holder carries “Elixir of Speed”. | The holder drops a game, the dice show 5, the holder answers the dice with “Elixir of Speed”. | The move goes 5 cells back; no reaction window opens; the holder carries “Elixir of Speed”. | publish · `pnpm test` |
| `SC-ELIXIR-4` | Cannot be used from the inventory | The holder carries “Elixir of Speed”. | The holder uses “Elixir of Speed”. | The use is refused: `ieeItemReactionOnly`; the holder carries “Elixir of Speed”. | publish · `pnpm test` |

- **SC-ELIXIR-3** — One more on a drop would be a longer move back, so the elixir acts on passed games only (spec §6.8).

## Spring

`spring` — item · common · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SPRING-1` | A move through its cell goes 2 cells further, and the cell where it ends fires; the spring is gone | The holder carries “Spring”. | 1. The holder uses “Spring”, picking cell 14.<br>2. The rival passes a game, the dice show 4. | 1. The item is used; 1 object on the board; the holder does not carry “Spring”.<br>2. The move goes 6 cells forward; the cell fires; the rival is on cell 18; no object stands on the board. | publish · `pnpm test` |
| `SC-SPRING-2` | Its owner's own move is carried on too, and so is one that ends on its cell | The holder's “Spring” stands on cell 12. | The holder passes a game, the dice show 2. | The move goes 4 cells forward; the cell fires; the holder is on cell 14; no object stands on the board. | publish · `pnpm test` |
| `SC-SPRING-3` | A move back is carried further back | The rival's “Spring” stands on cell 8. | The holder drops a game, the dice show 3. | The move goes 5 cells back; the cell fires; the holder is on cell 5; no object stands on the board. | publish · `pnpm test` |
| `SC-SPRING-4` | An object on the longer way acts too | The holder's “Spring” stands on cell 12 and the rival's “Mine” stands on cell 16. | The holder passes a game, the dice show 5. | The move goes 4 cells forward; the cell does not fire; the holder is on cell 14; no object stands on the board. | publish · `pnpm test` |

- **SC-SPRING-1** — The holder starts on cell 10, the rival on 12; a pass moves by one d6, a drop by two, back (spec §5.5).
- **SC-SPRING-4** — From cell 10 a pass of 5 meets the spring on 12 and would end on 17; the mine on 16 stops it there and throws it to 14 (spec §6.18).

## Scroll of Exchange

`swap_scroll` — item · legendary · target: other (ahead) · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SWAPSCROLL-1` | Swaps the holder and the chosen player | The holder carries “Scroll of Exchange” and the rival is on cell 20. | The holder uses “Scroll of Exchange”. | The item is used; the holder is on cell 20; the rival is on cell 10. | publish · `pnpm test` |
| `SC-SWAPSCROLL-2` | Only a player ahead can be chosen | The holder carries “Scroll of Exchange” and the rival is on cell 5. | The holder uses “Scroll of Exchange”. | The use is refused: `ieeTargetNotEligible`; the holder is on cell 10; the rival is on cell 5. | publish · `pnpm test` |

## Teleport

`teleport` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TELEPORT-1` | Moves the holder three cells forward at once | The holder carries “Teleport”. | The holder uses “Teleport”. | The item is used; the holder is on cell 13; the holder does not carry “Teleport”. | publish · `pnpm test` |
| `SC-TELEPORT-2` | Wraps past the last cell of a looping board | The holder is on cell 38, the holder carries “Teleport” and the board loops. | The holder uses “Teleport”. | The item is used; the holder is on cell 1. | publish · `pnpm test` |

- **SC-TELEPORT-2** — An out-of-turn move forward wraps on a loop; one back never does (spec §6.9).

## Ring of Teleportation

`teleport_ring` — item · epic · target: other (ahead) · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-RING-1` | Takes the holder to the cell right before the chosen player | The holder carries “Ring of Teleportation” and the rival is on cell 20. | The holder uses “Ring of Teleportation”. | The item is used; the holder is on cell 19; the rival is on cell 20. | publish · `pnpm test` |
| `SC-RING-2` | Only a player ahead can be chosen | The holder carries “Ring of Teleportation” and the rival is on cell 5. | The holder uses “Ring of Teleportation”. | The use is refused: `ieeTargetNotEligible`; the holder is on cell 10. | publish · `pnpm test` |

## Thief's Glove

`thief_glove` — item · epic · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-GLOVE-1` | Takes a random bonus item from the chosen player | The holder carries “Thief's Glove” and the rival carries “Boots of Speed”. | The holder uses “Thief's Glove”. | The item is used; the holder carries “Boots of Speed”; the holder does not carry “Thief's Glove”; the rival does not carry “Boots of Speed”. | publish · `pnpm test` |
| `SC-GLOVE-2` | Cursed items stay where they are | The holder carries “Thief's Glove” and the rival carries “Heavy Boots”. | The holder uses “Thief's Glove”. | The holder does not carry “Heavy Boots”; the rival carries “Heavy Boots”. | publish · `pnpm test` |
| `SC-GLOVE-3` | A «Щит» stops it | The holder carries “Thief's Glove” and the rival carries “Boots of Speed” and “Shield”. | The holder uses “Thief's Glove”. | The item is used; the holder does not carry “Thief's Glove” or “Boots of Speed”; the rival carries “Boots of Speed”; the rival does not carry “Shield”. | publish · `pnpm test` |

## Three Doors

`three_doors` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-DOORS-1` | The next draw offers three games to choose from | The holder carries “Three Doors”. | 1. The holder uses “Three Doors”.<br>2. The holder's next game is picked. | 1. The item is used; the holder carries “Behind the Doors”; the holder does not carry “Three Doors”.<br>2. A choice of games opens; the holder has no game in flight; a choice of 3 games waits. | publish · `pnpm test` |
| `SC-DOORS-2` | Any of the three may be taken | The holder carries “Three Doors”. | 1. The holder uses “Three Doors”.<br>2. The holder's next game is picked; if a choice opens, the holder takes “Quiet House”. | 1. The item is used.<br>2. A game comes up; the holder is playing “Quiet House”; no choice of games waits. | publish · `pnpm test` |
| `SC-DOORS-3` | A game not behind the doors cannot be taken | The holder carries “Three Doors”. | 1. The holder uses “Three Doors”.<br>2. The holder's next game is picked; if a choice opens, the holder takes “Sky Garden”. | 1. The item is used.<br>2. A choice of games opens; the holder has no game in flight; a choice of 3 games waits. | publish · `pnpm test` |
| `SC-DOORS-4` | Used during a game, the doors open at the game after it | The holder is playing “Starfall” and the holder carries “Three Doors”. | 1. The holder uses “Three Doors”.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. The item is used; the holder is playing “Starfall”; no choice of games waits.<br>2. The holder has no game in flight.<br>3. A choice of games opens; a choice of 3 games waits. | publish · `pnpm test` |

## Time Stone

`time_stone` — item · rare · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TIMESTONE-1` | Returns the chosen player to where their last move started | The holder carries “Time Stone”. | 1. The rival passes a game, the dice show 4.<br>2. The holder uses “Time Stone”. | 1. The rival is on cell 16.<br>2. The item is used; the rival is on cell 12; the holder does not carry “Time Stone”. | publish · `pnpm test` |
| `SC-TIMESTONE-2` | A player who has not moved yet stays put | The holder carries “Time Stone”. | The holder uses “Time Stone”. | The rival is on cell 12. | publish · `pnpm test` |

## Scroll of Trade

`trade_scroll` — item · rare · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TRADE-1` | The holder and the chosen player swap a random bonus item each | The holder carries “Scroll of Trade” and “Boots of Speed” and the rival carries “Hex Scroll”. | The holder uses “Scroll of Trade”. | The item is used; the holder carries “Hex Scroll”; the holder does not carry “Scroll of Trade” or “Boots of Speed”; the rival carries “Boots of Speed”; the rival does not carry “Hex Scroll”. | publish · `pnpm test` |
| `SC-TRADE-2` | Nothing moves when the chosen player has none | The holder carries “Scroll of Trade” and “Boots of Speed”. | The holder uses “Scroll of Trade”. | The holder carries “Boots of Speed”. | publish · `pnpm test` |
| `SC-TRADE-3` | Cursed items never change hands | The holder carries “Scroll of Trade” and “Boots of Speed” and the rival carries “Heavy Boots”. | The holder uses “Scroll of Trade”. | The holder carries “Boots of Speed”; the holder does not carry “Heavy Boots”; the rival carries “Heavy Boots”. | publish · `pnpm test` |

## Treasure Map

`treasure_map` — item · common · target: self · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MAP-1` | The next move ending on a bonus cell spins the wheel twice | The holder carries “Treasure Map”. | 1. The holder uses “Treasure Map”.<br>2. The holder passes a game, the dice show 3, the move ends on a bonus cell. | 1. The item is used; the holder carries “Treasure Hunt”; the holder does not carry “Treasure Map”.<br>2. The bonus wheel spins; the bonus wheel spins once more; the holder does not carry “Treasure Hunt”. | publish · `pnpm test` |
| `SC-MAP-2` | A move ending elsewhere: no second spin, and the search is over | The holder carries “Treasure Map”. | 1. The holder uses “Treasure Map”.<br>2. The holder passes a game, the dice show 3. | 1. Nothing is checked.<br>2. No wheel spins once more; the holder does not carry “Treasure Hunt”. | publish · `pnpm test` |
| `SC-MAP-3` | Cannot be used once the game is rolled | The holder has a game in flight and the holder carries “Treasure Map”. | The holder uses “Treasure Map”. | The use is refused: `ieeItemWrongWindow`; the holder carries “Treasure Map”. | publish · `pnpm test` |

## Acceleration

`acceleration` — effect · positive · common · 2 moves · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-ACCEL-1` | Adds one cell to the next move | The holder carries “Acceleration”. | The holder passes a game, the dice show 5. | The move goes 6 cells forward. | publish · `pnpm test` |
| `SC-ACCEL-2` | Lasts exactly two moves | The holder carries “Acceleration”. | 1. The holder passes a game, the dice show 5.<br>2. The holder passes a game, the dice show 5.<br>3. The holder passes a game, the dice show 5. | 1. The move goes 6 cells forward.<br>2. The move goes 6 cells forward; the holder does not carry “Acceleration”.<br>3. The move goes 5 cells forward. | publish · `pnpm test` |
| `SC-ACCEL-3` | A second copy refreshes rather than stacks | The holder carries “Acceleration”. | 1. “Acceleration” is handed to the holder.<br>2. The holder passes a game, the dice show 5. | 1. It refreshes the one already there; the holder carries “Acceleration”.<br>2. The move goes 6 cells forward. | publish · `pnpm test` |
| `SC-ACCEL-4` | Cancels “Swamp” exactly | The holder carries “Acceleration” and “Swamp”. | The holder passes a game, the dice show 5. | The move goes 5 cells forward. | publish · `pnpm test` |

- **SC-ACCEL-4** — The pair is ±1 cell for two moves each, so one answers the other for as long as both last.

## Backward Teleport

`back_teleport` — effect · negative · common · instant

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-BACKTELE-1` | Throws the holder up to three cells back at once | — | “Backward Teleport” is handed to the holder. | The holder is on cell 7; the holder does not carry “Backward Teleport”. | publish · `pnpm test` |
| `SC-BACKTELE-2` | At least one cell | Random draws come out high. | “Backward Teleport” is handed to the holder. | The holder is on cell 9. | publish · `pnpm test` |
| `SC-BACKTELE-3` | Stops at the first cell, even on a looping board | The holder is on cell 1 and the board loops. | “Backward Teleport” is handed to the holder. | The holder is on cell 0. | publish · `pnpm test` |

## Behind the Doors

`behind_doors` — effect · positive · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-BEHIND-1` | The draw offers three games and the holder takes one | The holder carries “Behind the Doors”. | 1. The holder's next game is picked; if a choice opens, the holder takes “Old Keep”.<br>2. The holder passes a game, the dice show 3. | 1. A game comes up; the holder is playing “Old Keep”; the holder carries “Behind the Doors”.<br>2. The holder does not carry “Behind the Doors”. | publish · `pnpm test` |
| `SC-BEHIND-2` | The last three games left, on high draws | The holder carries “Behind the Doors” and random draws come out high. | The holder's next game is picked; if a choice opens, the holder takes “Iron Tide”. | A game comes up; the holder is playing “Iron Tide”. | publish · `pnpm test` |

- **SC-BEHIND-2** — The scenario's draws are high: a draw takes the last game left in the scenario pool's order (spec §5.5).

## Burden

`burden` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-BURDEN-1` | A passed game moves one cell less for each item held | The holder carries “Burden”, “Boots of Speed” and “Spare Die”. | The holder passes a game, the dice show 5. | The move goes 3 cells forward; the holder does not carry “Burden”. | publish · `pnpm test` |
| `SC-BURDEN-2` | Never below 1 | The holder carries “Burden”, “Boots of Speed”, “Spare Die” and “Hex Scroll”. | The holder passes a game, the dice show 2. | The move goes 1 cell forward. | publish · `pnpm test` |
| `SC-BURDEN-3` | Cursed items weigh too | The holder carries “Burden” and “Cursed Die”. | The holder passes a game, the dice show 5, then 5. | The move goes 4 cells forward; the holder does not carry “Burden” or “Cursed Die”. | publish · `pnpm test` |
| `SC-BURDEN-4` | Empty hands, a full move | The holder carries “Burden”. | The holder passes a game, the dice show 5. | The move goes 5 cells forward; the holder does not carry “Burden”. | publish · `pnpm test` |
| `SC-BURDEN-5` | A dropped game is left alone and spends it | The holder is on cell 20 and the holder carries “Burden” and “Boots of Speed”. | The holder drops a game, the dice show 6. | The move goes 6 cells back; the holder does not carry “Burden”. | publish · `pnpm test` |

## Castling

`castling` — effect · negative · legendary · instant

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CASTLING-1` | Swaps the holder with the nearest rival behind | The rival is on cell 4. | “Castling” is handed to the holder. | The holder is on cell 4; the rival is on cell 10; the holder does not carry “Castling”. | publish · `pnpm test` |
| `SC-CASTLING-2` | With nobody behind nothing happens | — | “Castling” is handed to the holder. | The holder is on cell 10; the rival is on cell 12. | publish · `pnpm test` |

## Chain

`chain` — effect · negative · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CHAIN-1` | The holder cannot use items | The holder carries “Chain” and “Boots of Speed”. | The holder uses “Boots of Speed”. | The use is refused: `ieeItemsForbidden`; the holder carries “Boots of Speed”. | publish · `pnpm test` |
| `SC-CHAIN-2` | After the holder's next roll the items work again | The holder carries “Chain” and “Boots of Speed”. | 1. The holder passes a game, the dice show 3.<br>2. The holder uses “Boots of Speed”. | 1. The holder does not carry “Chain”.<br>2. The item is used; the holder does not carry “Boots of Speed”. | publish · `pnpm test` |

## Chosen Era

`chosen_era` — effect · positive · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CHOSENERA-1` | Only games released in the decade picked come up | The holder carries “Era Pick” and random draws come out high. | 1. The holder uses “Era Pick”, picking the years 1990–1999.<br>2. The holder's next game is picked. | 1. The item is used.<br>2. The holder is playing “Old Keep”; the holder carries “Chosen Era”. | publish · `pnpm test` |
| `SC-CHOSENERA-2` | One game, then it is over | The holder carries “Era Pick”. | 1. The holder uses “Era Pick”, picking the years 2000–2009.<br>2. The holder's next game is picked.<br>3. The holder drops a game, the dice show 4. | 1. The item is used.<br>2. The holder is playing “Quiet House”.<br>3. The holder does not carry “Chosen Era”. | publish · `pnpm test` |

- **SC-CHOSENERA-1** — The scenario's draws are high: a draw takes the last game left in the scenario pool's order (spec §5.5).

## Chosen Genre

`chosen_genre` — effect · positive · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CHOSENGENRE-1` | Only games of the genre picked come up | The holder carries “Genre Pick” and random draws come out high. | 1. The holder uses “Genre Pick”, picking the genre “horror”.<br>2. The holder's next game is picked. | 1. The item is used.<br>2. The holder is playing “Night Shift”; the holder carries “Chosen Genre”. | publish · `pnpm test` |
| `SC-CHOSENGENRE-2` | One game, then the draw is open again | The holder carries “Genre Pick”. | 1. The holder uses “Genre Pick”, picking the genre “horror”.<br>2. The holder's next game is picked.<br>3. The holder passes a game, the dice show 3.<br>4. The holder's next game is picked. | 1. The item is used.<br>2. The holder is playing “Quiet House”.<br>3. The holder does not carry “Chosen Genre”.<br>4. The holder is playing “Starfall”. | publish · `pnpm test` |
| `SC-CHOSENGENRE-3` | Handed out without a pick, it asks nothing of the draw | The holder carries “Chosen Genre”. | The holder's next game is picked. | The holder is playing “Starfall”. | publish · `pnpm test` |

- **SC-CHOSENGENRE-1** — The scenario's draws are high: a draw takes the last game left in the scenario pool's order (spec §5.5).

## Clean Start

`clean_start` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CLEANSTART-1` | The next game holds the condition until it is reported | The holder carries “Clean Start”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. A game comes up; the holder's game has 1 completion condition; the holder carries “Clean Start”.<br>2. The holder has no game in flight; the holder's game has no completion conditions; the holder does not carry “Clean Start”.<br>3. The holder's game has no completion conditions. | publish · `pnpm test` |
| `SC-CLEANSTART-2` | A game rerolled: the new game holds it again | The holder carries “Clean Start” and “Game Reroll”. | 1. The holder's next game is picked.<br>2. The holder uses “Game Reroll”. | 1. The holder is playing “Starfall”; the holder's game has 1 completion condition.<br>2. The item is used; the holder is playing “Old Keep”; the holder's game has 1 completion condition; the holder carries “Clean Start”. | publish · `pnpm test` |

## Curse

`curse` — effect · negative · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-CURSE-1` | A bonus item from the wheel never arrives | The holder carries “Curse”. | The wheel drops “Boots of Speed” to the holder. | It is refused; the holder carries “Curse”; the holder does not carry “Boots of Speed”. | publish · `pnpm test` |
| `SC-CURSE-2` | Bonus effects still arrive | The holder carries “Curse”. | The wheel drops “Tailwind” to the holder. | It is granted; the holder carries “Tailwind”. | publish · `pnpm test` |
| `SC-CURSE-3` | Over once the next game is played | The holder carries “Curse”. | 1. The holder passes a game, the dice show 3.<br>2. The wheel drops “Boots of Speed” to the holder. | 1. The holder does not carry “Curse”.<br>2. It is granted; the holder carries “Boots of Speed”. | publish · `pnpm test` |

## Curse Echo

`curse_echo` — effect · negative · rare · 1 trigger · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-ECHO-1` | The next penalty effect acts twice | The holder carries “Curse Echo”. | The wheel drops “Backward Teleport” to the holder. | The holder is on cell 4; the holder does not carry “Curse Echo”. | publish · `pnpm test` |
| `SC-ECHO-2` | A lasting one lasts twice as long | The holder carries “Curse Echo”. | 1. The wheel drops “Swamp” to the holder.<br>2. The holder passes a game, the dice show 3.<br>3. The holder passes a game, the dice show 3.<br>4. The holder passes a game, the dice show 3. | 1. The holder carries “Swamp”; the holder does not carry “Curse Echo”.<br>2. The move goes 2 cells forward.<br>3. The move goes 2 cells forward.<br>4. The move goes 2 cells forward; the holder carries “Swamp”. | publish · `pnpm test` |
| `SC-ECHO-3` | A bonus passes untouched, and the echo waits | The holder carries “Curse Echo”. | The wheel drops “Tailwind” to the holder. | The holder carries “Curse Echo” and “Tailwind”. | publish · `pnpm test` |

## Curse of Greed

`curse_of_greed` — effect · negative · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-GREED-1` | The holder keeps the one bonus item they choose, the rest burn | The holder carries “Boots of Speed” and “Cleansing Salve”. | 1. “Curse of Greed” is handed to the holder.<br>2. The holder keeps “Cleansing Salve”. | 1. A choice waits for the holder.<br>2. The choice is made; no choice waits for the holder; the holder carries “Cleansing Salve”; the holder does not carry “Boots of Speed”. | publish · `pnpm test` |
| `SC-GREED-2` | One more arriving asks again | The holder carries “Boots of Speed”. | 1. “Curse of Greed” is handed to the holder.<br>2. The wheel drops “Hex Scroll” to the holder. | 1. No choice waits for the holder.<br>2. A choice waits for the holder. | publish · `pnpm test` |
| `SC-GREED-3` | Over once the next game is played | The holder carries “Boots of Speed”. | 1. “Curse of Greed” is handed to the holder.<br>2. The holder passes a game, the dice show 3.<br>3. The wheel drops “Hex Scroll” to the holder. | 1. Nothing is checked.<br>2. The holder does not carry “Curse of Greed”.<br>3. No choice waits for the holder; the holder carries “Boots of Speed” and “Hex Scroll”. | publish · `pnpm test` |

## Fast Track

`fast_track` — effect · positive · rare · 1 passed game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-FASTTRACK-1` | The next passed game is thrown twice and the better throw counts | The holder carries “Fast Track”. | The holder passes a game, the dice show 2, then 5. | The move goes 5 cells forward; the holder does not carry “Fast Track”. | publish · `pnpm test` |
| `SC-FASTTRACK-2` | Waits through a dropped game | The holder is on cell 20 and the holder carries “Fast Track”. | 1. The holder drops a game, the dice show 7.<br>2. The holder passes a game, the dice show 3, then 1. | 1. The move goes 7 cells back; the holder carries “Fast Track”.<br>2. The move goes 3 cells forward; the holder does not carry “Fast Track”. | publish · `pnpm test` |

## Roll of Fate

`fate_roll` — effect · positive · epic · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-FATEROLL-1` | A passed game is rolled with a die more | The holder carries “Roll of Fate”. | The holder passes a game, the dice show 7. | The move goes 7 cells forward; 2 dice are thrown; the holder does not carry “Roll of Fate”. | publish · `pnpm test` |
| `SC-FATEROLL-2` | A dropped game rolls the season's dice and spends it | The holder is on cell 20 and the holder carries “Roll of Fate”. | The holder drops a game, the dice show 4. | The move goes 4 cells back; 2 dice are thrown; the holder does not carry “Roll of Fate”. | publish · `pnpm test` |

- **SC-FATEROLL-2** — Twice the dice on a drop would throw the holder twice as far back, so the extra die is for passed games only.

## Favoured Game

`favoured_game` — effect · positive · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-FAVOURED-1` | The game favoured comes up, and the favour is over with it | The holder carries “Favourite”. | 1. The holder uses “Favourite”, picking “Iron Tide”.<br>2. The holder's next game is picked.<br>3. The holder passes a game, the dice show 3. | 1. The item is used.<br>2. The holder is playing “Iron Tide”; the holder carries “Favoured Game”.<br>3. The holder does not carry “Favoured Game”. | publish · `pnpm test` |
| `SC-FAVOURED-2` | Favoured, not certain: another game may still come up | The holder carries “Favourite” and random draws come out high. | 1. The holder uses “Favourite”, picking “Starfall”.<br>2. The holder's next game is picked. | 1. The item is used.<br>2. The holder is playing “Sky Garden”. | publish · `pnpm test` |

- **SC-FAVOURED-1** — The scenario's draws are low: a draw takes the first game left in the scenario pool's order (spec §5.5).
- **SC-FAVOURED-2** — The scenario's draws are high: the favoured game weighs three, each other one, and the last share of the draw is another game's.

## Fortune

`fortune` — effect · positive · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-FORTUNE-1` | A 1 on a passed game is thrown again | The holder carries “Fortune”. | The holder passes a game, the dice show 1, then 4. | The move goes 4 cells forward; the holder does not carry “Fortune”. | publish · `pnpm test` |
| `SC-FORTUNE-2` | A dropped game is left alone | The holder is on cell 20 and the holder carries “Fortune”. | The holder drops a game, the dice show 2, then 6. | The move goes 2 cells back; the holder does not carry “Fortune”. | publish · `pnpm test` |

## Genre Trial

`genre_trial` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TRIAL-1` | No game sharing a genre with the last game passed | The holder has passed “Night Shift” and the holder carries “Genre Trial”. | The holder's next game is picked. | A game comes up; the holder is playing “Old Keep”. | publish · `pnpm test` |
| `SC-TRIAL-2` | One game, then the draw is open again | The holder has passed “Night Shift” and the holder carries “Genre Trial”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. The holder is playing “Old Keep”.<br>2. The holder does not carry “Genre Trial”.<br>3. The holder is playing “Starfall”. | publish · `pnpm test` |
| `SC-TRIAL-3` | No game passed yet: the draw as it is | The holder carries “Genre Trial”. | The holder's next game is picked. | The holder is playing “Starfall”. | publish · `pnpm test` |

- **SC-TRIAL-1** — Night Shift is horror and action; Starfall, the first game of the scenario pool, is action too, so the draw passes it over (spec §5.5).

## Greedy Explorer

`greedy_explorer` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-EXPLORER-1` | The next game holds the condition until it is reported | The holder carries “Greedy Explorer”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. A game comes up; the holder's game has 1 completion condition; the holder carries “Greedy Explorer”.<br>2. The holder has no game in flight; the holder's game has no completion conditions; the holder does not carry “Greedy Explorer”.<br>3. The holder's game has no completion conditions. | publish · `pnpm test` |
| `SC-EXPLORER-2` | With another such penalty, the game holds both conditions | The holder carries “Greedy Explorer” and “Hard Mode”. | The holder's next game is picked. | The holder's game has 2 completion conditions. | publish · `pnpm test` |

## Hard Mode

`hard_mode` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-HARDMODE-1` | The next game holds the condition until it is reported | The holder carries “Hard Mode”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. A game comes up; the holder's game has 1 completion condition; the holder carries “Hard Mode”.<br>2. The holder has no game in flight; the holder's game has no completion conditions; the holder does not carry “Hard Mode”.<br>3. The holder's game has no completion conditions. | publish · `pnpm test` |
| `SC-HARDMODE-2` | Received during a game, it is the game after it | The holder is playing “Starfall”. | 1. “Hard Mode” is handed to the holder.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. The holder's game has no completion conditions; the holder carries “Hard Mode”.<br>2. The holder carries “Hard Mode”.<br>3. The holder's game has 1 completion condition. | publish · `pnpm test` |
| `SC-HARDMODE-3` | Immunity keeps it off | The holder carries “Hard Mode” and “Immunity”. | The holder's next game is picked. | The holder's game has no completion conditions. | publish · `pnpm test` |

## Heavy Step

`heavy_boots` — effect · negative · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-BOOTS-1` | Shortens the next move by two cells | The holder carries “Heavy Step”. | The holder passes a game, the dice show 5. | The move goes 3 cells forward. | publish · `pnpm test` |
| `SC-BOOTS-2` | Gone after a single roll | The holder carries “Heavy Step”. | The holder passes a game, the dice show 5. | The move goes 3 cells forward; the holder does not carry “Heavy Step”. | publish · `pnpm test` |
| `SC-BOOTS-3` | Cannot catapult a player to the far end of a looping board | The holder is on cell 0, the holder carries “Heavy Step” and the board loops. | The holder passes a game, the dice show 1. | The move goes nowhere. | publish · `pnpm test` |
| `SC-BOOTS-5` | A roll shorter than the penalty is cancelled, not reversed | The holder is on cell 18 and the holder carries “Heavy Step”. | The holder passes a game, the dice show 1. | The move goes nowhere. | publish · `pnpm test` |
| `SC-BOOTS-6` | Lasts exactly the number of rolls the catalog declares | The holder carries “Heavy Step”. | 1. The holder passes a game, the dice show 5.<br>2. The holder passes a game, the dice show 5. | 1. The move goes 3 cells forward.<br>2. The move goes 5 cells forward. | publish · `pnpm test` |
| `SC-BOOTS-4` | The salve clears it | a player carrying `heavy_boots` (the effect «Тяжёлый шаг») and holding a cleansing salve | they use the salve | the status is gone and the next move is full length | live probe |

- **SC-BOOTS-3** — The sharpest form of SC-SWAMP-4: a two-cell penalty at the start would otherwise make the player the leader.
- **SC-BOOTS-5** — SC-BOOTS-3 states the rule as a position ("stays on cell 0"), so the implementation only guarded cell 0 and every other cell reversed. Found by a live run, not by this suite. The rule is about the distance travelled: a status that shortens a move may cancel it and stop there.
- **SC-BOOTS-6** — The runtime once filtered activity with the roll before the one being resolved while expiry compared against the one just finished, so every `rolls` duration lasted one roll too long.
- **SC-BOOTS-4** — The salve takes effects only: the cursed item «Тяжёлые ботинки» (`cursed_boots`, wave A) stays — «Амулет очищения» removes it (spec §7.5).

## Immunity

`immunity` — effect · positive · common · 1 trigger · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-IMMUNITY-1` | The next game that would get completion conditions gets none, and the immunity is spent | The holder carries “Immunity” and “Hard Mode”. | The holder's next game is picked. | A game comes up; the holder's game has no completion conditions; the holder carries “Hard Mode”; the holder does not carry “Immunity”. | publish · `pnpm test` |
| `SC-IMMUNITY-2` | It waits for a game that would get them | The holder carries “Immunity”. | 1. The holder's next game is picked.<br>2. “Hard Mode” is handed to the holder.<br>3. The holder passes a game, the dice show 3.<br>4. The holder's next game is picked. | 1. The holder's game has no completion conditions; the holder carries “Immunity”.<br>2. The holder's game has no completion conditions.<br>3. The holder carries “Immunity” and “Hard Mode”.<br>4. The holder's game has no completion conditions; the holder does not carry “Immunity”. | publish · `pnpm test` |
| `SC-IMMUNITY-3` | Once: the conditions after it come through | The holder carries “Immunity” and “Hard Mode”. | 1. The holder's next game is picked.<br>2. “No Guides” is handed to the holder.<br>3. The holder passes a game, the dice show 3.<br>4. The holder's next game is picked. | 1. The holder's game has no completion conditions.<br>2. The holder's game has no completion conditions; the holder does not carry “Immunity”.<br>3. The holder has no game in flight.<br>4. The holder's game has 1 completion condition. | publish · `pnpm test` |

- **SC-IMMUNITY-2** — A condition comes with a landing and acts on the next game: the immunity outlasts the games that get none.

## Invisibility

`invisibility` — effect · positive · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-INVIS-1` | Rivals cannot aim items at the holder | The holder carries “Invisibility” and the rival carries “Hex Scroll”. | The rival uses “Hex Scroll”. | The use is refused: `ieeTargetUntargetable`; the holder does not carry “Swamp”; the rival carries “Hex Scroll”. | publish · `pnpm test` |
| `SC-INVIS-2` | Gone after the holder's next roll | The holder carries “Invisibility” and the rival carries “Hex Scroll”. | 1. The holder passes a game, the dice show 3.<br>2. The rival uses “Hex Scroll”. | 1. The holder does not carry “Invisibility”.<br>2. The item is used; the holder carries “Swamp”. | publish · `pnpm test` |

## Lost Time

`lost_time` — effect · negative · rare · 1 passed game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-LOSTTIME-1` | The next passed game gives no move | The holder carries “Lost Time”. | The holder passes a game, the dice show 5. | The move goes nowhere; the holder does not carry “Lost Time”. | publish · `pnpm test` |
| `SC-LOSTTIME-2` | A dropped game still goes back, and the effect waits | The holder is on cell 20 and the holder carries “Lost Time”. | 1. The holder drops a game, the dice show 6.<br>2. The holder passes a game, the dice show 5. | 1. The move goes 6 cells back; the holder carries “Lost Time”.<br>2. The move goes nowhere; the holder does not carry “Lost Time”. | publish · `pnpm test` |

- **SC-LOSTTIME-2** — Staying put on a drop would spare the move back, so it waits for a finished game — the merged «Ловушка» says the same.

## Lucky

`lucky` — effect · positive · common · 2 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-LUCKY-1` | Adds two sides to the dice | The holder carries “Lucky”. | The holder passes a game, the dice show 3. | The dice have 8 sides. | publish · `pnpm test` |
| `SC-LUCKY-2` | Lasts two rolls | The holder carries “Lucky”. | 1. The holder passes a game, the dice show 3.<br>2. The holder passes a game, the dice show 3.<br>3. The holder passes a game, the dice show 3. | 1. The dice have 8 sides.<br>2. The dice have 8 sides; the holder does not carry “Lucky”.<br>3. The dice have 6 sides. | publish · `pnpm test` |
| `SC-LUCKY-3` | A second copy does not stack | The holder carries “Lucky”. | 1. “Lucky” is handed to the holder.<br>2. The holder passes a game, the dice show 3. | 1. It is refused.<br>2. The dice have 8 sides. | publish · `pnpm test` |
| `SC-LUCKY-4` | A drop rolls the season's dice, and still counts as one of its rolls | The holder is on cell 20 and the holder carries “Lucky”. | 1. The holder drops a game, the dice show 4.<br>2. The holder passes a game, the dice show 3. | 1. The move goes 4 cells back; the dice have 6 sides.<br>2. The dice have 8 sides; the holder does not carry “Lucky”. | publish · `pnpm test` |

- **SC-LUCKY-4** — Bigger dice on a drop would throw the holder further back, so the status acts on passed games only (owner's call, 2026-10-09). Its duration counts rolls, drops included.

## Magnetic Pull

`magnet_pull` — effect · positive · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PULL-1` | Off the wheel it remembers nobody and does nothing | The holder carries “Magnetic Pull” and the rival's last roll was 5. | The holder passes a game, the dice show 3. | The move goes 3 cells forward; the holder does not carry “Magnetic Pull”. | publish · `pnpm test` |

- **SC-PULL-1** — The pull reads the player «Магнит» was aimed at (spec §6.11); handed out any other way there is nobody to compare with.

## Main Story Only

`main_story` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MAINSTORY-1` | The next game holds the condition until it is reported | The holder carries “Main Story Only”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. A game comes up; the holder's game has 1 completion condition; the holder carries “Main Story Only”.<br>2. The holder has no game in flight; the holder's game has no completion conditions; the holder does not carry “Main Story Only”.<br>3. The holder's game has no completion conditions. | publish · `pnpm test` |
| `SC-MAINSTORY-2` | A game set aside leaves the condition behind; the game picked now holds it | The holder carries “Main Story Only” and “Postponed Game”. | 1. The holder's next game is picked.<br>2. The holder uses “Postponed Game”. | 1. The holder is playing “Starfall”; the holder's game has 1 completion condition.<br>2. The item is used; the holder is playing “Old Keep”; the holder's game has 1 completion condition. | publish · `pnpm test` |

## Mark

`mark` — effect · negative · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MARK-1` | A rival's item gets through the holder's «Щит» | The holder carries “Mark” and “Shield” and the rival carries “Hex Scroll”. | The rival uses “Hex Scroll”. | The item is used; the holder carries “Swamp” and “Shield”. | publish · `pnpm test` |
| `SC-MARK-2` | Gone after the holder's next roll: the shield works again | The holder carries “Mark” and “Shield” and the rival carries “Hex Scroll”. | 1. The holder passes a game, the dice show 3.<br>2. The rival uses “Hex Scroll”. | 1. The holder does not carry “Mark”.<br>2. The item is used; the holder does not carry “Swamp” or “Shield”. | publish · `pnpm test` |

## Misfired Portal

`misfired_portal` — effect · negative · rare · instant

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MISPORTAL-1` | Throws the holder up to five cells back at once | — | “Misfired Portal” is handed to the holder. | The holder is on cell 5; the holder does not carry “Misfired Portal”. | publish · `pnpm test` |
| `SC-MISPORTAL-2` | At least one cell | Random draws come out high. | “Misfired Portal” is handed to the holder. | The holder is on cell 9. | publish · `pnpm test` |

## Misfortune

`misfortune` — effect · negative · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MISFORTUNE-1` | A 6 on a passed game is thrown again | The holder carries “Misfortune”. | The holder passes a game, the dice show 6, then 2. | The move goes 2 cells forward; the holder does not carry “Misfortune”. | publish · `pnpm test` |
| `SC-MISFORTUNE-2` | A dropped game is left alone | The holder is on cell 20 and the holder carries “Misfortune”. | The holder drops a game, the dice show 12, then 1. | The move goes 12 cells back; the holder does not carry “Misfortune”. | publish · `pnpm test` |

## Momentum

`momentum` — effect · positive · common · 3 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MOMENTUM-1` | Pays a point when the game is passed | The holder carries “Momentum”. | The holder passes a game, the dice show 3. | The holder's points change by +1. | publish · `pnpm test` |
| `SC-MOMENTUM-2` | Pays nothing when the game is dropped | The holder carries “Momentum”. | The holder drops a game, the dice show 4. | The holder's points do not change. | publish · `pnpm test` |
| `SC-MOMENTUM-3` | The payout reaches the ledger, not just the balance | a player carrying `momentum` | they pass a game | the balance rises and a ledger entry records why | live probe |

- **SC-MOMENTUM-3** — This hook was dispatched with its patch discarded once; the ledger is what proves it is wired.

## No DLC

`no_dlc` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-NODLC-1` | The next game holds the condition until it is reported | The holder carries “No DLC”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. A game comes up; the holder's game has 1 completion condition; the holder carries “No DLC”.<br>2. The holder has no game in flight; the holder's game has no completion conditions; the holder does not carry “No DLC”.<br>3. The holder's game has no completion conditions. | publish · `pnpm test` |
| `SC-NODLC-2` | A game taken from a choice holds it as it is taken | The holder carries “No DLC” and “Behind the Doors”. | The holder's next game is picked; if a choice opens, the holder takes “Old Keep”. | A game comes up; the holder is playing “Old Keep”; the holder's game has 1 completion condition. | publish · `pnpm test` |
| `SC-NODLC-3` | While the choice waits there is no game to hold it | The holder carries “No DLC” and “Behind the Doors”. | The holder's next game is picked. | A choice of games opens; the holder has no game in flight; the holder's game has no completion conditions; the holder carries “No DLC”. | publish · `pnpm test` |

## No Guides

`no_guides` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-NOGUIDES-1` | The next game holds the condition until it is reported | The holder carries “No Guides”. | 1. The holder's next game is picked.<br>2. The holder passes a game, the dice show 3.<br>3. The holder's next game is picked. | 1. A game comes up; the holder's game has 1 completion condition; the holder carries “No Guides”.<br>2. The holder has no game in flight; the holder's game has no completion conditions; the holder does not carry “No Guides”.<br>3. The holder's game has no completion conditions. | publish · `pnpm test` |
| `SC-NOGUIDES-2` | A dropped game takes the condition with it | The holder is on cell 20 and the holder carries “No Guides”. | 1. The holder's next game is picked.<br>2. The holder drops a game, the dice show 4. | 1. The holder's game has 1 completion condition.<br>2. The holder's game has no completion conditions; the holder does not carry “No Guides”. | publish · `pnpm test` |

## Old Hardware

`old_hardware` — effect · negative · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-OLDHW-1` | Only games released in 2009 or earlier come up | The holder carries “Old Hardware” and random draws come out high. | The holder's next game is picked. | A game comes up; the holder is playing “Tiny Planet”. | publish · `pnpm test` |
| `SC-OLDHW-2` | None that old left: the draw goes on without it | The holder has passed “Starfall”, “Old Keep”, “Quiet House”, “Gear Run” and “Tiny Planet” and the holder carries “Old Hardware”. | The holder's next game is picked. | A game comes up; the holder is playing “Iron Tide”. | publish · `pnpm test` |

- **SC-OLDHW-1** — The scenario's draws are high: a draw takes the last game left in the scenario pool's order (spec §5.5).

## One Chance

`one_chance` — effect · negative · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-ONECHANCE-1` | A dropped next game spins the penalty wheel as well | The holder is on cell 20 and the holder carries “One Chance”. | The holder drops a game, the dice show 5. | The penalty wheel spins once more; the holder does not carry “One Chance”. | publish · `pnpm test` |
| `SC-ONECHANCE-2` | A passed one does not, and the chance is spent | The holder carries “One Chance”. | The holder passes a game, the dice show 3. | No wheel spins once more; the holder does not carry “One Chance”. | publish · `pnpm test` |

## Overload

`overload` — effect · negative · rare · 1 passed game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-OVERLOAD-1` | Discarding two bonus items is the way out | The holder carries “Boots of Speed” and “Hex Scroll”. | 1. “Overload” is handed to the holder.<br>2. The holder discards “Boots of Speed” and “Hex Scroll”.<br>3. The holder passes a game, the dice show 5. | 1. A choice waits for the holder.<br>2. The choice is made; the holder does not carry “Overload”, “Boots of Speed” or “Hex Scroll”.<br>3. The move goes 5 cells forward. | publish · `pnpm test` |
| `SC-OVERLOAD-2` | Enduring, the next passed game moves at most 3 | The holder carries “Boots of Speed” and “Hex Scroll”. | 1. “Overload” is handed to the holder.<br>2. The holder gives nothing up.<br>3. The holder passes a game, the dice show 5. | 1. Nothing is checked.<br>2. The choice is made; the holder carries “Overload” and “Boots of Speed”.<br>3. The move goes 3 cells forward; the holder does not carry “Overload”. | publish · `pnpm test` |
| `SC-OVERLOAD-3` | With fewer than two there is nothing to choose: the cap | The holder carries “Boots of Speed”. | 1. “Overload” is handed to the holder.<br>2. The holder passes a game, the dice show 6. | 1. No choice waits for the holder.<br>2. The move goes 3 cells forward; the holder carries “Boots of Speed”; the holder does not carry “Overload”. | publish · `pnpm test` |
| `SC-OVERLOAD-4` | Left unanswered, the holder endures | The holder carries “Boots of Speed” and “Hex Scroll”. | 1. “Overload” is handed to the holder.<br>2. The holder passes a game, the dice show 5. | 1. Nothing is checked.<br>2. The move goes 3 cells forward; no choice waits for the holder; the holder carries “Boots of Speed” and “Hex Scroll”. | publish · `pnpm test` |
| `SC-OVERLOAD-5` | Waits through a dropped game | The holder is on cell 20. | 1. “Overload” is handed to the holder.<br>2. The holder drops a game, the dice show 8.<br>3. The holder passes a game, the dice show 5. | 1. Nothing is checked.<br>2. The move goes 8 cells back; the holder carries “Overload”.<br>3. The move goes 3 cells forward; the holder does not carry “Overload”. | publish · `pnpm test` |

## Pick of Two

`pick_of_two` — effect · positive · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PICKTWO-1` | The draw offers two games; one it did not offer cannot be taken | The holder carries “Pick of Two”. | The holder's next game is picked; if a choice opens, the holder takes “Gear Run”. | A choice of games opens; the holder has no game in flight; a choice of 2 games waits. | publish · `pnpm test` |
| `SC-PICKTWO-3` | The game taken is the game until it is reported, and the choice is over | The holder carries “Pick of Two”. | 1. The holder's next game is picked; if a choice opens, the holder takes “Starfall”.<br>2. The holder passes a game, the dice show 3. | 1. A game comes up; the holder is playing “Starfall”; no choice of games waits; the holder carries “Pick of Two”.<br>2. The holder has no game in flight; the holder does not carry “Pick of Two”. | publish · `pnpm test` |
| `SC-PICKTWO-2` | While the choice waits, no item can be used | The holder carries “Pick of Two” and “Boots of Speed”. | 1. The holder's next game is picked.<br>2. The holder uses “Boots of Speed”. | 1. A choice of games opens.<br>2. The use is refused: `ieeDecisionPending`; the holder carries “Boots of Speed”. | publish · `pnpm test` |

- **SC-PICKTWO-1** — The scenario's draws are low: a draw takes the first game left in the scenario pool's order (spec §5.5).

## Pickpocket

`pickpocket` — effect · negative · rare · instant

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PICKPOCKET-1` | A random bonus item of the holder goes to a rival | The holder carries “Boots of Speed”. | “Pickpocket” is handed to the holder. | The holder does not carry “Boots of Speed”; the rival carries “Boots of Speed”. | publish · `pnpm test` |
| `SC-PICKPOCKET-2` | Cursed items stay | The holder carries “Heavy Boots”. | “Pickpocket” is handed to the holder. | The holder carries “Heavy Boots”; the rival does not carry “Heavy Boots”. | publish · `pnpm test` |

## Poison

`poison` — effect · negative · rare · 2 passed games · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-POISON-1` | Shortens every move by one cell | The holder carries “Poison”. | The holder passes a game, the dice show 5. | The move goes 4 cells forward. | publish · `pnpm test` |
| `SC-POISON-2` | Ends with the second passed game | The holder carries “Poison”. | 1. The holder passes a game, the dice show 5.<br>2. The holder passes a game, the dice show 5.<br>3. The holder passes a game, the dice show 5. | 1. The move goes 4 cells forward.<br>2. The move goes 4 cells forward; the holder does not carry “Poison”.<br>3. The move goes 5 cells forward. | publish · `pnpm test` |
| `SC-POISON-3` | Dropped games do not count | The holder is on cell 20 and the holder carries “Poison”. | 1. The holder drops a game, the dice show 4.<br>2. The holder drops a game, the dice show 4.<br>3. The holder passes a game, the dice show 5.<br>4. The holder passes a game, the dice show 5.<br>5. The holder passes a game, the dice show 5. | 1. The move goes 5 cells back.<br>2. The move goes 5 cells back; the holder carries “Poison”.<br>3. The move goes 4 cells forward.<br>4. The move goes 4 cells forward; the holder does not carry “Poison”.<br>5. The move goes 5 cells forward. | publish · `pnpm test` |
| `SC-POISON-4` | A second copy refreshes rather than stacks | The holder carries “Poison”. | 1. “Poison” is handed to the holder.<br>2. The holder passes a game, the dice show 5. | 1. It refreshes the one already there; the holder carries “Poison”.<br>2. The move goes 4 cells forward. | publish · `pnpm test` |
| `SC-POISON-5` | A copy that arrives during a game in flight counts after it | The holder has a game in flight and the holder carries “Poison”. | 1. “Poison” is handed to the holder.<br>2. The holder passes a game, the dice show 5.<br>3. The holder passes a game, the dice show 5.<br>4. The holder passes a game, the dice show 5. | 1. It refreshes the one already there; the holder carries “Poison”.<br>2. The move goes 4 cells forward; the holder carries “Poison”.<br>3. The move goes 4 cells forward; the holder carries “Poison”.<br>4. The move goes 4 cells forward; the holder does not carry “Poison”. | publish · `pnpm test` |

- **SC-POISON-3** — `passed_games` (spec §7.9): dropping is not a way out of it.
- **SC-POISON-5** — A renewal is a fresh copy (spec §7.10): the game already in flight still bites and stays with the old count, so the two passed games after it are the renewal's.

## Pursuit

`pursuit` — effect · negative · rare · instant

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PURSUIT-1` | The nearest rival behind halves the gap at once | The rival is on cell 4. | “Pursuit” is handed to the holder. | The holder is on cell 10; the rival is on cell 7; the holder does not carry “Pursuit”. | publish · `pnpm test` |
| `SC-PURSUIT-2` | Half a cell rounds down to none | The rival is on cell 9. | “Pursuit” is handed to the holder. | The rival is on cell 9. | publish · `pnpm test` |
| `SC-PURSUIT-3` | With nobody behind nothing happens | — | “Pursuit” is handed to the holder. | The holder is on cell 10; the rival is on cell 12. | publish · `pnpm test` |

## Swamp

`swamp` — effect · negative · common · 2 moves · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SWAMP-1` | Shortens the next move by one cell | The holder carries “Swamp”. | The holder passes a game, the dice show 5. | The move goes 4 cells forward. | publish · `pnpm test` |
| `SC-SWAMP-2` | Lasts exactly two moves | The holder carries “Swamp”. | 1. The holder passes a game, the dice show 5.<br>2. The holder passes a game, the dice show 5.<br>3. The holder passes a game, the dice show 5. | 1. The move goes 4 cells forward.<br>2. The move goes 4 cells forward; the holder does not carry “Swamp”.<br>3. The move goes 5 cells forward. | publish · `pnpm test` |
| `SC-SWAMP-3` | A second copy refreshes rather than stacks | The holder carries “Swamp”. | 1. “Swamp” is handed to the holder.<br>2. The holder passes a game, the dice show 5. | 1. It refreshes the one already there; the holder carries “Swamp”.<br>2. The move goes 4 cells forward. | publish · `pnpm test` |
| `SC-SWAMP-4` | Never pushes a player backwards past the start | The holder is on cell 0, the holder carries “Swamp” and the board loops. | The holder passes a game, the dice show 1. | The move goes nowhere. | publish · `pnpm test` |
| `SC-SWAMP-6` | A cancelled move is not one of the two | `swamp` with two moves left | a turn resolves with its move cancelled, and then three regular moves follow | the first two regular moves are shortened and the third is not | `pnpm test` |
| `SC-SWAMP-5` | A penalty landing applies it and the next move is visibly shorter | a season whose negative pool is `swamp` | a player lands on a penalty cell and then rolls again | the status appears, the next move travels one cell less, and both are in the feed | live probe |

- **SC-SWAMP-3** — `stacking: refresh` — the clock restarts, the penalty does not double.
- **SC-SWAMP-4** — A negative modifier must not wrap: on a loop board cell -1 is the LAST cell, which would turn a penalty into a jump to the front.
- **SC-SWAMP-6** — The duration counts regular moves (spec §7.9). It was `slowed`, counted in rolls, until the `core` pack curated it in stage 2.

## Tailwind

`tailwind` — effect · positive · common · 1 move · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TAILWIND-1` | Adds two cells to the next move | The holder carries “Tailwind”. | The holder passes a game, the dice show 5. | The move goes 7 cells forward. | publish · `pnpm test` |
| `SC-TAILWIND-2` | Nets out against “Swamp” | The holder carries “Tailwind” and “Swamp”. | The holder passes a game, the dice show 5. | The move goes 6 cells forward. | publish · `pnpm test` |
| `SC-TAILWIND-3` | A second copy refreshes rather than stacks | The holder carries “Tailwind”. | 1. “Tailwind” is handed to the holder.<br>2. The holder passes a game, the dice show 5. | 1. It refreshes the one already there; the holder carries “Tailwind”.<br>2. The move goes 7 cells forward. | publish · `pnpm test` |
| `SC-TAILWIND-4` | Lasts exactly one move | The holder carries “Tailwind”. | 1. The holder passes a game, the dice show 5.<br>2. The holder passes a game, the dice show 5. | 1. The move goes 7 cells forward; the holder does not carry “Tailwind”.<br>2. The move goes 5 cells forward. | publish · `pnpm test` |

- **SC-TAILWIND-2** — Both are additive on the same hook, so they sum rather than one winning.
- **SC-TAILWIND-4** — Counted in moves since the `core` pack curated it in stage 2 ("next move", spec §17); a cancelled move does not use it up.

## Tax

`tax` — effect · negative · common · instant

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TAX-1` | The holder discards the bonus item they choose | The holder carries “Boots of Speed” and “Cleansing Salve”. | 1. “Tax” is handed to the holder.<br>2. The holder discards “Cleansing Salve”. | 1. A choice waits for the holder; the holder carries “Boots of Speed” and “Cleansing Salve”.<br>2. The choice is made; no choice waits for the holder; the holder carries “Boots of Speed”; the holder does not carry “Cleansing Salve”. | publish · `pnpm test` |
| `SC-TAX-2` | Left unanswered, the commonest goes when the next game is rolled | The holder carries “Boots of Speed” and “Cleansing Salve”. | 1. “Tax” is handed to the holder.<br>2. The holder passes a game, the dice show 4. | 1. Nothing is checked.<br>2. No choice waits for the holder; the holder carries “Cleansing Salve”; the holder does not carry “Boots of Speed”. | publish · `pnpm test` |
| `SC-TAX-3` | With one bonus item it goes at once | The holder carries “Boots of Speed”. | “Tax” is handed to the holder. | No choice waits for the holder; the holder does not carry “Boots of Speed”. | publish · `pnpm test` |
| `SC-TAX-4` | With none, one cell back | — | “Tax” is handed to the holder. | The holder is on cell 9; no choice waits for the holder. | publish · `pnpm test` |
| `SC-TAX-5` | Cursed items are never asked for | The holder carries “Heavy Boots”. | “Tax” is handed to the holder. | The holder is on cell 9; no choice waits for the holder; the holder carries “Heavy Boots”. | publish · `pnpm test` |

## Toll

`toll` — effect · negative · common · 3 moves · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TOLL-1` | Costs a point per landing | The holder carries “Toll”. | The holder passes a game, the dice show 4. | The holder's points change by −1. | publish · `pnpm test` |
| `SC-TOLL-2` | Balance never goes negative | The holder has 0 points and the holder carries “Toll”. | The holder passes a game, the dice show 4. | The holder's points do not change. | publish · `pnpm test` |
| `SC-TOLL-3` | A second copy does not stack | The holder carries “Toll”. | 1. “Toll” is handed to the holder.<br>2. The holder passes a game, the dice show 4. | 1. It is refused.<br>2. The holder's points change by −1. | publish · `pnpm test` |
| `SC-TOLL-5` | Charges for exactly three moves | The holder carries “Toll”. | 1. The holder passes a game, the dice show 4.<br>2. The holder passes a game, the dice show 4.<br>3. The holder passes a game, the dice show 4.<br>4. The holder passes a game, the dice show 4. | 1. The holder's points change by −1.<br>2. The holder's points change by −1.<br>3. The holder's points change by −1; the holder does not carry “Toll”.<br>4. The holder's points do not change. | publish · `pnpm test` |
| `SC-TOLL-4` | A ward does not stop the toll | a player carrying both a ward and `toll` | they land on a penalty cell | the landing is absorbed, and the toll is still charged | live probe |

- **SC-TOLL-4** — Deliberate: the ward absorbs the *cell*. `toll` is a status that bleeds on every landing, absorbed or not — it is answered by the salve, not by the ward.

## Treasure Hunt

`treasure_hunt` — effect · positive · common · 1 move · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-HUNT-1` | A move ending on a bonus cell spins the bonus wheel once more | The holder carries “Treasure Hunt”. | The holder passes a game, the dice show 3, the move ends on a bonus cell. | The bonus wheel spins; the bonus wheel spins once more; the holder does not carry “Treasure Hunt”. | publish · `pnpm test` |

## Uncharted Territory

`uncharted_territory` — effect · negative · rare · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-UNCHARTED-1` | No game of a genre already passed this season | The holder has passed “Starfall” and “Quiet House”, the holder carries “Uncharted Territory” and random draws come out high. | The holder's next game is picked. | A game comes up; the holder is playing “Iron Tide”. | publish · `pnpm test` |
| `SC-UNCHARTED-2` | Every genre already passed: the draw goes on without it | The holder has passed “Starfall”, “Old Keep”, “Quiet House”, “Gear Run”, “Tiny Planet” and “Iron Tide” and the holder carries “Uncharted Territory”. | The holder's next game is picked. | A game comes up; the holder is playing “Night Shift”. | publish · `pnpm test` |

- **SC-UNCHARTED-1** — The scenario's draws are high. Passed: Starfall (action, shooter) and Quiet House (horror, adventure) — Sky Garden and Night Shift share a genre with them, so Iron Tide is the last game left.

## Unlucky

`unlucky` — effect · negative · common · 3 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-UNLUCKY-1` | Removes two sides from the dice | The holder carries “Unlucky”. | The holder passes a game, the dice show 3. | The dice have 4 sides. | publish · `pnpm test` |
| `SC-UNLUCKY-2` | Dice never fall below two sides | The holder carries “Unlucky” and the season rolls d3. | The holder passes a game, the dice show 2. | The dice have 2 sides. | publish · `pnpm test` |
| `SC-UNLUCKY-3` | A second copy does not stack | The holder carries “Unlucky”. | 1. “Unlucky” is handed to the holder.<br>2. The holder passes a game, the dice show 3. | 1. It is refused; the holder carries “Unlucky”.<br>2. The dice have 4 sides. | publish · `pnpm test` |
| `SC-UNLUCKY-4` | “Lucky” cancels it exactly | The holder carries “Unlucky” and “Lucky”. | The holder passes a game, the dice show 3. | The dice have 6 sides. | publish · `pnpm test` |
| `SC-UNLUCKY-5` | A drop rolls the season's dice | The holder is on cell 20 and the holder carries “Unlucky”. | The holder drops a game, the dice show 4. | The move goes 4 cells back; the dice have 6 sides. | publish · `pnpm test` |

- **SC-UNLUCKY-2** — `rollDice` rejects fewer than two sides; the clamp keeps a status from throwing mid-turn.
- **SC-UNLUCKY-3** — `stacking: unique`.
- **SC-UNLUCKY-4** — Both are ±2 sides, so the counter is exact for as long as both are active.
- **SC-UNLUCKY-5** — Smaller dice on a drop would spare the holder part of the way back, so the status acts on passed games only (owner's call, 2026-10-09).

## Vetoed Genre

`vetoed_genre` — effect · positive · common · the next game · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-VETOED-1` | One game drawn without the genre vetoed, then it is over | The holder carries “Genre Veto”. | 1. The holder uses “Genre Veto”, picking the genre “action”.<br>2. The holder's next game is picked.<br>3. The holder passes a game, the dice show 3.<br>4. The holder's next game is picked. | 1. The item is used.<br>2. The holder is playing “Old Keep”; the holder carries “Vetoed Genre”.<br>3. The holder does not carry “Vetoed Genre”.<br>4. The holder is playing “Starfall”. | publish · `pnpm test` |
| `SC-VETOED-2` | Handed out without a pick, it changes nothing | The holder carries “Vetoed Genre”. | The holder's next game is picked. | The holder is playing “Starfall”. | publish · `pnpm test` |

## Ward

`ward` — effect · positive · rare · 1 trigger · stacking: stack

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-WARD-1` | Absorbs a penalty landing and is spent on it | The holder carries “Ward”. | The holder passes a game, the dice show 4, the move ends on a penalty cell. | The cell does not fire; no wheel spins; the holder does not carry “Ward”. | publish · `pnpm test` |
| `SC-WARD-2` | Ignores anything that is not a penalty | The holder carries “Ward”. | 1. The holder passes a game, the dice show 4, the move ends on a bonus cell.<br>2. The holder passes a game, the dice show 4, the move ends on an event cell.<br>3. The holder passes a game, the dice show 4.<br>4. The holder passes a game, the dice show 4, the move ends on a teleport cell. | 1. The cell fires; the bonus wheel spins.<br>2. The cell fires.<br>3. The cell fires.<br>4. The cell fires; the holder carries “Ward”. | publish · `pnpm test` |
| `SC-WARD-3` | Two wards absorb two landings | The holder carries “Ward” ×2. | 1. The holder passes a game, the dice show 4, the move ends on a penalty cell.<br>2. The holder passes a game, the dice show 4, the move ends on a penalty cell.<br>3. The holder passes a game, the dice show 4, the move ends on a penalty cell. | 1. The cell does not fire; the holder carries “Ward”.<br>2. The cell does not fire; the holder does not carry “Ward”.<br>3. The cell fires; the penalty wheel spins. | publish · `pnpm test` |
| `SC-WARD-4` | Absorbs the whole landing, not half of it | a player carrying a ward in a season whose penalty pool is `swamp` | they land on a penalty cell | the ward is spent, no negative status is applied and no balance is lost | live probe |
| `SC-WARD-5` | Protection ends with the charge | a ward already spent on a previous landing | the player lands on another penalty cell | the status and the balance penalty both land normally | live probe |

- **SC-WARD-1** — A ward absorbs the landing, not half of it: neither the cell nor its wheel acts.
- **SC-WARD-2** — Only a cell that would hurt is worth a charge.
- **SC-WARD-3** — `stacking: stack` — the only entry in the catalog that stacks. A veto is paid for once: the redundant one is free.
- **SC-WARD-4** — Shipped broken once (as the effect `shield`): the balance penalty was vetoed while the wheel still granted the status, so the charge was spent and the damage kept.
- **SC-WARD-5** — The other half of SC-WARD-4: proves absorption, not blanket suppression.

## Rules that span the subsystem

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-PVP-1` | With PvP off, no item reaches another player | a season with `allowTargetingOthers` off | any offensive item is used on an opponent | it is rejected with `ieeTargetingDisabled` | `pnpm test` |
| `SC-PVP-2` | New participants are protected for a while | a protection window of three moves and an opponent who has made two | an offensive item is used on them | it is rejected with `ieeTargetProtected` | `pnpm test` |
| `SC-PVP-3` | Targets from another season are not targets | a candidate who belongs to a different run | an offensive item is used on them | it is rejected with `ieeTargetNotActive` | `pnpm test` |
| `SC-POOL-1` | A per-player cap stops the same entry dropping forever | an entry with `maxPerPlayer: 1` that the player already holds | the wheel is spun | that entry is gated out of the pool | `pnpm test` |
| `SC-POOL-2` | An empty pool pays out nothing instead of failing the turn | a polarity whose entries are all disabled | the wheel is spun | the outcome is a fallback and the turn still resolves | `pnpm test` |
| `SC-POOL-3` | Disabling an entry mid-season keeps what players already hold | a player holding an item whose entry an admin then disables | the season continues | the held item still works and the entry stops dropping | live probe |
| `SC-POOL-4` | A season reset clears items, statuses and challenges | a player with an item, a status and an assigned challenge | an admin resets the season | all three are gone and the participant survives | live probe |
| `SC-POOL-5` | Switching an entry to a newer revision changes later drops only | a player holding a status granted under revision 1, and the season switched to revision 2 | the season continues | the held status keeps revision 1's text and duration, the rules page and the next drop show revision 2, and neither revision can be deleted | live probe |
| `SC-POOL-6` | A season-wide limit holds whoever hands an entry out | a season capped at one active status per player, and a player who has one | an item hands them another | the grant is refused and journaled with its reason; a status they already hold still refreshes | `pnpm test` |
| `SC-POOL-7` | A disabled tag takes an entry out of the season | a season that disables the tag `dice` | a bonus cell spins the wheel, or something hands out `lucky` | no entry with the tag is on the wheel, and the grant is refused | `pnpm test` |

- **SC-POOL-6** — Spec §4.5. The wheel's gates keep such an entry off the wheel; the executor holds the line for every other source.

---

## Running them

```
pnpm test                 # core's entry scenarios, the subsystem table, and the coverage checks
```

Publishing an entry or importing a pack runs its scenarios too, and refuses a red one.
The live half runs against a built app and a scratch database and lives in the
verification harness (`probe/scenarios.mts`), not in this repository's toolchain.
Its results are recorded in `WORKLOG.md` for each session.
