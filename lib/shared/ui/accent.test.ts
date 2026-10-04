import { describe, expect, it } from "vitest";

import { ACCENT_KEYS, ACCENTS, DEFAULT_ACCENT, getAccent, isAccentKey } from "./accent";

describe("ACCENTS", () => {
  it("every accent record has the full, non-empty shape", () => {
    for (const key of ACCENT_KEYS) {
      const accent = ACCENTS[key];
      expect(accent.label.length).toBeGreaterThan(0);
      expect(accent.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(accent.border).toMatch(/^#[0-9a-f]{6}$/i);
      expect(accent.swatch).toMatch(/^#[0-9a-f]{6}$/i);
      expect(accent.glow).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
    }
  });

  it("keeps swatch equal to primary for every accent", () => {
    for (const key of ACCENT_KEYS) {
      expect(ACCENTS[key].swatch).toBe(ACCENTS[key].primary);
    }
  });
});

describe("ACCENT_KEYS", () => {
  it("is exactly the set of record keys", () => {
    expect([...ACCENT_KEYS].sort()).toEqual(Object.keys(ACCENTS).sort());
  });

  it("contains the default accent", () => {
    expect(ACCENT_KEYS).toContain(DEFAULT_ACCENT);
  });
});

describe("isAccentKey", () => {
  it("accepts a known accent key", () => {
    expect(isAccentKey("amber")).toBe(true);
    expect(isAccentKey("steel")).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isAccentKey("unknown")).toBe(false);
    expect(isAccentKey("")).toBe(false);
    expect(isAccentKey(null)).toBe(false);
    expect(isAccentKey(123)).toBe(false);
  });

  it("rejects Object.prototype members that an `in` check would leak", () => {
    expect(isAccentKey("constructor")).toBe(false);
    expect(isAccentKey("toString")).toBe(false);
    expect(isAccentKey("hasOwnProperty")).toBe(false);
  });
});

describe("getAccent", () => {
  it("returns the matching accent record by reference", () => {
    expect(getAccent("cyan")).toBe(ACCENTS.cyan);
  });

  it("falls back to the default accent for unknown or invalid input", () => {
    expect(getAccent("nope")).toBe(ACCENTS[DEFAULT_ACCENT]);
    expect(getAccent(null)).toBe(ACCENTS[DEFAULT_ACCENT]);
    expect(getAccent(undefined)).toBe(ACCENTS[DEFAULT_ACCENT]);
  });
});
