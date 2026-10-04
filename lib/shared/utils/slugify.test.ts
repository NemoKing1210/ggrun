import { describe, expect, it } from "vitest";

import { slugify, transliterate } from "./slugify";

describe("transliterate", () => {
  it("maps Russian Cyrillic letters to latin", () => {
    expect(transliterate("Привет")).toBe("privet");
    expect(transliterate("Ёж")).toBe("yozh");
  });

  it("maps the Ukrainian-only glyphs", () => {
    // NB: the table maps и -> "i" and ї -> "yi", so "Київ" becomes "kiyiv",
    // not the "kyiv" shown in the module's doc comment.
    expect(transliterate("Київ")).toBe("kiyiv");
    expect(transliterate("Ґанок")).toBe("ganok");
    expect(transliterate("Єдність")).toBe("yednist");
  });

  it("keeps non-Cyrillic characters unchanged", () => {
    expect(transliterate("Hello, 123!")).toBe("hello, 123!");
  });

  it("drops the soft and hard signs", () => {
    expect(transliterate("Объект")).toBe("obekt");
  });
});

describe("slugify", () => {
  it("builds a latin slug from a Russian title", () => {
    expect(slugify("Забег #1")).toBe("zabeg-1");
  });

  it("builds a slug from a Ukrainian title", () => {
    expect(slugify("Сезон Київ")).toBe("sezon-kiyiv");
  });

  it("collapses runs of separators into single hyphens", () => {
    expect(slugify("a---b  c")).toBe("a-b-c");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("converts an ampersand to the word 'and'", () => {
    expect(slugify("Rock & Roll")).toBe("rock-and-roll");
  });

  it("strips latin diacritics", () => {
    expect(slugify("Café")).toBe("cafe");
  });

  it("truncates to maxLength without leaving a trailing hyphen", () => {
    expect(slugify("ab cd", 3)).toBe("ab");
    expect(slugify("hello world", 5)).toBe("hello");
    expect(slugify("hello world", 6)).toBe("hello");
  });

  it("returns an empty slug for empty or garbage input", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("###")).toBe("");
  });

  it("defaults maxLength to 100", () => {
    expect(slugify("a".repeat(150))).toHaveLength(100);
  });
});
