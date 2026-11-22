/**
 * The season registry — which compiled entries a season plays, and how it
 * tunes them (docs/IEE_CONSTRUCTOR_SPEC.md §8).
 *
 * The load set is the season's catalog — one revision per entry, the ones
 * references resolve to — plus every revision its live instances still hold
 * (granted before the season switched to a newer one). A set is compiled once
 * per process: revision ids are derived from content, so the same ids are the
 * same documents. The tuning comes from the catalog rows and is applied per
 * call, so a retuned season needs no recompilation.
 */
import {
  catalogCandidate,
  catalogEntryConfig,
  defaultCatalogEntry,
  NO_ART,
  poolSlot,
  type CatalogSubject,
  type EntryArt,
  type EntryView,
  type IeeEntryConfig,
  type IeeParams,
  type PoolCandidate,
  type SeasonCatalogEntry,
  type SeasonPoolSlot,
} from "@/lib/engine";
import { CORE_DOCS } from "@/lib/engine/iee/core-docs";
import {
  compileSet,
  entryView,
  factsOf,
  instanceStart,
  isEffect,
  isItem,
  type CompiledEffect,
  type CompiledEntry,
  type CompiledItem,
  type CompiledSet,
  type EntryFacts,
  type EntryTuning,
  type InstanceStart,
  type SetMemberInput,
} from "@/lib/engine/iee/dsl";

import { loadPlaySet, type PlaySet } from "../catalog/repository";

export interface SeasonRegistry {
  readonly set: CompiledSet;
  /** An entry by key, entry id or revision id. Keys and entry ids find the catalog's revision. */
  get(ref: string): CompiledEntry | null;
  item(ref: string): CompiledItem | null;
  effect(ref: string): CompiledEffect | null;
  /** The catalog's items and effects — not the older revisions instances hold. */
  items(): readonly CompiledItem[];
  effects(): readonly CompiledEffect[];
  /** What other entries and conditions see of an entry. */
  facts(entryId: string): EntryFacts | null;
  /** The season's catalog row of an entry, by entry id. */
  tuning(entryId: string): SeasonCatalogEntry | null;
  /** The wheel's candidates, with the season's pool and rarity folded in. */
  candidates(): PoolCandidate[];
  /** The wheel's gates and tuning, by key. */
  entryConfigs(): Record<string, IeeEntryConfig>;
  /** How each attached entry drops, by key — the rules page prints it. */
  pool(): Record<string, SeasonPoolSlot>;
  /** Declared parameter defaults by key. */
  defaults(): Record<string, IeeParams>;
  /** The numbers an instance of `entry` starts with in this season. */
  start(entry: CompiledEntry): InstanceStart;
  /** The client's view of one entry, under the season's tuning. */
  view(entry: CompiledEntry): EntryView;
  views(): EntryView[];
  /** The views by key — what a component looks a key up in (keys are unique in a season). */
  viewsByKey(): Record<string, EntryView>;
  /**
   * The view of the revision an instance holds — the catalog's, or an older
   * one granted before the season switched or detached the entry (§8).
   */
  instanceView(revisionId: string): EntryView | null;
}

/** What a catalog row changes about an instance's numbers; undefined when it changes nothing. */
export function entryTuning(row: SeasonCatalogEntry | null | undefined): EntryTuning | undefined {
  if (!row) return undefined;
  if (Object.keys(row.paramOverrides).length === 0 && row.durationOverride === null) return undefined;
  return { paramOverrides: row.paramOverrides, durationOverride: row.durationOverride };
}

/** A compiled entry as the catalog helpers read it. */
export function catalogSubject(entry: CompiledEntry): CatalogSubject {
  return {
    entryId: entry.entryId,
    revisionId: entry.revisionId,
    kind: entry.kind,
    key: entry.key,
    character: entry.character,
    rarity: entry.rarity,
    tags: entry.tags,
    stacking: isEffect(entry) ? entry.stacking.mode : null,
    needsBehind: isEffect(entry) && entry.needsBehind,
    unique: !isEffect(entry) && entry.usage.unique,
    seasonUnique: !isEffect(entry) && entry.usage.seasonUnique,
  };
}

/**
 * A registry over a compiled set. `catalog` is the season's rows; without
 * one every entry of the set is attached with its own defaults — the fixture
 * registry tests and tools use. `art` says how each entry is drawn (§12).
 */
