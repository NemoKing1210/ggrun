import { describe, expect, it } from "vitest";
import { isEventOverdue, parseEventReward, pickEventKey } from "./iee";

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe("pickEventKey", () => {
  it("returns null for an empty pool", () => {
    expect(pickEventKey([], [], () => 0)).toBeNull();
  });

  it("returns null once the player has everything in the pool", () => {
    expect(pickEventKey(["a", "b"], ["a", "b"], () => 0)).toBeNull();
  });

  it("never repeats what the player already has (§12 F6)", () => {
    for (let i = 0; i < 50; i++) {
      const key = pickEventKey(["a", "b", "c"], ["a", "c"], () => i / 50);
      expect(key).toBe("b");
    }
  });

  it("picks by the injected rng", () => {
    expect(pickEventKey(["a", "b", "c"], [], seq(0))).toBe("a");
    expect(pickEventKey(["a", "b", "c"], [], seq(0.5))).toBe("b");
    expect(pickEventKey(["a", "b", "c"], [], seq(0.99))).toBe("c");
  });

  it("survives an rng that returns exactly 1", () => {
    expect(pickEventKey(["a", "b"], [], () => 1)).toBe("b");
  });

  it("spreads across the pool over many draws", () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      const key = pickEventKey(["a", "b", "c"], [], () => (i % 3000) / 3000);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    expect(counts.a).toBeGreaterThan(800);
    expect(counts.b).toBeGreaterThan(800);
    expect(counts.c).toBeGreaterThan(800);
  });
});

describe("parseEventReward", () => {
  it("reads a full reward", () => {
    expect(parseEventReward({ points: 2, itemKey: "hex_scroll", effectKey: "shield" })).toEqual({
      points: 2,
      itemKey: "hex_scroll",
      effectKey: "shield",
    });
  });

  it("treats anything malformed as no reward", () => {
    for (const raw of [null, undefined, 42, "x", [], { points: "2" }, { points: -1 }, { points: 0 }]) {
      expect(parseEventReward(raw)).toEqual({});
    }
  });

  it("truncates a fractional point value", () => {
    expect(parseEventReward({ points: 2.9 })).toEqual({ points: 2 });
  });

  it("drops empty keys", () => {
    expect(parseEventReward({ itemKey: "", effectKey: "" })).toEqual({});
  });
});

describe("isEventOverdue", () => {
  const now = new Date("2026-09-08T12:00:00Z");

  it("is overdue only when assigned and past the deadline", () => {
    expect(isEventOverdue("assigned", new Date("2026-09-08T11:00:00Z"), now)).toBe(true);
    expect(isEventOverdue("assigned", new Date("2026-09-08T13:00:00Z"), now)).toBe(false);
  });

  it("never expires a submission already waiting on a judge", () => {
    expect(isEventOverdue("submitted", new Date("2026-01-01T00:00:00Z"), now)).toBe(false);
  });

  it.each(["approved", "rejected", "expired"])("leaves a %s row alone", (status) => {
    expect(isEventOverdue(status, new Date("2026-01-01T00:00:00Z"), now)).toBe(false);
  });

  it("a deadline-less challenge never expires", () => {
    expect(isEventOverdue("assigned", null, now)).toBe(false);
  });
});
