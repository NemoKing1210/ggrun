/**
 * The behaviour catalogue: what every item and effect promises, written as
 * scenarios that are actually executed.
 *
 * This table is the single source for two things — the generated reference
 * (`ITEMS_EFFECTS_SCENARIOS.md`, via `pnpm scenarios:doc`) and the tests that
 * run them. Neither is written by hand against the other, so the document
 * cannot describe behaviour the code does not have.
 *
 * Two bugs reached a real playthrough because an invariant checked a
 * *declaration* rather than a *consequence*: the catalog said counter-play
 * existed, and the shield still let the penalty through. Every line below is
 * phrased as an observable consequence for that reason.
 *
 * `tier` says where a scenario can honestly be checked:
 *  - `engine` — pure, in `lib/engine/iee-scenarios.test.ts`, runs in `pnpm test`;
 *  - `live`   — needs the turn transaction, the database or the browser, so it
 *               lives in the harness probe `probe/scenarios.mjs`.
 *
 * Both suites assert that every scenario of their tier has an implementation
 * and that no implementation exists without a scenario. Adding a line here
 * fails the build until it is covered.
 */

export type ScenarioTier = "engine" | "live";

export interface Scenario {
  /** Stable id, `SC-<ENTRY>-<n>`. Referenced by the tests and the document. */
  id: string;
  /** Catalog key it belongs to, or "*" for a rule that spans the subsystem. */
  entry: string;
  title: string;
  given: string;
  when: string;
  then: string;
  tier: ScenarioTier;
  /** Why the expected result is what it is, when that is not obvious. */
  note?: string;
}

