import type { IeePlayerSnapshot, ItemTarget, ItemUseWindow, TargetFilter } from "../types/iee";

/** Where the resolved target ended up pointing. */
export type UseTargetKind = "none" | "self" | "other";

export type UseGuardResult =
  | { ok: true; target: UseTargetKind }
  | { ok: false; code: string };

/**
 * Only what the guards read of an item: whether it is usable, when, on whom.
 * `mode` is the compiled usage's `activation`: passive and cursed items work
 * by themselves and are never used (spec §6.10).
 */
export interface UseGuardUsage {
  mode: "active" | "passive" | "cursed";
  window: ItemUseWindow;
  target: ItemTarget;
  /** Who an aimed item may be aimed at, beyond a rival. */
  filter?: TargetFilter | null;
}

/** Where a participant stands — what a target filter is judged on. */
export interface Standing {
  seasonPlayerId: string;
  position: number;
  status: IeePlayerSnapshot["status"];
}

export interface UseGuardInput {
  usage: UseGuardUsage;
  /** Whether the holder currently has an unresolved roll. */
  hasOpenRoll: boolean;
  actor: IeePlayerSnapshot;
  /** The candidate the caller resolved, or null when none was supplied. */
  target: IeePlayerSnapshot | null;
  /** False when the candidate belongs to a different season. */
  targetInSameSeason: boolean;
  allowTargetingOthers: boolean;
  pvpProtectionMoves: number;
  /** The season's participants as they stand now — a target filter reads them; none: only the two players are known. */
  standings?: readonly Standing[];
}

/**
 * Whether a target filter allows aiming at `target` from `actor` (spec
 * §6.10): strictly ahead or behind, the nearest active player that way (ties
 * all count), or a player on the highest cell. Judged on the positions now.
 */
export function filterAllows(
  filter: TargetFilter,
  actor: Pick<Standing, "seasonPlayerId" | "position">,
  target: Pick<Standing, "seasonPlayerId" | "position">,
  standings: readonly Standing[],
): boolean {
  const rivals = standings.filter((s) => s.status === "active" && s.seasonPlayerId !== actor.seasonPlayerId);
  switch (filter) {
    case "ahead":
      return target.position > actor.position;
    case "behind":
      return target.position < actor.position;
    case "nearest_ahead": {
      const ahead = rivals.filter((s) => s.position > actor.position).map((s) => s.position);
      return ahead.length > 0 && target.position === Math.min(...ahead);
    }
    case "nearest_behind": {
      const behind = rivals.filter((s) => s.position < actor.position).map((s) => s.position);
      return behind.length > 0 && target.position === Math.max(...behind);
    }
    case "leader": {
      const all = [...rivals, { seasonPlayerId: actor.seasonPlayerId, position: actor.position, status: "active" as const }];
      return target.position === Math.max(...all.map((s) => s.position));
    }
  }
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
  // A reaction item is used by answering the reaction window, never from the inventory (§6.15).
  if (usage.window === "after_dice") return { ok: false, code: "ieeItemReactionOnly" };

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
    // A filter judges the user too: nobody is ahead of themselves.
    if (usage.filter && !filterAllows(usage.filter, actor, actor, input.standings ?? [])) {
      return { ok: false, code: "ieeTargetNotEligible" };
    }
    return { ok: true, target: "self" };
  }

  if (!input.allowTargetingOthers) return { ok: false, code: "ieeTargetingDisabled" };
  if (target.status !== "active") return { ok: false, code: "ieeTargetNotActive" };
  if (target.moveCount < input.pvpProtectionMoves) {
    return { ok: false, code: "ieeTargetProtected" };
  }
  if (usage.filter) {
    const standings = input.standings ?? [
      { seasonPlayerId: actor.seasonPlayerId, position: actor.position, status: actor.status },
      { seasonPlayerId: target.seasonPlayerId, position: target.position, status: target.status },
    ];
    if (!filterAllows(usage.filter, actor, target, standings)) return { ok: false, code: "ieeTargetNotEligible" };
  }

  return { ok: true, target: "other" };
}
