import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { gameRolls, gamesCatalog, type CatalogGame, type GameRoll } from "@/db/schema";

export async function createRoll(seasonPlayerId: string, gameId: string | null): Promise<GameRoll> {
  const [created] = await db.insert(gameRolls).values({ seasonPlayerId, gameId, status: "rolled" }).returning();
  return created!;
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
