/**
 * What an entry is worth in play, measured (docs/IEE_CONSTRUCTOR_SPEC.md §14):
 * the cells of advantage it gives the player who holds it — or takes from the
 * one it is aimed at — over a stretch of ordinary turns, against the same
 * turns without it.
 *
 * Two players play in a memory season (`./season`): the holder and a rival,
 * side by side in the middle of a long board laid out with a new season's
 * share of bonus, penalty and event cells (no teleports — a jump across the
 * board would drown everything else), far enough from the start that a run of
 * dropped games does not pile them onto cell 0. Every seed is played twice,
 * with and without the entry, on the same dice, the same passed-or-dropped
 * games and the same wheel draws; the difference is the entry's doing. Points
 * left at the end count at what they are worth on the next roll. The power
 * estimate (`entryPower`) is calibrated against this.
 */
import { DEFAULT_SEASON_CONFIG, defaultCatalogEntry, type SeasonConfig, type TurnCell } from "@/lib/engine";
import { compileSet, isItem, type EntryDoc, type SetMemberInput } from "@/lib/engine/iee/dsl";
import { generateBoardCells } from "@/lib/modules/catalog/pool/board-generator";

import { referencedEntries } from "../library/refs";
import { buildRegistry, type SeasonRegistry } from "../registry";
import { entryChoiceOptions } from "../use";
import { seededRng } from "./sandbox";
import { botReactionPolicy, simSeason } from "./season";

/** How often a game is passed in the measured turns — the vocabulary's `outcome` likelihood. */
export const MEASURE_PASS_RATE = 0.6;

export interface MeasureOptions {
  /** Seeds played, each with and without the entry. */
  seeds: number;
  /** Turns each player takes. */
  turns: number;
  /** The first seed; seeds run from it upwards. */
  from?: number;
}

export interface MeasureSubject {
  entryId: string;
  doc: EntryDoc;
  docOf: (entryId: string) => EntryDoc | null;
  /**
   * Entries on the wheels — what a landing hands out, so an entry that keeps a
   * cell from firing is worth what that cell's wheel would have done. Without
   * them a landing pays the cell's own points only.
   */
  wheels?: readonly { entryId: string; doc: EntryDoc }[];
  /** Entries the holder carries in both plays before the entry arrives — what a cleanse has to take away. */
  carries?: readonly string[];
  /**
   * Where the players stand when the entry arrives — what an out-of-turn move
   * is aimed across (spec §14, the play model's `aimGap` and `behindGap`): the
   * cells the rival is ahead (behind when negative), and how far each one's
   * last regular move went (back when negative). Side by side, with no move
   * behind them, unless set.
   */
  placing?: {
    rivalAhead?: number;
    lastMove?: { holder?: number; rival?: number };
    /** The dice sum of each one's last move — what «Магнит» compares against; none unless set. */
    lastRoll?: { holder?: number; rival?: number };
  };
}

export interface Measured {
  /** Mean cells of advantage for the side that has the entry (negative: it hurts its holder). */
  value: number;
  /** Standard error of that mean. */
  error: number;
}

const HOLDER = "holder";
const RIVAL = "rival";
/** Far from the start: a run of dropped games — each multiplying the next — must not pile everyone onto cell 0. */
const START = 500;
/** What a point is worth: it rides on the next roll, forward on a pass and backward on a drop. */
export const POINT_VALUE = 2 * MEASURE_PASS_RATE - 1;

/** The measured season: a new season's rules on a long board, items and effects on, no wheel to draw from. */
export function measureSeasonConfig(): SeasonConfig {
  return {
    ...DEFAULT_SEASON_CONFIG,
    board: { ...DEFAULT_SEASON_CONFIG.board, size: 1000, loop: false, bonusCount: 100, penaltyCount: 100, teleportCount: 0, eventCount: 75 },
    iee: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true, allowTargetingOthers: true, pvpProtectionMoves: 0, revealDropsInFeed: false, nothingWeight: 0 },
  };
}

/** The entry and everything it hands out, off the wheels; the wheels' entries on them. */
function measureRegistry(subject: MeasureSubject): SeasonRegistry | null {
  const members = new Map<string, SetMemberInput>();
  const slugs = new Set<string>();
  const add = (entryId: string, doc: EntryDoc) => {
    if (members.has(entryId) || slugs.has(doc.slug)) return false;
    members.set(entryId, { entryId, revisionId: `measure:${entryId}`, doc });
    slugs.add(doc.slug);
    return true;
  };
  add(subject.entryId, subject.doc);
  const queue = [...referencedEntries(subject.doc), ...(subject.carries ?? [])];
  const onWheels = new Set<string>();
  for (const w of subject.wheels ?? []) {
    if (w.entryId === subject.entryId || !add(w.entryId, w.doc)) continue;
    onWheels.add(w.entryId);
    queue.push(...referencedEntries(w.doc));
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (members.has(id)) continue;
    const doc = subject.docOf(id);
    if (!doc || !add(id, doc)) continue;
    queue.push(...referencedEntries(doc));
  }
  const set = compileSet([...members.values()]);
  if (!set.byEntryId.has(subject.entryId)) return null;
  return buildRegistry(
    set,
    set.entries.map((e) => defaultCatalogEntry(e, { enabled: onWheels.has(e.entryId) })),
  );
}

