/**
 * The play the power estimate assumes (spec §14), calibrated against the
 * simulator: `lib/modules/iee/sim/measure.ts` plays every primitive and every
 * `core` entry with and without it, and `power-calibration.test.ts` holds the
 * costs to what it measures.
 *
 * Power is counted in cells: the advantage an entry gives its holder over its
 * life — or takes from whoever it is aimed at. The numbers below are what
 * that advantage is made of in an ordinary season.
 */
import { NO_DICE_RULES } from "../../board/movement";
import { DEFAULT_SEASON_CONFIG } from "../../config/defaults";
import { isBadThrow, reactionGain, type ReactionRules } from "../../turn/reaction";
import type { Rarity } from "../../types/iee";
import type { CellType, Character, EntryKind } from "./doc";

const { dice, board } = DEFAULT_SEASON_CONFIG;

const PASS_RATE = 0.6;
const DROP_WEIGHT = 0.48;

export const PLAY_MODEL = {
  /** A game is passed 60 % of the time — the `outcome` condition's likelihood. */
  passRate: PASS_RATE,
  /**
   * A drop's weight among turns: 40 % of them, and each moves back further
   * when it follows other drops (the streak multiplier) — about 1.2 times a
   * lone drop, measured.
   */
  dropWeight: DROP_WEIGHT,
  /** One die's mean on a new season's dice. */
  dieMean: (dice.sides + 1) / 2,
  passDice: dice.passDiceCount,
  dropDice: dice.dropDiceCount,
  /**
   * A point rides on the next roll — forward on a pass, back on a drop — so it
   * is worth what a pass gains over a drop: about a fifth of a cell.
   */
  pointValue: 0.2,
  /** How often a holder has points for a loss to take (a balance never goes below zero). */
  pointsHeld: 0.3,
  /** What a landing is worth to whoever lands — its points and its wheel — measured. */
  landing: { bonus: 1.1, penalty: -1 } as Readonly<Partial<Record<CellType, number>>>,
  /**
   * How far ahead stands the player an item is aimed at — what a jump to their
   * cell or a swap with them is worth. An assumption, like the pass rate: a
   * season's real spread is only known once it is played.
   */
  aimGap: 6,
  /** How far back stands the nearest rival behind — what a swap with them or halving their gap moves. */
  behindGap: 4,
  /**
   * Items a player holds at a time, and the share of them that are cursed —
   * what a count of them reads (`itemCount`). Assumptions, like the gaps.
   */
  heldItems: 1,
  cursedShare: 0.2,
  /** Players in a race — what a place (`rank`) is one of. An assumption. */
  field: 8,
  /**
   * The bonus items players hold, as the wheel hands them out (wave B, spec
   * §6.12): the share of each rarity among them and what one is worth to
   * whoever ends up with it — its power, which it keeps whoever holds it.
   * Derived from `core`'s bonus items, weighted by how often each drops;
   * `power-calibration.test.ts` holds them to the pack.
   */
  heldItem: {
    common: { share: 0.69, worth: 1.29 },
    rare: { share: 0.28, worth: 2.05 },
    epic: { share: 0.03, worth: 4.4 },
    legendary: { share: 0.002, worth: 12 },
  } as Readonly<Record<Rarity, { share: number; worth: number }>>,
  /**
   * The strongest bonus item of a rarity the season offers — what a pick from
   * its catalog is worth (`grantChosen`): `core`'s best, held to it like the above.
   */
  bestItem: { common: 2, rare: 3.6, epic: 6, legendary: 12 } as Readonly<Record<Rarity, number>>,
  /**
   * What the user gains by choosing whom to trade with (`swapItems`): the item
   * they aim for is worth a third of an item more than the one they give. An
   * assumption, like the gaps.
   */
  tradeEdge: 1 / 3,
  /**
   * What one more spin of a wheel hands its holder (`extraSpin`): the power of
   * what it drops, weighted by how often each drops — `core`'s pools, held to
   * the pack like the items above. The penalty wheel's is measured too; the
   * bonus wheel's items are used by players, which the simulator does not do
   * with what a run hands out, so only the pack can say what they are worth.
   */
  spin: { bonus: 1.45, penalty: -1 } as Readonly<Record<"bonus" | "penalty", number>>,
  /**
   * What reaches a player (wave B, spec §6.13): how often one arrival of each
   * kind comes in a roll of theirs, and what it is worth to them — read off
   * `core`, each entry's power weighted by how often it drops, and held to the
   * pack by `power-calibration.test.ts`. A harmful action is a rival's item
   * used on them: it comes as often as a player lands one (by symmetry), and
   * takes what the item's power says — on the one side, for a swap that moves
   * both; `turned` is what turning it back takes from the rival (a swap does
   * not turn). An entry comes from its wheel's share of the board; a move back
   * from a penalty drop or a rival's item.
   */
  arrival: {
    harm: { worth: 1.88, turned: 1.76, perRoll: 0.0136 },
    moveBack: { worth: 2.1, perRoll: 0.0125 },
    /**
     * Completion conditions (wave C, spec §6.17): how many a game of the holder's
     * gets in a roll — the pack's entries that add them, at their share of the
     * penalty wheel and of the board, like the rest.
     */
    condition: { perRoll: 0.0241 },
    entry: {
      bonus: { item: { worth: 1.62, perRoll: 0.0759 }, effect: { worth: 0.92, perRoll: 0.0241 } },
      penalty: { item: { worth: 1.38, perRoll: 0.0097 }, effect: { worth: 0.96, perRoll: 0.0903 } },
    } as Readonly<Record<Character, Readonly<Record<EntryKind, { worth: number; perRoll: number }>>>>,
  },
  /** How much of an item's worth a player loses while kept from using it (`forbidItems`): it waits, it is not lost. An assumption. */
  delayLoss: 0.5,
  /**
   * How often a protection stands between a harmful action and its target
   * (`pierce`): the share of the bonus items players hold that block or turn
   * one back («Щит», «Зеркальный щит») — read off `core` like the above.
   */
  shielded: 0.0569,
  /**
   * What a pass instead of a drop is worth (wave C, spec §6.16): a pass's
   * move forward, and a drop's move back spared at the streak weight —
   * 3.5 + 7 × 1.2 = 11.9 cells on a new season's dice. A game is worth how
   * likely its player is to pass it.
   */
  gameSwing:
    dice.passDiceCount * ((dice.sides + 1) / 2) + dice.dropDiceCount * ((dice.sides + 1) / 2) * (DROP_WEIGHT / (1 - PASS_RATE)),
  /**
   * How far each primitive of the next game moves that chance (wave C, spec
   * §6.16-§6.17). Assumptions until a live season measures them, like the pass
   * rate: the simulator plays no game pool. What the holder picked works for
   * them; what they did not pick narrows their pool against them.
   */
  pool: {
    /** A choice of 2–5 games (`chooseOfN`). */
    choice: { 2: 0.1, 3: 0.15, 4: 0.18, 5: 0.2 } as Readonly<Record<2 | 3 | 4 | 5, number>>,
    /** What the use picked, required or excluded. */
    picked: { require: { genre: 0.1, years: 0.07 }, exclude: { genre: 0.03, years: 0.03 } },
    /** A picked game favoured, per factor above 1. */
    favor: 0.01,
    /** A game in flight drawn again, or set aside for later. */
    reroll: 0.2,
    postpone: 0.15,
    /** Genres, a span of years or a rating the holder did not pick, required or excluded. */
    imposed: { genres: -0.04, years: -0.05, rating: -0.03 },
    /** A completion condition on the game. */
    condition: -0.05,
  },
  /**
   * Objects on the board (wave D, spec §6.18): an object acts on whoever
   * enters its cell first, and its owner places it where it serves them — a
   * harm on a rival's way, a gain on their own — meeting the one it was placed
   * for this often. An assumption until a live season measures it: the
   * simulator places no objects.
   */
  object: { aimed: 0.75 },
  /**
   * The same cell (wave D, spec §6.19): how often, in one of a holder's rolls,
   * a rival's regular move ends on their cell — a rule at `onSameCell` fires
   * that often, and an item a rival takes stays 1/`sameCell` rolls. An
   * assumption until a live season measures it: about one arrival in ten
   * rolls in a field of six on a 40-cell board.
   */
  sameCell: 0.1,
} as const;

