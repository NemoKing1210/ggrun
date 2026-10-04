import { describe, expect, it } from "vitest";
import { EFFECTS, getEffect, listEffects } from "./registry";

describe("effect registry", () => {
  it("keys every effect by its own key", () => {
    for (const [key, def] of Object.entries(EFFECTS)) {
      expect(def.key).toBe(key);
    }
  });

  it("getEffect returns the registered definition for a known key", () => {
    expect(getEffect("slowed")).toBe(EFFECTS.slowed);
    expect(getEffect("shield")).toBe(EFFECTS.shield);
  });

  it("getEffect returns null for a key the catalog never shipped", () => {
    expect(getEffect("not_an_effect")).toBeNull();
    expect(getEffect("")).toBeNull();
  });

  it("listEffects returns every registered definition exactly once", () => {
    const list = listEffects();
    expect(list).toHaveLength(Object.keys(EFFECTS).length);
    expect(new Set(list).size).toBe(list.length);
    for (const def of list) expect(EFFECTS[def.key]).toBe(def);
  });

  it("ships both polarities, so a season can build two pools", () => {
    const list = listEffects();
    expect(list.some((d) => d.polarity === "negative")).toBe(true);
    expect(list.some((d) => d.polarity === "positive")).toBe(true);
  });
});
