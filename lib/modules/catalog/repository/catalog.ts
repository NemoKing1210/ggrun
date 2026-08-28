import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { gamesCatalog, type CatalogGame } from "@/db/schema";

export async function listCatalogGames(): Promise<CatalogGame[]> {
  return db.select().from(gamesCatalog).orderBy(gamesCatalog.title);
}

export async function getCatalogPreview(limit = 18): Promise<CatalogGame[]> {
  return db
    .select()
    .from(gamesCatalog)
    .where(eq(gamesCatalog.isBlacklisted, false))
    .orderBy(sql`random()`)
    .limit(limit);
}

export async function addCatalogGame(game: {
  title: string;
  platform?: string | null;
  coverUrl?: string | null;
  genres?: string[];
  tags?: string[];
  metacritic?: number | null;
  rating?: number | null;
  releasedAt?: Date | null;
  esrb?: string | null;
  externalSource?: string | null;
  externalRawId?: string | null;
  externalIds?: Record<string, unknown>;
  description?: string | null;
  playtimeHours?: number | null;
  stores?: Array<{ store: string; url: string }> | null;
  website?: string | null;
}): Promise<CatalogGame> {
  const [created] = await db
    .insert(gamesCatalog)
    .values({
      title: game.title,
      platform: game.platform ?? null,
      coverUrl: game.coverUrl ?? null,
      genres: game.genres ?? [],
      tags: game.tags ?? [],
      metacritic: game.metacritic ?? null,
      rating: game.rating != null ? String(game.rating) : null,
      releasedAt: game.releasedAt ?? null,
      esrb: game.esrb ?? null,
      externalSource: game.externalSource ?? null,
      externalRawId: game.externalRawId ?? null,
      externalIds: game.externalIds ?? {},
      description: game.description ?? null,
      playtimeHours: game.playtimeHours ?? null,
      stores: game.stores ?? [],
      website: game.website ?? null,
    } as never)
    .returning();
  return created!;
}

export async function setGameBlacklisted(gameId: string, blacklisted: boolean): Promise<void> {
  await db.update(gamesCatalog).set({ isBlacklisted: blacklisted }).where(eq(gamesCatalog.id, gameId));
}

export async function deleteCatalogGame(gameId: string): Promise<void> {
  await db.delete(gamesCatalog).where(eq(gamesCatalog.id, gameId));
}

export async function bulkSetGamesBlacklisted(ids: string[], blacklisted: boolean): Promise<void> {
  if (ids.length === 0) return;
  await db.update(gamesCatalog).set({ isBlacklisted: blacklisted }).where(inArray(gamesCatalog.id, ids));
}

export async function bulkDeleteGames(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(gamesCatalog).where(inArray(gamesCatalog.id, ids));
}

export async function getGameById(id: string): Promise<CatalogGame | null> {
  const rows = await db.select().from(gamesCatalog).where(eq(gamesCatalog.id, id)).limit(1);
  return rows[0] ?? null;
}
