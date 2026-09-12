import type { Polarity, Rarity } from "../types/iee";

/**
 * Catalog list filtering, extracted for the same reason `use-guards.ts` was:
 * it is a rule, and a rule buried in a component can only be tested through a
 * browser. It was also about to be written twice — once in the catalog grid
 * and once in the season wizard — which is how two lists start disagreeing
 * about what "matches" means.
 *
 * Text is passed in already resolved. The engine holds dictionary *keys*, not
 * language, so the caller does the lookup and this stays pure.
 */

export type FilterableEntry = {
  key: string;
  /** Resolved display name, in the viewer's language. */
  name: string;
  /** Resolved description, in the viewer's language. */
  description: string;
  polarity: Polarity;
  rarity: Rarity;
  /** Whether this entry is enabled in the season being edited. */
  armed?: boolean;
};

export type CatalogFilter = {
  query: string;
  polarity?: Polarity | "all";
  rarity?: Rarity | "all";
  armed?: "all" | "on" | "off";
};

export const EMPTY_CATALOG_FILTER: Required<Omit<CatalogFilter, "query">> & { query: string } = {
  query: "",
  polarity: "all",
  rarity: "all",
  armed: "all",
};

/**
 * Key as well as name and description: an admin arriving from a log line, a
 * drop table or a database row has the key in hand, not the label.
 *
 * Matching is case-insensitive and trims the query, so a trailing space from a
 * paste does not empty the list.
 */
export function matchesCatalogFilter(entry: FilterableEntry, filter: CatalogFilter): boolean {
  const polarity = filter.polarity ?? "all";
  if (polarity !== "all" && entry.polarity !== polarity) return false;

  const rarity = filter.rarity ?? "all";
  if (rarity !== "all" && entry.rarity !== rarity) return false;

  const armed = filter.armed ?? "all";
  if (armed === "on" && !entry.armed) return false;
  if (armed === "off" && entry.armed) return false;

  const q = filter.query.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.key.toLowerCase().includes(q) ||
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q)
  );
}

/** True when the filter would hide nothing — drives the "reset" affordance. */
export function isCatalogFilterEmpty(filter: CatalogFilter): boolean {
  return (
    filter.query.trim() === "" &&
    (filter.polarity ?? "all") === "all" &&
    (filter.rarity ?? "all") === "all" &&
    (filter.armed ?? "all") === "all"
  );
}
