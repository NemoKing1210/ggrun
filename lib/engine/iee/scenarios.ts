/**
 * The behaviour catalogue's second half: what no entry document can say on
 * its own, written as scenarios that are actually executed.
 *
 * An entry's own promises are **data** now — the scenarios in its document
 * (spec §5.5), run on publish and import, and for the system pack by
 * `lib/modules/iee/sim/core-scenarios.test.ts`. This table keeps the rest:
 * rules that span the subsystem (season settings, the wheel's gates, the
 * season-wide limits), the few an entry scenario cannot set up (a move
 * cancelled by something else), and the `live` tier. The generated reference
 * (`docs/ITEMS_EFFECTS_SCENARIOS.md`, via `pnpm scenarios:doc`) prints both,
 * so it cannot describe behaviour the code does not have.
 *
 * Two bugs reached a real playthrough because an invariant checked a
 * *declaration* rather than a *consequence*: the catalog said counter-play
 * existed, and the shield still let the penalty through. Every line below is
 * phrased as an observable consequence for that reason.
 *
 * `tier` says where a scenario can honestly be checked:
 *  - `engine` — no database: `lib/modules/iee/scenarios.test.ts` runs the
 *               compiled core entries through the executor on a memory store,
 *               in `pnpm test`;
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
  // --- swamp ----------------------------------------------------------------
  {
    id: "SC-SWAMP-6", entry: "swamp", tier: "engine",
    title: "A cancelled move is not one of the two",
    given: "`swamp` with two moves left",
    when: "a turn resolves with its move cancelled, and then three regular moves follow",
    then: "the first two regular moves are shortened and the third is not",
    note: "The duration counts regular moves (spec §7.9). It was `slowed`, counted in rolls, until the `core` pack curated it in stage 2.",
  },
  {
    id: "SC-SWAMP-5", entry: "swamp", tier: "live",
    title: "A penalty landing applies it and the next move is visibly shorter",
    given: "a season whose negative pool is `swamp`",
    when: "a player lands on a penalty cell and then rolls again",
    then: "the status appears, the next move travels one cell less, and both are in the feed",
  },

  // --- heavy_boots ----------------------------------------------------------
  {
    id: "SC-BOOTS-4", entry: "heavy_boots", tier: "live",
    title: "The salve clears it",
    given: "a player carrying `heavy_boots` (the effect «Тяжёлый шаг») and holding a cleansing salve",
    when: "they use the salve",
    then: "the status is gone and the next move is full length",
    note: "The salve takes effects only: the cursed item «Тяжёлые ботинки» (`cursed_boots`, wave A) stays — «Амулет очищения» removes it (spec §7.5).",
  },

  // --- toll -----------------------------------------------------------------
  {
    id: "SC-TOLL-4", entry: "toll", tier: "live",
    title: "A ward does not stop the toll",
    given: "a player carrying both a ward and `toll`",
    when: "they land on a penalty cell",
    then: "the landing is absorbed, and the toll is still charged",
    note: "Deliberate: the ward absorbs the *cell*. `toll` is a status that bleeds on every landing, absorbed or not — it is answered by the salve, not by the ward.",
  },

  // --- momentum -------------------------------------------------------------
  {
    id: "SC-MOMENTUM-3", entry: "momentum", tier: "live",
    title: "The payout reaches the ledger, not just the balance",
    given: "a player carrying `momentum`",
    when: "they pass a game",
    then: "the balance rises and a ledger entry records why",
    note: "This hook was dispatched with its patch discarded once; the ledger is what proves it is wired.",
  },

  // --- ward -----------------------------------------------------------------
  {
    id: "SC-WARD-4", entry: "ward", tier: "live",
    title: "Absorbs the whole landing, not half of it",
    given: "a player carrying a ward in a season whose penalty pool is `swamp`",
    when: "they land on a penalty cell",
    then: "the ward is spent, no negative status is applied and no balance is lost",
    note: "Shipped broken once (as the effect `shield`): the balance penalty was vetoed while the wheel still granted the status, so the charge was spent and the damage kept.",
  },
  {
    id: "SC-WARD-5", entry: "ward", tier: "live",
    title: "Protection ends with the charge",
    given: "a ward already spent on a previous landing",
    when: "the player lands on another penalty cell",
    then: "the status and the balance penalty both land normally",
    note: "The other half of SC-WARD-4: proves absorption, not blanket suppression.",
  },

  // --- hex_scroll -----------------------------------------------------------
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
    id: "SC-SALVE-3", entry: "cleansing_salve", tier: "live",
    title: "Used with nothing to clear, it still costs its charge",
    given: "a clean player holding a salve",
    when: "they use it",
    then: "the item is consumed and nothing else changes",
    note: "Documented rather than defended: the guard layer has no 'would this do anything' check, and adding one would let a player probe their own status list for free.",
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
  {
    id: "SC-POOL-5", entry: "*", tier: "live",
    title: "Switching an entry to a newer revision changes later drops only",
    given: "a player holding a status granted under revision 1, and the season switched to revision 2",
    when: "the season continues",
    then: "the held status keeps revision 1's text and duration, the rules page and the next drop show revision 2, and neither revision can be deleted",
  },
  {
    id: "SC-POOL-6", entry: "*", tier: "engine",
    title: "A season-wide limit holds whoever hands an entry out",
    given: "a season capped at one active status per player, and a player who has one",
    when: "an item hands them another",
    then: "the grant is refused and journaled with its reason; a status they already hold still refreshes",
    note: "Spec §4.5. The wheel's gates keep such an entry off the wheel; the executor holds the line for every other source.",
  },
  {
    id: "SC-POOL-7", entry: "*", tier: "engine",
    title: "A disabled tag takes an entry out of the season",
    given: "a season that disables the tag `dice`",
    when: "a bonus cell spins the wheel, or something hands out `lucky`",
    then: "no entry with the tag is on the wheel, and the grant is refused",
  },
] as const;

/** Scenarios for one catalog entry, in table order. */
export function scenariosFor(entry: string): Scenario[] {
  return SCENARIOS.filter((s) => s.entry === entry);
}

export function scenariosByTier(tier: ScenarioTier): Scenario[] {
  return SCENARIOS.filter((s) => s.tier === tier);
}
