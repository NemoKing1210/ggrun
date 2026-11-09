import { describe, expect, it } from "vitest";

import { compileEntry } from "./compile";
import { IDS, effectDoc, itemDoc, resolve } from "./fixtures.test-helpers";
import { entryView, instanceStart } from "./tuning";

const REV = "99999999-9999-4999-8999-999999999999";
const compile = (doc: Parameters<typeof compileEntry>[0]["doc"]) =>
  compileEntry({ entryId: IDS.self, revisionId: REV, doc, resolve });

const slowed = compile(
  effectDoc({
    params: { steps: { type: "int", default: -1, min: -6, max: -1 } },
    rules: [{ when: "afterMovement", do: [{ op: "steps", delta: { param: "steps" } }] }],
  }),
);
const hex = compile(itemDoc());

describe("instanceStart — what a grant hands out", () => {
  it("an effect starts with its declared numbers", () => {
    expect(instanceStart(slowed)).toEqual({ params: { steps: -1 }, problems: [], charges: null, remaining: 2, unit: "rolls" });
  });

  it("applies the season's valid overrides and reports the rest", () => {
    expect(instanceStart(slowed, { paramOverrides: { steps: -3, speed: 1 }, durationOverride: 5 })).toEqual({
      params: { steps: -3 },
      problems: [{ param: "speed", reason: "unknown" }],
      charges: null,
      remaining: 5,
      unit: "rolls",
    });
    // A magnitude-style override from the old config shape breaks the bounds.
    expect(instanceStart(slowed, { paramOverrides: { steps: 4 } }).problems).toEqual([{ param: "steps", reason: "range" }]);
  });

  it("never starts a counter below one", () => {
    expect(instanceStart(slowed, { durationOverride: 0 }).remaining).toBe(1);
    expect(instanceStart(hex, { durationOverride: 0 }).charges).toBe(1);
  });

  it("an item counts uses; the duration override doubles as its charges", () => {
    expect(instanceStart(hex)).toEqual({ params: {}, problems: [], charges: 1, remaining: null, unit: null });
    expect(instanceStart(hex, { durationOverride: 3 }).charges).toBe(3);
  });

  it("a permanent effect has no counter", () => {
    const forever = compile(effectDoc({ duration: { unit: "permanent" } }));
    expect(instanceStart(forever, { durationOverride: 4 })).toMatchObject({ remaining: null, unit: "permanent" });
  });
});

describe("entryView — what the client is told", () => {
  it("is plain data with every locale filled", () => {
    const view = entryView(slowed, resolve);
    expect(view).toEqual({
      revisionId: REV,
      entryId: IDS.self,
      key: "test_effect",
      kind: "effect",
      name: { ru: "Тест", en: "Test", uk: "Тест" },
      ruleText: slowed.ruleText,
      flavor: null,
      glyph: null,
      character: "penalty",
      polarity: "negative",
      rarity: "common",
      tags: ["movement"],
      usage: null,
      duration: { unit: "rolls", count: 2 },
      stacking: "refresh",
      triggers: ["afterMovement"],
      // The document does not know how the library draws it.
      art: { iconUrl: null, packIconUrl: null, system: false },
    });
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("carries the art it is given", () => {
    const art = { iconUrl: "/api/files?key=iee_icon%2Fa.webp", packIconUrl: null, system: false };
    expect(entryView(slowed, resolve, undefined, art).art).toBe(art);
  });

  it("prints the season's numbers, not the catalog's", () => {
    const view = entryView(slowed, resolve, { paramOverrides: { steps: -3 }, durationOverride: 4 });
    expect(view.ruleText.en).toBe("Your move is 3 cells shorter. Lasts 4 rolls.");
    expect(view.duration).toEqual({ unit: "rolls", count: 4 });
    const item = entryView(hex, resolve, { durationOverride: 2 });
    expect(item.ruleText.en).toBe("Use at any time on another player. 2 uses. The chosen player gets “Slowed”.");
    expect(item.usage).toEqual({
      activation: "active",
      window: "anytime",
      target: "other",
      charges: 2,
      filter: null,
      choice: null,
      entryChoice: null,
      pick: null,
      unique: false,
    });
    expect(item.triggers).toEqual(["onUse"]);
    expect(item.duration).toBeNull();
    expect(item.stacking).toBeNull();
  });
});
