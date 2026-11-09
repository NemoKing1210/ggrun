import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "../config/defaults";
import { emptyModifiers } from "../iee/resolve/hooks";
import type { TurnHook } from "../iee/resolve/live";
import type { HookTurnContext, IeeModifiers, SeasonConfig } from "../types";
import type { ObjectAnswer } from "../iee/dsl/runtime";
import { playTurn, polarityForCell, walkPath, type PlayTurnInput, type TurnCell, type TurnObject } from "./index";

/** A season where points never ride on a roll, so a move is exactly its dice. */
const CONFIG: SeasonConfig = {
  ...DEFAULT_SEASON_CONFIG,
  points: { startingBalance: 0, bonusAddsToRollOnPass: false, resetBalanceAfterUse: false },
};

/** Statuses that answer each hook with the given modifiers and remember being asked. */
function statuses(answers: Partial<Record<TurnHook, Partial<IeeModifiers>>> = {}) {
  const calls: { hook: TurnHook; turn: HookTurnContext }[] = [];
  const hooks = (hook: TurnHook, turn: HookTurnContext): IeeModifiers => {
    calls.push({ hook, turn });
    return { ...emptyModifiers(), ...(answers[hook] ?? {}) };
  };
  return { hooks, calls, asked: () => calls.map((c) => c.hook) };
}

/** Every cell plain unless named. */
function board(special: Record<number, Omit<TurnCell, "position">> = {}) {
  return (position: number): TurnCell => {
    const named = special[position];
    return named ? { position, ...named } : { position, cellType: "normal", config: {} };
  };
}

/** Dice that show `face` on every die. */
const showing = (face: number) => (dice: { count: number; sides: number }) => () => (face - 0.5) / dice.sides;

function play(over: Partial<PlayTurnInput> = {}) {
  return playTurn({
    position: 10,
    balancePoints: 5,
    streakPass: 0,
    streakDrop: 0,
    config: CONFIG,
    turn: { rollSeq: 5, outcome: "passed" },
    cellAt: board(),
    hooks: statuses().hooks,
    diceRng: showing(4),
    ...over,
  });
}

describe("playTurn — a plain turn", () => {
  it("moves by the dice and lands on the cell where the move ends", () => {
    const turn = play();
    expect(turn.dice).toEqual({ count: 1, sides: 6 });
    expect(turn.diceResults).toEqual([4]);
    expect(turn.movedTo).toBe(14);
    expect(turn.finalPosition).toBe(14);
    expect(turn.landed).toEqual({ position: 14, cellType: "normal", config: {} });
    expect(turn.moveLedger).toBeNull();
    expect(turn.later).toEqual([]);
    expect(turn.finalBalance).toBe(5);
    expect(turn.wheel).toBeNull();
    expect(turn.reachedFinish).toBe(false);
  });

  it("a dropped game moves back by two dice", () => {
    const turn = play({ turn: { rollSeq: 5, outcome: "dropped" } });
    expect(turn.dice).toEqual({ count: 2, sides: 6 });
    expect(turn.movedTo).toBe(2);
    expect(turn.newStreakDrop).toBe(1);
    expect(turn.newStreakPass).toBe(0);
  });

  it("asks the statuses at every hook, in turn order", () => {
    const s = statuses();
    play({ hooks: s.hooks });
    expect(s.asked()).toEqual([
      "beforeMovement",
      "afterDice",
      "afterMovement",
      "beforeCellEffect",
      "afterCellEffect",
      "onOutcome",
      "onTick",
    ]);
  });

  it("tells each hook what the turn knows by then", () => {
    const s = statuses();
    play({ hooks: s.hooks, cellAt: board({ 14: { cellType: "event", config: { x: 1 } } }) });
    const at = (hook: TurnHook) => s.calls.find((c) => c.hook === hook)!.turn;
    expect(at("beforeMovement")).toEqual({ rollSeq: 5, outcome: "passed" });
    expect(at("afterMovement")).toMatchObject({ diceResults: [4], fromPosition: 10, toPosition: 14, balancePoints: 5 });
    expect(at("beforeCellEffect")).toMatchObject({ toPosition: 14, cellType: "event", cellConfig: { x: 1 } });
    expect(at("onOutcome")).toEqual({ rollSeq: 5, outcome: "passed", toPosition: 14, cellType: "event" });
    expect(at("onTick")).toEqual({ rollSeq: 5, outcome: "passed" });
  });
});

