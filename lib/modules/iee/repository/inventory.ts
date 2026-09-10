import { and, desc, eq, gt, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { playerInventory, type PlayerInventoryRow } from "@/db/schema";
import type { IeeParams } from "@/lib/engine";

export type GrantItemInput = {
  seasonId: string;
  seasonPlayerId: string;
  itemKey: string;
  params: IeeParams;
  charges: number;
  source: string;
  sourceMoveId?: string | null;
  /** Season-wide resolved-roll counter at grant time (cooldown clock). */
  seasonRollSeq: number;
};

/** Transaction handle or the pool — every write here is callable inside a tx. */
type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function grantItem(
  input: GrantItemInput,
  tx: Db = db,
): Promise<PlayerInventoryRow> {
  const [row] = await tx
    .insert(playerInventory)
    .values({
      seasonId: input.seasonId,
      seasonPlayerId: input.seasonPlayerId,
      itemKey: input.itemKey,
      params: input.params,
      chargesLeft: input.charges,
      source: input.source,
      sourceMoveId: input.sourceMoveId ?? null,
      seasonRollSeq: input.seasonRollSeq,
    })
    .returning();
  return row!;
}

/** Items the player can still act on. */
export async function getHeldItems(
  seasonPlayerId: string,
): Promise<PlayerInventoryRow[]> {
  return db
    .select()
    .from(playerInventory)
    .where(
      and(
        eq(playerInventory.seasonPlayerId, seasonPlayerId),
        eq(playerInventory.state, "held"),
      ),
    )
    .orderBy(desc(playerInventory.acquiredAt));
}

export async function countHeldItems(seasonPlayerId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playerInventory)
    .where(
      and(
        eq(playerInventory.seasonPlayerId, seasonPlayerId),
        eq(playerInventory.state, "held"),
      ),
    );
  return rows[0]?.n ?? 0;
}

export async function getInventoryItem(
  id: string,
): Promise<PlayerInventoryRow | null> {
  const rows = await db
    .select()
    .from(playerInventory)
    .where(eq(playerInventory.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Spends one charge, guarded by the row's own state.
 *
 * The guard lives in the WHERE clause rather than in a preceding SELECT, so a
 * double-submitted form spends exactly one charge: the second statement
 * matches nothing and returns null. Never read-then-write here.
 */
export async function consumeItemCharge(
  id: string,
  tx: Db = db,
): Promise<PlayerInventoryRow | null> {
  const [row] = await tx
    .update(playerInventory)
    .set({
      chargesLeft: sql`${playerInventory.chargesLeft} - 1`,
      usedAt: new Date(),
    })
    .where(
      and(
        eq(playerInventory.id, id),
        eq(playerInventory.state, "held"),
        gt(playerInventory.chargesLeft, 0),
      ),
    )
    .returning();
  if (!row) return null;
  if (row.chargesLeft > 0) return row;

  // Spent. Kept as a second statement rather than a CASE expression so the
  // enum value stays type-checked by drizzle instead of a raw ::cast that a
  // rename would silently break. Callers run this inside a transaction.
  await tx
    .update(playerInventory)
    .set({ state: "used" })
    .where(eq(playerInventory.id, id));
  return { ...row, state: "used" };
}

/** Staff takeback. Always paired with an audit entry by the caller. */
export async function revokeItem(id: string, tx: Db = db): Promise<boolean> {
  const rows = await tx
    .update(playerInventory)
    .set({ state: "revoked" })
    .where(and(eq(playerInventory.id, id), eq(playerInventory.state, "held")))
    .returning({ id: playerInventory.id });
  return rows.length > 0;
}

/** Drops of each item key across the whole season — feeds `maxPerSeason`. */
export async function countItemsPerSeason(
  seasonId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: playerInventory.itemKey, n: sql<number>`count(*)::int` })
    .from(playerInventory)
    .where(eq(playerInventory.seasonId, seasonId))
    .groupBy(playerInventory.itemKey);
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

/** Drops of each item key to one participant — feeds `maxPerPlayer`. */
export async function countItemsPerPlayer(
  seasonPlayerId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ key: playerInventory.itemKey, n: sql<number>`count(*)::int` })
    .from(playerInventory)
    .where(eq(playerInventory.seasonPlayerId, seasonPlayerId))
    .groupBy(playerInventory.itemKey);
  return Object.fromEntries(rows.map((r) => [r.key, r.n]));
}

/**
 * Season roll sequence at which each item key last dropped — feeds cooldowns.
 * Uses the granting player's `roll_seq` at grant time via the move it came
 * from; falls back to 0 for admin grants that have no move.
 */
export async function lastItemDropSeq(
  seasonId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      key: playerInventory.itemKey,
      seq: sql<number>`coalesce(max(${playerInventory.seasonRollSeq}), 0)::int`,
    })
    .from(playerInventory)
    .where(eq(playerInventory.seasonId, seasonId))
    .groupBy(playerInventory.itemKey);
  return Object.fromEntries(rows.map((r) => [r.key, r.seq]));
}

/** Held items across a season, for the staff intervention panel. */
export async function getHeldItemsBySeason(
  seasonId: string,
): Promise<Array<{ id: string; seasonPlayerId: string; itemKey: string; chargesLeft: number }>> {
  return db
    .select({
      id: playerInventory.id,
      seasonPlayerId: playerInventory.seasonPlayerId,
      itemKey: playerInventory.itemKey,
      chargesLeft: playerInventory.chargesLeft,
    })
    .from(playerInventory)
    .where(and(eq(playerInventory.seasonId, seasonId), eq(playerInventory.state, "held")))
    .orderBy(desc(playerInventory.acquiredAt));
}
