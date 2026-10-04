import { describe, expect, it } from "vitest";
import { isEventOverdue, parseEventReward, pickEventKey } from "./events";

describe("pickEventKey", () => {
  it("returns null for an empty pool", () => {
    expect(pickEventKey([], [], () => 0)).toBeNull();
  });

  it("returns null once the player has everything on offer", () => {
    expect(pickEventKey(["a", "b"], ["a", "b"], () => 0)).toBeNull();
  });

  it("never hands out a template the player already has (§12 F6)", () => {
    expect(pickEventKey(["a", "b", "c"], ["a", "c"], () => 0.99)).toBe("b");
  });

  it("ignores assignments that name templates no longer in the pool", () => {
    expect(pickEventKey(["a", "b"], ["zzz"], () => 0)).toBe("a");
  });

  it("maps rng to the available list and clamps an rng of exactly 1", () => {
    expect(pickEventKey(["a", "b", "c"], [], () => 0)).toBe("a");
    expect(pickEventKey(["a", "b", "c"], [], () => 0.5)).toBe("b");
    expect(pickEventKey(["a", "b", "c"], [], () => 1)).toBe("c");
    expect(pickEventKey(["only"], [], () => 1)).toBe("only");
  });

  it("only ever returns a key from the pool", () => {
    for (let i = 0; i < 40; i++) {
      const key = pickEventKey(["a", "b"], [], () => i / 40);
      expect(["a", "b"]).toContain(key);
    }
  });
});

describe("parseEventReward", () => {
  it("reads a complete, well-formed reward", () => {
    expect(parseEventReward({ points: 3, itemKey: "hex_scroll", effectKey: "shield" })).toEqual({
      points: 3,
      itemKey: "hex_scroll",
      effectKey: "shield",
    });
  });

  it("treats anything that is not an object as no reward", () => {
    for (const raw of [null, undefined, 42, "x", true, []]) {
      expect(parseEventReward(raw)).toEqual({});
    }
  });

  it("drops a non-positive, fractional-rounded, or non-finite point value", () => {
    expect(parseEventReward({ points: 2.9 })).toEqual({ points: 2 });
    expect(parseEventReward({ points: 0 })).toEqual({});
    expect(parseEventReward({ points: -3 })).toEqual({});
    expect(parseEventReward({ points: Infinity })).toEqual({});
    expect(parseEventReward({ points: NaN })).toEqual({});
    expect(parseEventReward({ points: "2" })).toEqual({});
  });

  it("keeps only non-empty string keys and drops everything else", () => {
    expect(parseEventReward({ itemKey: "", effectKey: "  " })).toEqual({ effectKey: "  " });
    expect(parseEventReward({ itemKey: 7, effectKey: true })).toEqual({});
  });

  it("ignores unknown fields", () => {
    expect(parseEventReward({ points: 1, extra: "ignored" })).toEqual({ points: 1 });
  });
});

describe("isEventOverdue", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("is overdue when an assigned task is past its deadline", () => {
    expect(isEventOverdue("assigned", new Date("2026-09-08T11:59:59Z"), now)).toBe(true);
  });

  it("is not overdue at the deadline itself", () => {
    expect(isEventOverdue("assigned", new Date(now.getTime()), now)).toBe(false);
  });

  it("never expires a task that is not merely assigned", () => {
    for (const status of ["submitted", "approved", "rejected", "expired"]) {
      expect(isEventOverdue(status, new Date("2000-01-01T00:00:00Z"), now)).toBe(false);
    }
  });

  it("never expires a task with no deadline", () => {
    expect(isEventOverdue("assigned", null, now)).toBe(false);
  });
});