/** A stream for one (seed, player, turn): the same dice and games in both plays of a seed. */
const streamFor = (seed: number, player: number, turn: number) => seededRng((seed * 7919 + player * 104_729 + turn * 1_299_709) >>> 0);

/** One seed, played with or without the entry: the holder's lead over the rival when it is over. */
async function play(registry: SeasonRegistry, subject: MeasureSubject, seed: number, turns: number, withEntry: boolean): Promise<number> {
  const config = measureSeasonConfig();
  const cells = generateBoardCells(config, seededRng(seed ^ 0x0b0a4d00));
  const cellAt = (position: number): TurnCell | null => {
    const cell = cells[position];
    return cell ? { position: cell.position, cellType: cell.cellType, config: cell.config } : null;
  };
  const placing = subject.placing ?? {};
  const rivalAt = START + (placing.rivalAhead ?? 0);
  const lastMoveStart = (at: number, cells: number | undefined) => (cells === undefined ? null : at - cells);
  const season = simSeason({
    seasonId: `measure:${seed}`,
    registry,
    config,
    players: [
      { id: HOLDER, position: START, lastMoveStart: lastMoveStart(START, placing.lastMove?.holder), lastRoll: placing.lastRoll?.holder ?? null },
      { id: RIVAL, position: rivalAt, lastMoveStart: lastMoveStart(rivalAt, placing.lastMove?.rival), lastRoll: placing.lastRoll?.rival ?? null },
    ],
    cellAt,
    rng: seededRng(seed),
  });

  for (const carried of subject.carries ?? []) await season.give(carried, HOLDER, { source: "measure" });
  if (withEntry) {
    const entry = registry.get(subject.entryId)!;
    await season.give(subject.entryId, HOLDER, { source: "measure" });
    // An active item is used on the first turn; a passive or cursed one works by itself while held;
    // a reaction item in the window, on the first bad throw it improves (§6.15) — the turns' policy.
    if (isItem(entry) && entry.usage.activation === "active" && entry.usage.window !== "after_dice") {
      const aim = entry.usage.target;
      if (entry.usage.window === "on_open_roll") season.player(HOLDER).inFlight = true;
      // One that asks for a pick («Амулет очищения») takes the newest of what the holder carries.
      const choice = entry.usage.choice
        ? ((await season.holdings(HOLDER)).filter((r) => r.entryId !== subject.entryId).at(-1)?.id ?? null)
        : null;
      // One that asks for an item of the catalog takes the first the season offers (spec §6.12).
      const entryChoice = entry.usage.entryChoice ? (entryChoiceOptions(entry.usage.entryChoice, registry, entry)[0]?.entryId ?? null) : null;
      await season.use({
        player: HOLDER,
        item: { entry: subject.entryId },
        target: aim === "other" || aim === "any" ? RIVAL : aim === "self" ? HOLDER : null,
        choice,
        entryChoice,
      });
      season.player(HOLDER).inFlight = false;
    }
  }
  const spin = (subject.wheels ?? []).length > 0;

  for (let turn = 0; turn < turns; turn++) {
    for (const [n, id] of [HOLDER, RIVAL].entries()) {
      if (season.player(id).status !== "active") continue;
      const games = streamFor(seed, n, turn);
      const outcome = games() < MEASURE_PASS_RATE ? "passed" : "dropped";
      await season.turn({ player: id, outcome, dice: () => games, spin, wheelRng: streamFor(seed ^ 0x77ee1, n, turn), react: botReactionPolicy });
    }
  }
  const standing = (id: string) => season.player(id).position + season.balance(id) * POINT_VALUE;
  return standing(HOLDER) - standing(RIVAL);
}

/**
 * The entry's worth in play: the holder's lead with it minus the lead without
 * it, over `seeds` seeds. An item is used on the first turn — on the rival
 * when it aims at others, on its holder when it aims at them, picking the
 * newest of what the holder carries when it asks for a pick, and the first
 * item the season offers when it asks for one of the catalog. What a run hands
 * out is never used: an item obtained on the way is worth nothing here, so
 * the item operations of wave B are held to the pack instead (spec §6.12).
 */
export async function measureEntry(subject: MeasureSubject, options: MeasureOptions): Promise<Measured | null> {
  const registry = measureRegistry(subject);
  if (!registry) return null;
  const diffs: number[] = [];
  const from = options.from ?? 1;
  for (let seed = from; seed < from + options.seeds; seed++) {
    const withIt = await play(registry, subject, seed, options.turns, true);
    const without = await play(registry, subject, seed, options.turns, false);
    diffs.push(withIt - without);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance = diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, diffs.length - 1);
  return { value: mean, error: Math.sqrt(variance / diffs.length) };
}
