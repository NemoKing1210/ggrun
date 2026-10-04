import { describe, expect, it } from "vitest";
import {
  EMPTY_CATALOG_FILTER,
  isCatalogFilterEmpty,
  matchesCatalogFilter,
  type FilterableEntry,
} from "./filter";

const entry = (over: Partial<FilterableEntry> = {}): FilterableEntry => ({
  key: "hex_scroll",
  name: "Hex Scroll",
  description: "A scrawled curse aimed at another player",
  polarity: "positive",
  rarity: "common",
  ...over,
});

describe("matchesCatalogFilter — facets", () => {
  it("matches everything when the filter only holds an empty query", () => {
    expect(matchesCatalogFilter(entry(), { query: "" })).toBe(true);
  });

  it("treats an explicit 'all' the same as an absent facet", () => {
    expect(matchesCatalogFilter(entry(), { query: "", polarity: "all", rarity: "all", armed: "all" })).toBe(
      true,
    );
  });

  it("filters on polarity", () => {
    expect(matchesCatalogFilter(entry({ polarity: "positive" }), { query: "", polarity: "negative" })).toBe(false);
    expect(matchesCatalogFilter(entry({ polarity: "negative" }), { query: "", polarity: "negative" })).toBe(true);
  });

  it("filters on rarity", () => {
    expect(matchesCatalogFilter(entry({ rarity: "epic" }), { query: "", rarity: "epic" })).toBe(true);
    expect(matchesCatalogFilter(entry({ rarity: "epic" }), { query: "", rarity: "rare" })).toBe(false);
  });

  it("treats a missing 'armed' as off", () => {
    expect(matchesCatalogFilter(entry(), { query: "", armed: "on" })).toBe(false);
    expect(matchesCatalogFilter(entry(), { query: "", armed: "off" })).toBe(true);
    expect(matchesCatalogFilter(entry({ armed: true }), { query: "", armed: "on" })).toBe(true);
    expect(matchesCatalogFilter(entry({ armed: false }), { query: "", armed: "on" })).toBe(false);
  });

  it("requires every facet, not just the last one set", () => {
    const e = entry({ polarity: "positive", rarity: "common" });
    expect(matchesCatalogFilter(e, { query: "", polarity: "positive", rarity: "epic" })).toBe(false);
  });
});

describe("matchesCatalogFilter — text", () => {
  it("matches on the key, the name and the description", () => {
    expect(matchesCatalogFilter(entry(), { query: "hex_scroll" })).toBe(true);
    expect(matchesCatalogFilter(entry(), { query: "Scroll" })).toBe(true);
    expect(matchesCatalogFilter(entry(), { query: "scrawled" })).toBe(true);
  });

  it("is case-insensitive and trims the query", () => {
    expect(matchesCatalogFilter(entry(), { query: "HEX SCROLL" })).toBe(true);
    expect(matchesCatalogFilter(entry(), { query: "   curse   " })).toBe(true);
  });

  it("matches nothing when the query matches nothing", () => {
    expect(matchesCatalogFilter(entry(), { query: "zzzz-no-such-entry" })).toBe(false);
  });

  it("treats a whitespace-only query as no query at all", () => {
    expect(matchesCatalogFilter(entry(), { query: "   " })).toBe(true);
  });
});

describe("isCatalogFilterEmpty", () => {
  it("is true only when every facet is neutral", () => {
    expect(isCatalogFilterEmpty({ query: "" })).toBe(true);
    expect(isCatalogFilterEmpty({ query: "   " })).toBe(true);
    expect(isCatalogFilterEmpty({ query: "x" })).toBe(false);
    expect(isCatalogFilterEmpty({ query: "", polarity: "negative" })).toBe(false);
    expect(isCatalogFilterEmpty({ query: "", rarity: "epic" })).toBe(false);
    expect(isCatalogFilterEmpty({ query: "", armed: "on" })).toBe(false);
    expect(isCatalogFilterEmpty({ query: "", armed: "off" })).toBe(false);
  });

  it("the shared empty filter reports empty and hides nothing", () => {
    expect(isCatalogFilterEmpty(EMPTY_CATALOG_FILTER)).toBe(true);
    expect(matchesCatalogFilter(entry(), EMPTY_CATALOG_FILTER)).toBe(true);
  });
});