/** What arrives, as an `incoming` condition narrows it (wave B, spec §6.13): null — everything. */
export type ArrivalScope =
  | { is: "harm" }
  | { is: "moveBack" }
  | { is: "entry"; kind: EntryKind | null; character: Character | null };

/**
 * One arrival of a scope (`PLAY_MODEL.arrival`): how often one comes in a roll,
 * and what it is worth to whoever receives it — a bonus up, a harm, a penalty
 * or a move back down. A wider scope is its parts at their rates.
 */
export function arrivalOf(scope: ArrivalScope | null): { perRoll: number; worth: number } {
  const { harm, moveBack, entry } = PLAY_MODEL.arrival;
  const parts: { perRoll: number; worth: number }[] = [];
  if (scope === null || scope.is === "harm") parts.push({ perRoll: harm.perRoll, worth: -harm.worth });
  if (scope === null || scope.is === "moveBack") parts.push({ perRoll: moveBack.perRoll, worth: -moveBack.worth });
  if (scope === null || scope.is === "entry") {
    for (const character of ["bonus", "penalty"] as const) {
      if (scope?.is === "entry" && scope.character !== null && scope.character !== character) continue;
      for (const kind of ["item", "effect"] as const) {
        if (scope?.is === "entry" && scope.kind !== null && scope.kind !== kind) continue;
        const one = entry[character][kind];
        parts.push({ perRoll: one.perRoll, worth: character === "bonus" ? one.worth : -one.worth });
      }
    }
  }
  const perRoll = parts.reduce((sum, p) => sum + p.perRoll, 0);
  const worth = perRoll > 0 ? parts.reduce((sum, p) => sum + p.perRoll * p.worth, 0) / perRoll : 0;
  return { perRoll, worth };
}

