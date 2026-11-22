/**
 * A season's catalog — which revision of which entry it plays, and its tuning
 * (docs/IEE_CONSTRUCTOR_SPEC.md §4.2). This file is the only code that writes
 * `season_catalog`; an architecture test holds it to that.
 *
 * Behind an interface, like the library's store, so the rules around it — the
 * wizard's checks, dependencies, the audit diff — are tested in memory.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { seasonCatalog, type SeasonCatalogRow } from "@/db/schema";
import type { IeeParams, ItemTarget, SeasonCatalogEntry } from "@/lib/engine";

export type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SeasonCatalogStore {
  /** The season's rows, in no particular order. */
  rows(seasonId: string): Promise<SeasonCatalogEntry[]>;
  insert(seasonId: string, rows: readonly SeasonCatalogEntry[]): Promise<void>;
  update(seasonId: string, row: SeasonCatalogEntry): Promise<void>;
  remove(seasonId: string, entryIds: readonly string[]): Promise<void>;
}

/** A stored row as the engine reads it. */
export function toCatalogEntry(row: SeasonCatalogRow): SeasonCatalogEntry {
  return {
    entryId: row.entryId,
    revisionId: row.revisionId,
    enabled: row.enabled,
    pool: row.pool,
    rarity: row.rarity,
    weight: row.weight,
    maxPerSeason: row.maxPerSeason,
    maxPerPlayer: row.maxPerPlayer,
    cooldownRolls: row.cooldownRolls,
    minPosition: row.minPosition,
    unlockAfterMove: row.unlockAfterMove,
    paramOverrides: (row.paramOverrides ?? {}) as IeeParams,
    durationOverride: row.durationOverride,
    targetOverride: (row.targetOverride ?? null) as ItemTarget | null,
  };
}

function values(seasonId: string, row: SeasonCatalogEntry) {
  return {
    seasonId,
    entryId: row.entryId,
    revisionId: row.revisionId,
    enabled: row.enabled,
    pool: row.pool,
    rarity: row.rarity,
    weight: row.weight,
    maxPerSeason: row.maxPerSeason,
    maxPerPlayer: row.maxPerPlayer,
    cooldownRolls: row.cooldownRolls,
    minPosition: row.minPosition,
    unlockAfterMove: row.unlockAfterMove,
    paramOverrides: row.paramOverrides,
    durationOverride: row.durationOverride,
    targetOverride: row.targetOverride,
  };
}

export function pgSeasonCatalogStore(tx: Tx): SeasonCatalogStore {
  return {
    async rows(seasonId) {
      const rows = await tx.select().from(seasonCatalog).where(eq(seasonCatalog.seasonId, seasonId));
      return rows.map(toCatalogEntry);
    },
    async insert(seasonId, rows) {
      if (rows.length === 0) return;
      await tx.insert(seasonCatalog).values(rows.map((r) => values(seasonId, r)));
    },
    async update(seasonId, row) {
      const { seasonId: _season, entryId: _entry, ...patch } = values(seasonId, row);
      await tx
        .update(seasonCatalog)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(seasonCatalog.seasonId, seasonId), eq(seasonCatalog.entryId, row.entryId)));
    },
    async remove(seasonId, entryIds) {
      if (entryIds.length === 0) return;
      await tx
        .delete(seasonCatalog)
        .where(and(eq(seasonCatalog.seasonId, seasonId), inArray(seasonCatalog.entryId, [...entryIds])));
    },
  };
}
