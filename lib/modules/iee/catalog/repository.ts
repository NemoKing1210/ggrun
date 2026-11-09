/**
 * Reads of the season catalog — what a season plays (spec §8: its catalog
 * plus every revision its live instances still hold) and where an entry is
 * used. Writes go through `store.ts`.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { ieeEntryRevisions, ieeInstances, seasonCatalog } from "@/db/schema";
import type { EntryArt, SeasonCatalogEntry } from "@/lib/engine";

import { loadEntryArt } from "./art";
import { toCatalogEntry, type Tx } from "./store";

export interface PlaySet {
  /** The season's catalog rows with the documents of their revisions. */
  catalog: { row: SeasonCatalogEntry; doc: unknown }[];
  /** Revisions only live instances hold — granted before the season switched (§8). */
  held: { entryId: string; revisionId: string; doc: unknown }[];
  /** How each of those entries is drawn (§12), by entry id. */
  art: Record<string, EntryArt>;
}

/** Everything a season's registry compiles. Four reads at most. */
export async function loadPlaySet(seasonId: string, tx: Tx = db): Promise<PlaySet> {
  const catalog = await tx
    .select({ row: seasonCatalog, doc: ieeEntryRevisions.doc })
    .from(seasonCatalog)
    .innerJoin(ieeEntryRevisions, eq(ieeEntryRevisions.id, seasonCatalog.revisionId))
    .where(eq(seasonCatalog.seasonId, seasonId));
  const pinned = catalog.map((c) => c.row.revisionId);
  const held = await tx
    .selectDistinct({ entryId: ieeEntryRevisions.entryId, revisionId: ieeEntryRevisions.id, doc: ieeEntryRevisions.doc })
    .from(ieeInstances)
    .innerJoin(ieeEntryRevisions, eq(ieeEntryRevisions.id, ieeInstances.revisionId))
    .where(
      and(
        eq(ieeInstances.seasonId, seasonId),
        eq(ieeInstances.status, "active"),
        ...(pinned.length > 0 ? [notInArray(ieeInstances.revisionId, pinned)] : []),
      ),
    );
  const art = await loadEntryArt([...catalog.map((c) => c.row.entryId), ...held.map((h) => h.entryId)], tx);
  return {
    catalog: catalog.map((c) => ({ row: toCatalogEntry(c.row), doc: c.doc })),
    held,
    art,
  };
}

/** The revisions a season's live instances hold — what they hand out must stay attached. */
export async function heldRevisionIds(seasonId: string, tx: Tx = db): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ revisionId: ieeInstances.revisionId })
    .from(ieeInstances)
    .where(and(eq(ieeInstances.seasonId, seasonId), eq(ieeInstances.status, "active")));
  return rows.map((r) => r.revisionId);
}

/** How many seasons attach each entry, by entry id. */
export async function catalogUsageByEntry(tx: Tx = db): Promise<Record<string, number>> {
  const rows = await tx
    .select({ entryId: seasonCatalog.entryId, n: sql<number>`count(*)::int` })
    .from(seasonCatalog)
    .groupBy(seasonCatalog.entryId);
  return Object.fromEntries(rows.map((r) => [r.entryId, Number(r.n)]));
}

/** Which seasons attach the given entries, at which revision — the library's screens show it. */
export async function catalogRowsOf(
  entryIds: readonly string[],
  tx: Tx = db,
): Promise<{ seasonId: string; entryId: string; revisionId: string; enabled: boolean }[]> {
  if (entryIds.length === 0) return [];
  return tx
    .select({
      seasonId: seasonCatalog.seasonId,
      entryId: seasonCatalog.entryId,
      revisionId: seasonCatalog.revisionId,
      enabled: seasonCatalog.enabled,
    })
    .from(seasonCatalog)
    .where(inArray(seasonCatalog.entryId, [...entryIds]));
}
