import { describe, expect, it } from "vitest";

import { revisionDiff } from "./diff";
import { coreLibrary, withNewRevision } from "./fixtures.test-helpers";
import { libraryOptions } from "./views";

function revisionsOf(slug: string, change: Parameters<typeof withNewRevision>[2]) {
  const option = libraryOptions(withNewRevision(coreLibrary(), slug, change)).find((o) => o.key === slug)!;
  return { from: option.revisions[0]!, to: option.revisions[1]! };
}

describe("revisionDiff — what a switch changes (spec §4.2)", () => {
  it("names what a player meets the entry by: text, numbers, rarity", () => {
    const { from, to } = revisionsOf("tailwind", (doc) => {
      doc.params!.steps!.default = 3;
      doc.rarity = "rare";
      doc.duration = { unit: "moves", count: 2 };
    });
    const diff = revisionDiff(from, to)!;
    expect(diff.same).toBe(false);
    expect(diff.ruleText.map((c) => c.locale)).toEqual(["ru", "en", "uk"]);
    expect(diff.ruleText.find((c) => c.locale === "en")).toEqual({
      locale: "en",
      from: "Your move is 2 cells longer. Lasts 1 move.",
      to: "Your move is 3 cells longer. Lasts 2 moves.",
    });
    expect(diff.rarity).toEqual({ from: "common", to: "rare" });
    expect(diff.duration).toEqual({ from: { unit: "moves", count: 1 }, to: { unit: "moves", count: 2 } });
    expect(diff.power).toEqual({ from: 2, to: 6 });
    expect(diff.name).toEqual([]);
    expect(diff.character).toBeUndefined();
    expect(diff.usage).toBeUndefined();
  });

  it("lists names per locale, tags added and removed, character and stacking", () => {
    const { from, to } = revisionsOf("swamp", (doc) => {
      doc.name = { ...doc.name, en: "Bog" };
      doc.tags = ["dice"];
      doc.character = "bonus";
      doc.stacking = { mode: "unique" };
    });
    const diff = revisionDiff(from, to)!;
    expect(diff.name).toEqual([{ locale: "en", from: "Swamp", to: "Bog" }]);
    expect(diff.tags).toEqual({ added: ["dice"], removed: ["movement"] });
    expect(diff.character).toEqual({ from: "penalty", to: "bonus" });
    expect(diff.stacking).toEqual({ from: "refresh", to: "unique" });
  });

  it("an item's usage", () => {
    const { from, to } = revisionsOf("speed_boots", (doc) => {
      doc.usage = { ...doc.usage!, charges: 2 };
    });
    expect(revisionDiff(from, to)!.usage).toEqual({
      from: { activation: "active", window: "before_roll", target: "self", charges: 1, filter: null, choice: null, entryChoice: null, pick: null, unique: false },
      to: { activation: "active", window: "before_roll", target: "self", charges: 2, filter: null, choice: null, entryChoice: null, pick: null, unique: false },
    });
  });

  it("shows a new flavor line", () => {
    const { from, to } = revisionsOf("swamp", (doc) => {
      doc.flavor = { ru: "Вязко.", en: "Sticky." };
    });
    expect(revisionDiff(from, to)!.flavor).toEqual([
      { locale: "ru", from: "", to: "Вязко." },
      { locale: "en", from: "", to: "Sticky." },
      { locale: "uk", from: "", to: "Вязко." },
    ]);
  });

  it("says when nothing a player sees changes", () => {
    // Wider bounds for the season's tuning: the document differs, the card does not.
    const { from, to } = revisionsOf("swamp", (doc) => {
      doc.params!.steps = { type: "int", default: -1, min: -5, max: -1 };
    });
    expect(revisionDiff(from, to)!.same).toBe(true);
  });

  it("cannot compare a revision that no longer compiles", () => {
    const { from, to } = revisionsOf("swamp", () => {});
    expect(revisionDiff({ ...from, view: null }, to)).toBeNull();
  });
});
