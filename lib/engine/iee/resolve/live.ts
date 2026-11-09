/**
 * Running compiled entries over a player's live instances — the pure half of
 * a turn's hook dispatch (spec §7.1, §7.9).
 *
 * The service loads the instances and resolves each to the compiled revision
 * it was granted with; everything after that is here, so the ordering, the
 * "not on a roll already in flight" rule and the counter arithmetic are tested
 * without a database.
 */
import type { HookPatch, HookTurnContext, IeeModifiers, IeeParams, IeePlayerSnapshot } from "../../types/iee";
import type { CompiledEffect, RuleContext } from "../dsl/runtime";
import { reduceHookPatches, type PatchSource } from "./hooks";

/** What a turn hook runs of an entry: its rules at the hooks, and who it is. */
export type HookedEntry = Pick<CompiledEffect, "key" | "revisionId" | "hooks">;

/**
 * One active instance with the revision it plays: an effect, or a passive or
 * cursed item, whose rules act at the turn hooks while it is held (spec §6.10).
 */
export interface LiveEffect {
  instanceId: string;
  entry: HookedEntry;
  /** Parameter snapshot taken at grant. */
  params: IeeParams;
  /** Grant time in ms — orders sources of the same priority. */
  grantedAt: number;
  /** The holder roll the instance counts from; null = no bound. */
  anchorRollSeq: number | null;
  /**
   * The player the item that handed it out was aimed at, as they stand now —
   * its rules read them as the chosen player (spec §6.11). Null or absent:
   * nobody, and what reads them does not hold.
   */
  target?: IeePlayerSnapshot | null;
}

/**
 * Whether an instance takes part in the holder's roll number `rollSeq`.
 *
 * A status granted while its holder had a game in flight is anchored at that
 * game's roll, so it neither changes the move being reported nor counts down
 * on it (SC-HEXSCROLL-7). One granted at the end of a turn — a wheel drop — is
 * anchored at the roll just resolved, which keeps it out of that roll too.
 */
export function participates(anchorRollSeq: number | null, rollSeq: number): boolean {
  return anchorRollSeq === null || rollSeq > anchorRollSeq;
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

/** The turn hooks the loop dispatches, in turn order (spec §7.1). */
export const TURN_HOOKS = [
  "beforeMovement",
  "afterDice",
  "afterMovement",
  "beforeCellEffect",
  "afterCellEffect",
  "onOutcome",
  "onTick",
] as const;
export type TurnHook = (typeof TURN_HOOKS)[number];

/** A rule that fired at a hook: what the journal's `fire` rows record. */
export interface FiredRule {
  instanceId: string;
  revisionId: string;
  key: string;
  ruleIndex: number;
  hook: TurnHook;
  patch: HookPatch;
  /** Server random draws the rule made — journaled with the firing. */
  draws: number[];
}

export interface LiveHookInput {
  hook: TurnHook;
  effects: readonly LiveEffect[];
  turn: HookTurnContext;
  /** Everything a rule may read apart from its own params and the turn. */
  base: Omit<RuleContext, "trigger" | "params" | "turn">;
}

/** Runs one hook over the holder's effects that take part in this roll. */
export function runLiveHook(input: LiveHookInput): { mods: IeeModifiers; fired: FiredRule[] } {
  const sources: PatchSource[] = [];
  const fired: FiredRule[] = [];
  for (const live of input.effects) {
    if (!participates(live.anchorRollSeq, input.turn.rollSeq)) continue;
    for (const rule of live.entry.hooks[input.hook] ?? []) {
      const draws: number[] = [];
      const rng = () => {
        const value = input.base.rng();
        draws.push(value);
        return value;
      };
      const patch = rule.run({
        ...input.base,
        rng,
        trigger: input.hook,
        params: live.params,
        turn: input.turn,
        target: live.target ?? input.base.target,
        instanceId: live.instanceId,
      });
      if (!patch) continue;
      sources.push({
        id: live.instanceId,
        effectKey: live.entry.key,
        priority: rule.priority,
        appliedAt: live.grantedAt,
        patch,
      });
      fired.push({
        instanceId: live.instanceId,
        revisionId: live.entry.revisionId,
        key: live.entry.key,
        ruleIndex: rule.ruleIndex,
        hook: input.hook,
        patch,
        draws,
      });
    }
  }
  return { mods: reduceHookPatches(sources), fired };
}

/** The counter events of one resolved turn (spec §7.9). */
export interface TurnTicks {
  /** Always: a roll was resolved. */
  roll: true;
  /** A regular move happened — false when a rule cancelled it. */
  moved: boolean;
  /** The game was passed. */
  passed: boolean;
}

/** How much a counter goes down at the end of a turn it took part in. */
export function tickAmount(unit: string | null, ticks: TurnTicks): number {
  switch (unit) {
    // The next game ends with the first one the holder resolves, passed or dropped.
    case "rolls":
    case "next_game":
      return 1;
    case "moves":
      return ticks.moved ? 1 : 0;
    case "passed_games":
      return ticks.passed ? 1 : 0;
    default:
      // `triggers` count firings, `permanent` and items count nothing here.
      return 0;
  }
}

/**
 * The roll an instance's counter counts from: the anchor, until a `refresh`
 * renewal moved it on (`count_from_roll_seq`). The counter goes down only on
 * the holder's rolls after it; the rules keep taking part from the anchor.
 */
export function countingFrom(anchorRollSeq: number | null, countFromRollSeq: number | null): number | null {
  return countFromRollSeq ?? anchorRollSeq;
}

/**
 * The counter after a `refresh` grant (spec §7.10): whichever copy lasts
 * longer — never a shorter one (fix A3).
 *
 * A renewal is a fresh copy: the incoming count, counted from the roll a fresh
 * copy counts from — after the roll already underway when it arrives (a game
 * in flight, or the move whose landing handed it out). That roll stays with
 * the old count; whatever counts the effect down after it — a roll, a move, a
 * passed game, a firing — comes off the renewed one. Counting from a roll
 * number, rather than adding the underway roll's tick to the count, is what
 * keeps this exact for the units that roll may or may not move: a passed game
 * is only known once the game is reported, a firing once the turn has played.
 *
 * The old copy stays only when it has more left than the incoming one. The
 * roll underway takes at most one off it, so it still lasts at least as long
 * as the renewal would have.
 *
 * Null when the instance stays as it is (the old copy lasts longer, or the
 * duration is permanent).
 */
export function refreshCounter(input: {
  existing: { remaining: number | null; anchorRollSeq: number | null; countFromRollSeq: number | null };
  incoming: { remaining: number | null; anchorRollSeq: number };
}): { remaining: number; countFromRollSeq: number } | null {
  const { existing, incoming } = input;
  if (existing.remaining === null || incoming.remaining === null) return null;
  if (existing.remaining > incoming.remaining) return null;
  const counted = countingFrom(existing.anchorRollSeq, existing.countFromRollSeq);
  return {
    remaining: incoming.remaining,
    countFromRollSeq: Math.max(incoming.anchorRollSeq, counted ?? incoming.anchorRollSeq),
  };
}
