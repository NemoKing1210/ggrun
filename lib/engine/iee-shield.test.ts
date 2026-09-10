import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./config";
import { applyCellEffect } from "./board/cell-effects";
import { applyMovementModifiers } from "./board/movement";
import { EFFECTS, runHook, shield, slowed } from "./iee";
import type { ActiveEffectLike, CellLike, IeePlayerSnapshot } from "./types";

const self: IeePlayerSnapshot = {
  seasonPlayerId: "sp-1",
  position: 10,
  balancePoints: 5,
  rollSeq: 4,
  moveCount: 4,
  rank: 1,
  status: "active",
};

const row = (over: Partial<ActiveEffectLike> = {}): ActiveEffectLike => ({
  id: "e-shield",
  effectKey: "shield",
  params: {},
  chargesLeft: 1,
  expiresAfterRollSeq: null,
  appliedAt: 1,
  ...over,
});

const turn = (over: Record<string, unknown> = {}) => ({
  rollSeq: 4,
  outcome: "passed" as const,
  ...over,
});

describe("shield — the counter-play (§8.3)", () => {
  it("is positive and rare, so a bonus cell can drop it", () => {
    expect(shield.polarity).toBe("positive");
    expect(shield.duration).toEqual({ kind: "charges", value: 1 });
  });

  it("is registered in the catalog", () => {
    expect(EFFECTS.shield).toBe(shield);
  });

  it("absorbs a penalty landing and asks for its charge", () => {
    const out = runHook({
      hook: "beforeCellEffect",
      effects: [row()],
      registry: EFFECTS,
      self,
      turn: turn({ cellType: "penalty" }),
    });
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed).toEqual(["e-shield"]);
    expect(out.reasons).toEqual(["effect:shield"]);
  });

  it.each(["bonus", "normal", "teleport", "event", "start", "finish"])(
    "does not spend itself on a %s cell",
    (cellType) => {
      const out = runHook({
        hook: "beforeCellEffect",
        effects: [row()],
        registry: EFFECTS,
        self,
        turn: turn({ cellType }),
      });
      expect(out.skipCellEffect).toBe(false);
      expect(out.consumed).toEqual([]);
    },
  );

  it("a spent shield no longer speaks", () => {
    const out = runHook({
      hook: "beforeCellEffect",
      effects: [row({ chargesLeft: 0 })],
      registry: EFFECTS,
      self,
      turn: turn({ cellType: "penalty" }),
    });
    expect(out.skipCellEffect).toBe(false);
  });

  // This used to assert the opposite — that both charges are spent on one hit —
  // and it was a description of what the reducer happened to do, not a decision
  // anyone made. Two shields are two absorbed hits: that is what the entry
  // promises and what a player counting their protection expects. The second
  // shield's veto changed nothing, so it costs nothing.
  it("two shields absorb one hit apiece — only the first is spent", () => {
    const out = runHook({
      hook: "beforeCellEffect",
      effects: [row({ id: "a", appliedAt: 1 }), row({ id: "b", appliedAt: 2 })],
      registry: EFFECTS,
      self,
      turn: turn({ cellType: "penalty" }),
    });
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed, "the older shield takes the hit").toEqual(["a"]);
  });

  it("and the survivor absorbs the next one", () => {
    const out = runHook({
      hook: "beforeCellEffect",
      effects: [row({ id: "b", appliedAt: 2 })],
      registry: EFFECTS,
      self,
      turn: turn({ cellType: "penalty" }),
    });
    expect(out.skipCellEffect).toBe(true);
    expect(out.consumed).toEqual(["b"]);
  });

  it("stacks rather than refreshing — two drops are two shields", () => {
    expect(shield.stacking).toBe("stack");
  });

  it("runs before a reactive effect, by priority", () => {
    expect(shield.priority).toBeLessThan(slowed.priority);
  });
});

/**
 * What the loop does with the patch: the veto has to actually prevent the
 * penalty, and the same landing must still move the player normally.
 */
describe("shield in the turn loop", () => {
  const penalty: CellLike = { position: 12, cellType: "penalty", config: { amount: 3 } };

  it("without a shield the penalty is applied", () => {
    const effect = applyCellEffect(penalty, 12, 5);
    expect(effect.balancePoints).toBe(2);
    expect(effect.ledgerDelta).toBe(-3);
  });

  it("with a shield the loop skips applyCellEffect entirely", () => {
    const out = runHook({
      hook: "beforeCellEffect",
      effects: [row()],
      registry: EFFECTS,
      self,
      turn: turn({ cellType: "penalty" }),
    });
    // The loop's branch: balance and ledger stay exactly where they were.
    const balance = out.skipCellEffect ? 5 : applyCellEffect(penalty, 12, 5).balancePoints;
    const ledger = out.skipCellEffect ? 0 : applyCellEffect(penalty, 12, 5).ledgerDelta;
    expect(balance).toBe(5);
    expect(ledger).toBe(0);
  });

  it("slowed still shortens the move on the same turn", () => {
    const mods = runHook({
      hook: "afterMovement",
      effects: [{ ...row({ id: "s", effectKey: "slowed", params: { steps: 1 } }) }],
      registry: EFFECTS,
      self,
      turn: turn(),
    });
    const moved = applyMovementModifiers(
      {
        diceResults: [4],
        newPosition: 14,
        newBalancePoints: 5,
        newStreakPass: 1,
        newStreakDrop: 0,
      },
      mods,
      DEFAULT_SEASON_CONFIG.board,
      10,
    );
    expect(moved.newPosition).toBe(13);
  });

  it("a shield and a slow coexist: one shortens, the other absorbs", () => {
    const effects = [
      row({ id: "sh" }),
      row({ id: "sl", effectKey: "slowed", params: { steps: 1 }, chargesLeft: null }),
    ];
    const move = runHook({ hook: "afterMovement", effects, registry: EFFECTS, self, turn: turn() });
    const cell = runHook({
      hook: "beforeCellEffect",
      effects,
      registry: EFFECTS,
      self,
      turn: turn({ cellType: "penalty" }),
    });
    expect(move.stepsDelta).toBe(-1);
    expect(cell.skipCellEffect).toBe(true);
    // Only the shield asked for a charge; the slow ticks on its own clock.
    expect(cell.consumed).toEqual(["sh"]);
  });
});