describe("playTurn — what the statuses change", () => {
  it("composes the dice before they are thrown, and hands the composition to the dice", () => {
    const seen: { count: number; sides: number }[] = [];
    const turn = play({
      hooks: statuses({ beforeMovement: { diceSidesDelta: 2, diceCountDelta: 1 } }).hooks,
      diceRng: (dice) => {
        seen.push(dice);
        return showing(8)(dice);
      },
    });
    expect(seen).toEqual([{ count: 2, sides: 8 }]);
    expect(turn.dice).toEqual({ count: 2, sides: 8 });
    expect(turn.movedTo).toBe(26);
  });

  it("step modifiers change the move but never reverse it", () => {
    expect(play({ hooks: statuses({ afterMovement: { stepsDelta: 2 } }).hooks }).movedTo).toBe(16);
    expect(play({ hooks: statuses({ afterMovement: { stepsDelta: -9 } }).hooks }).movedTo).toBe(10);
  });

  it("a cancelled move stays put: no cell, no wheel, no cell hooks", () => {
    const s = statuses({ afterMovement: { cancelMove: true } });
    const turn = play({ hooks: s.hooks, cellAt: board({ 10: { cellType: "penalty", config: { amount: 3 } } }) });
    expect(turn.moveCancelled).toBe(true);
    expect(turn.movedTo).toBe(10);
    expect(turn.landed).toBeNull();
    expect(turn.wheel).toBeNull();
    expect(s.asked()).toEqual(["beforeMovement", "afterDice", "afterMovement", "onOutcome", "onTick"]);
  });

  it("a penalty cell takes its points and spins the penalty wheel", () => {
    const turn = play({ cellAt: board({ 14: { cellType: "penalty", config: { amount: 3 } } }) });
    expect(turn.moveLedger).toEqual({ delta: -3, reason: "penalty" });
    expect(turn.moveBalance).toBe(2);
    expect(turn.wheel).toBe("negative");
  });

  it("an absorbed landing takes nothing and spins no wheel", () => {
    const s = statuses({ beforeCellEffect: { skipCellEffect: true } });
    const turn = play({ hooks: s.hooks, cellAt: board({ 14: { cellType: "penalty", config: { amount: 3 } } }) });
    expect(turn.cellAbsorbed).toBe(true);
    expect(turn.moveLedger).toBeNull();
    expect(turn.finalBalance).toBe(5);
    expect(turn.wheel).toBeNull();
    expect(s.asked()).toContain("afterCellEffect");
  });

  it("points after the landing join the move's ledger line, as far as they go", () => {
    const toll = play({ hooks: statuses({ afterCellEffect: { balanceDelta: -1 } }).hooks });
    expect(toll.moveLedger).toEqual({ delta: -1, reason: "iee_effect" });
    expect(toll.moveBalance).toBe(4);

    const broke = play({ balancePoints: 0, hooks: statuses({ afterCellEffect: { balanceDelta: -1 } }).hooks });
    expect(broke.moveLedger).toBeNull();
    expect(broke.finalBalance).toBe(0);
  });

  it("onOutcome and onTick move points on lines of their own", () => {
    const turn = play({
      balancePoints: 1,
      hooks: statuses({
        onOutcome: { balanceDelta: 2, reasons: ["effect:momentum"] },
        onTick: { balanceDelta: -5 },
      }).hooks,
    });
    expect(turn.later).toEqual([
      { hook: "onOutcome", delta: 2, reason: "effect:momentum", balance: 3 },
      { hook: "onTick", delta: -3, reason: "iee_effect", balance: 0 },
    ]);
    expect(turn.moveBalance).toBe(1);
    expect(turn.finalBalance).toBe(0);
  });
});

