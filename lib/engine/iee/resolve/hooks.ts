/**
 * Reducing what a turn's statuses asked for into one set of modifiers.
 *
 * The rules themselves run in `live.ts` over the compiled entries a player's
 * instances play; this file only decides how their patches combine — order,
 * vetoes, which charge is spent — so that question has one answer.
 */
import type { HookPatch, IeeModifiers } from "../../types/iee";

/** A patch together with the instance it came from. */
export interface PatchSource {
  /** The instance id — what the caller charges when `consumeCharge` is set. */
  id: string;
  effectKey: string;
  priority: number;
  appliedAt: number;
  patch: HookPatch;
}

export function emptyModifiers(): IeeModifiers {
  return {
    stepsDelta: 0,
    balanceDelta: 0,
    diceCountDelta: 0,
    diceSidesDelta: 0,
    resultDelta: 0,
    rerollValues: [],
    bestOfTwo: false,
    worstOfTwo: false,
    resultCap: null,
    reverseLowerHalf: false,
    forcedPosition: null,
    forcedOutcome: null,
    skipCellEffect: false,
    immune: false,
    cancelMove: false,
    intents: [],
    extraSpins: [],
    reasons: [],
    consumed: [],
    conflicts: [],
  };
}

/**
 * Deterministic order: priority (low first), then application time, then id.
 * Never rely on the order rows come back from the database.
 */
export function sortPatchSources(sources: readonly PatchSource[]): PatchSource[] {
  return [...sources].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.appliedAt - b.appliedAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * Reduces every effect's contribution at one hook into a single result.
 *
 * Three classes of field, three rules:
 *  - additive (`*Delta`) accumulate — and so do the dice pipeline's asks:
 *    faces to throw again join, a cap keeps the lowest, a second throw or a
 *    reversed lower half is asked by any source (spec §7.2);
 *  - override (`forced*`) go to the highest-priority setter, and every later
 *    attempt is recorded in `conflicts` rather than silently dropped;
 *  - veto (`skipCellEffect`, `immune`, `cancelMove`) are boolean OR;
 *  - intents, and the wheels to spin once more, are collected in reduction
 *    order for the executor and the turn.
 */
export function reduceHookPatches(sources: readonly PatchSource[]): IeeModifiers {
  const out = emptyModifiers();

  for (const source of sortPatchSources(sources)) {
    const p = source.patch;

    out.stepsDelta += p.stepsDelta ?? 0;
    out.balanceDelta += p.balanceDelta ?? 0;
    out.diceCountDelta += p.diceCountDelta ?? 0;
    out.diceSidesDelta += p.diceSidesDelta ?? 0;
    out.resultDelta += p.resultDelta ?? 0;
    for (const v of p.rerollValues ?? []) if (!out.rerollValues.includes(v)) out.rerollValues.push(v);
    out.rerollValues.sort((a, b) => a - b);
    if (p.bestOfTwo) out.bestOfTwo = true;
    if (p.worstOfTwo) out.worstOfTwo = true;
    if (p.resultCap !== undefined) out.resultCap = out.resultCap === null ? p.resultCap : Math.min(out.resultCap, p.resultCap);
    if (p.reverseLowerHalf) out.reverseLowerHalf = true;

    if (p.forcedPosition !== undefined) {
      if (out.forcedPosition === null) out.forcedPosition = p.forcedPosition;
      else {
        out.conflicts.push(
          `forcedPosition: ${source.effectKey} lost to an earlier effect`,
        );
      }
    }
    if (p.forcedOutcome !== undefined) {
      if (out.forcedOutcome === null) out.forcedOutcome = p.forcedOutcome;
      else {
        out.conflicts.push(
          `forcedOutcome: ${source.effectKey} lost to an earlier effect`,
        );
      }
    }

    // A veto is satisfied by the first effect that supplies it.
    //
    // Two shields used to burn on one penalty landing: both returned
    // `skipCellEffect` *and* `consumeCharge`, the reducer collected every
    // charge it was offered, and the player paid twice to be protected once.
    // A test recorded that as fact without anyone deciding it. Two shields are
    // two absorbed hits — that is what the catalog entry promises and what a
    // player counting their protection expects.
    //
    // Sorting is by priority, then application time, then id, so "first" is
    // deterministic and the oldest ward is the one spent.
    const offered: Array<[offered: boolean, alreadyInForce: boolean]> = [];
    if (p.skipCellEffect) offered.push([true, out.skipCellEffect]);
    if (p.immune) offered.push([true, out.immune]);
    if (p.cancelMove) offered.push([true, out.cancelMove]);
    const vetoWasRedundant = offered.length > 0 && offered.every(([, already]) => already);

    if (p.skipCellEffect) out.skipCellEffect = true;
    if (p.immune) out.immune = true;
    if (p.cancelMove) out.cancelMove = true;
    if (p.intents && p.intents.length > 0) out.intents.push(...p.intents);
    if (p.extraSpins && p.extraSpins.length > 0) out.extraSpins.push(...p.extraSpins);

    if (p.reason) out.reasons.push(p.reason);
    // An effect that asks for a charge without vetoing anything still pays —
    // only a veto that changed nothing is free.
    if (p.consumeCharge && !vetoWasRedundant) out.consumed.push(source.id);
  }

  return out;
}
