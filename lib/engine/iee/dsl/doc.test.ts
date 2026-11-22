import { describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical";
import { EntryDocSchema, fillLocales, localize } from "./doc";
import { effectDoc, itemDoc, rngOf } from "./fixtures.test-helpers";
import { capitalize, counted, joinAnd, joinOr, plural, quote, sentence, NOUNS } from "./text-kit";
import { upgradeDoc } from "./upgrade";
import { paramNumber, resolveParamOverrides, resolveValue, tableShares, valueMean, valueRange, ValueSchema } from "./values";

describe("EntryDocSchema — the frame of a document", () => {
  it("accepts a minimal effect and a minimal item", () => {
    expect(EntryDocSchema.safeParse(effectDoc()).success).toBe(true);
    expect(EntryDocSchema.safeParse(itemDoc()).success).toBe(true);
  });

  it("rejects an unknown top-level field instead of ignoring it", () => {
    const r = EntryDocSchema.safeParse({ ...effectDoc(), cooldown: 3 });
    expect(r.success).toBe(false);
  });

  it("requires a ru name; en and uk are optional", () => {
    expect(EntryDocSchema.safeParse(effectDoc({ name: { ru: "Только ру" } })).success).toBe(true);
    expect(EntryDocSchema.safeParse({ ...effectDoc(), name: { en: "No Russian" } }).success).toBe(false);
  });

  it("rejects a slug that is not lowercase snake case", () => {
    expect(EntryDocSchema.safeParse(effectDoc({ slug: "Swamp" })).success).toBe(false);
    expect(EntryDocSchema.safeParse(effectDoc({ slug: "a" })).success).toBe(false);
  });

  it("rejects a future DSL version — the upgrader decides those", () => {
    expect(EntryDocSchema.safeParse({ ...effectDoc(), dslVersion: 2 }).success).toBe(false);
  });

  it("caps the actions of one rule at eight (spec §7.10)", () => {
    const nine = Array.from({ length: 9 }, () => ({ op: "steps", delta: 1 }));
    const r = EntryDocSchema.safeParse(effectDoc({ rules: [{ when: "afterMovement", do: nine }] }));
    expect(r.success).toBe(false);
  });

  it("checks a parameter's default against its own bounds", () => {
    const bad = effectDoc({ params: { steps: { type: "int", default: 3, min: -6, max: -1 } } });
    expect(EntryDocSchema.safeParse(bad).success).toBe(false);
    const enumBad = effectDoc({ params: { mode: { type: "enum", default: "x", values: ["a", "b"] } } });
    expect(EntryDocSchema.safeParse(enumBad).success).toBe(false);
  });

  it("leaves operation parameters to the operation's own schema", () => {
    const doc = itemDoc({
      rules: [{ when: "onUse", do: [{ op: "grantEffect", entry: { entry: "slowed" }, to: "target" }] }],
    });
    // The frame keeps ops loose; the reference is checked by the op's schema.
    expect(EntryDocSchema.safeParse(doc).success).toBe(true);
  });
});

describe("locales", () => {
  it("falls back to ru for a missing language", () => {
    expect(localize({ ru: "Болото", en: "Swamp" }, "uk")).toBe("Болото");
    expect(localize({ ru: "Болото", en: "Swamp" }, "en")).toBe("Swamp");
    expect(fillLocales({ ru: "Болото" })).toEqual({ ru: "Болото", en: "Болото", uk: "Болото" });
  });
});

describe("values", () => {
  const decls = { steps: { type: "int" as const, default: -1, min: -6, max: -1 } };

  it("reads literals, parameters and server randomness", () => {
    const env = { params: { steps: -3 }, decls, rng: rngOf(0) };
    expect(resolveValue(4, env)).toBe(4);
    expect(resolveValue({ param: "steps" }, env)).toBe(-3);
    expect(resolveValue({ random: [1, 3] }, { ...env, rng: rngOf(0) })).toBe(1);
    expect(resolveValue({ random: [1, 3] }, { ...env, rng: rngOf(0.999) })).toBe(3);
  });

  it("falls back to the declared default for a parameter that breaks its declaration", () => {
    expect(paramNumber("steps", { steps: 5 }, decls)).toBe(-1);
    expect(paramNumber("steps", { steps: "fast" }, decls)).toBe(-1);
    expect(paramNumber("steps", {}, decls)).toBe(-1);
    expect(paramNumber("missing", {}, decls)).toBe(0);
  });

  it("reports the range a value can take, for text and power", () => {
    expect(valueRange({ random: [-2, 3] }, {}, decls)).toEqual({ min: -2, max: 3 });
    expect(valueRange({ param: "steps" }, { steps: -4 }, decls)).toEqual({ min: -4, max: -4 });
  });

  it("refuses a random range written backwards", () => {
    expect(ValueSchema.safeParse({ random: [3, 1] }).success).toBe(false);
  });

  describe("a die rolled on a table (wave A, «Кубик хаоса»)", () => {
    const chaos = {
      table: {
        die: 20,
        rows: [
          { upTo: 1, value: -5 },
          { upTo: 5, value: -2 },
          { upTo: 10, value: 0 },
          { upTo: 15, value: 2 },
          { upTo: 19, value: 4 },
          { upTo: 20, value: 8 },
        ],
      },
    };

    it("rolls the die on the server and reads the row its face falls in", () => {
      const env = { params: {}, decls, rng: rngOf(0) };
      // rng r is the face floor(r·20) + 1.
      expect(resolveValue(chaos, { ...env, rng: rngOf(0) })).toBe(-5);
      expect(resolveValue(chaos, { ...env, rng: rngOf(0.05) })).toBe(-2);
      expect(resolveValue(chaos, { ...env, rng: rngOf(0.49) })).toBe(0);
      expect(resolveValue(chaos, { ...env, rng: rngOf(0.5) })).toBe(2);
      expect(resolveValue(chaos, { ...env, rng: rngOf(0.999) })).toBe(8);
    });

    it("spans its rows, averages at its faces' odds and shares the die out", () => {
      expect(valueRange(chaos, {}, decls)).toEqual({ min: -5, max: 8 });
      expect(valueMean(chaos, {}, decls)).toBeCloseTo(1.05);
      expect(valueMean({ random: [-3, -1] }, {}, decls)).toBe(-2);
      expect(tableShares(chaos.table).map((r) => [r.from, r.upTo, r.share])).toEqual([
        [1, 1, 0.05],
        [2, 5, 0.2],
        [6, 10, 0.25],
        [11, 15, 0.25],
        [16, 19, 0.2],
        [20, 20, 0.05],
      ]);
    });

    it("refuses rows that do not go up, or stop short of the die", () => {
      expect(ValueSchema.safeParse(chaos).success).toBe(true);
      const rows = chaos.table.rows;
      expect(ValueSchema.safeParse({ table: { die: 20, rows: [rows[1], rows[0], ...rows.slice(2)] } }).success).toBe(false);
      expect(ValueSchema.safeParse({ table: { die: 20, rows: rows.slice(0, -1) } }).success).toBe(false);
      expect(ValueSchema.safeParse({ table: { die: 20, rows: [rows[5]] } }).success).toBe(false);
    });
  });

  it("applies valid overrides and reports the rest without applying them", () => {
    const all = {
      steps: { type: "int" as const, default: -1, min: -6, max: -1 },
      loud: { type: "bool" as const, default: false },
      mode: { type: "enum" as const, default: "a", values: ["a", "b"] },
    };
    const { params, problems } = resolveParamOverrides(all, {
      steps: -4,
      loud: true,
      mode: "c",
      typo: 1,
    });
    expect(params).toEqual({ steps: -4, loud: true, mode: "a" });
    expect(problems).toEqual([
      { param: "mode", reason: "value" },
      { param: "typo", reason: "unknown" },
    ]);
    expect(resolveParamOverrides(all, { steps: 2 }).problems).toEqual([{ param: "steps", reason: "range" }]);
    expect(resolveParamOverrides(all, { steps: 1.5 }).problems).toEqual([{ param: "steps", reason: "type" }]);
    expect(resolveParamOverrides(all, { loud: 1 }).problems).toEqual([{ param: "loud", reason: "type" }]);
    expect(resolveParamOverrides(all, { mode: 1 }).problems).toEqual([{ param: "mode", reason: "type" }]);
  });
});

describe("text kit", () => {
  it("picks Russian and Ukrainian plural forms by the CLDR rules", () => {
    const forms = [1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map((n) => plural("ru", n, NOUNS.cell));
    expect(forms).toEqual([
      "клетку", "клетки", "клетки", "клеток", "клеток", "клеток",
      "клеток", "клетку", "клетки", "клеток", "клетку", "клеток",
    ]);
    expect([1, 3, 7].map((n) => plural("uk", n, NOUNS.roll))).toEqual(["кидок", "кидки", "кидків"]);
    expect([1, 2].map((n) => plural("en", n, NOUNS.point))).toEqual(["point", "points"]);
  });

  it("writes ranges with the form of their upper bound", () => {
    expect(counted("ru", 1, 3, NOUNS.cell)).toBe("1–3 клетки");
    expect(counted("en", -3, -1, NOUNS.cell)).toBe("1–3 cells");
    expect(counted("en", 1, 1, NOUNS.cell)).toBe("1 cell");
  });

  it("quotes, joins and ends sentences", () => {
    expect(quote("en", "Swamp")).toBe("“Swamp”");
    expect(quote("ru", "Болото")).toBe("«Болото»");
    expect(joinAnd("ru", ["а", "б", "в"])).toBe("а, б и в");
    expect(joinOr("uk", ["а", "б"])).toBe("а або б");
    expect(joinAnd("en", [])).toBe("");
    expect(capitalize("")).toBe("");
    expect(sentence("done.")).toBe("Done.");
    expect(sentence("  ")).toBe("");
  });
});

describe("canonical JSON", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"x":0,"y":1}]},"b":1}',
    );
  });
});

describe("upgradeDoc", () => {
  it("passes a current document through", () => {
    const doc = effectDoc();
    expect(upgradeDoc(doc)).toEqual({ ok: true, doc });
  });

  it("refuses what it cannot read", () => {
    expect(upgradeDoc(null).ok).toBe(false);
    expect(upgradeDoc([]).ok).toBe(false);
    expect(upgradeDoc({ dslVersion: "1" }).ok).toBe(false);
    expect(upgradeDoc({ dslVersion: 0 }).ok).toBe(false);
    const future = upgradeDoc({ dslVersion: 9 });
    expect(future).toEqual({ ok: false, reason: "written for DSL v9; this build reads up to v1" });
  });
});
