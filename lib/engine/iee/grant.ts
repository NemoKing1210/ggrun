import type { EffectDef, IeeConfig } from "../types/iee";
import { catalogDefaults } from "./index";
import { resolveParams } from "./selection/pick";

/**
 * What a season's tuning turns one catalog effect into.
 *
 * Pure on purpose. Three things grant a status — a wheel drop, an item, a
 * challenge reward — and only the wheel used to read the season's tuning at
 * all. A host who set heavy boots to "-4 cells for 3 rolls" got exactly that
 * from a penalty cell and the catalog's "-2 for 1" from lead weights, with
 * nothing in the interface to explain the difference. Putting the arithmetic
 * here means the answer cannot depend on which caller asked.
 */
export interface ResolvedEffectGrant {
  /** Catalog defaults with the season's `paramOverrides` applied. */
  params: Record<string, number | string | boolean>;
  /** Null for charge-counted and permanent statuses. */
  expiresAfterRollSeq: number | null;
  /** Null for anything not counted in charges. */
  chargesLeft: number | null;
}

/**
 * `anchorRollSeq` is the last roll that counts as finished when the grant
 * lands: the roll being resolved for a wheel drop (the same transaction sets
 * `roll_seq` to it), the recipient's current counter for an item used between
 * turns. A status of N rolls then covers the next N.
 */
export function resolveEffectGrant(
  def: EffectDef,
  config: IeeConfig,
  anchorRollSeq: number,
): ResolvedEffectGrant {
  const entry = config.entries[def.key];
  const duration = def.duration;
  const value = entry?.durationOverride ?? ("value" in duration ? duration.value : 0);
  return {
    params: resolveParams(def.key, catalogDefaults(), entry),
    expiresAfterRollSeq:
      duration.kind === "rolls" ? anchorRollSeq + Math.max(1, value) : null,
    chargesLeft: duration.kind === "charges" ? Math.max(1, value) : null,
  };
}

/**
 * The roll a grant counts from, given who is receiving it.
 *
 * A status must never touch a move that is already in flight. A player who has
 * rolled a game is away playing it — often for days — and `/board` shows that
 * roll as in progress, so an `anytime` offensive item could be timed for
 * exactly that moment: the victim came back, pressed "passed", and travelled
 * two cells less than the dice said, with no window in which they could have
 * answered.
 *
 * A *cell* drop never did this. A status handed out by a penalty cell is
 * granted at the end of a turn and shortens the **next** move. So the same
 * status behaved differently depending on how it arrived, which is the split
 * this module exists to close.
 *
 * Pushing the clock one roll out keeps offensive items fully usable — in a
 * format where a game takes days, an open roll is the normal state and
 * forbidding the use outright would make them dead weight — while giving the
 * victim the answering window §8.3 requires everywhere else: they see the
 * status on their dashboard and can burn a cleansing salve before it bites.
 */
export function grantAnchor(recipientRollSeq: number, recipientHasOpenRoll: boolean): number {
  return recipientHasOpenRoll ? recipientRollSeq + 1 : recipientRollSeq;
}
