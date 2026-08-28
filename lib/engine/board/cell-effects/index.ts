import type { CellLike } from "../../types/board";
import { getCellEffect } from "./registry";

export interface AppliedCellEffect {
  position: number;
  balancePoints: number;
  ledgerDelta: number;
  reason?: string;
}

export function applyCellEffect(
  cell: CellLike,
  playerPosition: number,
  balancePoints: number,
): AppliedCellEffect {
  const effectKey =
    typeof cell.config.effectKey === "string" ? cell.config.effectKey : cell.cellType;
  const result = getCellEffect(effectKey)({
    cell,
    landingPosition: playerPosition,
    balancePoints,
  });
  const position = result.position ?? playerPosition + (result.steps ?? 0);
  const ledgerDelta = result.balanceDelta ?? 0;
  return {
    position,
    balancePoints: Math.max(0, balancePoints + ledgerDelta),
    ledgerDelta,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
  };
}

export * from "./registry";
