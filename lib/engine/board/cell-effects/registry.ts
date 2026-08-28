import type { CellEffectContext, CellEffectResult } from "../../types/board";

export type CellEffect = (ctx: CellEffectContext) => CellEffectResult;

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
  event: noOp,
};

export function registerCellEffect(key: string, effect: CellEffect): void {
  CELL_EFFECTS[key] = effect;
}

export function getCellEffect(key: string): CellEffect {
  return CELL_EFFECTS[key] ?? noOp;
}

export { readNumber, noOp };
