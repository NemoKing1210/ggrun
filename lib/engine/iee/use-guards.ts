import type { IeePlayerSnapshot, ItemUsage } from "../types/iee";

/** Where the resolved target ended up pointing. */
export type UseTargetKind = "none" | "self" | "other";

export type UseGuardResult =
  | { ok: true; target: UseTargetKind }
  | { ok: false; code: string };

export interface UseGuardInput {
  usage: ItemUsage;
  /** Whether the holder currently has an unresolved roll. */
  hasOpenRoll: boolean;
  actor: IeePlayerSnapshot;
  /** The candidate the caller resolved, or null when none was supplied. */
  target: IeePlayerSnapshot | null;
  /** False when the candidate belongs to a different season. */
  targetInSameSeason: boolean;
  allowTargetingOthers: boolean;
  pvpProtectionMoves: number;
}

/**
 * Every rule that decides whether an item may be used right now, on this
 * target — pure, so the PvP guardrails can be tested exhaustively without a
 * database or a browser (§8.3).
 *
 * The service composes it: load the rows, ask this, then act. It returns an
 * error *code*, never a message; the action layer translates.
 */
export function checkItemUse(input: UseGuardInput): UseGuardResult {
  const { usage, actor, target } = input;

  if (usage.mode !== "active") return { ok: false, code: "ieeItemNotUsable" };

  if (usage.window === "before_roll" && input.hasOpenRoll) {
    return { ok: false, code: "ieeItemWrongWindow" };
  }
  if (usage.window === "on_open_roll" && !input.hasOpenRoll) {
    return { ok: false, code: "ieeItemWrongWindow" };
  }

  if (usage.target === "none") return { ok: true, target: "none" };

  if (usage.target === "self") {
    // A self item ignores whatever the form sent.
    return { ok: true, target: "self" };
  }

  if (!target) {
    if (usage.target === "other") return { ok: false, code: "ieeTargetRequired" };
    return { ok: true, target: "none" };
  }

  if (!input.targetInSameSeason) return { ok: false, code: "ieeTargetNotActive" };

  const isSelf = target.seasonPlayerId === actor.seasonPlayerId;
  if (isSelf) {
    if (usage.target === "other") return { ok: false, code: "ieeTargetSelfNotAllowed" };
    return { ok: true, target: "self" };
  }

  if (!input.allowTargetingOthers) return { ok: false, code: "ieeTargetingDisabled" };
  if (target.status !== "active") return { ok: false, code: "ieeTargetNotActive" };
  if (target.moveCount < input.pvpProtectionMoves) {
    return { ok: false, code: "ieeTargetProtected" };
  }

  return { ok: true, target: "other" };
}
