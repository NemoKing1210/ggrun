# Items & effects — scenario reference

> **Generated file — do not edit.** `pnpm scenarios:doc` rebuilds it from
> [`lib/engine/iee/scenarios.ts`](./lib/engine/iee/scenarios.ts), which is also what
> the tests run. A scenario cannot appear here without an implementation:
> `lib/engine/iee-scenarios.test.ts` and `probe/scenarios.mts` each fail if one of
> their tier is unimplemented.

58 scenarios across 15 entries — 47 pure (run by `pnpm test`), 11 live (need the turn transaction, the database and a browser).

Every scenario is phrased as an observable consequence rather than a property of
the catalog. Two bugs reached a real playthrough because a test asserted that an
effect *declared* a hook and never that the hook *did* anything.

## Contents

- [Hex Scroll](#hex-scroll) — 7
- [Cleansing Salve](#cleansing-salve) — 3
- [Lodestone](#lodestone) — 2
- [Spare Die](#spare-die) — 2
- [Lead Weights](#lead-weights) — 2
- [Jinx](#jinx) — 2
- [Slowed](#slowed) — 5
- [Shield](#shield) — 5
- [Heavy Boots](#heavy-boots) — 6
- [Unlucky](#unlucky) — 4
- [Taxed](#taxed) — 4
- [Tailwind](#tailwind) — 3
- [Lucky](#lucky) — 3
- [Momentum](#momentum) — 3
- [Rules that span the subsystem](#rules-that-span-the-subsystem) — 7

## Hex Scroll

`hex_scroll` — item · common · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-HEXSCROLL-1` | Puts `slowed` on the chosen target | an active opponent in the same season | the scroll is used on them | the intent grants `slowed` to that opponent and to nobody else | `pnpm test` |
| `SC-HEXSCROLL-2` | Refuses to be used with no target | no target supplied | the scroll is used | it is rejected with `ieeTargetRequired` | `pnpm test` |
| `SC-HEXSCROLL-3` | Refuses to be used on yourself | the holder as the target | the scroll is used | it is rejected with `ieeTargetSelfNotAllowed` | `pnpm test` |
| `SC-HEXSCROLL-4` | Refuses a target who has left the run | a target whose status is not active | the scroll is used | it is rejected with `ieeTargetNotActive` | `pnpm test` |
| `SC-HEXSCROLL-7` | Cannot reach a move that is already in flight | a target who has rolled a game and not yet reported the outcome | the scroll is used on them | the status starts on the roll after the pending one, so the move they are about to report is untouched | `pnpm test` |
| `SC-HEXSCROLL-5` | The victim learns who hit them | two players in one season with targeting allowed | one uses the scroll on the other | the status names its caster and the feed records who, what and on whom | live probe |
| `SC-HEXSCROLL-6` | One charge, however many clicks | a single scroll in the inventory | several uses are submitted at once | exactly one succeeds | live probe |

- **SC-HEXSCROLL-7** — The rule for every offensive item, not just this one. A penalty cell has always worked this way — its status is granted at the end of a turn and bites the next — and an item timed at an open roll used to bite the move already underway, with no window in which the victim could answer.
- **SC-HEXSCROLL-6** — The charge guard is in the UPDATE's WHERE clause, not a preceding SELECT.

## Cleansing Salve

`cleansing_salve` — item · rare · target: self · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SALVE-1` | Clears every negative status the holder carries | a player carrying several negative statuses | they use the salve | the intent cleanses all negatives from themselves | `pnpm test` |
| `SC-SALVE-2` | Leaves positives alone | a player carrying a shield and a curse | they use the salve | only the negative polarity is cleansed | `pnpm test` |
| `SC-SALVE-3` | Used with nothing to clear, it still costs its charge | a clean player holding a salve | they use it | the item is consumed and nothing else changes | live probe |

- **SC-SALVE-3** — Documented rather than defended: the guard layer has no 'would this do anything' check, and adding one would let a player probe their own status list for free.

## Lodestone

`lodestone` — item · common · target: self · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-LODESTONE-1` | Grants `tailwind` to the holder | a player with no open roll | they use the lodestone | the intent grants `tailwind` to themselves | `pnpm test` |
| `SC-LODESTONE-2` | Cannot be used once the dice are out | the holder has an open roll | they try to use the lodestone | it is rejected with `ieeItemWrongWindow` | `pnpm test` |

- **SC-LODESTONE-2** — `window: before_roll` — using it after seeing the dice would be free hindsight.

## Spare Die

`spare_die` — item · epic · target: self · window: before_roll

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SPAREDIE-1` | Grants `lucky` to the holder | a player with no open roll | they use the spare die | the intent grants `lucky` to themselves | `pnpm test` |
| `SC-SPAREDIE-2` | Cannot be used once the dice are out | the holder has an open roll | they try to use the spare die | it is rejected with `ieeItemWrongWindow` | `pnpm test` |

## Lead Weights

`lead_weights` — item · rare · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-WEIGHTS-1` | Puts `heavy_boots` on the chosen target | an active opponent in the same season | the weights are used on them | the intent grants `heavy_boots` to that opponent | `pnpm test` |
| `SC-WEIGHTS-2` | Refuses to be used on yourself | the holder as the target | the weights are used | it is rejected with `ieeTargetSelfNotAllowed` | `pnpm test` |

## Jinx

`jinx` — item · epic · target: other · window: anytime

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-JINX-1` | Puts `unlucky` on the chosen target | an active opponent in the same season | the jinx is used on them | the intent grants `unlucky` to that opponent | `pnpm test` |
| `SC-JINX-2` | Refuses a target who has left the run | a target whose status is not active | the jinx is used | it is rejected with `ieeTargetNotActive` | `pnpm test` |

## Slowed

`slowed` — effect · negative · common · 2 rolls · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SLOWED-1` | Shortens the next move by one cell | a player carrying `slowed` | they resolve a roll that would land them on cell 5 | they land on cell 4 | `pnpm test` |
| `SC-SLOWED-2` | Lasts exactly two rolls | `slowed` applied at roll 4 with a two-roll duration | rolls 5 and 6 resolve | both are shortened, and roll 7 is not | `pnpm test` |
| `SC-SLOWED-3` | A second copy refreshes rather than stacks | `slowed` is already active | another one lands | one active row remains and the move loses one cell, not two | `pnpm test` |
| `SC-SLOWED-4` | Never pushes a player backwards past the start | a player on cell 0 of a looping board | they roll a 1 while slowed | they stay on cell 0 | `pnpm test` |
| `SC-SLOWED-5` | A penalty landing applies it and the next move is visibly shorter | a season whose negative pool is `slowed` | a player lands on a penalty cell and then rolls again | the status appears, the next move travels one cell less, and both are in the feed | live probe |

- **SC-SLOWED-3** — `stacking: refresh` — the clock restarts, the penalty does not double.
- **SC-SLOWED-4** — A negative modifier must not wrap: on a loop board cell -1 is the LAST cell, which would turn a penalty into a jump to the front.

## Shield

`shield` — effect · positive · rare · 1 charge · stacking: stack

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-SHIELD-1` | Vetoes a penalty landing and asks for its charge | a player carrying a shield | they land on a penalty cell | the cell effect is skipped and one charge is claimed | `pnpm test` |
| `SC-SHIELD-2` | Ignores anything that is not a penalty | a player carrying a shield | they land on a bonus, event or plain cell | nothing is vetoed and no charge is claimed | `pnpm test` |
| `SC-SHIELD-3` | Two shields absorb two landings | two shields held at once | a penalty landing is resolved | the landing is absorbed and only one shield is spent, so the second survives for the next one | `pnpm test` |
| `SC-SHIELD-4` | Absorbs the whole landing, not half of it | a player carrying a shield in a season whose penalty pool is `slowed` | they land on a penalty cell | the shield is spent, no negative status is applied and no balance is lost | live probe |
| `SC-SHIELD-5` | Protection ends with the charge | a shield already spent on a previous landing | the player lands on another penalty cell | the status and the balance penalty both land normally | live probe |

- **SC-SHIELD-2** — Only a cell that would hurt is worth a charge.
- **SC-SHIELD-3** — `stacking: stack` — the only entry in the catalog that stacks. A veto is paid for once: the redundant one is free.
- **SC-SHIELD-4** — Shipped broken once: the balance penalty was vetoed while the wheel still granted the status, so the charge was spent and the damage kept.
- **SC-SHIELD-5** — The other half of SC-SHIELD-4: proves absorption, not blanket suppression.

## Heavy Boots

`heavy_boots` — effect · negative · rare · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-BOOTS-1` | Shortens the next move by two cells | a player carrying `heavy_boots` | they resolve a roll that would land them on cell 5 | they land on cell 3 | `pnpm test` |
| `SC-BOOTS-2` | Gone after a single roll | `heavy_boots` applied at roll 4 with a one-roll duration | roll 6 resolves | it no longer shortens the move | `pnpm test` |
| `SC-BOOTS-3` | Cannot catapult a player to the far end of a looping board | a player on cell 0 of a 40-cell looping board | they roll a 1 while wearing heavy boots (-2) | they stay on cell 0 rather than wrapping to cell 39 | `pnpm test` |
| `SC-BOOTS-5` | A roll shorter than the penalty is cancelled, not reversed | a player on cell 18 wearing heavy boots (-2) | they roll a 1 | they stay on cell 18 rather than being walked back to 17 | `pnpm test` |
| `SC-BOOTS-6` | Lasts exactly the number of rolls the catalog declares | `heavy_boots` granted during roll 4 with a one-roll duration | rolls 5 and 6 resolve | roll 5 is shortened and roll 6 is not | `pnpm test` |
| `SC-BOOTS-4` | The salve clears it | a player wearing heavy boots and holding a cleansing salve | they use the salve | the status is gone and the next move is full length | live probe |

- **SC-BOOTS-3** — The sharpest form of SC-SLOWED-4: a two-cell penalty at the start would otherwise make the player the leader.
- **SC-BOOTS-5** — SC-BOOTS-3 states the rule as a position ("stays on cell 0"), so the implementation only guarded cell 0 and every other cell reversed. Found by a live run, not by this suite. The rule is about the *distance travelled*: a status that shortens a move may cancel it and stop there.
- **SC-BOOTS-6** — The runtime filtered activity with the roll *before* the one being resolved while expiry compared against the one just finished, so every `rolls` duration lasted one roll too long. The old scenario jumped from roll 4 to roll 6 and never asserted the roll in between.

## Unlucky

`unlucky` — effect · negative · rare · 3 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-UNLUCKY-1` | Removes two sides from the dice | a season on d6 and a player carrying `unlucky` | their dice are computed | they roll d4 | `pnpm test` |
| `SC-UNLUCKY-2` | Dice never fall below two sides | a season on d3 and a player carrying `unlucky` (-2) | their dice are computed | they roll d2, not d1 or d0 | `pnpm test` |
| `SC-UNLUCKY-3` | A second copy does not stack | `unlucky` is already active | another one is applied | the dice lose two sides in total, not four | `pnpm test` |
| `SC-UNLUCKY-4` | `lucky` cancels it exactly | a player carrying both `unlucky` and `lucky` | their dice are computed | the dice are unchanged | `pnpm test` |

- **SC-UNLUCKY-2** — `rollDice` rejects fewer than two sides; the clamp keeps a status from throwing mid-turn.
- **SC-UNLUCKY-3** — `stacking: unique`.
- **SC-UNLUCKY-4** — Both are ±2 sides, so the counter is exact for as long as both are active.

## Taxed

`taxed` — effect · negative · common · 3 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TAXED-1` | Costs a point per landing | a player with balance 5 carrying `taxed` | they land on a cell | the balance delta is -1 | `pnpm test` |
| `SC-TAXED-2` | Balance never goes negative | a player with balance 0 carrying `taxed` | they land on a cell | the balance stays 0 | `pnpm test` |
| `SC-TAXED-3` | A second copy does not stack | `taxed` is already active | another one is applied | the landing costs one point, not two | `pnpm test` |
| `SC-TAXED-4` | A shield does not stop the tax | a player carrying both a shield and `taxed` | they land on a penalty cell | the landing is absorbed, and the tax is still charged | live probe |

- **SC-TAXED-4** — Deliberate: the shield absorbs the *cell*. `taxed` is a status that bleeds on every landing, absorbed or not — it is answered by the salve, not by the shield.

## Tailwind

`tailwind` — effect · positive · common · 1 roll · stacking: refresh

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-TAILWIND-1` | Adds two cells to the next move | a player carrying `tailwind` | they resolve a roll that would land them on cell 5 | they land on cell 7 | `pnpm test` |
| `SC-TAILWIND-2` | Nets out against `slowed` | a player carrying both `tailwind` (+2) and `slowed` (-1) | they move | the move is one cell longer, not two or three | `pnpm test` |
| `SC-TAILWIND-3` | A second copy refreshes rather than stacks | `tailwind` is already active | another one lands | the move gains two cells, not four | `pnpm test` |

- **SC-TAILWIND-2** — Both are additive on the same hook, so they sum rather than one winning.

## Lucky

`lucky` — effect · positive · rare · 2 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-LUCKY-1` | Adds two sides to the dice | a season on d6 and a player carrying `lucky` | their dice are computed | they roll d8 | `pnpm test` |
| `SC-LUCKY-2` | Lasts two rolls | `lucky` applied at roll 4 with a two-roll duration | roll 7 resolves | the dice are back to normal | `pnpm test` |
| `SC-LUCKY-3` | A second copy does not stack | `lucky` is already active | another one is applied | the dice gain two sides, not four | `pnpm test` |

## Momentum

`momentum` — effect · positive · epic · 3 rolls · stacking: unique

| ID | Scenario | Given | When | Then | Checked by |
| --- | --- | --- | --- | --- | --- |
| `SC-MOMENTUM-1` | Pays a point when the game is passed | a player carrying `momentum` | they resolve a roll as passed | the balance delta is +1 | `pnpm test` |
| `SC-MOMENTUM-2` | Pays nothing when the game is dropped | a player carrying `momentum` | they resolve a roll as dropped | no balance change | `pnpm test` |
| `SC-MOMENTUM-3` | The payout reaches the ledger, not just the balance | a player carrying `momentum` | they pass a game | the balance rises and a ledger entry records why | live probe |

- **SC-MOMENTUM-3** — This hook was dispatched with its patch discarded once; the ledger is what proves it is wired.

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

---

## Running them

```
pnpm test                 # the pure scenarios, plus the coverage checks
```

The live half runs against a built app and a scratch database and lives in the
verification harness (`probe/scenarios.mts`), not in this repository's toolchain.
Its results are recorded in `WORKLOG.md` for each session.
