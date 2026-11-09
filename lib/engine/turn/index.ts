/**
 * One resolved turn's arithmetic: the dice, the move, the landing cell and the
 * points they move, with the holder's statuses consulted at every hook
 * (docs/IEE_CONSTRUCTOR_SPEC.md §7.1).
 *
 * Pure. The caller loads the holder's statuses once, passes their dispatch in
 * as `hooks`, and writes what comes back. The game's turn
 * (`applyResolvedTurn`) and the simulations — entry scenarios and the sandbox
 * (spec §5.5, §10.5) — all play their turns through this function, so what a
 * scenario proves is the turn players get, not a copy of it.
 */
import { applyCellEffect } from "../board/cell-effects";
import {
  applyMovementModifiers,
  diceResult,
  finishThrow,
  modifiedDice,
  normalizePosition,
  resolveMovement,
} from "../board/movement";
import { rollDice } from "../dice";
import type { ObjectAnswer } from "../iee/dsl/runtime";
import type { TurnHook } from "../iee/resolve/live";
import { applyReaction, withReaction, type ReactionRules, type ReactionView } from "./reaction";

export * from "./reaction";
import type { CellLike, HookTurnContext, IeeModifiers, Polarity, SeasonConfig } from "../types";

/** A board cell as the turn reads it. */
export type TurnCell = Pick<CellLike, "position" | "cellType" | "config">;

/** A board object as the turn's walk meets it (wave D, spec §6.18, §7.7). */
export interface TurnObject {
  instanceId: string;
  /** What it does to the mover — its rules at `onObjectEntered` — asked as the walk enters its cell. */
  enter: (turn: HookTurnContext) => ObjectAnswer;
}

/** An object that acted on the turn's move, in the order the walk met them. */
export interface FiredObject {
  instanceId: string;
  position: number;
  answer: ObjectAnswer;
}

export interface PlayTurnInput {
  /** Where the holder stands and what they hold before the turn. */
  position: number;
  balancePoints: number;
  streakPass: number;
  streakDrop: number;
  config: SeasonConfig;
  /** What every hook reads: the roll being resolved and how it went. */
  turn: { rollSeq: number; outcome: "passed" | "dropped" };
  /** The cell at a position; null where there is none (a season without a board). */
  cellAt: (position: number) => TurnCell | null;
  /** The holder's statuses at one hook — loaded once, queried per hook. */
  hooks: (hook: TurnHook, turn: HookTurnContext) => IeeModifiers;
  /**
   * The dice's randomness, server-side only. It is asked for once the dice are
   * composed, so a simulation can choose the faces.
   */
  diceRng: (dice: { count: number; sides: number }) => () => number;
  /**
   * The reaction window (wave B, spec §7.4): asked once, after step 3, with
   * the throw — what it answers acts at step 4. None, or null: the turn plays
   * straight through.
   */
  react?: (view: ReactionView) => ReactionRules | null;
  /**
   * The board object standing on a cell, if any (wave D, spec §7.7): the move
   * walks to where it ends and the objects on its way act. None: no objects.
   */
  objectAt?: (position: number) => TurnObject | null;
}

export interface LedgerLine {
  delta: number;
  reason: string;
}

export interface PlayedTurn {
  /** The dice thrown, after `beforeMovement`. */
  dice: { count: number; sides: number };
  /** The faces that counted (spec §7.2, after the rerolls and a best- or worst-of-two). */
  diceResults: number[];
  /** Every throw in order, each after its rerolls: one, or two for a best- or worst-of-two, then a reaction's. */
  throws: number[][];
  /**
   * What a reaction did at step 4 (wave B, §7.4): the faces it was used on,
   * the throws it made, the faces that counted, and the dice result before and
   * after it; null for none.
   */
  reaction: { before: number[]; thrown: number[][]; after: number[]; result: { before: number; after: number } } | null;
  /** The dice result after the result modifiers — what the move is made of. */
  result: number;
  /** A direction rule's verdict; null when the outcome decided the direction. */
  direction: "back" | "forward" | null;
  /**
   * Where the move leaves the token before the landing cell acts — its dice and
   * step modifiers, then the objects on its way (wave D): a stop, a push, a
   * longer move.
   */
  movedTo: number;
  /** The objects that acted on the move, in the order the walk met them (wave D, spec §7.7). */
  objects: FiredObject[];
  /** `noMove`: the token stays, so no cell fires and no wheel spins. */
  moveCancelled: boolean;
  /** The cell the move ended on; null when it was cancelled or there is no board. */
  landed: TurnCell | null;
  /** A status vetoed the landing cell (`skipCellEffect`). */
  cellAbsorbed: boolean;
  /** Where the turn leaves the token — a teleport cell may move it again. */
  finalPosition: number;
  /** Points after the move, its cell and `afterCellEffect`: the move's own ledger line. */
  moveBalance: number;
  moveLedger: LedgerLine | null;
  /** `onOutcome`, then `onTick` — each moves points on a ledger line of its own. */
  later: (LedgerLine & { hook: "onOutcome" | "onTick"; balance: number })[];
  /** Points when the turn is over. */
  finalBalance: number;
  newStreakPass: number;
  newStreakDrop: number;
  /** The wheel this landing spins; null when it spins none or a status absorbed it. */
  wheel: Polarity | null;
  /**
   * The wheels spun once more this turn, after the landing's own (wave B,
   * `extraSpin`, spec §6.12): asked for at `afterCellEffect` and `onOutcome`, in order.
   */
  extraWheels: Polarity[];
  /** The token ends on the finish cell. */
  reachedFinish: boolean;
}

