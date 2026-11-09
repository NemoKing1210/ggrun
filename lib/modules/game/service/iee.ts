/**
 * Items and effects inside a turn: what the turn reads from the database
 * before it plays — the holder's statuses and what the wheel's picker needs.
 *
 * Kept out of `turn.ts` on purpose: that file is the turn transaction. The
 * hook dispatch is loaded before the transaction (one read, so the set cannot
 * change halfway through a move); everything it decides is written inside it,
 * through the executor — the one writer of IEE state
 * (docs/IEE_CONSTRUCTOR_SPEC.md §9). The dispatch itself, the wheel and the
 * settlement live in `lib/modules/iee/turn`, where the simulations reach them
 * too; selection and rule evaluation are pure and live in `lib/engine/iee`.
 */
import type { SeasonPlayer } from "@/db/schema";
import { participates } from "@/lib/engine/iee/resolve/live";
import { factsOfRows } from "@/lib/modules/iee/executor";
import { listActiveInstances, loadPoolContext, snapshotsOf, toPlayerSnapshot } from "@/lib/modules/iee/repository";
import type { SeasonRegistry } from "@/lib/modules/iee/registry";
import { hooksOver, liveSources, noHooks, rememberedPlayers, type PoolContext, type TurnHooks } from "@/lib/modules/iee/turn";

export { polarityForCell } from "@/lib/engine";
export {
  applyWheel,
  applyWheels,
  settleTurnHooks,
  type FeedEntry,
  type PoolContext,
  type TurnHooks,
  type WheelResult,
} from "@/lib/modules/iee/turn";

/**
 * Loads everything the picker needs. Read outside the transaction, like the
 * board and cell reads already are.
 *
 * Caveat worth knowing: under READ COMMITTED two players resolving at the very
 * same moment could each pass a `maxPerSeason` check that only one of them
 * should. The caps are advisory, not invariants; making them hard would need
 * SERIALIZABLE or a lock, which is not worth it for a seasonal event.
 */
export async function loadWheelContext(sp: SeasonPlayer, registry: SeasonRegistry, landedAt?: number): Promise<PoolContext> {
  return loadPoolContext(sp, registry, landedAt);
}

export async function loadTurnHooks(
  sp: SeasonPlayer,
  enabled: boolean,
  /**
   * The number of the roll being resolved — `sp.rollSeq + 1`. An effect takes
   * part only if it was in force before this roll was rolled: one granted while
   * the game was in flight is anchored at this very roll and waits for the next
   * (SC-HEXSCROLL-7).
   */
  turnRollSeq: number,
  registry: SeasonRegistry,
  rng: () => number = Math.random,
): Promise<TurnHooks> {
  if (!enabled) return noHooks();

  const rows = await listActiveInstances(sp.id);
  // Effects, and the passive or cursed items the player holds (spec §6.10);
  // an effect sees the player its item was aimed at as they stand now (§6.11).
  const remembered = rememberedPlayers(rows);
  const targets = remembered.length > 0 ? await snapshotsOf(remembered) : undefined;
  const effects = liveSources(registry, rows, targets);
  if (!effects.some((e) => participates(e.anchorRollSeq, turnRollSeq))) return noHooks();

  // The real snapshot: rank and move count are real queries, made only when
  // the player is actually carrying something that may read them.
  const self = await toPlayerSnapshot(sp);
  return hooksOver({ effects, self, selfEntries: factsOfRows(registry, rows), rng });
}
