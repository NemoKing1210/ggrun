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

  // The ledger records what moved, not what was asked for.
  //
  // A balance cannot go below zero, and this used to clamp it while still
  // reporting the full requested amount: a penalty of 9 against a balance of 5
  // left the player on 0 and wrote -9 to `ledger_entries`. The ledger is the
  // audit trail *of* the balance — it is what explains a player's number back
  // to them — so the two must agree or neither can be trusted. Four points
  // were never taken and the history said they were.
  const requested = result.balanceDelta ?? 0;
  const nextBalance = Math.max(0, balancePoints + requested);
  return {
    position,
    balancePoints: nextBalance,
    ledgerDelta: nextBalance - balancePoints,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
  };
}

export * from "./registry";
