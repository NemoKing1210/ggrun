/**
 * The reaction window, apart from the database (docs/IEE_CONSTRUCTOR_SPEC.md
 * §6.15, §7.4): what a throw offers its holder, the draws the window keeps and
 * replays, and what its decision holds. The game's turn and the simulations
 * share it, so a scenario's window opens where a season's does.
 */
import {
  NO_DICE_RULES,
  chooseReaction,
  reactionActs,
  type DiceRules,
  type IeePlayerSnapshot,
  type ReactionRules,
  type ReactionView,
} from "@/lib/engine";
import type { IeeInstanceRow } from "@/db/schema";

import { factsOfRows, standingFor } from "../executor";
import type { SeasonRegistry } from "../registry";

/** A reaction item the throw offers its holder, and what it would do (§6.15). */
export interface ReactionOffer {
  instanceId: string;
  entryId: string;
  revisionId: string;
  key: string;
  rules: ReactionRules;
}

/** Whether any of the rows is a reaction item — without one, no window can open. */
export function holdsReactionItem(registry: SeasonRegistry, rows: readonly IeeInstanceRow[]): boolean {
  return rows.some((row) => row.kind === "item" && row.status === "active" && registry.item(row.revisionId)?.usage.window === "after_dice");
}

/**
 * Whether the holder may use a reaction item now (§7.4): not while kept from
 * their items, nor while a victim choice of theirs waits.
 */
export function mayReact(input: {
  registry: SeasonRegistry;
  rows: readonly IeeInstanceRow[];
  self: IeePlayerSnapshot;
  victimChoicePending: boolean;
  rng: () => number;
}): boolean {
  if (input.victimChoicePending) return false;
  return !standingFor(input.registry, input.rows, input.self, input.rng).forbidItems;
}

/**
 * What the throw offers the holder (§6.15): each reaction item they hold with
 * a charge left, oldest first, whose `onUse` rules hold on the throw and would
 * change it. The rules' draws come from `rng` — the window keeps them.
 */
export function reactionOffers(input: {
  registry: SeasonRegistry;
  rows: readonly IeeInstanceRow[];
  view: ReactionView;
  self: IeePlayerSnapshot;
  /** The roll being resolved. */
  rollSeq: number;
  rng: () => number;
}): ReactionOffer[] {
  const { registry, view } = input;
  const actorEntries = factsOfRows(registry, input.rows);
  const held = input.rows
    .filter((row) => row.kind === "item" && row.status === "active" && (row.chargesLeft === null || row.chargesLeft > 0))
    .sort((a, b) => a.grantedAt.getTime() - b.grantedAt.getTime() || a.id.localeCompare(b.id));
  const offers: ReactionOffer[] = [];
  for (const row of held) {
    const item = registry.item(row.revisionId);
    if (!item || item.usage.activation !== "active" || item.usage.window !== "after_dice" || !item.react) continue;
    const rules = item.react({
      params: (row.params ?? {}) as Record<string, string | number | boolean>,
      actor: input.self,
      turn: {
        rollSeq: input.rollSeq,
        outcome: view.outcome,
        diceResults: [...view.faces],
        diceCount: view.dice.count,
        diceSides: view.dice.sides,
      },
      actorEntries,
      rng: input.rng,
      instanceId: row.id,
    });
    if (!rules || !reactionActs(view, rules)) continue;
    offers.push({ instanceId: row.id, entryId: item.entryId, revisionId: item.revisionId, key: item.key, rules });
  }
  return offers;
}

/** A source of draws that keeps every one it hands out — what a window replays (§7.4). */
export function recorder(source: () => number): { draws: number[]; rng: () => number } {
  const draws: number[] = [];
  return {
    draws,
    rng: () => {
      const value = source();
      draws.push(value);
      return value;
    },
  };
}

/** Hands out `draws` in order, then draws afresh from `source`. */
export function replayer(draws: readonly number[], source: () => number): () => number {
  let next = 0;
  return () => (next < draws.length ? draws[next++]! : source());
}

/**
 * What a reaction window's decision holds (§4.3 `context`): the turn it
 * paused — the roll and how it was reported, the throw shown and the move it
 * makes as it stands — and every server draw made by then, the dice's and the
 * rules', with where the window stood among them.
 */
export interface ReactionContext {
  rollId: string;
  outcome: "passed" | "dropped";
  notes: string | null;
  rating: number | null;
  /** Merged into the turn's `game_passed` / `game_dropped` payload — a judge's approval. */
  feedExtra?: Record<string, unknown>;
  view: {
    faces: number[];
    throws: number[][];
    dice: { count: number; sides: number };
    /** The dice result after the result modifiers. */
    result: number;
    /** Where the player stands, and where the move would end before its cell acts. */
    from: number;
    to: number;
    /** The cell it would end on; null without a board, or when no move is made. */
    cellType: string | null;
    /** What the holder's statuses asked of the dice at `afterDice` — what a reaction's worth is judged with. */
    rules?: DiceRules;
  };
  draws: {
    dice: number[];
    hooks: number[];
    /** How many of each were drawn when the window opened: a use replays those, an accept all. */
    diceAt: number;
    hooksAt: number;
  };
  /** What the window offered, and what each would do to the throw. */
  offers: { instanceId: string; key: string; rules?: ReactionRules }[];
}

/** Only the dice rules of a hook's modifiers — what a window keeps of them. */
export function diceRulesOf(rules: DiceRules): DiceRules {
  return {
    rerollValues: [...rules.rerollValues],
    bestOfTwo: rules.bestOfTwo,
    worstOfTwo: rules.worstOfTwo,
    resultDelta: rules.resultDelta,
    resultCap: rules.resultCap,
    reverseLowerHalf: rules.reverseLowerHalf,
  };
}

/**
 * What a bot answers its window with (§7.4) — what the power of a reaction
 * item assumes a player does (§6.15): on a bad throw, the offer expected to
 * gain the most; otherwise none, and it accepts.
 */
export function botReaction(context: ReactionContext): string | null {
  const view: ReactionView = {
    outcome: context.outcome,
    dice: context.view.dice,
    faces: context.view.faces,
    throws: context.view.throws,
    rules: context.view.rules ?? NO_DICE_RULES,
  };
  const offers = context.offers.flatMap((o) => (o.rules ? [{ instanceId: o.instanceId, rules: o.rules }] : []));
  return chooseReaction(view, offers)?.instanceId ?? null;
}
