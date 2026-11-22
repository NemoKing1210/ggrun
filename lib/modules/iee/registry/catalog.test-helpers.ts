/**
 * The core fixture as a season that attaches exactly the given entries, each
 * tuned over its own defaults — the way a season catalog would. Test-only.
 */
import { defaultCatalogEntry, type EntryArt, type SeasonCatalogEntry } from "@/lib/engine";
import { CORE_DOCS } from "@/lib/engine/iee/core-docs";

import { referencedEntries } from "../library/refs";
import { buildRegistry, coreRegistry, type SeasonRegistry } from "./index";

export type CatalogTuning = Partial<Omit<SeasonCatalogEntry, "entryId" | "revisionId">>;

/** Catalog rows for core entries, by key. */
export function coreCatalog(entries: Record<string, CatalogTuning>): SeasonCatalogEntry[] {
  const set = coreRegistry().set;
  return Object.entries(entries).map(([key, over]) => {
    const entry = set.byKey.get(key);
    if (!entry) throw new Error(`${key} is not a core entry`);
    return defaultCatalogEntry(entry, over);
  });
}

/**
 * Closes rows over what their entries hand out, attached disabled — what the
 * server does when a season is saved (`normalizeCatalog`).
 */
export function closeCoreCatalog(rows: readonly SeasonCatalogEntry[]): SeasonCatalogEntry[] {
  const set = coreRegistry().set;
  const out = [...rows];
  const have = new Set(out.map((r) => r.entryId));
  for (let i = 0; i < out.length; i++) {
    const doc = CORE_DOCS.find((d) => d.entryId === out[i]!.entryId)?.doc;
    for (const ref of doc ? referencedEntries(doc) : []) {
      const entry = set.byEntryId.get(ref);
      if (!entry || have.has(ref)) continue;
      out.push(defaultCatalogEntry(entry, { enabled: false }));
      have.add(ref);
    }
  }
  return out;
}

/** A season that attaches `entries` and, disabled, what they hand out. */
export function catalogRegistry(entries: Record<string, CatalogTuning>): SeasonRegistry {
  return buildRegistry(coreRegistry().set, closeCoreCatalog(coreCatalog(entries)), () => SYSTEM_ART);
}

/** Core entries draw with the shipped artwork, as the system pack's do. */
const SYSTEM_ART: EntryArt = { iconUrl: null, packIconUrl: null, system: true };
