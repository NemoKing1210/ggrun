/**
 * The library as a season catalog sees it: every entry with a published
 * revision, its pack, and each revision's document and references
 * (docs/IEE_CONSTRUCTOR_SPEC.md §4.2, §10.3).
 *
 * Read-only; the library module writes these tables. Kept here rather than in
 * the library because the question is the season's — what may be attached,
 * and what an attached entry pulls in with it.
 */
import { asc } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { ieeEntries, ieeEntryRevisions, ieePacks } from "@/db/schema";
import type { EntryArt } from "@/lib/engine";
import { EntryDocSchema, upgradeDoc, type EntryDoc, type Localized } from "@/lib/engine/iee/dsl";

import { referencedEntries } from "../library/refs";
import { artOf, iconUrls } from "./art";
import type { Tx } from "./store";

export interface CatalogRevision {
  revisionId: string;
  entryId: string;
  /** 1, 2, … per entry on this installation. */
  number: number;
  /** The document upgraded to the current DSL; null when it no longer reads. */
  doc: EntryDoc | null;
  /** Entry ids its rules reference — attaching it attaches them (§10.3). */
  references: string[];
}

export interface CatalogEntryOption {
  entryId: string;
  slug: string;
  kind: "item" | "effect";
  pack: { id: string; slug: string; names: Localized; isSystem: boolean };
  /**
   * Offered to a season: the entry and its pack are not archived and the pack
   * is in the library (`draft` hides a pack from the wizard). An entry a season
   * already plays stays attached either way.
   */
  available: boolean;
  latestRevisionId: string;
  /** Oldest first. */
  revisions: CatalogRevision[];
  /** How it is drawn (§12). */
  art: EntryArt;
}

function readDoc(raw: unknown): EntryDoc | null {
  const upgraded = upgradeDoc(raw);
  if (!upgraded.ok) return null;
  const parsed = EntryDocSchema.safeParse(upgraded.doc);
  return parsed.success ? parsed.data : null;
}

/** Every entry that has a published revision, with its pack and revisions. */
export async function loadCatalogLibrary(tx: Tx = db): Promise<CatalogEntryOption[]> {
  const [packs, entries, revisions] = await Promise.all([
    tx.select().from(ieePacks),
    tx.select().from(ieeEntries).orderBy(asc(ieeEntries.slug)),
    tx
      .select({
        id: ieeEntryRevisions.id,
        entryId: ieeEntryRevisions.entryId,
        number: ieeEntryRevisions.number,
        doc: ieeEntryRevisions.doc,
      })
      .from(ieeEntryRevisions)
      .orderBy(asc(ieeEntryRevisions.number)),
  ]);
  const packById = new Map(packs.map((p) => [p.id, p]));
  const urls = await iconUrls(
    [...packs.map((p) => p.iconFileId), ...entries.map((e) => e.iconFileId)].filter((id): id is string => id !== null),
    tx,
  );
  const byEntry = new Map<string, CatalogRevision[]>();
  for (const r of revisions) {
    const list = byEntry.get(r.entryId) ?? [];
    list.push({ revisionId: r.id, entryId: r.entryId, number: r.number, doc: readDoc(r.doc), references: referencedEntries(r.doc) });
    byEntry.set(r.entryId, list);
  }
  const out: CatalogEntryOption[] = [];
  for (const e of entries) {
    const pack = packById.get(e.packId);
    const list = byEntry.get(e.id);
    if (!pack || !list || list.length === 0 || !e.latestRevisionId) continue;
    out.push({
      entryId: e.id,
      slug: e.slug,
      kind: e.kind,
      pack: { id: pack.id, slug: pack.slug, names: pack.names as Localized, isSystem: pack.isSystem },
      available: e.archivedAt === null && pack.archivedAt === null && pack.visibility === "library",
      latestRevisionId: e.latestRevisionId,
      revisions: list,
      art: artOf({ entryIconFileId: e.iconFileId, packIconFileId: pack.iconFileId, system: pack.isSystem }, urls),
    });
  }
  return out;
}
