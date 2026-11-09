/**
 * What a season's catalog may hold (docs/IEE_CONSTRUCTOR_SPEC.md §4.2, §10.3)
 * — the checks the wizard's submission goes through before it is stored.
 *
 * Pure: the library is passed in. An attached entry pulls in the entries its
 * revision references, attached but disabled (they play when handed out, they
 * do not drop) — a grant must never point at an entry the season does not
 * load. Keys are unique in a season, because the wheel, the feed and the
 * artwork know an entry by its key.
 */
import {
  defaultCatalogEntry,
  SeasonCatalogSchema,
  type SeasonCatalogEntry,
} from "@/lib/engine";
import { AdminError } from "@/lib/modules/season/service/errors";

import type { CatalogEntryOption, CatalogRevision } from "./library";

/** A revision whose document reads. */
type ReadableRevision = CatalogRevision & { doc: NonNullable<CatalogRevision["doc"]> };

const readable = (revision: CatalogRevision | undefined): revision is ReadableRevision => Boolean(revision?.doc);

export interface NormalizedCatalog {
  rows: SeasonCatalogEntry[];
  /** Entries attached because an attached entry references them. */
  dependencies: string[];
}

const invalid = (reason: string) => new AdminError("ieeCatalogInvalid", { reason });

/**
 * Checks a submitted catalog against the library and closes it over the
 * references. `current` is what the season holds now: an entry it already
 * plays may stay attached after its pack is archived or hidden; it just
 * cannot be attached anew.
 *
 * `requiredSlugs` are keys the season hands out by key — its challenge
 * rewards. An entry with that key is attached, disabled, when none is; a key
 * the library does not offer is left to the reward's own check.
 *
 * `heldRevisions` are the revisions the season's live instances hold. What
 * they hand out stays attached, disabled, even after the season pins a newer
 * revision that no longer does: an instance granted earlier must keep
 * compiling (spec §8). Such an entry is kept even if its pack was archived
 * since — keeping it is not a new choice.
 */
