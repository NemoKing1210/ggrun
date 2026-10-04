import { describe, expect, it } from "vitest";

import { LOCALES } from "@/lib/i18n/config";

import { getDictionary } from "./index";

type Leaf = { path: string; value: string };

/** Flattens a dictionary into dotted-path → string leaves. */
function leaves(value: unknown, prefix = "", out: Leaf[] = []): Leaf[] {
  if (typeof value === "string") {
    out.push({ path: prefix, value });
    return out;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
}

const en = leaves(getDictionary("en"));
const enByPath = new Map(en.map(({ path, value }) => [path, value]));

/**
 * `rules.streakOff` is intentionally empty: it is substituted into the
 * `diceDetails` suffix `…drop {drop} dice{streak}`, so the "streak multiplier
 * off" case must append nothing. Any other blank value is a wiring mistake.
 */
const ALLOWED_BLANK: Record<string, true> = { "rules.streakOff": true };

describe("dictionary key parity", () => {
  for (const locale of LOCALES) {
    it(`${locale} exposes exactly the same key structure as en`, () => {
      const target = new Set(leaves(getDictionary(locale)).map(({ path }) => path));
      const missing = en.map(({ path }) => path).filter((path) => !target.has(path));
      const extra = [...target].filter((path) => !enByPath.has(path));
      expect(missing).toEqual([]);
      expect(extra).toEqual([]);
    });

    it(`${locale} has no unexpected empty or whitespace-only string value`, () => {
      const unexpected = leaves(getDictionary(locale))
        .filter(({ value }) => value.trim() === "")
        .map(({ path }) => path)
        .filter((path) => ALLOWED_BLANK[path] !== true);
      expect(unexpected).toEqual([]);
    });

    it(`${locale} keeps every interpolation placeholder used by en`, () => {
      const target = new Map(leaves(getDictionary(locale)).map(({ path, value }) => [path, value]));
      const problems: string[] = [];
      for (const { path, value } of en) {
        const expected = placeholders(value);
        if (expected.length === 0) continue;
        const actual = placeholders(target.get(path) ?? "");
        if (expected.join(",") !== actual.join(",")) {
          problems.push(`${path} (en: ${expected.join(",")} / ${locale}: ${actual.join(",")})`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
