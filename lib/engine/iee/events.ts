/**
 * Event assignment — the pure part.
 *
 * Templates themselves are admin-authored rows; only the choice of which one
 * to hand out belongs in the engine, so it can be tested with an injected rng
 * like every other draw.
 */

/**
 * Picks a template key for a player who landed on an event cell.
 *
 * Anything already assigned to them is excluded, which is how "once per player
 * per season" (§12 F6) is honoured *before* the unique index has to catch it —
 * the index is the backstop, not the rule.
 *
 * Returns null when the pool is empty or exhausted; the caller then treats the
 * landing as an ordinary cell rather than failing the turn.
 */
export function pickEventKey(
  pool: readonly string[],
  alreadyAssigned: readonly string[],
  rng: () => number,
): string | null {
  const taken = new Set(alreadyAssigned);
  const available = pool.filter((key) => !taken.has(key));
  if (available.length === 0) return null;
  const index = Math.min(available.length - 1, Math.floor(rng() * available.length));
  return available[index] ?? null;
}

/** Reward shape carried on a template and copied onto an assignment. */
export interface EventReward {
  points?: number;
  itemKey?: string;
  effectKey?: string;
}

/** Reads a reward out of the jsonb column, ignoring anything malformed. */
export function parseEventReward(raw: unknown): EventReward {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: EventReward = {};
  if (typeof r.points === "number" && Number.isFinite(r.points) && r.points > 0) {
    out.points = Math.trunc(r.points);
  }
  if (typeof r.itemKey === "string" && r.itemKey) out.itemKey = r.itemKey;
  if (typeof r.effectKey === "string" && r.effectKey) out.effectKey = r.effectKey;
  return out;
}

/** True when a deadline has passed and the assignment was never submitted. */
export function isEventOverdue(
  status: string,
  dueAt: Date | null,
  now: Date,
): boolean {
  if (status !== "assigned") return false;
  if (dueAt === null) return false;
  return dueAt.getTime() < now.getTime();
}
