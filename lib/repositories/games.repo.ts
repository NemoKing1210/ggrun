import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { gameRolls, gamesCatalog, type CatalogGame, type GameRoll } from "@/db/schema";

export async function listCatalogGames(): Promise<CatalogGame[]> {
  return db.select().from(gamesCatalog).orderBy(gamesCatalog.title);
}

export async function addCatalogGame(game: {
  title: string;
  platform?: string | null;
  coverUrl?: string | null;
  genres?: string[];
}): Promise<CatalogGame> {
  const [created] = await db
    .insert(gamesCatalog)
    .values({
      title: game.title,
      platform: game.platform ?? null,
      coverUrl: game.coverUrl ?? null,
      genres: game.genres ?? [],
    })
    .returning();
  return created!;
}

export async function setGameBlacklisted(
  gameId: string,
  blacklisted: boolean,
): Promise<void> {
  await db
    .update(gamesCatalog)
    .set({ isBlacklisted: blacklisted })
    .where(eq(gamesCatalog.id, gameId));
}

export async function deleteCatalogGame(gameId: string): Promise<void> {
  await db.delete(gamesCatalog).where(eq(gamesCatalog.id, gameId));
}

/**
 * Picks a random game for a roll: excludes blacklisted games and games
 * already rolled for this player in the current season.
 */
export async function rollRandomGame(
  seasonPlayerId: string,
): Promise<CatalogGame | null> {
  const played = await db
    .select({ gameId: gameRolls.gameId })
    .from(gameRolls)
    .where(eq(gameRolls.seasonPlayerId, seasonPlayerId));
  const playedIds = played
    .map((r) => r.gameId)
    .filter((id): id is string => id !== null);

  const conditions = [
    eq(gamesCatalog.isBlacklisted, false),
    ...(playedIds.length > 0 ? [notInArray(gamesCatalog.id, playedIds)] : []),
  ];
  const candidates = await db
    .select()
    .from(gamesCatalog)
    .where(and(...conditions))
    .orderBy(sql`random()`)
    .limit(1);
  return candidates[0] ?? null;
}

export async function getGameById(id: string): Promise<CatalogGame | null> {
  const rows = await db
    .select()
    .from(gamesCatalog)
    .where(eq(gamesCatalog.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// --- Rolls ----------------------------------------------------------------

export async function createRoll(
  seasonPlayerId: string,
  gameId: string | null,
): Promise<GameRoll> {
  const [created] = await db
    .insert(gameRolls)
    .values({ seasonPlayerId, gameId, status: "rolled" })
    .returning();
  return created!;
}

/** The player's current unfinished roll (rolled or in_progress). */
export async function getOpenRoll(
  seasonPlayerId: string,
): Promise<(GameRoll & { game: CatalogGame | null }) | null> {
  const rows = await db
    .select({ roll: gameRolls, game: gamesCatalog })
    .from(gameRolls)
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")),
        isNull(gameRolls.resolvedAt),
      ),
    )
    .orderBy(sql`${gameRolls.rolledAt} desc`)
    .limit(1);
  const row = rows[0];
  return row ? { ...row.roll, game: row.game } : null;
}

export async function updateRollStatus(
  rollId: string,
  status: GameRoll["status"],
): Promise<void> {
  const patch: Partial<GameRoll> = { status };
  if (status !== "rolled" && status !== "in_progress") patch.resolvedAt = new Date();
  await db.update(gameRolls).set(patch).where(eq(gameRolls.id, rollId));
}

export async function countRerollsForGame(
  seasonPlayerId: string,
  gameId: string | null,
): Promise<number> {
  if (!gameId) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(gameRolls)
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        eq(gameRolls.gameId, gameId),
        eq(gameRolls.status, "rerolled"),
      ),
    );
  return rows[0]?.n ?? 0;
}
