import { describe, expect, it } from "vitest";
import { DEFAULT_SEASON_CONFIG } from "./config";
import {
  canReroll,
  INITIAL_ROLL_STATUS,
  nextRollStatus,
  requestReroll,
} from "./roll/state-machine";
import type { SeasonConfig } from "./types";

const configWith = (rerolls: SeasonConfig["rerolls"]): SeasonConfig => ({
  ...DEFAULT_SEASON_CONFIG,
  rerolls: { ...DEFAULT_SEASON_CONFIG.rerolls, ...rerolls } as SeasonConfig["rerolls"],
});

describe("nextRollStatus", () => {
  it("advances in_progress to each terminal outcome", () => {
    expect(nextRollStatus("in_progress", "passed")).toBe("passed");
    expect(nextRollStatus("in_progress", "dropped")).toBe("dropped");
    expect(nextRollStatus("in_progress", "rerolled")).toBe("rerolled");
  });

  it("rejects outcomes before the game is in progress", () => {
    expect(() => nextRollStatus(INITIAL_ROLL_STATUS, "passed")).toThrow(RangeError);
  });

  it("rejects transitions out of terminal statuses", () => {
    for (const status of ["passed", "dropped", "rerolled"] as const) {
      expect(() => nextRollStatus(status, "passed")).toThrow(RangeError);
      expect(() => nextRollStatus(status, "dropped")).toThrow(RangeError);
      expect(() => nextRollStatus(status, "rerolled")).toThrow(RangeError);
    }
  });
});

describe("canReroll", () => {
  const enabled = configWith({ allowed: true, limitPerGame: 2, requireApproval: true });

  it("allows rerolls under the per-game limit", () => {
    expect(canReroll(0, enabled)).toBe(true);
    expect(canReroll(1, enabled)).toBe(true);
  });

  it("blocks once the limit is reached", () => {
    expect(canReroll(2, enabled)).toBe(false);
    expect(canReroll(5, enabled)).toBe(false);
  });

  it("blocks when rerolls are disabled regardless of the counter", () => {
    const disabled = configWith({ allowed: false, limitPerGame: 3, requireApproval: true });
    expect(canReroll(0, disabled)).toBe(false);
  });

  it("blocks immediately with a zero limit", () => {
    expect(canReroll(0, configWith({ allowed: true, limitPerGame: 0, requireApproval: true }))).toBe(false);
  });
});

describe("requestReroll", () => {
  const enabled = DEFAULT_SEASON_CONFIG.rerolls;

  it("returns a fresh rolled status and an incremented counter when allowed", () => {
    expect(requestReroll("in_progress", 0, { ...DEFAULT_SEASON_CONFIG })).toEqual({
      allowed: true,
      nextStatus: INITIAL_ROLL_STATUS,
      rerollsUsed: 1,
    });
  });

  it("reports rerolls-disabled", () => {
    expect(
      requestReroll("in_progress", 0, {
        ...DEFAULT_SEASON_CONFIG,
        rerolls: { allowed: false, limitPerGame: enabled.limitPerGame, requireApproval: true },
      }),
    ).toEqual({
      allowed: false,
      nextStatus: "in_progress",
      rerollsUsed: 0,
      reason: "rerolls-disabled",
    });
  });

  it("reports limit-reached", () => {
    expect(requestReroll("in_progress", 1, { ...DEFAULT_SEASON_CONFIG })).toEqual({
      allowed: false,
      nextStatus: "in_progress",
      rerollsUsed: 1,
      reason: "limit-reached",
    });
  });

  it("reports invalid-status for finished rolls", () => {
    expect(requestReroll("passed", 0, { ...DEFAULT_SEASON_CONFIG })).toEqual({
      allowed: false,
      nextStatus: "passed",
      rerollsUsed: 0,
      reason: "invalid-status",
    });
  });
});
