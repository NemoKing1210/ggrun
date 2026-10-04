import { describe, expect, it } from "vitest";
import { int, nullableInt } from "./helpers";

describe("int", () => {
  it("accepts an integer at or above the floor", () => {
    expect(int(0).parse(0)).toBe(0);
    expect(int(0).parse(7)).toBe(7);
    expect(int(2).parse(2)).toBe(2);
  });

  it("rejects anything below the floor, fractional, or non-numeric", () => {
    expect(() => int(0).parse(-1)).toThrow();
    expect(() => int(2).parse(1)).toThrow();
    expect(() => int(0).parse(1.5)).toThrow();
    expect(() => int(0).parse("3")).toThrow();
  });
});

describe("nullableInt", () => {
  it("defaults a missing value to null", () => {
    expect(nullableInt(0).parse(undefined)).toBeNull();
    expect(nullableInt(5).parse(undefined)).toBeNull();
  });

  it("keeps an explicit null and an in-range integer", () => {
    expect(nullableInt(0).parse(null)).toBeNull();
    expect(nullableInt(0).parse(0)).toBe(0);
    expect(nullableInt(1970).parse(2026)).toBe(2026);
  });

  it("rejects a fractional or below-floor value", () => {
    expect(() => nullableInt(0).parse(-1)).toThrow();
    expect(() => nullableInt(1970).parse(1969)).toThrow();
    expect(() => nullableInt(0).parse(2.5)).toThrow();
  });
});