/**
 * What a random bonus item of these rarities is worth, as players hold them
 * (`PLAY_MODEL.heldItem`): any rarity when null.
 */
export function heldItemWorth(rarities: readonly Rarity[] | null | undefined): number {
  const among = rarities && rarities.length > 0 ? rarities : (Object.keys(PLAY_MODEL.heldItem) as Rarity[]);
  let share = 0;
  let worth = 0;
  for (const r of among) {
    const held = PLAY_MODEL.heldItem[r];
    share += held.share;
    worth += held.share * held.worth;
  }
  return share > 0 ? worth / share : 0;
}

/**
 * How many bonus items of these rarities a holder has to give, up to `count`
 * — Σ P(held ≥ k), on a Poisson spread around `meanHeld`.
 */
export function itemsHeldUpTo(count: number, rarities: readonly Rarity[] | null | undefined): number {
  const among = rarities && rarities.length > 0 ? rarities : (Object.keys(PLAY_MODEL.heldItem) as Rarity[]);
  const mean = meanHeld("bonus") * among.reduce((sum, r) => sum + PLAY_MODEL.heldItem[r].share, 0);
  let expected = 0;
  let atMost = 0;
  let term = Math.exp(-mean);
  for (let k = 1; k <= count; k++) {
    // P(held ≥ k) = 1 − P(held ≤ k − 1)
    atMost += term;
    expected += Math.max(0, 1 - atMost);
    term *= mean / k;
  }
  return expected;
}

/**
 * How many bonus items a holder has over `max` — E[max(0, held − max)] on the
 * same spread: what a hold limit burns as it starts (wave B, spec §6.14).
 */
