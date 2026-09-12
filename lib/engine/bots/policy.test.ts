import { describe, expect, it } from "vitest";

import { nextBotStepKind, pickBotOutcome } from "./policy";

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("pickBotOutcome", () => {
  it("draws proportionally to weights", () => {
    const weights = { passed: 70, dropped: 20, rerolled: 10 };
    expect(pickBotOutcome(weights, seq([0]))).toBe("passed");
    expect(pickBotOutcome(weights, seq([0.699]))).toBe("passed");
    expect(pickBotOutcome(weights, seq([0.7]))).toBe("dropped");
    expect(pickBotOutcome(weights, seq([0.899]))).toBe("dropped");
    expect(pickBotOutcome(weights, seq([0.9]))).toBe("rerolled");
  });

  it("falls back to passed when every weight is zero", () => {
    expect(
      pickBotOutcome({ passed: 0, dropped: 0, rerolled: 0 }, seq([0.5])),
    ).toBe("passed");
  });

  it("ignores negative weights", () => {
    expect(
      pickBotOutcome({ passed: -5, dropped: 10, rerolled: 0 }, seq([0.5])),
    ).toBe("dropped");
  });
});

describe("nextBotStepKind", () => {
  it("resolves an open roll and rolls when idle", () => {
    expect(nextBotStepKind(true, { enableRoll: true, enableResolve: true })).toBe("resolve");
    expect(nextBotStepKind(false, { enableRoll: true, enableResolve: true })).toBe("roll");
  });

  it("returns null when the needed endpoint is switched off", () => {
    expect(nextBotStepKind(true, { enableRoll: true, enableResolve: false })).toBeNull();
    expect(nextBotStepKind(false, { enableRoll: false, enableResolve: true })).toBeNull();
    expect(nextBotStepKind(false, { enableRoll: false, enableResolve: false })).toBeNull();
  });
});
