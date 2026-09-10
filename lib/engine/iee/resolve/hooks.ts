import type {
  ActiveEffectLike,
  EffectDef,
  HookName,
  HookPatch,
  HookTurnContext,
  IeeModifiers,
  IeePlayerSnapshot,
} from "../../types/iee";

/** A patch together with the row and definition it came from. */
export interface PatchSource {
  /** `player_effects.id` — what the caller charges when `consumeCharge` is set. */
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
    forcedPosition: null,
    forcedOutcome: null,
    skipCellEffect: false,
    immune: false,
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
 *  - additive (`*Delta`) accumulate;
 *  - override (`forced*`) go to the highest-priority setter, and every later
 *    attempt is recorded in `conflicts` rather than silently dropped;
 *  - veto (`skipCellEffect`, `immune`) are boolean OR.
 */
export function reduceHookPatches(sources: readonly PatchSource[]): IeeModifiers {
  const out = emptyModifiers();

  for (const source of sortPatchSources(sources)) {
    const p = source.patch;

    out.stepsDelta += p.stepsDelta ?? 0;
    out.balanceDelta += p.balanceDelta ?? 0;
    out.diceCountDelta += p.diceCountDelta ?? 0;
    out.diceSidesDelta += p.diceSidesDelta ?? 0;

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
    // deterministic and the oldest shield is the one spent.
    const offered: Array<[offered: boolean, alreadyInForce: boolean]> = [];
    if (p.skipCellEffect) offered.push([true, out.skipCellEffect]);
    if (p.immune) offered.push([true, out.immune]);
    const vetoWasRedundant = offered.length > 0 && offered.every(([, already]) => already);

    if (p.skipCellEffect) out.skipCellEffect = true;
    if (p.immune) out.immune = true;

    if (p.reason) out.reasons.push(p.reason);
    // An effect that asks for a charge without vetoing anything still pays —
    // only a veto that changed nothing is free.
    if (p.consumeCharge && !vetoWasRedundant) out.consumed.push(source.id);
  }

  return out;
}

/**
 * Drops rows whose duration has run out. Lazy — there is no scheduler.
 *
 * Takes only the two fields it reads, so a database row can be passed straight
 * in. It used to demand a whole `ActiveEffectLike`, which is why the dashboard
 * grew its own hand-written copy of this rule rather than importing it — and
 * that copy then drifted onto the wrong roll counter.
 *
 * `currentRollSeq` is the roll being decided, not the one that just finished.
 */
export function isEffectActive(
  effect: Pick<ActiveEffectLike, "chargesLeft" | "expiresAfterRollSeq">,
  currentRollSeq: number,
): boolean {
  if (effect.chargesLeft !== null && effect.chargesLeft <= 0) return false;
  if (
    effect.expiresAfterRollSeq !== null &&
    currentRollSeq > effect.expiresAfterRollSeq
  ) {
    return false;
  }
  return true;
}

/** Active rows only, in the order they will be reduced. */
export function activeEffects(
  effects: readonly ActiveEffectLike[],
  currentRollSeq: number,
): ActiveEffectLike[] {
  return effects.filter((e) => isEffectActive(e, currentRollSeq));
}

/** Rows that have run out and should be marked `expired` by the caller. */
export function expiredEffects(
  effects: readonly ActiveEffectLike[],
  currentRollSeq: number,
): ActiveEffectLike[] {
  return effects.filter((e) => !isEffectActive(e, currentRollSeq));
}

/**
 * Runs one hook across a player's active effects and reduces the result.
 * Effects with no handler for the hook, and unknown keys left behind by a
 * removed catalog entry, are simply skipped.
 */
export function runHook(params: {
  hook: HookName;
  effects: readonly ActiveEffectLike[];
  registry: Readonly<Record<string, EffectDef>>;
  self: IeePlayerSnapshot;
  turn: HookTurnContext;
}): IeeModifiers {
  const sources: PatchSource[] = [];

  for (const effect of activeEffects(params.effects, params.turn.rollSeq)) {
    const def = params.registry[effect.effectKey];
    if (!def) continue;
    const fn = def.hooks[params.hook];
    if (!fn) continue;

    sources.push({
      id: effect.id,
      effectKey: effect.effectKey,
      priority: def.priority,
      appliedAt: effect.appliedAt,
      patch: fn({
        hook: params.hook,
        effectKey: effect.effectKey,
        params: effect.params,
        self: params.self,
        turn: params.turn,
      }),
    });
  }

  return reduceHookPatches(sources);
}
