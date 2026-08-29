import { and, eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { boardCells } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";

import { AdminError } from "./errors";

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new AdminError("adminStaffRequired");
  return user;
}

export async function setBoardCell(input: {
  boardId: string;
  position: number;
  cellType: (typeof boardCells.$inferInsert)["cellType"];
  label?: string | null;
  config?: Record<string, unknown>;
}): Promise<void> {
  const actor = await requireStaff();
  await db
    .insert(boardCells)
    .values({
      boardId: input.boardId,
      position: input.position,
      cellType: input.cellType,
      label: input.label ?? null,
      config: input.config ?? {},
    })
    .onConflictDoUpdate({
      target: [boardCells.boardId, boardCells.position],
      set: { cellType: input.cellType, label: input.label ?? null, config: input.config ?? {} },
    });
  log.info("board.cell.persisted", { actorId: actor.id, boardId: input.boardId, position: input.position, cellType: input.cellType });
  await logAdminAction({ actorId: actor.id, actionType: "board_cell_set", targetType: "board_cell", payload: { ...input } });
}

export async function bulkSetBoardCellGenres(input: { boardId: string; positions: number[]; genres: string[] }): Promise<number> {
  const actor = await requireStaff();
  const clean = [...new Set(input.genres.map((g) => String(g).trim().toLowerCase()).filter(Boolean))];
  const allRows = await db.select().from(boardCells).where(eq(boardCells.boardId, input.boardId));
  const byPos = new Map(allRows.map((r) => [r.position, r]));
  let updated = 0;
  for (const pos of input.positions) {
    const existing = byPos.get(pos);
    const prevConfig = (existing?.config as Record<string, unknown>) ?? {};
    const nextConfig: Record<string, unknown> = { ...prevConfig };
    if (clean.length > 0) nextConfig.genres = clean;
    else delete (nextConfig as Record<string, unknown>).genres;
    if (existing) {
      await db.update(boardCells).set({ config: nextConfig }).where(and(eq(boardCells.boardId, input.boardId), eq(boardCells.position, pos)));
    } else {
      await db.insert(boardCells).values({ boardId: input.boardId, position: pos, cellType: "normal", label: null, config: nextConfig });
    }
    updated++;
  }
  log.info("board.cell.bulk_genres", { actorId: actor.id, boardId: input.boardId, positions: input.positions.length, genres: clean });
  await logAdminAction({ actorId: actor.id, actionType: "board_bulk_genres", targetType: "board", targetId: input.boardId, payload: { positions: input.positions, genres: clean } });
  return updated;
}

export async function randomizeBoardGenres(input: { boardId: string; positions: number[]; poolGenres?: string[] }): Promise<number> {
  const actor = await requireStaff();
  const pool = input.poolGenres?.length ? [...new Set(input.poolGenres.map((g) => String(g).trim().toLowerCase()).filter(Boolean))] : ["action", "adventure", "rpg", "strategy", "shooter", "puzzle", "arcade", "platformer", "racing", "sports", "simulation", "indie"];
  const allRows = await db.select().from(boardCells).where(eq(boardCells.boardId, input.boardId));
  const byPos = new Map(allRows.map((r) => [r.position, r]));
  let updated = 0;
  for (const pos of input.positions) {
    const pick = pool[Math.floor(Math.random() * pool.length)]!;
    const genres = [pick];
    const existing = byPos.get(pos);
    const prevConfig = (existing?.config as Record<string, unknown>) ?? {};
    const nextConfig: Record<string, unknown> = { ...prevConfig, genres };
    if (existing) {
      await db.update(boardCells).set({ config: nextConfig }).where(and(eq(boardCells.boardId, input.boardId), eq(boardCells.position, pos)));
    } else {
      await db.insert(boardCells).values({ boardId: input.boardId, position: pos, cellType: "normal", label: null, config: nextConfig });
    }
    updated++;
  }
  log.info("board.cell.randomize_genres", { actorId: actor.id, boardId: input.boardId, positions: input.positions.length });
  await logAdminAction({ actorId: actor.id, actionType: "board_randomize_genres", targetType: "board", targetId: input.boardId, payload: { positions: input.positions } });
  return updated;
}