/** Cell types that spin a wheel, and the pool each draws from. */
export function polarityForCell(cellType: string | null): Polarity | null {
  if (cellType === "bonus") return "positive";
  if (cellType === "penalty") return "negative";
  return null;
}

export function playTurn(input: PlayTurnInput): PlayedTurn {
  const { config, turn } = input;

  // The dice pipeline (spec §7.2). 1 — composition: the season's dice and
  // what `beforeMovement` makes of them.
  const beforeMove = input.hooks("beforeMovement", turn);
  const dice = modifiedDice(config.dice, turn.outcome, beforeMove);
  const rng = input.diceRng(dice);
  // 2 — the throw, server randomness only.
  const first = rollDice(dice.count, dice.sides, rng);
  // 3 and 5 — what the statuses make of the throw: faces thrown again, a
  // second throw, the result's additions and cap, its sign.
  const afterDice = input.hooks("afterDice", {
    ...turn,
    diceResults: first,
    diceCount: dice.count,
    diceSides: dice.sides,
  });
  const shown = finishThrow(first, dice, turn.outcome, rng, afterDice);
  // 4 — the reaction window (wave B): the holder may act on the throw they see.
  const view: ReactionView = { outcome: turn.outcome, dice, faces: shown.faces, throws: shown.throws, rules: afterDice };
  const reaction = input.react?.(view) ?? null;
  const thrown = reaction ? applyReaction(view, reaction, rng) : shown;
  const result = diceResult(thrown.faces, dice.sides, reaction ? withReaction(afterDice, reaction) : afterDice);
  // 6 — the move the result makes, before the step modifiers.
  const raw = resolveMovement({
    currentPosition: input.position,
    balancePoints: input.balancePoints,
    outcome: turn.outcome,
    streakPass: input.streakPass,
    streakDrop: input.streakDrop,
    config,
    rng,
    modifiers: beforeMove,
    dice: { faces: thrown.faces, result: result.result, direction: result.direction },
  });

  const afterMove = input.hooks("afterMovement", {
    ...turn,
    diceResults: raw.diceResults,
    diceCount: dice.count,
    diceSides: dice.sides,
    fromPosition: input.position,
    toPosition: raw.newPosition,
    balancePoints: raw.newBalancePoints,
  });
  const moved = applyMovementModifiers(raw, afterMove, config.board, input.position);
  const moveCancelled = afterMove.cancelMove;

  // 7 — the path (wave D, spec §7.7): the move walks to where it ends, and the
  // objects on its way act — a stop ends it there without a landing.
  const back = result.direction === null ? turn.outcome === "dropped" : result.direction === "back";
  const walk = walkPath({
    from: input.position,
    to: moved.newPosition,
    back,
    board: config.board,
    cancelled: moveCancelled,
    objectAt: input.objectAt,
    turn: {
      ...turn,
      diceResults: moved.diceResults,
      diceCount: dice.count,
      diceSides: dice.sides,
      fromPosition: input.position,
      toPosition: moved.newPosition,
      balancePoints: moved.newBalancePoints,
    },
  });

  // A push is no walk: it moves the mover from the object's cell, back no further than the start (§6.18).
  let finalPosition = walk.stoppedAt === null ? walk.end : normalizePosition(Math.max(0, walk.stoppedAt + walk.push), config.board);
  const movedTo = finalPosition;
  let balance = moved.newBalancePoints;
  let ledgerDelta = 0;
  let ledgerReason: string | undefined;
  let cellAbsorbed = false;
  const extraWheels: Polarity[] = [];

  // A cell fires only at the end of a move: a cancelled one lands nowhere, nor does one an object stopped.
  const landed = moveCancelled || walk.stoppedAt !== null ? null : input.cellAt(finalPosition);
  if (landed) {
    const cellTurn: HookTurnContext = {
      ...turn,
      diceResults: moved.diceResults,
      diceCount: dice.count,
      diceSides: dice.sides,
      fromPosition: input.position,
      toPosition: finalPosition,
      balancePoints: balance,
      cellType: landed.cellType,
      cellConfig: landed.config,
    };

    // A ward absorbs the landing here, before it is ever applied.
    const beforeCell = input.hooks("beforeCellEffect", cellTurn);
    if (!beforeCell.skipCellEffect) {
      const effect = applyCellEffect(landed, finalPosition, balance);
      finalPosition = normalizePosition(effect.position, config.board);
      balance = effect.balancePoints;
      ledgerDelta += effect.ledgerDelta;
      if (effect.reason) ledgerReason = effect.reason;
    } else {
      cellAbsorbed = true;
    }

    const afterCell = input.hooks("afterCellEffect", { ...cellTurn, toPosition: finalPosition });
    extraWheels.push(...afterCell.extraSpins);
    if (afterCell.balanceDelta !== 0) {
      // The ledger gets the difference that actually happened, never the one
      // that was asked for: `toll` on a player with nothing left takes nothing.
      const adjusted = Math.max(0, balance + afterCell.balanceDelta);
      ledgerDelta += adjusted - balance;
      balance = adjusted;
      ledgerReason = ledgerReason ?? "iee_effect";
    }
  }
  const moveBalance = balance;
  const moveLedger = ledgerDelta !== 0 && ledgerReason ? { delta: ledgerDelta, reason: ledgerReason } : null;

  // `onOutcome` and `onTick` can move points too — an effect that pays out on
  // a pass. Same rule as the cell: the ledger records what moved.
  const later: PlayedTurn["later"] = [];
  for (const hook of ["onOutcome", "onTick"] as const) {
    const mods = input.hooks(
      hook,
      hook === "onOutcome" ? { ...turn, toPosition: finalPosition, cellType: landed?.cellType } : turn,
    );
    if (hook === "onOutcome") extraWheels.push(...mods.extraSpins);
    if (mods.balanceDelta === 0) continue;
    const adjusted = Math.max(0, balance + mods.balanceDelta);
    later.push({ hook, delta: adjusted - balance, reason: mods.reasons[0] ?? "iee_effect", balance: adjusted });
    balance = adjusted;
  }

  return {
    dice,
    diceResults: moved.diceResults,
    throws: thrown.throws,
    reaction: reaction
      ? {
          before: [...shown.faces],
          thrown: thrown.throws.slice(shown.throws.length).map((t) => [...t]),
          after: [...thrown.faces],
          result: { before: diceResult(shown.faces, dice.sides, afterDice).result, after: result.result },
        }
      : null,
    result: result.result,
    direction: result.direction,
    movedTo,
    objects: walk.fired,
    moveCancelled,
    landed,
    cellAbsorbed,
    finalPosition,
    moveBalance,
    moveLedger,
    later,
    finalBalance: balance,
    newStreakPass: moved.newStreakPass,
    newStreakDrop: moved.newStreakDrop,
    // An object that stopped the move may spin a wheel in place of the cell (wave D).
    wheel: walk.stoppedAt !== null ? walk.spin : cellAbsorbed ? null : polarityForCell(landed?.cellType ?? null),
    extraWheels,
    reachedFinish: input.cellAt(finalPosition)?.cellType === "finish",
  };
}

