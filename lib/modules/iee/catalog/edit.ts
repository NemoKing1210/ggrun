/**
 * Editing a season's catalog in the wizard — pure, so the client and the
 * tests share it. The server re-checks everything on save (`normalize.ts`).
 *
 * The switch on an entry means "drops from the wheel". Attaching an entry
 * attaches what its revision hands out, disabled: it plays when handed out
 * and does not drop. Switching an entry off detaches it — unless something
 * attached hands it out, in which case it stays, disabled. A disabled entry
 * nothing hands out any more is detached with it.
 *
 * No database here: the client imports this file directly.
 */
import { defaultCatalogEntry, HANDOUT_TAG, type SeasonCatalogEntry } from "@/lib/engine";

import type { LibraryOption, RevisionOption } from "./views";

export type OptionIndex = ReadonlyMap<string, LibraryOption>;

export function indexOptions(options: readonly LibraryOption[]): OptionIndex {
  return new Map(options.map((o) => [o.entryId, o]));
}

function revisionOf(index: OptionIndex, entryId: string, revisionId: string): RevisionOption | undefined {
  return index.get(entryId)?.revisions.find((r) => r.revisionId === revisionId);
}

/** A fresh row at the entry's latest revision, with that revision's pool and weight. */
export function newRow(index: OptionIndex, entryId: string, over: Partial<SeasonCatalogEntry> = {}): SeasonCatalogEntry | null {
  const option = index.get(entryId);
  const revisionId = over.revisionId ?? option?.latestRevisionId;
  const view = revisionId ? revisionOf(index, entryId, revisionId)?.view : null;
  if (!option || !revisionId || !view) return null;
  return defaultCatalogEntry({ entryId, revisionId, character: view.character, rarity: view.rarity }, over);
}

/**
 * Whether an option's latest revision plays only when another entry hands it
 * out (tag `handout`, spec §6.6): the presets leave it for `closeOver`, which
 * attaches it disabled with whatever hands it out.
 */
export function isHandout(option: LibraryOption): boolean {
  const latest = option.revisions.find((r) => r.revisionId === option.latestRevisionId);
  return latest?.view?.tags.includes(HANDOUT_TAG) ?? false;
}

/** Entry ids whose pinned revision hands out `entryId`. */
export function requiredBy(rows: readonly SeasonCatalogEntry[], index: OptionIndex, entryId: string): string[] {
  return rows
    .filter((r) => r.entryId !== entryId && revisionOf(index, r.entryId, r.revisionId)?.references.includes(entryId))
    .map((r) => r.entryId);
}

/** Adds, disabled, everything an attached revision references and the season lacks. */
export function closeOver(rows: readonly SeasonCatalogEntry[], index: OptionIndex): SeasonCatalogEntry[] {
  const out = [...rows];
  const have = new Set(out.map((r) => r.entryId));
  for (let i = 0; i < out.length; i++) {
    for (const ref of revisionOf(index, out[i]!.entryId, out[i]!.revisionId)?.references ?? []) {
      if (have.has(ref)) continue;
      const row = newRow(index, ref, { enabled: false });
      if (!row) continue; // unknown here: the server says so on save
      out.push(row);
      have.add(ref);
    }
  }
  return out;
}

/** Detaches disabled rows that nothing attached hands out any more. */
export function pruneOrphans(rows: readonly SeasonCatalogEntry[], index: OptionIndex): SeasonCatalogEntry[] {
  let out = [...rows];
  for (;;) {
    const next = out.filter((r) => r.enabled || requiredBy(out, index, r.entryId).length > 0);
    if (next.length === out.length) return out;
    out = next;
  }
}

/** Switches an entry on: attached at its latest revision if it was not, enabled either way. */
export function attachEntry(
  rows: readonly SeasonCatalogEntry[],
  index: OptionIndex,
  entryId: string,
  over: Partial<SeasonCatalogEntry> = {},
): SeasonCatalogEntry[] {
  const existing = rows.find((r) => r.entryId === entryId);
  if (existing) {
    return closeOver(rows.map((r) => (r.entryId === entryId ? { ...r, ...over, enabled: true } : r)), index);
  }
  const row = newRow(index, entryId, { ...over, enabled: true });
  return row ? closeOver([...rows, row], index) : [...rows];
}

/** Switches an entry off: detached, or kept disabled while something hands it out. */
export function detachEntry(rows: readonly SeasonCatalogEntry[], index: OptionIndex, entryId: string): SeasonCatalogEntry[] {
  const kept =
    requiredBy(rows, index, entryId).length > 0
      ? rows.map((r) => (r.entryId === entryId ? { ...r, enabled: false } : r))
      : rows.filter((r) => r.entryId !== entryId);
  return pruneOrphans(kept, index);
}

/** Pins another revision of an attached entry; what it references follows. */
export function pinRevision(
  rows: readonly SeasonCatalogEntry[],
  index: OptionIndex,
  entryId: string,
  revisionId: string,
): SeasonCatalogEntry[] {
  if (!revisionOf(index, entryId, revisionId)?.view) return [...rows];
  const next = rows.map((r) => (r.entryId === entryId ? { ...r, revisionId } : r));
  return pruneOrphans(closeOver(next, index), index);
}

/** Changes the tuning of an attached entry. */
export function tuneEntry(
  rows: readonly SeasonCatalogEntry[],
  entryId: string,
  patch: Partial<Omit<SeasonCatalogEntry, "entryId" | "revisionId">>,
): SeasonCatalogEntry[] {
  return rows.map((r) => (r.entryId === entryId ? { ...r, ...patch } : r));
}