describe("playTurn — wheels spun once more (wave B, spec §6.12)", () => {
  it("after the landing's own, in the order the rules asked: the end of the move, then the game's", () => {
    const turn = play({
      cellAt: board({ 14: { cellType: "bonus", config: { amount: 2 } } }),
      hooks: statuses({ afterCellEffect: { extraSpins: ["positive"] }, onOutcome: { extraSpins: ["negative"] } }).hooks,
    });
    expect(turn.wheel).toBe("positive");
    expect(turn.extraWheels).toEqual(["positive", "negative"]);
  });

  it("a cancelled move lands nowhere, but the game's own still spins one more", () => {
    const turn = play({
      hooks: statuses({ afterMovement: { cancelMove: true }, afterCellEffect: { extraSpins: ["positive"] }, onOutcome: { extraSpins: ["negative"] } }).hooks,
    });
    expect(turn.wheel).toBeNull();
    expect(turn.extraWheels).toEqual(["negative"]);
  });

  it("none unless a rule asks", () => {
    expect(play().extraWheels).toEqual([]);
  });
});

describe("playTurn — the board", () => {
  it("a teleport onto the finish finishes the run", () => {
    const turn = play({
      cellAt: board({ 14: { cellType: "teleport", config: { target: 39 } }, 39: { cellType: "finish", config: {} } }),
    });
    expect(turn.movedTo).toBe(14);
    expect(turn.finalPosition).toBe(39);
    expect(turn.reachedFinish).toBe(true);
  });

  it("a season without a board moves the token and fires nothing", () => {
    const s = statuses();
    const turn = play({ hooks: s.hooks, cellAt: () => null });
    expect(turn.finalPosition).toBe(14);
    expect(turn.landed).toBeNull();
    expect(s.asked()).toEqual(["beforeMovement", "afterDice", "afterMovement", "onOutcome", "onTick"]);
  });

  it("only bonus and penalty cells spin a wheel", () => {
    expect(polarityForCell("bonus")).toBe("positive");
    expect(polarityForCell("penalty")).toBe("negative");
    for (const cell of ["normal", "event", "teleport", "finish", null]) expect(polarityForCell(cell)).toBeNull();
  });
});

describe("playTurn — the dice pipeline (spec §7.2)", () => {
  /** Faces drawn in order — the first throw, then each reroll or second throw. */
  const drawing =
    (...faces: number[]) =>
    (dice: { count: number; sides: number }) => {
      let next = 0;
      return () => (faces[Math.min(next++, faces.length - 1)]! - 0.5) / dice.sides;
    };

  it("asks the statuses about the first throw, and moves by what is left of it", () => {
    const s = statuses({ afterDice: { rerollValues: [1] } });
    const turn = play({ hooks: s.hooks, diceRng: drawing(1, 5) });
    const at = (hook: TurnHook) => s.calls.find((c) => c.hook === hook)?.turn;
    expect(at("afterDice")).toEqual({ rollSeq: 5, outcome: "passed", diceResults: [1], diceCount: 1, diceSides: 6 });
    expect(turn.diceResults).toEqual([5]);
    expect(turn.throws).toEqual([[5]]);
    expect(turn.movedTo).toBe(15);
    expect(at("afterMovement")).toMatchObject({ diceResults: [5], diceCount: 1, diceSides: 6 });
  });

  it("a second throw is drawn after the first, and the better one counts", () => {
    const turn = play({ hooks: statuses({ afterDice: { bestOfTwo: true } }).hooks, diceRng: drawing(2, 6) });
    expect(turn.throws).toEqual([[2], [6]]);
    expect(turn.movedTo).toBe(16);
  });

  it("the result modifiers shape the move; step modifiers come after them", () => {
    const boots = play({ hooks: statuses({ afterDice: { resultDelta: -2 } }).hooks, diceRng: drawing(2) });
    expect([boots.result, boots.movedTo]).toEqual([1, 11]);
    const capped = play({
      hooks: statuses({ afterDice: { resultCap: 3 }, afterMovement: { stepsDelta: 1 } }).hooks,
      diceRng: drawing(6),
    });
    expect([capped.result, capped.movedTo]).toEqual([3, 14]);
  });

  it("a direction rule can send a passed game back", () => {
    const compass = statuses({ afterDice: { reverseLowerHalf: true } });
    const low = play({ hooks: compass.hooks, diceRng: drawing(2) });
    expect([low.direction, low.movedTo]).toEqual(["back", 8]);
    const high = play({ hooks: compass.hooks, diceRng: drawing(5) });
    expect([high.direction, high.movedTo]).toEqual(["forward", 15]);
    // A step modifier shortens the move back; it never turns it around.
    const shoes = play({ hooks: statuses({ afterDice: { reverseLowerHalf: true }, afterMovement: { stepsDelta: 5 } }).hooks, diceRng: drawing(3) });
    expect(shoes.movedTo).toBe(10);
  });
});

