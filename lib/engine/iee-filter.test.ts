import { describe, expect, it } from "vitest";
import * as EnIee from "../i18n/dictionaries/en/iee";
import {
  catalogCandidates,
  isCatalogFilterEmpty,
  matchesCatalogFilter,
  listEffects,
  listItems,
  type CatalogFilter,
  type FilterableEntry,
} from "./iee";
import type { Polarity, Rarity } from "./types";

/** Resolve a dictionary path the way `dictText` does, so names are real. */
function dict(root: unknown, path: string): string {
  const parts = path.split(".");
  let node: unknown = root;
  for (const part of parts) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else return path;
  }
  return typeof node === "string" ? node : path;
}

/**
 * Scenarios are the real catalog, resolved through the real dictionary, so
 * these exercise the strings a user actually types against rather than
 * fixtures invented to match the implementation.
 */
const ENTRIES: FilterableEntry[] = [
  ...listItems().map((d) => ({
    key: d.key,
    name: dict(EnIee.iee, d.i18n.name.replace(/^iee\./, "")),
    description: dict(EnIee.iee, d.i18n.description.replace(/^iee\./, "")),
    polarity: d.polarity,
    rarity: d.rarity,
    armed: false,
  })),
  ...listEffects().map((d) => ({
    key: d.key,
    name: dict(EnIee.iee, d.i18n.name.replace(/^iee\./, "")),
    description: dict(EnIee.iee, d.i18n.description.replace(/^iee\./, "")),
    polarity: d.polarity,
    rarity: d.rarity,
    armed: true,
  })),
];

const F = (over: Partial<CatalogFilter> = {}): CatalogFilter => ({ query: "", ...over });
const shown = (f: CatalogFilter) => ENTRIES.filter((e) => matchesCatalogFilter(e, f));

describe("catalog filter — fixtures", () => {
  it("uses the whole catalog, resolved (a filter over nothing proves nothing)", () => {
    expect(ENTRIES.length).toBe(catalogCandidates().length);
    // A name that failed to resolve comes back as its own dictionary path.
    for (const e of ENTRIES) expect(e.name).not.toMatch(/^items\.|^effects\./);
  });
});

describe("catalog filter — the empty filter hides nothing", () => {
  it("matches every entry", () => {
    expect(shown(F())).toHaveLength(ENTRIES.length);
  });
  it("survives a pasted trailing space", () => {
    expect(shown(F({ query: "   " }))).toHaveLength(ENTRIES.length);
  });
  it("reports itself as empty, which is what hides the reset control", () => {
    expect(isCatalogFilterEmpty(F())).toBe(true);
    expect(isCatalogFilterEmpty(F({ query: "x" }))).toBe(false);
    expect(isCatalogFilterEmpty(F({ rarity: "epic" }))).toBe(false);
    expect(isCatalogFilterEmpty(F({ polarity: "negative" }))).toBe(false);
    expect(isCatalogFilterEmpty(F({ armed: "on" }))).toBe(false);
  });
});

describe("catalog filter — facets partition the catalog", () => {
  // Generated from the catalog: every facet value that exists is checked, and
  // the parts must add back up to the whole. A predicate that quietly drops an
  // entry fails here even if each individual filter looks right.
  const polarities = [...new Set(ENTRIES.map((e) => e.polarity))] as Polarity[];
  const rarities = [...new Set(ENTRIES.map((e) => e.rarity))] as Rarity[];

  it.each(polarities)("polarity=%s returns exactly that polarity", (p) => {
    const rows = shown(F({ polarity: p }));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.polarity).toBe(p);
  });

  it("polarities sum back to the full catalog", () => {
    const total = polarities.reduce((n, p) => n + shown(F({ polarity: p })).length, 0);
    expect(total).toBe(ENTRIES.length);
  });

  it.each(rarities)("rarity=%s returns exactly that rarity", (r) => {
    const rows = shown(F({ rarity: r }));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.rarity).toBe(r);
  });

  it("rarities sum back to the full catalog", () => {
    const total = rarities.reduce((n, r) => n + shown(F({ rarity: r })).length, 0);
    expect(total).toBe(ENTRIES.length);
  });

  it("armed on/off partitions the catalog", () => {
    const on = shown(F({ armed: "on" }));
    const off = shown(F({ armed: "off" }));
    expect(on.length + off.length).toBe(ENTRIES.length);
    for (const e of on) expect(e.armed).toBe(true);
    for (const e of off) expect(e.armed).toBe(false);
  });

  it("combines facets rather than letting the last one win", () => {
    const p = ENTRIES[0]!.polarity;
    const other: Polarity = p === "positive" ? "negative" : "positive";
    const rows = shown(F({ polarity: other, query: ENTRIES[0]!.key }));
    expect(rows).toHaveLength(0);
  });
});

describe("catalog filter — text", () => {
  it.each(ENTRIES.map((e) => [e.key] as const))("finds %s by its exact key", (key) => {
    expect(shown(F({ query: key }).valueOf() as CatalogFilter).map((e) => e.key)).toContain(key);
  });

  it.each(ENTRIES.map((e) => [e.key, e.name] as const))("finds %s by its name", (key, name) => {
    expect(shown(F({ query: name })).map((e) => e.key)).toContain(key);
  });

  it("ignores case in both directions", () => {
    const e = ENTRIES[0]!;
    expect(shown(F({ query: e.key.toUpperCase() })).map((x) => x.key)).toContain(e.key);
    expect(shown(F({ query: e.name.toLowerCase() })).map((x) => x.key)).toContain(e.key);
  });

  it("searches descriptions, not just labels", () => {
    const withText = ENTRIES.find((e) => e.description.split(" ").length > 3);
    expect(withText).toBeDefined();
    const word = withText!.description.split(/\s+/).find((w) => w.length > 5)!;
    expect(shown(F({ query: word })).map((e) => e.key)).toContain(withText!.key);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(shown(F({ query: "zzzz-no-such-entry" }))).toHaveLength(0);
  });
});