export function normalizeCatalog(
  draft: unknown,
  library: readonly CatalogEntryOption[],
  current: readonly SeasonCatalogEntry[],
  options: { requiredSlugs?: readonly string[]; heldRevisions?: readonly string[] } = {},
): NormalizedCatalog {
  const parsed = SeasonCatalogSchema.safeParse(draft);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    throw invalid(`${first.path.join(".") || "(root)"}: ${first.message}`);
  }
  const byId = new Map(library.map((e) => [e.entryId, e]));
  const held = new Set(current.map((r) => r.entryId));
  const rows = new Map<string, SeasonCatalogEntry>();

  const revisionOf = (entry: CatalogEntryOption, revisionId: string): CatalogRevision | undefined =>
    entry.revisions.find((r) => r.revisionId === revisionId);

  for (const row of parsed.data) {
    const entry = byId.get(row.entryId);
    if (!entry) throw new AdminError("ieeEntryNotFound");
    if (rows.has(row.entryId)) throw invalid(`${entry.slug} appears twice`);
    if (!entry.available && !held.has(row.entryId)) throw new AdminError("ieeCatalogUnavailable", { slug: entry.slug });
    const revision = revisionOf(entry, row.revisionId);
    if (!revision) throw invalid(`${entry.slug}: the revision is not this entry's`);
    if (!revision.doc) throw invalid(`${entry.slug}: revision ${revision.number} no longer reads`);
    rows.set(row.entryId, row);
  }

  const dependencies: string[] = [];
  const attachDisabled = (target: CatalogEntryOption, latest: ReadableRevision) => {
    const added = defaultCatalogEntry(
      { entryId: target.entryId, revisionId: latest.revisionId, character: latest.doc.character, rarity: latest.doc.rarity },
      { enabled: false },
    );
    rows.set(target.entryId, added);
    dependencies.push(target.entryId);
    return added;
  };

  // Keys the season hands out by key (challenge rewards): one entry with each.
  const attachedSlugs = () => new Set([...rows.keys()].map((id) => byId.get(id)!.slug));
  for (const slug of options.requiredSlugs ?? []) {
    if (attachedSlugs().has(slug)) continue;
    // The system pack first, then the library's order.
    const candidates = library
      .filter((e) => e.slug === slug && e.available)
      .sort((a, b) => Number(b.pack.isSystem) - Number(a.pack.isSystem));
    for (const target of candidates) {
      const latest = revisionOf(target, target.latestRevisionId);
      if (readable(latest)) {
        attachDisabled(target, latest);
        break;
      }
    }
  }

  // What the revisions live instances hold hand out stays playable.
  const revisionsById = new Map(library.flatMap((e) => e.revisions.map((r) => [r.revisionId, r] as const)));
  for (const revisionId of options.heldRevisions ?? []) {
    for (const ref of revisionsById.get(revisionId)?.references ?? []) {
      const target = byId.get(ref);
      const latest = target ? revisionOf(target, target.latestRevisionId) : undefined;
      if (rows.has(ref) || !target || !readable(latest)) continue;
      attachDisabled(target, latest);
    }
  }

  // Close over references: what an attached revision hands out comes along,
  // disabled, at its latest revision — and what that one references, in turn.
  const queue = [...rows.values()];
  while (queue.length > 0) {
    const row = queue.shift()!;
    const entry = byId.get(row.entryId)!;
    for (const ref of revisionOf(entry, row.revisionId)!.references) {
      if (rows.has(ref)) continue;
      const target = byId.get(ref);
      const latest = target ? revisionOf(target, target.latestRevisionId) : undefined;
      if (!target || !readable(latest) || (!target.available && !held.has(ref))) {
        throw new AdminError("ieeCatalogMissingDependency", { slug: target?.slug ?? ref, by: entry.slug });
      }
      queue.push(attachDisabled(target, latest));
    }
  }

  const seen = new Map<string, string>();
  for (const row of rows.values()) {
    const slug = byId.get(row.entryId)!.slug;
    if (seen.has(slug)) throw new AdminError("ieeCatalogDuplicateSlug", { slug });
    seen.set(slug, row.entryId);
  }

  return { rows: [...rows.values()], dependencies };
}

export interface CatalogDiff {
  attached: string[];
  detached: string[];
  /** Entries whose pinned revision changed. */
  switched: { entryId: string; from: string; to: string }[];
  /** Entries whose tuning changed. */
  retuned: string[];
}

const TUNING_KEYS = [
  "enabled",
  "pool",
  "rarity",
  "weight",
  "maxPerSeason",
  "maxPerPlayer",
  "cooldownRolls",
  "minPosition",
  "unlockAfterMove",
  "paramOverrides",
  "durationOverride",
  "targetOverride",
] as const satisfies readonly (keyof SeasonCatalogEntry)[];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function sortedObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]));
}

/** What changed between the stored catalog and the next one. */
export function catalogDiff(before: readonly SeasonCatalogEntry[], after: readonly SeasonCatalogEntry[]): CatalogDiff {
  const old = new Map(before.map((r) => [r.entryId, r]));
  const next = new Map(after.map((r) => [r.entryId, r]));
  const diff: CatalogDiff = { attached: [], detached: [], switched: [], retuned: [] };
  for (const [id, row] of next) {
    const prev = old.get(id);
    if (!prev) {
      diff.attached.push(id);
      continue;
    }
    if (prev.revisionId !== row.revisionId) diff.switched.push({ entryId: id, from: prev.revisionId, to: row.revisionId });
    const changed = TUNING_KEYS.some((k) =>
      k === "paramOverrides"
        ? !same(sortedObject(prev.paramOverrides), sortedObject(row.paramOverrides))
        : !same(prev[k], row[k]),
    );
    if (changed) diff.retuned.push(id);
  }
  for (const id of old.keys()) if (!next.has(id)) diff.detached.push(id);
  return diff;
}

export const isEmptyDiff = (d: CatalogDiff) =>
  d.attached.length + d.detached.length + d.switched.length + d.retuned.length === 0;
