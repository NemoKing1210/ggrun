/**
 * Season catalogs (docs/IEE_CONSTRUCTOR_SPEC.md §4.2): which revision of which
 * library entry a season plays, and its tuning. `store.ts` is the only writer
 * of `season_catalog`; the registry reads it through `repository.ts`.
 *
 * The client imports `./edit` directly — it holds no database code.
 */
export { catalogEditor, libraryKeys, libraryViews, type CatalogEditor } from "./editor";
export { loadCatalogLibrary, type CatalogEntryOption, type CatalogRevision } from "./library";
export { catalogDiff, isEmptyDiff, normalizeCatalog, type CatalogDiff, type NormalizedCatalog } from "./normalize";
export { catalogRowsOf, catalogUsageByEntry, heldRevisionIds, loadPlaySet, type PlaySet } from "./repository";
export { applyCatalog, auditCatalogSave, saveSeasonCatalog, type CatalogSave } from "./service";
export { pgSeasonCatalogStore, toCatalogEntry, type SeasonCatalogStore } from "./store";
export {
  keysOf,
  latestViews,
  libraryFacts,
  libraryOptions,
  type LibraryKeys,
  type LibraryOption,
  type RevisionOption,
} from "./views";
