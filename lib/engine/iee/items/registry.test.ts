import { describe, expect, it } from "vitest";
import { getItem, ITEMS, listItems } from "./registry";

describe("item registry", () => {
  it("keys every item by its own key", () => {
    for (const [key, def] of Object.entries(ITEMS)) {
      expect(def.key).toBe(key);
    }
  });

  it("getItem returns the registered definition for a known key", () => {
    expect(getItem("hex_scroll")).toBe(ITEMS.hex_scroll);
    expect(getItem("cleansing_salve")).toBe(ITEMS.cleansing_salve);
  });

  it("getItem returns null for a key the catalog never shipped", () => {
    expect(getItem("not_an_item")).toBeNull();
    expect(getItem("")).toBeNull();
  });

  it("listItems returns every registered definition exactly once", () => {
    const list = listItems();
    expect(list).toHaveLength(Object.keys(ITEMS).length);
    expect(new Set(list).size).toBe(list.length);
    for (const def of list) expect(ITEMS[def.key]).toBe(def);
  });

  it("every item is a positive tool, so a bonus cell can hand it out", () => {
    for (const def of listItems()) expect(def.polarity).toBe("positive");
  });
});