export function itemsHeldOver(max: number): number {
  return Math.max(0, meanHeld("bonus") - itemsHeldUpTo(max, null));
}

/** The strongest item a pick of these rarities may take (`PLAY_MODEL.bestItem`): any rarity when null. */
export function bestItemWorth(rarities: readonly Rarity[] | null | undefined): number {
  const among = rarities && rarities.length > 0 ? rarities : (Object.keys(PLAY_MODEL.bestItem) as Rarity[]);
  return Math.max(...among.map((r) => PLAY_MODEL.bestItem[r]));
}

/** The share of a new season's board each cell type takes. */
export const CELL_SHARE: Readonly<Record<CellType, number>> = (() => {
  const { size, loop, bonusCount, penaltyCount, teleportCount, eventCount } = board;
  const special = bonusCount + penaltyCount + teleportCount + eventCount;
  const ends = loop ? 1 : 2;
  return {
    start: 1 / size,
    finish: loop ? 0 : 1 / size,
    normal: Math.max(0, size - ends - special) / size,
    penalty: penaltyCount / size,
    event: eventCount / size,
    bonus: bonusCount / size,
    teleport: teleportCount / size,
    custom: 0,
  };
})();

/** The dice a throw uses: how many, and how many sides each. */
export interface DiceShape {
  count: number;
  sides: number;
}

/** What a rule's conditions — and the entry around it — say about the turns it fires on. */
export interface PlayContext {
  /** Only on this game result (an `outcome` condition). */
  outcome: "passed" | "dropped" | null;
  /** Only on these cells (a `cellType` condition). */
  cells: readonly CellType[] | null;
  /**
   * Only on throws whose sum this lets through (a `diceShow` condition on the
   * sum): what is lost or changed is what those throws hold. All when absent.
   */
  sum?: ((sum: number) => boolean) | null;
  /**
   * The dice a pass and a drop throw when the entry's own rules add dice or
   * sides before the throw («Кости судьбы»); a new season's when absent.
   */
  dice?: { pass: DiceShape; drop: DiceShape } | null;
  /** What arrives, at `onIncoming` (an `incoming` condition, wave B); everything when absent. */
  incoming?: ArrivalScope | null;
  /**
   * A reaction item's use (wave B, spec §6.15): its dice actions are worth what
   * one use gains on the bad throw it is used on, not what they do to every throw.
   */
  reaction?: boolean;
  /**
   * The entry waits for what it answers — an effect of `triggers`, a passive or
   * cursed item with charges: a firing is worth what one answer stops, not what
   * a roll brings (an immunity, spec §6.17).
   */
  waits?: boolean;
}

export const ANY_PLAY: PlayContext = { outcome: null, cells: null };

/** Passes and drops among the turns a rule fires on — drops at their weight. */
export function outcomeWeights(play: PlayContext): { pass: number; drop: number } {
  const dropFactor = PLAY_MODEL.dropWeight / (1 - PLAY_MODEL.passRate);
  if (play.outcome === "passed") return { pass: 1, drop: 0 };
  if (play.outcome === "dropped") return { pass: 0, drop: dropFactor };
  return { pass: PLAY_MODEL.passRate, drop: PLAY_MODEL.dropWeight };
}

/** How often a move ends on one of `cells`. */
export function cellChance(cells: readonly CellType[]): number {
  return Math.min(1, cells.reduce((sum, c) => sum + (CELL_SHARE[c] ?? 0), 0));
}

/**
 * What keeping the landing cell from firing is worth, on the cells a rule
 * fires on, with its way: plus when it spares a loss, minus when it costs a gain.
 */
export function skipWorth(cells: readonly CellType[] | null): number {
  const among = cells ?? (Object.keys(CELL_SHARE) as CellType[]);
  let share = 0;
  let value = 0;
  for (const c of among) {
    const s = CELL_SHARE[c] ?? 0;
    share += s;
    value -= s * (PLAY_MODEL.landing[c] ?? 0);
  }
  return share > 0 ? value / share : 0;
}

