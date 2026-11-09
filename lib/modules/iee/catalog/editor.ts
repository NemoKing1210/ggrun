/**
 * Read models built from the library and a season's catalog: the season
 * wizard's editor, the catalog page's views, and the keys rewards may name.
 */
import { db } from "@/lib/infrastructure/db";
import type { EntryView, SeasonCatalogEntry } from "@/lib/engine";

import { loadCatalogLibrary } from "./library";
import { pgSeasonCatalogStore } from "./store";
import { keysOf, latestViews, libraryOptions, type LibraryKeys, type LibraryOption } from "./views";

export interface CatalogEditor {
  /** What may be attached, and whatever the season already attaches. */
  options: LibraryOption[];
  rows: SeasonCatalogEntry[];
}

/** The season wizard's IEE stage: the library and the season's rows. */
export async function catalogEditor(seasonId: string): Promise<CatalogEditor> {
  const [library, rows] = await Promise.all([loadCatalogLibrary(), pgSeasonCatalogStore(db).rows(seasonId)]);
  const attached = new Set(rows.map((r) => r.entryId));
  return { options: libraryOptions(library, (e) => e.available || attached.has(e.entryId)), rows };
}

/** The latest revision of every published entry, as the catalog page browses it. */
export async function libraryViews(): Promise<EntryView[]> {
  return latestViews(libraryOptions(await loadCatalogLibrary()));
}

/** Item and effect keys a challenge reward may name. */
export async function libraryKeys(): Promise<LibraryKeys> {
  return keysOf(await loadCatalogLibrary());
}
