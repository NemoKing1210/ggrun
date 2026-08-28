import { describe, expect, it } from "vitest";
import { rollDice } from "./dice";

describe("rollDice", () => {
  it("returns an empty array for count 0", () => {
    expect(rollDice(0, 6, () => 0.5)).toEqual([]);
  });

  it("produces values in [1..sides]", () => {
    const low = rollDice(1, 6, () => 0);
    const high = rollDice(1, 6, () => 0.999999);
    expect(low).toEqual([1]);
    expect(high).toEqual([6]);
  });

  it("consumes rng once per die", () => {
    let calls = 0;
    rollDice(3, 6, () => {
      calls++;
      return 0.5;
    });
    expect(calls).toBe(3);
  });

  it("rejects invalid counts", () => {
    expect(() => rollDice(-1, 6, () => 0)).toThrow(RangeError);
    expect(() => rollDice(1.5, 6, () => 0)).toThrow(RangeError);
  });

  it("rejects invalid sides", () => {
    expect(() => rollDice(1, 1, () => 0)).toThrow(RangeError);
    expect(() => rollDice(1, 2.5, () => 0)).toThrow(RangeError);
  });
});
