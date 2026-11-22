/**
 * Where an object may stand on a season's board (wave D, spec §6.18): any cell
 * but the start and the finish, one object per cell. The board and the objects
 * standing on it are read fresh; a use asks again inside its own decision.
 */
import type { IeeInstanceRow } from "@/db/schema";
import type { UsePick } from "@/lib/engine";
import { listActiveObjects } from "@/lib/modules/iee/repository";
import { getBoardCells, getMainBoard } from "@/lib/modules/season/repository/seasons";

/** Pure: the cells an object may stand on — not the start, not the finish, not one taken — in board order. */
export function objectCellsOf(
  cells: readonly { position: number; cellType: string }[],
  objects: readonly Pick<IeeInstanceRow, "holderCellIndex">[],
): number[] {
  const taken = new Set(objects.map((o) => o.holderCellIndex));
  return cells
    .filter((c) => c.cellType !== "start" && c.cellType !== "finish" && !taken.has(c.position))
    .map((c) => c.position)
    .sort((a, b) => a - b);
}

/** How many objects a player has standing on the board. */
export function ownedObjects(objects: readonly Pick<IeeInstanceRow, "ownerPlayerId">[], seasonPlayerId: string): number {
  return objects.filter((o) => o.ownerPlayerId === seasonPlayerId).length;
}

/** The cells of a season's board an object may stand on now. */
export async function freeObjectCells(seasonId: string): Promise<number[]> {
  const board = await getMainBoard(seasonId);
  if (!board) return [];
  const [cells, objects] = await Promise.all([getBoardCells(board.id), listActiveObjects(seasonId)]);
  return objectCellsOf(cells, objects);
}

/** A cell picked for an object, as the board offers it; null when no object may stand there now. */
export async function offeredCell(seasonId: string, cell: number): Promise<UsePick | null> {
  return (await freeObjectCells(seasonId)).includes(cell) ? { cell } : null;
}