/** What keeping the landing cell from firing is worth, either way. */
export function skipValue(cells: readonly CellType[] | null): number {
  return Math.abs(skipWorth(cells));
}

// ---------------------------------------------------------------------------
// The dice, exactly: what the roll primitives of the pipeline (spec §7.2) are
// worth comes from the distribution of a new season's dice, not a guess.
// ---------------------------------------------------------------------------

/** One die's faces, each with its chance: index = face (index 0 unused). */
export type DieDistribution = readonly number[];

/** A fair die. */
export function fairDie(sides: number): DieDistribution {
  return [0, ...Array.from({ length: sides }, () => 1 / sides)];
}

/** A die whose faces in `values` are thrown again, once. */
export function rerolledDie(sides: number, values: readonly number[]): DieDistribution {
  const fair = fairDie(sides);
  const again = values.filter((v) => v >= 1 && v <= sides).length / sides;
  return fair.map((p, face) => (face === 0 ? 0 : (values.includes(face) ? 0 : p) + again / sides));
}

/** The chance of each sum of `count` dice: index = sum. */
export function sumDistribution(die: DieDistribution, count: number): number[] {
  let dist = [1];
  for (let i = 0; i < count; i++) {
    const next: number[] = new Array(dist.length + die.length - 1).fill(0);
    dist.forEach((p, s) => {
      if (p === 0) return;
      die.forEach((q, face) => {
        if (q > 0) next[s + face]! += p * q;
      });
    });
    dist = next;
  }
  return dist;
}

/** The better (`max`) or worse (`min`) of two independent throws. */
export function twoThrows(dist: readonly number[], keep: "max" | "min"): number[] {
  const cdf: number[] = [];
  dist.reduce((acc, p, s) => (cdf[s] = acc + p), 0);
  return dist.map((_, s) => {
    const atMost = cdf[s]!;
    const below = s === 0 ? 0 : cdf[s - 1]!;
    return keep === "max" ? atMost * atMost - below * below : (1 - below) ** 2 - (1 - atMost) ** 2;
  });
}

/** E[f(sum)] over a distribution. */
export function expectedValue(dist: readonly number[], f: (sum: number) => number): number {
  return dist.reduce((acc, p, s) => acc + p * f(s), 0);
}

/** The dice of a pass and of a drop on a new season's board. */
export const PLAY_DICE = { sides: dice.sides, pass: dice.passDiceCount, drop: dice.dropDiceCount } as const;

/** The dice a pass and a drop throw on the turns a rule fires on: a new season's, or what the entry makes them. */
export function playDice(play: Pick<PlayContext, "dice">): { pass: DiceShape; drop: DiceShape } {
  return (
    play.dice ?? {
      pass: { count: PLAY_DICE.pass, sides: PLAY_DICE.sides },
      drop: { count: PLAY_DICE.drop, sides: PLAY_DICE.sides },
    }
  );
}

/** The chance of each sum a throw of these dice shows: index = sum. */
export function throwDistribution(shape: DiceShape): number[] {
  return sumDistribution(fairDie(Math.max(2, shape.sides)), Math.max(0, shape.count));
}

/** A sum distribution narrowed to the sums `keep` lets through, scaled back to 1 (empty when none is). */
export function keptDistribution(dist: readonly number[], keep: PlayContext["sum"]): number[] {
  if (!keep) return [...dist];
  const share = dist.reduce((acc, p, s) => acc + (keep(s) ? p : 0), 0);
  return dist.map((p, s) => (share > 0 && keep(s) ? p / share : 0));
}

