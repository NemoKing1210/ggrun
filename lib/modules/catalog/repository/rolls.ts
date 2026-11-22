import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { gameRolls, gamesCatalog, type CatalogGame, type GameRoll } from "@/db/schema";

/** A new open roll — inside the caller's transaction when it passes one. */
export async function createRoll(seasonPlayerId: string, gameId: string | null, tx: Pick<typeof db, "insert"> = db): Promise<GameRoll> {
  const [created] = await tx.insert(gameRolls).values({ seasonPlayerId, gameId, status: "rolled" }).returning();
  return created!;
}

type RollWriter = Pick<typeof db, "update">;

/**
 * Ends the roll in flight as rerolled, inside the caller's transaction — set
 * aside until the player's `roll_seq` reaches `postponedUntilSeq`, when one is
 * given (wave C, `postponeGame`, IEE spec §6.16). False when it was no longer
 * in flight: the guard is the UPDATE.
 */
export async function endRollInFlight(tx: RollWriter, rollId: string, postponedUntilSeq: number | null): Promise<boolean> {
  const ended = await tx
    .update(gameRolls)
    .set({ status: "rerolled", resolvedAt: new Date(), postponedUntilSeq })
    .where(and(eq(gameRolls.id, rollId), or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")), isNull(gameRolls.resolvedAt)))
    .returning({ id: gameRolls.id });
  return ended.length > 0;
}

/**
 * The oldest game a participant set aside that is due by their roll counter
 * (spec §6.16, §7.12 step 1) — their next game, as it is — and the set-asides
 * that will never come back: a blacklisted game, a game gone from the catalog.
 */
export async function dueSetAside(seasonPlayerId: string, rollSeq: number): Promise<{ due: { rollId: string; game: CatalogGame } | null; dropped: string[] }> {
  const rows = await db
    .select({ rollId: gameRolls.id, game: gamesCatalog })
    .from(gameRolls)
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(and(eq(gameRolls.seasonPlayerId, seasonPlayerId), lte(gameRolls.postponedUntilSeq, rollSeq)))
    .orderBy(asc(gameRolls.postponedUntilSeq), asc(gameRolls.rolledAt));
  const dropped = rows.filter((r) => !r.game || r.game.isBlacklisted).map((r) => r.rollId);
  const due = rows.find((r) => r.game && !r.game.isBlacklisted);
  return { due: due ? { rollId: due.rollId, game: due.game! } : null, dropped };
}

/**
 * A set-aside game comes back (spec §6.16): its own roll, open again from now.
 * Null when it is not set aside any more — the guard is the UPDATE.
 */
export async function reopenSetAside(tx: RollWriter, rollId: string): Promise<GameRoll | null> {
  const [reopened] = await tx
    .update(gameRolls)
    .set({ status: "rolled", resolvedAt: null, rolledAt: new Date(), postponedUntilSeq: null })
    .where(and(eq(gameRolls.id, rollId), eq(gameRolls.status, "rerolled"), isNotNull(gameRolls.postponedUntilSeq)))
    .returning();
  return reopened ?? null;
}

/** Set-asides that will not come back — their game is blacklisted or gone (spec §6.16). */
export async function dropSetAsides(tx: RollWriter, rollIds: readonly string[]): Promise<void> {
  if (rollIds.length === 0) return;
  await tx.update(gameRolls).set({ postponedUntilSeq: null }).where(inArray(gameRolls.id, [...rollIds]));
}

export async function getOpenRoll(
  seasonPlayerId: string,
): Promise<(GameRoll & { game: CatalogGame | null }) | null> {
  const rows = await db
    .select({ roll: gameRolls, game: gamesCatalog })
    .from(gameRolls)
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(and(eq(gameRolls.seasonPlayerId, seasonPlayerId), or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")), isNull(gameRolls.resolvedAt)))
    .orderBy(sql`${gameRolls.rolledAt} desc`)
    .limit(1);
  const row = rows[0];
  return row ? { ...row.roll, game: row.game } : null;
}

export async function updateRollStatus(rollId: string, status: GameRoll["status"]): Promise<void> {
  const patch: Partial<GameRoll> = { status };
  if (status !== "rolled" && status !== "in_progress") patch.resolvedAt = new Date();
  await db.update(gameRolls).set(patch).where(eq(gameRolls.id, rollId));
}

export async function countRerollsForGame(seasonPlayerId: string, gameId: string | null): Promise<number> {
  if (!gameId) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gameRolls)
    .where(and(eq(gameRolls.seasonPlayerId, seasonPlayerId), eq(gameRolls.gameId, gameId), eq(gameRolls.status, "rerolled")));
  return rows[0]?.n ?? 0;
}

export async function getRecentRolls(
  seasonPlayerId: string,
  limit = 10,
): Promise<Array<GameRoll & { game: CatalogGame | null }>> {
  const rows = await db
    .select({ roll: gameRolls, game: gamesCatalog })
    .from(gameRolls)
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(gameRolls.seasonPlayerId, seasonPlayerId))
    .orderBy(desc(gameRolls.rolledAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.roll, game: r.game }));
}