export function buildRegistry(
  set: CompiledSet,
  catalog?: readonly SeasonCatalogEntry[],
  art: (entryId: string) => EntryArt = () => NO_ART,
): SeasonRegistry {
  const facts = new Map(set.entries.map((e) => [e.entryId, factsOf(e)]));
  const resolve = (entryId: string) => facts.get(entryId) ?? null;
  const rows = new Map<string, SeasonCatalogEntry>(
    catalog
      ? catalog.map((r) => [r.entryId, r])
      : set.entries.map((e) => [e.entryId, defaultCatalogEntry(e)]),
  );
  // A key or an entry id names what the season attaches; a revision id also
  // reaches the revisions live instances hold.
  const get = (ref: string) => {
    const named = set.byKey.get(ref) ?? set.byEntryId.get(ref);
    if (named) return rows.has(named.entryId) ? named : null;
    return set.byRevisionId.get(ref) ?? null;
  };
  // A row whose revision did not compile is not played (the set reports why).
  const attached = set.entries.filter((e) => rows.has(e.entryId));
  const items = attached.filter(isItem);
  const effects = attached.filter(isEffect);
  const tuningOf = (entry: CompiledEntry) => entryTuning(rows.get(entry.entryId));
  const view = (entry: CompiledEntry) => entryView(entry, resolve, tuningOf(entry), art(entry.entryId));

  return {
    set,
    get,
    item: (ref) => {
      const e = get(ref);
      return e && isItem(e) ? e : null;
    },
    effect: (ref) => {
      const e = get(ref);
      return e && isEffect(e) ? e : null;
    },
    items: () => items,
    effects: () => effects,
    facts: resolve,
    tuning: (entryId) => rows.get(entryId) ?? null,
    candidates: () => attached.map((e) => catalogCandidate(catalogSubject(e), rows.get(e.entryId)!)),
    entryConfigs: () => Object.fromEntries(attached.map((e) => [e.key, catalogEntryConfig(rows.get(e.entryId)!)])),
    pool: () => Object.fromEntries(attached.map((e) => [e.key, poolSlot(rows.get(e.entryId)!)])),
    defaults: () => Object.fromEntries(attached.map((e) => [e.key, e.defaults])),
    start: (entry) => instanceStart(entry, tuningOf(entry)),
    view,
    views: () => attached.map(view),
    viewsByKey: () => Object.fromEntries(attached.map((e) => [e.key, view(e)])),
    instanceView: (revisionId) => {
      const entry = set.byRevisionId.get(revisionId);
      return entry ? view(entry) : null;
    },
  };
}

// ---------------------------------------------------------------------------
// Compiled sets, by the revisions they hold
// ---------------------------------------------------------------------------

const CACHE_LIMIT = 64;
const compiled = new Map<string, CompiledSet>();

/** Compiles a load set once per process; least recently used sets go first. */
export function compileCached(members: readonly SetMemberInput[], older: readonly SetMemberInput[] = []): CompiledSet {
  const ids = (list: readonly SetMemberInput[]) => list.map((m) => m.revisionId).sort().join(",");
  const key = `${ids(members)}|${ids(older)}`;
  const hit = compiled.get(key);
  if (hit) {
    compiled.delete(key);
    compiled.set(key, hit);
    return hit;
  }
  const set = compileSet(members, older);
  compiled.set(key, set);
  if (compiled.size > CACHE_LIMIT) compiled.delete(compiled.keys().next().value!);
  return set;
}

/** The registry of a loaded play set — pure apart from the compile cache. */
export function registryFromPlaySet(play: PlaySet): SeasonRegistry {
  const members = play.catalog.map((c) => ({ entryId: c.row.entryId, revisionId: c.row.revisionId, doc: c.doc }));
  const set = compileCached(members, play.held);
  return buildRegistry(
    set,
    play.catalog.map((c) => c.row),
    (entryId) => play.art[entryId] ?? NO_ART,
  );
}

/** The registry a season plays: its catalog and the revisions its live instances hold. */
export async function getSeasonRegistry(seasonId: string): Promise<SeasonRegistry> {
  return registryFromPlaySet(await loadPlaySet(seasonId));
}

let core: SeasonRegistry | null = null;

/**
 * The system pack's fixture with every entry attached at its defaults —
 * for tests and tools that run without a database. Seasons play their
 * catalog (`getSeasonRegistry`).
 */
export function coreRegistry(): SeasonRegistry {
  core ??= buildRegistry(compileSet(CORE_DOCS), undefined, () => CORE_ART);
  return core;
}

/** The system pack draws with the artwork shipped in `public/iee`; it has no icons of its own. */
const CORE_ART: EntryArt = { iconUrl: null, packIconUrl: null, system: true };