/**
 * The move's walk (wave D, spec §7.7): from where the turn started to where the
 * dice and the step modifiers end it, cell by cell in its direction — over a
 * looping board's seam, up to either end of one that does not loop. The first
 * time the walk enters a cell an object stands on, the object acts: a stop ends
 * the walk there (and says where it pushes the mover), a longer move adds its
 * cells to what is left. A cancelled move does not walk.
 */
export function walkPath(input: {
  from: number;
  to: number;
  back: boolean;
  board: SeasonConfig["board"];
  cancelled: boolean;
  objectAt?: (position: number) => TurnObject | null;
  /** What the objects' rules read of the turn: its roll, outcome and dice. */
  turn: HookTurnContext;
}): { end: number; stoppedAt: number | null; push: number; spin: Polarity | null; fired: FiredObject[] } {
  const { from, to, back, board } = input;
  const out = { end: to, stoppedAt: null as number | null, push: 0, spin: null as Polarity | null, fired: [] as FiredObject[] };
  if (input.cancelled || !input.objectAt || from === to) return out;
  const size = board.size;
  let remaining = board.loop ? (back ? from - to : to - from) : Math.abs(to - from);
  if (board.loop) remaining = ((remaining % size) + size) % size;
  const step = back ? -1 : 1;
  let at = from;
  const met = new Set<string>();
  while (remaining > 0) {
    const next = at + step;
    if (!board.loop && (next < 0 || next > size - 1)) break;
    at = board.loop ? ((next % size) + size) % size : next;
    remaining -= 1;
    const object = input.objectAt(at);
    if (!object || met.has(object.instanceId)) continue;
    met.add(object.instanceId);
    const answer = object.enter(input.turn);
    out.fired.push({ instanceId: object.instanceId, position: at, answer });
    if (answer.stop) {
      out.stoppedAt = at;
      out.push = answer.push;
      out.spin = answer.spin;
      out.end = at;
      return out;
    }
    remaining += Math.max(0, answer.extend);
  }
  out.end = at;
  return out;
}
