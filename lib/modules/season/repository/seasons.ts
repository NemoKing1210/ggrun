import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/infrastructure/db";
import {
  boardCells,
  boards,
  seasons,
  type Board,
  type BoardCell,
  type Season,
} from "@/db/schema";

export async function getActiveSeason(): Promise<Season | null> {
  const rows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.status, "active"))
    .orderBy(desc(seasons.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSeasons(): Promise<Season[]> {
  return db.select().from(seasons).orderBy(desc(seasons.createdAt));
}

/** Public archive: active / paused / finished / archived, ordered by most recent first. */
export async function listPublicSeasons(): Promise<Season[]> {
  return db
    .select()
    .from(seasons)
    .where(inArray(seasons.status, ["active", "paused", "finished", "archived"]))
    .orderBy(desc(seasons.startedAt), desc(seasons.createdAt));
}

/** Finished seasons only (finished + archived) for the archive highlight. */
export async function listArchivedSeasons(): Promise<Season[]> {
  return db
    .select()
    .from(seasons)
    .where(inArray(seasons.status, ["finished", "archived"]))
    .orderBy(desc(seasons.finishedAt), desc(seasons.startedAt));
}

export async function getSeasonBySlug(slug: string): Promise<Season | null> {
  const rows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSeasonById(id: string): Promise<Season | null> {
  const rows = await db.select().from(seasons).where(eq(seasons.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getMainBoard(seasonId: string): Promise<Board | null> {
  const rows = await db
    .select()
    .from(boards)
    .where(eq(boards.seasonId, seasonId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBoardCells(boardId: string): Promise<BoardCell[]> {
  return db
    .select()
    .from(boardCells)
    .where(eq(boardCells.boardId, boardId))
    .orderBy(boardCells.position);
}

/** Atomic season status change (for draft→active and similar transitions). */
export async function setSeasonStatus(
  seasonId: string,
  status: Season["status"],
): Promise<void> {
  const patch: Partial<Season> = { status };
  if (status === "active") patch.startedAt = new Date();
  if (status === "finished") patch.finishedAt = new Date();
  await db.update(seasons).set(patch).where(eq(seasons.id, seasonId));
}

export async function updateSeasonConfig(
  seasonId: string,
  config: Record<string, unknown>,
  rulesMd?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { config };
  if (rulesMd !== undefined) patch.rulesMd = rulesMd;
  await db.update(seasons).set(patch).where(eq(seasons.id, seasonId));
}
