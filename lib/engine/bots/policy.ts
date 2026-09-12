/**
 * Pure bot brain: which real player step a synthetic participant takes next.
 * No next/*, react, drizzle or pg imports — randomness arrives as an
 * injected `rng` so tests stay deterministic.
 */

export type BotOutcome = "passed" | "dropped" | "rerolled";

export interface BotOutcomeWeights {
  passed: number;
  dropped: number;
  rerolled: number;
}

export type Rng = () => number;

/** Weighted draw over the resolve outcomes. Zero/negative weights never win. */
export function pickBotOutcome(weights: BotOutcomeWeights, rng: Rng = Math.random): BotOutcome {
  const pass = Math.max(0, weights.passed);
  const drop = Math.max(0, weights.dropped);
  const reroll = Math.max(0, weights.rerolled);
  const total = pass + drop + reroll;
  if (total <= 0) return "passed";
  const roll = rng() * total;
  if (roll < pass) return "passed";
  if (roll < pass + drop) return "dropped";
  return "rerolled";
}

export type BotStepKind = "roll" | "resolve";

/**
 * What the bot should attempt given its current state.
 * - open roll + resolve enabled → resolve it (mirrors a player with a game)
 * - no open roll + roll enabled → roll a new game
 * - otherwise null (this step is a no-op: e.g. resolve disabled while a roll
 *   is open, or both endpoints switched off)
 */
export function nextBotStepKind(
  hasOpenRoll: boolean,
  opts: { enableRoll: boolean; enableResolve: boolean },
): BotStepKind | null {
  if (hasOpenRoll) return opts.enableResolve ? "resolve" : null;
  return opts.enableRoll ? "roll" : null;
}


/** Flavor for resolve calls: bots write like players do. */
const BOT_DROP_REASONS = [
  "bot test run: could not finish this game in time",
  "bot test run: game too hard for the test profile",
  "bot test run: dropping to check the drop path",
] as const;

const BOT_PASS_COMMENTS = [
  "bot test run: finished, checking the pass path",
  "bot test run: game completed",
  "",
] as const;

export function pickBotReason(kind: BotOutcome, rng: Rng = Math.random): string | undefined {
  if (kind === "rerolled") return "bot test run: rerolling to check the reroll path";
  if (kind === "dropped") return BOT_DROP_REASONS[Math.floor(rng() * BOT_DROP_REASONS.length)];
  return undefined;
}

export function pickBotComment(rng: Rng = Math.random): string | undefined {
  const comment = BOT_PASS_COMMENTS[Math.floor(rng() * BOT_PASS_COMMENTS.length)];
  return comment.length > 0 ? comment : undefined;
}

export function pickBotRating(rng: Rng = Math.random): number | undefined {
  return 1 + Math.floor(rng() * 10);
}