/** The dice sum of a roll: a pass's, a drop's, or either at their rates. */
export function rollDistribution(outcome: "passed" | "dropped" | null): number[] {
  const die = fairDie(PLAY_DICE.sides);
  const pass = sumDistribution(die, PLAY_DICE.pass);
  const drop = sumDistribution(die, PLAY_DICE.drop);
  if (outcome === "passed") return pass;
  if (outcome === "dropped") return drop;
  const out: number[] = new Array(Math.max(pass.length, drop.length)).fill(0);
  pass.forEach((p, s) => (out[s]! += PLAY_MODEL.passRate * p));
  drop.forEach((p, s) => (out[s]! += (1 - PLAY_MODEL.passRate) * p));
  return out;
}

/** The mean dice sum of a roll: a pass's, a drop's, or either at their rates. */
export function meanRoll(outcome: "passed" | "dropped" | null): number {
  return expectedValue(rollDistribution(outcome), (sum) => sum);
}

/** The mean count of items held: all of them, or those of a character. */
export function meanHeld(character: "bonus" | "penalty" | null): number {
  const share = character === "penalty" ? PLAY_MODEL.cursedShare : character === "bonus" ? 1 - PLAY_MODEL.cursedShare : 1;
  return PLAY_MODEL.heldItems * share;
}

/**
 * How often a count of held items compares to `value` — a Poisson spread
 * around the mean, since nothing bounds what a player holds.
 */
export function heldChance(character: "bonus" | "penalty" | null, cmp: "eq" | "lte" | "gte", value: number): number {
  if (value < 0) return cmp === "gte" ? 1 : 0;
  const mean = meanHeld(character);
  let atMost = 0;
  let exactly = 0;
  let term = Math.exp(-mean);
  for (let k = 0; k <= value; k++) {
    if (k > 0) term *= mean / k;
    if (k === value) exactly = term;
    atMost += term;
  }
  if (cmp === "eq") return exactly;
  if (cmp === "lte") return Math.min(1, atMost);
  return Math.max(0, 1 - atMost + exactly);
}

/**
 * What one use of a reaction gains its holder (wave B, spec §6.15), in cells.
 * They see the dice before choosing, so they use it on a bad throw — a pass
 * below an average throw, a drop above one — that it is expected to improve,
 * the first that comes among those the rule's conditions let through, and gain
 * there what it is expected to bring; a drop's gain counts at the streak
 * multiplier. Exact over a new season's dice (or the entry's own): the throws
 * are few.
 */
export function reactionWorth(rules: ReactionRules, play: PlayContext): number {
  const dice = playDice(play);
  const dropFactor = PLAY_MODEL.dropWeight / (1 - PLAY_MODEL.passRate);
  let chance = 0;
  let gain = 0;
  for (const outcome of ["passed", "dropped"] as const) {
    if (play.outcome !== null && play.outcome !== outcome) continue;
    const shape = outcome === "passed" ? dice.pass : dice.drop;
    if (shape.count <= 0) continue;
    const sides = Math.max(2, shape.sides);
    const each = (outcome === "passed" ? PLAY_MODEL.passRate : 1 - PLAY_MODEL.passRate) / sides ** shape.count;
    for (const faces of allThrows(shape.count, sides)) {
      if (play.sum && !play.sum(faces.reduce((a, b) => a + b, 0))) continue;
      const view = { outcome, dice: { count: shape.count, sides }, faces, throws: [faces], rules: NO_DICE_RULES };
      if (!isBadThrow(view)) continue;
      const g = reactionGain(view, rules);
      if (g <= 0) continue;
      chance += each;
      gain += each * g * (outcome === "passed" ? 1 : dropFactor);
    }
  }
  return chance === 0 ? 0 : gain / chance;
}

/** Every face vector `count` dice of `sides` may show — capped, as a new season's few dice are. */
function allThrows(count: number, sides: number): number[][] {
  const limit = Math.min(count, 4);
  let out: number[][] = [[]];
  for (let i = 0; i < limit; i++) {
    const next: number[][] = [];
    for (const prefix of out) for (let face = 1; face <= sides; face++) next.push([...prefix, face]);
    out = next;
  }
  return out;
}
