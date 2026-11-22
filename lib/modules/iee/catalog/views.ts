/**
 * Library entries as the admin surfaces show them: every revision compiled
 * into its client view (spec §8), with its power (spec §14). The season
 * wizard lists them to attach, the catalog page to browse.
 *
 * Each revision is compiled on its own against the latest revision of every
 * entry — the library holds several packs, so keys may repeat across them and
 * a whole-library set would refuse that; a season's set never does.
 */
import type { EntryView, IeeLocaleText } from "@/lib/engine";
import {
  checkEntry,
  compileEntry,
  entryPower,
  entryView,
  fillLocales,
  powerTable,
  type EntryDoc,
  type EntryFacts,
} from "@/lib/engine/iee/dsl";

import type { CatalogEntryOption } from "./library";

export interface RevisionOption {
  revisionId: string;
  number: number;
  /** Null when the revision no longer compiles — it cannot be attached. */
  view: EntryView | null;
  /** Entry ids its rules reference; attaching it attaches them. */
  references: string[];
  /** Rough strength (spec §14) — the wizard warns above the season's ceiling. */
  power: number | null;
}

/** A library entry the season wizard can attach. Serializable. */
export interface LibraryOption {
  entryId: string;
  key: string;
  kind: "item" | "effect";
  pack: { id: string; slug: string; name: IeeLocaleText; system: boolean };
  /** Offered to new attachments; an attached entry stays either way. */
  available: boolean;
  latestRevisionId: string;
  /** Oldest first. */
  revisions: RevisionOption[];
}

/** What references resolve to: each entry's latest revision. */
export function libraryFacts(library: readonly CatalogEntryOption[]): Map<string, EntryFacts> {
  const facts = new Map<string, EntryFacts>();
  for (const e of library) {
    const doc = e.revisions.find((r) => r.revisionId === e.latestRevisionId)?.doc;
    if (doc) facts.set(e.entryId, { entryId: e.entryId, slug: doc.slug, kind: doc.kind, character: doc.character, tags: doc.tags, name: doc.name });
  }
  return facts;
}

/** Compiles every revision of the given entries into options for the wizard. */
export function libraryOptions(
  library: readonly CatalogEntryOption[],
  include: (entry: CatalogEntryOption) => boolean = () => true,
): LibraryOption[] {
  const facts = libraryFacts(library);
  const resolve = (entryId: string) => facts.get(entryId) ?? null;
  // A grant is worth what it hands out: its latest revision's power.
  const latest = new Map<string, EntryDoc>();
  for (const e of library) {
    const doc = e.revisions.find((r) => r.revisionId === e.latestRevisionId)?.doc;
    if (doc) latest.set(e.entryId, doc);
  }
  const powers = powerTable(latest, (ref) => facts.get(ref.entry) ?? null);
  const powerOf = (entryId: string) => powers.get(entryId) ?? null;
  return library.filter(include).map((e) => ({
    entryId: e.entryId,
    key: e.slug,
    kind: e.kind,
    pack: { id: e.pack.id, slug: e.pack.slug, name: fillLocales(e.pack.names), system: e.pack.isSystem },
    available: e.available,
    latestRevisionId: e.latestRevisionId,
    revisions: e.revisions.map((r): RevisionOption => {
      if (!r.doc) return { revisionId: r.revisionId, number: r.number, view: null, references: r.references, power: null };
      const checked = checkEntry(r.doc, { entryId: e.entryId, resolve, scenarios: false });
      if (!checked.doc || checked.errors.length > 0) {
        return { revisionId: r.revisionId, number: r.number, view: null, references: r.references, power: null };
      }
      const compiled = compileEntry({ entryId: e.entryId, revisionId: r.revisionId, doc: checked.doc, resolve });
      return {
        revisionId: r.revisionId,
        number: r.number,
        view: entryView(compiled, resolve, undefined, e.art),
        references: r.references,
        power: entryPower(checked.doc, { resolve: (ref) => facts.get(ref.entry) ?? null, powerOf }),
      };
    }),
  }));
}

/** The latest revision's view of each entry — what the catalog page browses. */
export function latestViews(options: readonly LibraryOption[]): EntryView[] {
  return options.flatMap((o) => {
    const view = o.revisions.find((r) => r.revisionId === o.latestRevisionId)?.view;
    return view ? [view] : [];
  });
}

export interface LibraryKeys {
  items: Record<string, IeeLocaleText>;
  effects: Record<string, IeeLocaleText>;
}

/**
 * Item and effect keys the library offers, with their names — a challenge
 * reward stores a key. Where packs share a key, the system pack names it.
 */
export function keysOf(library: readonly CatalogEntryOption[]): LibraryKeys {
  const out: LibraryKeys = { items: {}, effects: {} };
  const ordered = [...library].filter((e) => e.available).sort((a, b) => Number(b.pack.isSystem) - Number(a.pack.isSystem));
  for (const e of ordered) {
    const doc = e.revisions.find((r) => r.revisionId === e.latestRevisionId)?.doc;
    if (!doc) continue;
    const bucket = e.kind === "item" ? out.items : out.effects;
    bucket[e.slug] ??= fillLocales(doc.name);
  }
  return out;
}