describe("playTurn — the reaction window, step 4 (wave B, spec §7.4)", () => {
  /** Dice that show these faces, draw by draw; the last repeats. */
  const faces = (...shown: number[]) => (dice: { count: number; sides: number }) => {
    let i = 0;
    return () => (shown[Math.min(i++, shown.length - 1)]! - 0.5) / dice.sides;
  };

  it("asks once, after the statuses' rerolls, with the throw the player sees", () => {
    const seen: unknown[] = [];
    // «Удача» rerolls a 1: the window shows the throw after it.
    const s = statuses({ afterDice: { rerollValues: [1] } });
    const turn = play({
      hooks: s.hooks,
      diceRng: faces(1, 3),
      react: (view) => {
        seen.push({ faces: [...view.faces], throws: view.throws.map((t) => [...t]), outcome: view.outcome, dice: view.dice });
        return null;
      },
    });
    expect(seen).toEqual([{ faces: [3], throws: [[3]], outcome: "passed", dice: { count: 1, sides: 6 } }]);
    expect(turn.reaction).toBeNull();
    expect(turn.diceResults).toEqual([3]);
    expect(turn.movedTo).toBe(13);
  });

  it("a throw again replaces the throw before anything reads it: the move, the hooks, the cell", () => {
    const s = statuses();
    const turn = play({ hooks: s.hooks, diceRng: faces(2, 6), react: () => ({ reroll: true, bestOfTwo: false, rerollValues: [], resultDelta: 0, resultCap: null }) });
    expect(turn.reaction).toEqual({ before: [2], thrown: [[6]], after: [6], result: { before: 2, after: 6 } });
    expect(turn.diceResults).toEqual([6]);
    expect(turn.throws).toEqual([[2], [6]]);
    expect(turn.movedTo).toBe(16);
    expect(s.calls.find((c) => c.hook === "afterMovement")?.turn.diceResults).toEqual([6]);
  });

  it("its result modifiers join the statuses' at step 5", () => {
    // «Тяжёлые ботинки»: −2; the elixir: +1 — a 4 moves 3.
    const s = statuses({ afterDice: { resultDelta: -2 } });
    const turn = play({ hooks: s.hooks, react: () => ({ reroll: false, bestOfTwo: false, rerollValues: [], resultDelta: 1, resultCap: null }) });
    // No new throw: the faces stand, the result moves.
    expect(turn.reaction).toEqual({ before: [4], thrown: [], after: [4], result: { before: 2, after: 3 } });
    expect(turn.result).toBe(3);
    expect(turn.movedTo).toBe(13);
  });

  it("the better of two keeps the first when the second is worse: both throws are told", () => {
    const turn = play({ diceRng: faces(5, 2), react: () => ({ reroll: false, bestOfTwo: true, rerollValues: [], resultDelta: 0, resultCap: null }) });
    expect(turn.reaction).toEqual({ before: [5], thrown: [[2]], after: [5], result: { before: 5, after: 5 } });
    expect(turn.throws).toEqual([[5], [2]]);
  });

  it("no answer, no reaction: the turn plays straight through", () => {
    expect(play({ react: () => null }).reaction).toBeNull();
    expect(play().reaction).toBeNull();
  });
});

