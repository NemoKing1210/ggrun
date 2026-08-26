import type { CellEffectContext, CellEffectResult, CellLike } from "./types";

/**
 * Plugin registry for cell effects (PLAN.md 6.4). Lookup key is the cell's
 * `cell_type`, or `config.effectKey` when present — new effects can be added
 * without touching the core state machine.
 */
export type CellEffect = (ctx: CellEffectContext) => CellEffectResult;

/** Result of applying a landed-on cell to player state. */
export interface AppliedCellEffect {
  position: number;
  balancePoints: number;
  /** Balance change to record in `ledger_entries` (negative for penalties). */
  ledgerDelta: number;
  reason?: string;
}

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const noOp: CellEffect = () => ({});

export const CELL_EFFECTS: Record<string, CellEffect> = {
  start: noOp,
  finish: noOp,
  normal: noOp,
  penalty: (ctx) => ({
    balanceDelta: -Math.abs(readNumber(ctx.cell.config.amount) ?? 0),
    steps: -Math.abs(readNumber(ctx.cell.config.steps) ?? 0) || undefined,
    reason: "penalty",
  }),
  bonus: (ctx) => ({
    balanceDelta: Math.abs(readNumber(ctx.cell.config.amount) ?? 0),
    steps: Math.abs(readNumber(ctx.cell.config.steps) ?? 0) || undefined,
    reason: "bonus",
  }),
  teleport: (ctx) => {
    const target = readNumber(ctx.cell.config.target);
    if (target === undefined) return {};
    return {
      position: target,
      steps: target - ctx.landingPosition,
      reason: `teleport:${target}`,
    };
  },
  /** Reserved hook: triggers a random event from a configurable list (Phase 8). */
  event: noOp,
};

/** Registers or replaces an effect under `key` (plugin extension point). */
export function registerCellEffect(key: string, effect: CellEffect): void {
  CELL_EFFECTS[key] = effect;
}

/** Unknown keys degrade to a no-op rather than breaking the turn. */
export function getCellEffect(key: string): CellEffect {
  return CELL_EFFECTS[key] ?? noOp;
}

/**
 * Applies the effect of the cell the player landed on.
 *
 * - penalty/bonus read `cell.config.amount` (balance modifier) and optionally
 *   `cell.config.steps` (positional shift);
 * - teleport reads `cell.config.target`;
 * - event/custom are no-ops for MVP.
 *
 * The returned position is raw (absolute override or landing + steps); callers
 * normalize it against board bounds via `normalizePosition`.
 */
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
