import { describe, expect, it } from "vitest";

import { LOCALES, type Locale } from "@/lib/i18n/config";

import { getDictionary } from "./index";

/** Every non-object leaf reachable from a value. */
function leafValues(value: unknown, out: unknown[] = []): unknown[] {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      leafValues(child, out);
    }
  } else {
    out.push(value);
  }
  return out;
}

describe("getDictionary", () => {
  it("returns the requested locale's dictionary", () => {
    expect(getDictionary("en").core.common.save).toBe("Save");
    expect(getDictionary("ru").core.common.save).toBe("Сохранить");
    expect(getDictionary("uk").core.common.save).toBe("Зберегти");
  });

  it("falls back to the en dictionary for an unregistered locale", () => {
    const en = getDictionary("en");
    const unregistered = "de" as unknown as Locale;
    expect(getDictionary(unregistered)).toBe(en);
  });

  it("gives every registered locale the same set of namespaces", () => {
    const namespaces = Object.keys(getDictionary("en"));
    for (const locale of LOCALES) {
      expect(Object.keys(getDictionary(locale))).toEqual(namespaces);
    }
  });

  it("exposes only plain strings so the dictionary survives the RSC boundary", () => {
    for (const locale of LOCALES) {
      const bad = leafValues(getDictionary(locale)).filter(
        (value) => typeof value !== "string",
      );
      expect(bad).toEqual([]);
    }
  });
});