describe("playTurn — objects on the way (wave D, spec §7.7)", () => {
  /** An object that answers every move the same way and remembers what it was told. */
  function object(instanceId: string, answer: Partial<ObjectAnswer> = {}) {
    const told: HookTurnContext[] = [];
    const it: TurnObject = {
      instanceId,
      enter: (turn) => {
        told.push(turn);
        return { stop: false, push: 0, extend: 0, spin: null, ...answer };
      },
    };
    return Object.assign(it, { told });
  }
  const standing = (objects: Record<number, TurnObject>) => (position: number) => objects[position] ?? null;

  it("the first object on the way stops the move there: no landing, no cell hooks, no wheel", () => {
    const mine = object("mine", { stop: true });
    const s = statuses();
    const turn = play({ hooks: s.hooks, objectAt: standing({ 12: mine, 13: object("behind", { stop: true }) }), cellAt: board({ 12: { cellType: "penalty", config: { amount: 3 } } }) });
    expect(turn.movedTo).toBe(12);
    expect(turn.finalPosition).toBe(12);
    expect(turn.landed).toBeNull();
    expect(turn.wheel).toBeNull();
    expect(turn.finalBalance).toBe(5);
    expect(turn.objects).toEqual([{ instanceId: "mine", position: 12, answer: { stop: true, push: 0, extend: 0, spin: null } }]);
    expect(s.asked()).not.toContain("beforeCellEffect");
    expect(s.asked()).not.toContain("afterCellEffect");
  });

  it("a stop pushes the mover on from the object's cell — back no further than the start", () => {
    expect(play({ objectAt: standing({ 12: object("snare", { stop: true, push: -3 }) }) }).finalPosition).toBe(9);
    expect(play({ position: 1, objectAt: standing({ 2: object("snare", { stop: true, push: -5 }) }) }).finalPosition).toBe(0);
    const pushed = play({ objectAt: standing({ 11: object("snare", { stop: true, push: 2 }) }) });
    expect(pushed.finalPosition).toBe(13);
    // A push is no walk: nothing on its way acts, and no cell fires where it ends.
    expect(pushed.landed).toBeNull();
  });

  it("a stop may spin a wheel in place of the cell", () => {
    const turn = play({ objectAt: standing({ 13: object("pit", { stop: true, spin: "negative" }) }), cellAt: board({ 13: { cellType: "bonus", config: { amount: 2 } } }) });
    expect(turn.wheel).toBe("negative");
    expect(turn.finalBalance).toBe(5);
  });

  it("an object on the cell the move ends on acts too; one on the start or past the end is not met", () => {
    const start = object("start", { stop: true });
    const past = object("past", { stop: true });
    const end = object("end", { push: 0 });
    const turn = play({ objectAt: standing({ 10: start, 14: end, 15: past }) });
    expect(turn.objects.map((o) => o.instanceId)).toEqual(["end"]);
    expect(turn.finalPosition).toBe(14);
    expect(turn.landed).toEqual({ position: 14, cellType: "normal", config: {} });
    expect(start.told).toEqual([]);
    expect(past.told).toEqual([]);
  });

  it("a longer move goes on: its cells are added, and the landing fires where it ends", () => {
    const spring = object("spring", { extend: 2 });
    const turn = play({ objectAt: standing({ 12: spring }), cellAt: board({ 16: { cellType: "bonus", config: { amount: 2 } } }) });
    expect(turn.movedTo).toBe(16);
    expect(turn.landed?.position).toBe(16);
    expect(turn.wheel).toBe("positive");
    expect(turn.objects).toEqual([{ instanceId: "spring", position: 12, answer: { stop: false, push: 0, extend: 2, spin: null } }]);
  });

  it("the objects met first act first, each once, until one stops the move", () => {
    const turn = play({ objectAt: standing({ 11: object("a", { extend: 1 }), 13: object("b"), 15: object("c", { stop: true }), 16: object("d", { stop: true }) }) });
    expect(turn.objects.map((o) => [o.instanceId, o.position])).toEqual([
      ["a", 11],
      ["b", 13],
      ["c", 15],
    ]);
    expect(turn.finalPosition).toBe(15);
  });

  it("a move back walks back through the objects", () => {
    const turn = play({ turn: { rollSeq: 5, outcome: "dropped" }, objectAt: standing({ 5: object("mine", { stop: true }), 12: object("ahead", { stop: true }) }) });
    expect(turn.movedTo).toBe(5);
    expect(turn.objects.map((o) => o.instanceId)).toEqual(["mine"]);
  });

  it("a cancelled move walks nowhere", () => {
    const mine = object("mine", { stop: true });
    const turn = play({ hooks: statuses({ afterMovement: { cancelMove: true } }).hooks, objectAt: standing({ 11: mine }) });
    expect(turn.objects).toEqual([]);
    expect(mine.told).toEqual([]);
    expect(turn.finalPosition).toBe(10);
  });

  it("tells the object what the turn knows: the roll, the outcome, the dice and the move", () => {
    const mine = object("mine", { stop: true });
    play({ objectAt: standing({ 12: mine }) });
    expect(mine.told[0]).toMatchObject({ rollSeq: 5, outcome: "passed", diceResults: [4], diceCount: 1, diceSides: 6, fromPosition: 10, toPosition: 14 });
  });
});

