/**
 * A season's catalog: what the wizard saves, and what the registry and the
 * admin pages read (docs/IEE_CONSTRUCTOR_SPEC.md §4.2, §8).
 *
 * Saving runs inside the season-settings transaction, so the config and the
 * catalog it is played with change together; the audit row is written after
 * the commit, by the caller, from the diff returned here.
 */
import { logAdminAction } from "@/lib/infrastructure/events";
import type { SeasonCatalogEntry } from "@/lib/engine";

import { loadCatalogLibrary, type CatalogEntryOption } from "./library";
import { catalogDiff, isEmptyDiff, normalizeCatalog, type CatalogDiff } from "./normalize";
import { heldRevisionIds } from "./repository";
import { pgSeasonCatalogStore, type SeasonCatalogStore, type Tx } from "./store";

export interface CatalogSave {
  diff: CatalogDiff;
  /** Entries attached because an attached entry references them. */
  dependencies: string[];
  /** Slugs by entry id, for the audit row. */
  slugs: Record<string, string>;
}

/** Writes the difference between the stored rows and `next`. */
export async function applyCatalog(
  store: SeasonCatalogStore,
  seasonId: string,
  current: readonly SeasonCatalogEntry[],
  next: readonly SeasonCatalogEntry[],
): Promise<CatalogDiff> {
  const diff = catalogDiff(current, next);
  const byId = new Map(next.map((r) => [r.entryId, r]));
  await store.remove(seasonId, diff.detached);
  const changed = new Set([...diff.switched.map((s) => s.entryId), ...diff.retuned]);
  for (const id of changed) await store.update(seasonId, byId.get(id)!);
  await store.insert(seasonId, diff.attached.map((id) => byId.get(id)!));
  return diff;
}

/**
 * Checks a submitted catalog against the library, closes it over references
 * and stores it — inside the caller's transaction.
 */
export async function saveSeasonCatalog(
  tx: Tx,
  seasonId: string,
  draft: unknown,
  options: {
    /** Keys the season hands out by key — its challenge rewards. */
    requiredSlugs?: readonly string[];
    library?: readonly CatalogEntryOption[];
    store?: SeasonCatalogStore;
    /** The revisions live instances hold; read from the season when absent. */
    heldRevisions?: readonly string[];
  } = {},
): Promise<CatalogSave> {
  const store = options.store ?? pgSeasonCatalogStore(tx);
  const library = options.library ?? (await loadCatalogLibrary(tx));
  const heldRevisions = options.heldRevisions ?? (await heldRevisionIds(seasonId, tx));
  const current = await store.rows(seasonId);
  const normalized = normalizeCatalog(draft, library, current, { requiredSlugs: options.requiredSlugs, heldRevisions });
  const diff = await applyCatalog(store, seasonId, current, normalized.rows);
  const slugs = Object.fromEntries(library.map((e) => [e.entryId, e.slug]));
  return { diff, dependencies: normalized.dependencies, slugs };
}

/** The audit row for a catalog change; nothing when nothing changed. */
export async function auditCatalogSave(actorId: string, seasonId: string, save: CatalogSave): Promise<void> {
  if (isEmptyDiff(save.diff)) return;
  const slug = (id: string) => save.slugs[id] ?? id;
  await logAdminAction({
    actorId,
    actionType: "season_catalog_updated",
    targetType: "season",
    targetId: seasonId,
    payload: {
      attached: save.diff.attached.map(slug),
      detached: save.diff.detached.map(slug),
      switched: save.diff.switched.map((s) => slug(s.entryId)),
      retuned: save.diff.retuned.map(slug),
      dependencies: save.dependencies.map(slug),
    },
  });
}
