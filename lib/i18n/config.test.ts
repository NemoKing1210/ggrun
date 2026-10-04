import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  negotiateLocale,
} from "./config";

describe("isLocale", () => {
  it("accepts every registered locale", () => {
    for (const locale of LOCALES) {
      expect(isLocale(locale)).toBe(true);
    }
  });

  it("rejects unknown, region-tagged, mis-cased, and empty values", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("negotiateLocale", () => {
  it("falls back to the default for null/undefined/empty headers", () => {
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("")).toBe(DEFAULT_LOCALE);
  });

  it("returns the supported locale with the highest q-weight, regardless of order", () => {
    expect(negotiateLocale("en;q=0.5, ru;q=0.9")).toBe("ru");
    expect(negotiateLocale("ru;q=0.9, en;q=0.8")).toBe("ru");
    expect(negotiateLocale("uk;q=0.2, en;q=0.7, ru;q=0.1")).toBe("en");
  });

  it("preserves header order when q-weights tie", () => {
    expect(negotiateLocale("uk, ru")).toBe("uk");
    expect(negotiateLocale("ru, uk")).toBe("ru");
  });

  it("maps a region tag to its base supported locale", () => {
    expect(negotiateLocale("en-US")).toBe("en");
    expect(negotiateLocale("uk-UA")).toBe("uk");
    expect(negotiateLocale("RU-ru")).toBe("ru");
  });

  it("skips unsupported languages and falls back to the default", () => {
    expect(negotiateLocale("de-DE, fr;q=0.8")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("*")).toBe(DEFAULT_LOCALE);
  });

  it("skips an unsupported top-ranked language and picks the next supported one", () => {
    expect(negotiateLocale("de;q=1, ru;q=0.9")).toBe("ru");
  });

  it("treats a malformed q as 0 so a valid alternative wins", () => {
    expect(negotiateLocale("de;q=abc, ru;q=0.5")).toBe("ru");
  });

  it("tolerates whitespace around tags and params", () => {
    expect(negotiateLocale("  ru  ,  en ")).toBe("ru");
    expect(negotiateLocale("en ; q=0.1, uk ; q=0.9")).toBe("uk");
  });
});

describe("locale constants", () => {
  it("declares the three shipped locales with en as default", () => {
    expect(LOCALES).toEqual(["en", "ru", "uk"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALE_COOKIE).toBe("ggrun_locale");
  });
});