describe("walkPath — the move's walk (wave D, spec §7.7)", () => {
  const turn: HookTurnContext = { rollSeq: 1, outcome: "passed" };
  const loop = { ...DEFAULT_SEASON_CONFIG.board, size: 10, loop: true };
  const line = { ...DEFAULT_SEASON_CONFIG.board, size: 10, loop: false };
  const meets = (cells: number[], answer: Partial<ObjectAnswer> = {}) => {
    const met: number[] = [];
    return {
      met,
      objectAt: (position: number): TurnObject | null =>
        cells.includes(position)
          ? {
              instanceId: `o${position}`,
              enter: () => {
                met.push(position);
                return { stop: false, push: 0, extend: 0, spin: null, ...answer };
              },
            }
          : null,
    };
  };

  it("crosses a looping board's seam, both ways", () => {
    const forward = meets([9, 0, 1]);
    expect(walkPath({ from: 8, to: 1, back: false, board: loop, cancelled: false, objectAt: forward.objectAt, turn }).end).toBe(1);
    expect(forward.met).toEqual([9, 0, 1]);
    const back = meets([0, 9]);
    walkPath({ from: 1, to: 8, back: true, board: loop, cancelled: false, objectAt: back.objectAt, turn });
    expect(back.met).toEqual([0, 9]);
  });

  it("a longer move on a board that does not loop ends at its edge", () => {
    const spring = meets([8], { extend: 5 });
    expect(walkPath({ from: 7, to: 9, back: false, board: line, cancelled: false, objectAt: spring.objectAt, turn }).end).toBe(9);
  });

  it("an object is met once, however far a longer move goes", () => {
    const spring = meets([3], { extend: 20 });
    const walk = walkPath({ from: 2, to: 4, back: false, board: loop, cancelled: false, objectAt: spring.objectAt, turn });
    expect(spring.met).toEqual([3]);
    expect(walk.fired).toHaveLength(1);
    expect(walk.end).toBe(4 + 20 - 10 * 2);
  });

  it("no objects, no move or a cancelled move: the walk ends where the move does", () => {
    expect(walkPath({ from: 2, to: 5, back: false, board: line, cancelled: false, turn })).toEqual({ end: 5, stoppedAt: null, push: 0, spin: null, fired: [] });
    expect(walkPath({ from: 2, to: 2, back: false, board: line, cancelled: false, objectAt: meets([2]).objectAt, turn }).fired).toEqual([]);
    expect(walkPath({ from: 2, to: 5, back: false, board: line, cancelled: true, objectAt: meets([3]).objectAt, turn }).fired).toEqual([]);
  });
});