export const SCENARIOS: readonly Scenario[] = [
  // --- slowed ---------------------------------------------------------------
  {
    id: "SC-SLOWED-1", entry: "slowed", tier: "engine",
    title: "Shortens the next move by one cell",
    given: "a player carrying `slowed`",
    when: "they resolve a roll that would land them on cell 5",
    then: "they land on cell 4",
  },
  {
    id: "SC-SLOWED-2", entry: "slowed", tier: "engine",
    title: "Lasts exactly two rolls",
    given: "`slowed` applied at roll 4 with a two-roll duration",
    when: "rolls 5 and 6 resolve",
    then: "both are shortened, and roll 7 is not",
  },
  {
    id: "SC-SLOWED-3", entry: "slowed", tier: "engine",
    title: "A second copy refreshes rather than stacks",
    given: "`slowed` is already active",
    when: "another one lands",
    then: "one active row remains and the move loses one cell, not two",
    note: "`stacking: refresh` — the clock restarts, the penalty does not double.",
  },
  {
    id: "SC-SLOWED-4", entry: "slowed", tier: "engine",
    title: "Never pushes a player backwards past the start",
    given: "a player on cell 0 of a looping board",
    when: "they roll a 1 while slowed",
    then: "they stay on cell 0",
    note: "A negative modifier must not wrap: on a loop board cell -1 is the LAST cell, which would turn a penalty into a jump to the front.",
  },
  {
    id: "SC-SLOWED-5", entry: "slowed", tier: "live",
    title: "A penalty landing applies it and the next move is visibly shorter",
    given: "a season whose negative pool is `slowed`",
    when: "a player lands on a penalty cell and then rolls again",
    then: "the status appears, the next move travels one cell less, and both are in the feed",
  },

  // --- heavy_boots ----------------------------------------------------------
  {
    id: "SC-BOOTS-1", entry: "heavy_boots", tier: "engine",
    title: "Shortens the next move by two cells",
    given: "a player carrying `heavy_boots`",
    when: "they resolve a roll that would land them on cell 5",
    then: "they land on cell 3",
  },
  {
    id: "SC-BOOTS-2", entry: "heavy_boots", tier: "engine",
    title: "Gone after a single roll",
    given: "`heavy_boots` applied at roll 4 with a one-roll duration",
    when: "roll 6 resolves",
    then: "it no longer shortens the move",
  },
  {
    id: "SC-BOOTS-3", entry: "heavy_boots", tier: "engine",
    title: "Cannot catapult a player to the far end of a looping board",
    given: "a player on cell 0 of a 40-cell looping board",
    when: "they roll a 1 while wearing heavy boots (-2)",
    then: "they stay on cell 0 rather than wrapping to cell 39",
    note: "The sharpest form of SC-SLOWED-4: a two-cell penalty at the start would otherwise make the player the leader.",
  },
  {
    id: "SC-BOOTS-5", entry: "heavy_boots", tier: "engine",
    title: "A roll shorter than the penalty is cancelled, not reversed",
    given: "a player on cell 18 wearing heavy boots (-2)",
    when: "they roll a 1",
    then: "they stay on cell 18 rather than being walked back to 17",
    note: "SC-BOOTS-3 states the rule as a position (\"stays on cell 0\"), so the implementation only guarded cell 0 and every other cell reversed. Found by a live run, not by this suite. The rule is about the *distance travelled*: a status that shortens a move may cancel it and stop there.",
  },
  {
    id: "SC-BOOTS-6", entry: "heavy_boots", tier: "engine",
    title: "Lasts exactly the number of rolls the catalog declares",
    given: "`heavy_boots` granted during roll 4 with a one-roll duration",
    when: "rolls 5 and 6 resolve",
    then: "roll 5 is shortened and roll 6 is not",
    note: "The runtime filtered activity with the roll *before* the one being resolved while expiry compared against the one just finished, so every `rolls` duration lasted one roll too long. The old scenario jumped from roll 4 to roll 6 and never asserted the roll in between.",
  },
  {
    id: "SC-BOOTS-4", entry: "heavy_boots", tier: "live",
    title: "The salve clears it",
    given: "a player wearing heavy boots and holding a cleansing salve",
    when: "they use the salve",
    then: "the status is gone and the next move is full length",
  },

  // --- unlucky --------------------------------------------------------------
  {
    id: "SC-UNLUCKY-1", entry: "unlucky", tier: "engine",
    title: "Removes two sides from the dice",
    given: "a season on d6 and a player carrying `unlucky`",
    when: "their dice are computed",
    then: "they roll d4",
  },
  {
    id: "SC-UNLUCKY-2", entry: "unlucky", tier: "engine",
    title: "Dice never fall below two sides",
    given: "a season on d3 and a player carrying `unlucky` (-2)",
    when: "their dice are computed",
    then: "they roll d2, not d1 or d0",
    note: "`rollDice` rejects fewer than two sides; the clamp keeps a status from throwing mid-turn.",
  },
  {
    id: "SC-UNLUCKY-3", entry: "unlucky", tier: "engine",
    title: "A second copy does not stack",
    given: "`unlucky` is already active",
    when: "another one is applied",
    then: "the dice lose two sides in total, not four",
    note: "`stacking: unique`.",
  },
  {
    id: "SC-UNLUCKY-4", entry: "unlucky", tier: "engine",
    title: "`lucky` cancels it exactly",
    given: "a player carrying both `unlucky` and `lucky`",
    when: "their dice are computed",
    then: "the dice are unchanged",
    note: "Both are ±2 sides, so the counter is exact for as long as both are active.",
  },

  // --- taxed ----------------------------------------------------------------
  {
    id: "SC-TAXED-1", entry: "taxed", tier: "engine",
    title: "Costs a point per landing",
    given: "a player with balance 5 carrying `taxed`",
    when: "they land on a cell",
    then: "the balance delta is -1",
  },
  {
    id: "SC-TAXED-2", entry: "taxed", tier: "engine",
    title: "Balance never goes negative",
    given: "a player with balance 0 carrying `taxed`",
    when: "they land on a cell",
    then: "the balance stays 0",
  },
  {
    id: "SC-TAXED-3", entry: "taxed", tier: "engine",
    title: "A second copy does not stack",
    given: "`taxed` is already active",
    when: "another one is applied",
    then: "the landing costs one point, not two",
  },
  {
    id: "SC-TAXED-4", entry: "taxed", tier: "live",
    title: "A shield does not stop the tax",
    given: "a player carrying both a shield and `taxed`",
    when: "they land on a penalty cell",
    then: "the landing is absorbed, and the tax is still charged",
    note: "Deliberate: the shield absorbs the *cell*. `taxed` is a status that bleeds on every landing, absorbed or not — it is answered by the salve, not by the shield.",
  },

  // --- tailwind -------------------------------------------------------------
  {
    id: "SC-TAILWIND-1", entry: "tailwind", tier: "engine",
    title: "Adds two cells to the next move",
    given: "a player carrying `tailwind`",
    when: "they resolve a roll that would land them on cell 5",
    then: "they land on cell 7",
  },
  {
    id: "SC-TAILWIND-2", entry: "tailwind", tier: "engine",
    title: "Nets out against `slowed`",
    given: "a player carrying both `tailwind` (+2) and `slowed` (-1)",
    when: "they move",
    then: "the move is one cell longer, not two or three",
    note: "Both are additive on the same hook, so they sum rather than one winning.",
  },
  {
    id: "SC-TAILWIND-3", entry: "tailwind", tier: "engine",
    title: "A second copy refreshes rather than stacks",
    given: "`tailwind` is already active",
    when: "another one lands",
    then: "the move gains two cells, not four",
  },

  // --- lucky ----------------------------------------------------------------
  {
    id: "SC-LUCKY-1", entry: "lucky", tier: "engine",
    title: "Adds two sides to the dice",
    given: "a season on d6 and a player carrying `lucky`",
    when: "their dice are computed",
    then: "they roll d8",
  },
  {
    id: "SC-LUCKY-2", entry: "lucky", tier: "engine",
    title: "Lasts two rolls",
    given: "`lucky` applied at roll 4 with a two-roll duration",
    when: "roll 7 resolves",
    then: "the dice are back to normal",
  },
  {
    id: "SC-LUCKY-3", entry: "lucky", tier: "engine",
    title: "A second copy does not stack",
    given: "`lucky` is already active",
    when: "another one is applied",
    then: "the dice gain two sides, not four",
  },

  // --- momentum -------------------------------------------------------------
  {
    id: "SC-MOMENTUM-1", entry: "momentum", tier: "engine",
    title: "Pays a point when the game is passed",
    given: "a player carrying `momentum`",
    when: "they resolve a roll as passed",
    then: "the balance delta is +1",
  },
  {
    id: "SC-MOMENTUM-2", entry: "momentum", tier: "engine",
    title: "Pays nothing when the game is dropped",
    given: "a player carrying `momentum`",
    when: "they resolve a roll as dropped",
    then: "no balance change",
  },
  {
    id: "SC-MOMENTUM-3", entry: "momentum", tier: "live",
    title: "The payout reaches the ledger, not just the balance",
    given: "a player carrying `momentum`",
    when: "they pass a game",
    then: "the balance rises and a ledger entry records why",
    note: "This hook was dispatched with its patch discarded once; the ledger is what proves it is wired.",
  },

  // --- shield ---------------------------------------------------------------
  {
    id: "SC-SHIELD-1", entry: "shield", tier: "engine",
    title: "Vetoes a penalty landing and asks for its charge",
    given: "a player carrying a shield",
    when: "they land on a penalty cell",
    then: "the cell effect is skipped and one charge is claimed",
  },
  {
    id: "SC-SHIELD-2", entry: "shield", tier: "engine",
    title: "Ignores anything that is not a penalty",
    given: "a player carrying a shield",
    when: "they land on a bonus, event or plain cell",
    then: "nothing is vetoed and no charge is claimed",
    note: "Only a cell that would hurt is worth a charge.",
  },
  {
    id: "SC-SHIELD-3", entry: "shield", tier: "engine",
    title: "Two shields absorb two landings",
    given: "two shields held at once",
    when: "a penalty landing is resolved",
    then: "the landing is absorbed and only one shield is spent, so the second survives for the next one",
    note: "`stacking: stack` — the only entry in the catalog that stacks. A veto is paid for once: the redundant one is free.",
  },
  {
    id: "SC-SHIELD-4", entry: "shield", tier: "live",
    title: "Absorbs the whole landing, not half of it",
    given: "a player carrying a shield in a season whose penalty pool is `slowed`",
    when: "they land on a penalty cell",
    then: "the shield is spent, no negative status is applied and no balance is lost",
    note: "Shipped broken once: the balance penalty was vetoed while the wheel still granted the status, so the charge was spent and the damage kept.",
  },
  {
    id: "SC-SHIELD-5", entry: "shield", tier: "live",
    title: "Protection ends with the charge",
    given: "a shield already spent on a previous landing",
    when: "the player lands on another penalty cell",
    then: "the status and the balance penalty both land normally",
    note: "The other half of SC-SHIELD-4: proves absorption, not blanket suppression.",
  },

  // --- hex_scroll -----------------------------------------------------------
  {
    id: "SC-HEXSCROLL-1", entry: "hex_scroll", tier: "engine",
    title: "Puts `slowed` on the chosen target",
    given: "an active opponent in the same season",
    when: "the scroll is used on them",
    then: "the intent grants `slowed` to that opponent and to nobody else",
  },
  {
    id: "SC-HEXSCROLL-2", entry: "hex_scroll", tier: "engine",
    title: "Refuses to be used with no target",
    given: "no target supplied",
    when: "the scroll is used",
    then: "it is rejected with `ieeTargetRequired`",
  },
  {
    id: "SC-HEXSCROLL-3", entry: "hex_scroll", tier: "engine",
    title: "Refuses to be used on yourself",
    given: "the holder as the target",
    when: "the scroll is used",
    then: "it is rejected with `ieeTargetSelfNotAllowed`",
  },
  {
    id: "SC-HEXSCROLL-4", entry: "hex_scroll", tier: "engine",
    title: "Refuses a target who has left the run",
    given: "a target whose status is not active",
    when: "the scroll is used",
    then: "it is rejected with `ieeTargetNotActive`",
  },
  {
    id: "SC-HEXSCROLL-7", entry: "hex_scroll", tier: "engine",
    title: "Cannot reach a move that is already in flight",
    given: "a target who has rolled a game and not yet reported the outcome",
    when: "the scroll is used on them",
    then: "the status starts on the roll after the pending one, so the move they are about to report is untouched",
    note: "The rule for every offensive item, not just this one. A penalty cell has always worked this way — its status is granted at the end of a turn and bites the next — and an item timed at an open roll used to bite the move already underway, with no window in which the victim could answer.",
  },
  {
    id: "SC-HEXSCROLL-5", entry: "hex_scroll", tier: "live",
    title: "The victim learns who hit them",
    given: "two players in one season with targeting allowed",
    when: "one uses the scroll on the other",
    then: "the status names its caster and the feed records who, what and on whom",
  },
  {
    id: "SC-HEXSCROLL-6", entry: "hex_scroll", tier: "live",
    title: "One charge, however many clicks",
    given: "a single scroll in the inventory",
    when: "several uses are submitted at once",
    then: "exactly one succeeds",
    note: "The charge guard is in the UPDATE's WHERE clause, not a preceding SELECT.",
  },

  // --- cleansing_salve ------------------------------------------------------
  {
    id: "SC-SALVE-1", entry: "cleansing_salve", tier: "engine",
    title: "Clears every negative status the holder carries",
    given: "a player carrying several negative statuses",
    when: "they use the salve",
    then: "the intent cleanses all negatives from themselves",
  },
  {
    id: "SC-SALVE-2", entry: "cleansing_salve", tier: "engine",
    title: "Leaves positives alone",
    given: "a player carrying a shield and a curse",
    when: "they use the salve",
    then: "only the negative polarity is cleansed",
  },
  {
    id: "SC-SALVE-3", entry: "cleansing_salve", tier: "live",
    title: "Used with nothing to clear, it still costs its charge",
    given: "a clean player holding a salve",
    when: "they use it",
    then: "the item is consumed and nothing else changes",
    note: "Documented rather than defended: the guard layer has no 'would this do anything' check, and adding one would let a player probe their own status list for free.",
  },

  // --- lodestone ------------------------------------------------------------
  {
    id: "SC-LODESTONE-1", entry: "lodestone", tier: "engine",
    title: "Grants `tailwind` to the holder",
    given: "a player with no open roll",
    when: "they use the lodestone",
    then: "the intent grants `tailwind` to themselves",
  },
  {
    id: "SC-LODESTONE-2", entry: "lodestone", tier: "engine",
    title: "Cannot be used once the dice are out",
    given: "the holder has an open roll",
    when: "they try to use the lodestone",
    then: "it is rejected with `ieeItemWrongWindow`",
    note: "`window: before_roll` — using it after seeing the dice would be free hindsight.",
  },

  // --- spare_die ------------------------------------------------------------
  {
    id: "SC-SPAREDIE-1", entry: "spare_die", tier: "engine",
    title: "Grants `lucky` to the holder",
    given: "a player with no open roll",
    when: "they use the spare die",
    then: "the intent grants `lucky` to themselves",
  },
  {
    id: "SC-SPAREDIE-2", entry: "spare_die", tier: "engine",
    title: "Cannot be used once the dice are out",
    given: "the holder has an open roll",
    when: "they try to use the spare die",
    then: "it is rejected with `ieeItemWrongWindow`",
  },

  // --- lead_weights ---------------------------------------------------------
  {
    id: "SC-WEIGHTS-1", entry: "lead_weights", tier: "engine",
    title: "Puts `heavy_boots` on the chosen target",
    given: "an active opponent in the same season",
    when: "the weights are used on them",
    then: "the intent grants `heavy_boots` to that opponent",
  },
  {
    id: "SC-WEIGHTS-2", entry: "lead_weights", tier: "engine",
    title: "Refuses to be used on yourself",
    given: "the holder as the target",
    when: "the weights are used",
    then: "it is rejected with `ieeTargetSelfNotAllowed`",
  },

  // --- jinx -----------------------------------------------------------------
  {
    id: "SC-JINX-1", entry: "jinx", tier: "engine",
    title: "Puts `unlucky` on the chosen target",
    given: "an active opponent in the same season",
    when: "the jinx is used on them",
    then: "the intent grants `unlucky` to that opponent",
  },
  {
    id: "SC-JINX-2", entry: "jinx", tier: "engine",
    title: "Refuses a target who has left the run",
    given: "a target whose status is not active",
    when: "the jinx is used",
    then: "it is rejected with `ieeTargetNotActive`",
  },

  // --- rules that span the subsystem ---------------------------------------
  {
    id: "SC-PVP-1", entry: "*", tier: "engine",
    title: "With PvP off, no item reaches another player",
    given: "a season with `allowTargetingOthers` off",
    when: "any offensive item is used on an opponent",
    then: "it is rejected with `ieeTargetingDisabled`",
  },
  {
    id: "SC-PVP-2", entry: "*", tier: "engine",
    title: "New participants are protected for a while",
    given: "a protection window of three moves and an opponent who has made two",
    when: "an offensive item is used on them",
    then: "it is rejected with `ieeTargetProtected`",
  },
  {
    id: "SC-PVP-3", entry: "*", tier: "engine",
    title: "Targets from another season are not targets",
    given: "a candidate who belongs to a different run",
    when: "an offensive item is used on them",
    then: "it is rejected with `ieeTargetNotActive`",
  },
  {
    id: "SC-POOL-1", entry: "*", tier: "engine",
    title: "A per-player cap stops the same entry dropping forever",
    given: "an entry with `maxPerPlayer: 1` that the player already holds",
    when: "the wheel is spun",
    then: "that entry is gated out of the pool",
  },
  {
    id: "SC-POOL-2", entry: "*", tier: "engine",
    title: "An empty pool pays out nothing instead of failing the turn",
    given: "a polarity whose entries are all disabled",
    when: "the wheel is spun",
    then: "the outcome is a fallback and the turn still resolves",
  },
  {
    id: "SC-POOL-3", entry: "*", tier: "live",
    title: "Disabling an entry mid-season keeps what players already hold",
    given: "a player holding an item whose entry an admin then disables",
    when: "the season continues",
    then: "the held item still works and the entry stops dropping",
  },
  {
    id: "SC-POOL-4", entry: "*", tier: "live",
    title: "A season reset clears items, statuses and challenges",
    given: "a player with an item, a status and an assigned challenge",
    when: "an admin resets the season",
    then: "all three are gone and the participant survives",
  },
] as const;

/** Scenarios for one catalog entry, in table order. */
export function scenariosFor(entry: string): Scenario[] {
  return SCENARIOS.filter((s) => s.entry === entry);
}

export function scenariosByTier(tier: ScenarioTier): Scenario[] {
  return SCENARIOS.filter((s) => s.tier === tier);
}
