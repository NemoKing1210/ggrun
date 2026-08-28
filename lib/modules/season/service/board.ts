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
