/** Board generation strategy for special cells. */
export type BoardDistribution = "random" | "even" | "clustered" | "manual";

/** Cell types for MVP (PLAN.md 6.2), extensible via cell `config` JSONB. */
export type CellType =
  | "start"
  | "finish"
  | "normal"
  | "penalty"
  | "bonus"
  | "event"
  | "teleport"
  | "custom";

/** Shape of a board cell as consumed by the engine (`cells` row projection). */
export interface CellLike {
  position: number;
  cellType: CellType;
  config: Record<string, unknown>;
  label?: string | null;
}

export interface CellEffectContext {
  cell: CellLike;
  landingPosition: number;
  balancePoints: number;
}

export interface CellEffectResult {
  position?: number;
  steps?: number;
  balanceDelta?: number;
  reason?: string;
  eventKey?: string;
}
