/**
 * Wheel grants for a landing cell.
 *
 * Kept out of `resolve.ts` on purpose: that file is the turn transaction and is
 * already the longest in the repo. Everything here is called *inside* that
 * transaction, so a move and the grant it produced can never be persisted
 * apart. Selection itself is pure and lives in `lib/engine/iee`.
 */
import { db } from "@/lib/infrastructure/db";
import type { SeasonPlayer } from "@/db/schema";
import type { EventType } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import type {
  ActiveEffectLike,
  HookName,
  HookTurnContext,
  IeeModifiers,
  IeePlayerSnapshot,
} from "@/lib/engine";
import {
  activeEffects,
  EFFECTS,
  emptyModifiers,
  runHook,
  catalogCandidates,
  catalogDefaults,
  expiredEffects,
  pickWheelOutcome,
  type IeeConfig,
  type Polarity,
  type WheelOutcome,
} from "@/lib/engine";
import {
  spendEffectCharges,
  getActiveEffectRows,
  loadPoolContext,
  markEffectsEnded,
  toActiveEffectLike,
  toPlayerSnapshot,
} from "@/lib/modules/iee/repository";

import { grantEffect, grantInventoryItem } from "./grant";

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FeedEntry = { eventType: EventType; payload: Record<string, unknown> };

export interface WheelResult {
  outcome: WheelOutcome;
  /** Feed rows for the caller's batch insert — written in the same transaction. */
  events: FeedEntry[];
}

/** Cell types that spin a wheel, and the pool each draws from. */
export function polarityForCell(cellType: string | null): Polarity | null {
  if (cellType === "bonus") return "positive";
  if (cellType === "penalty") return "negative";
  return null;
}

/**
 * Loads everything the picker needs. Read outside the transaction, like the
 * board and cell reads already are.
 *
 * Caveat worth knowing: under READ COMMITTED two players resolving at the very
 * same moment could each pass a `maxPerSeason` check that only one of them
 * should. The caps are advisory, not invariants; making them hard would need
 * SERIALIZABLE or a lock, which is not worth it for a seasonal event.
 */
export async function loadWheelContext(sp: SeasonPlayer) {
  return loadPoolContext(sp);
}

/**
 * Picks and persists what a bonus/penalty cell grants.
 *
 * Returns `kind: "fallback"` without writing anything when the subsystem is
 * off or the pool is empty — the caller then applies the cell's plain point
 * value, so a mis-tuned season still plays.
 */
export async function applyWheel(
  tx: Tx,
  params: {
    seasonId: string;
    sp: SeasonPlayer;
    polarity: Polarity;
    iee: IeeConfig;
    context: Awaited<ReturnType<typeof loadPoolContext>>;
    moveId: string;
    /** `season_players.roll_seq` after this resolve — the duration clock. */
    nextRollSeq: number;
    rng: () => number;
  },
): Promise<WheelResult> {
  const { sp, polarity, iee, context } = params;

  const outcome = pickWheelOutcome({
    polarity,
    config: iee,
    catalog: catalogCandidates(),
    catalogDefaults: catalogDefaults(),
    player: context.player,
    counters: context.counters,
    activeEffectKeys: context.activeEffectKeys,
    heldItemCount: context.heldItemCount,
    seasonRollSeq: context.seasonRollSeq,
    playerCount: context.playerCount,
    rng: params.rng,
  });

  if (outcome.kind === "fallback" || outcome.kind === "nothing" || !outcome.key) {
    return { outcome, events: [] };
  }

  const source = polarity === "positive" ? "cell_bonus" : "cell_penalty";
  const events: FeedEntry[] = [];

  if (outcome.kind === "item") {
    const row = await grantInventoryItem(tx, {
      seasonId: params.seasonId,
      seasonPlayerId: sp.id,
      itemKey: outcome.key,
      config: iee,
      seasonRollSeq: context.seasonRollSeq,
      source,
      sourceMoveId: params.moveId,
    });
    if (!row) {
      // A key that survived selection but has no definition means the catalog
      // and the season pool have drifted. Fall back rather than crash a turn.
      return {
        outcome: { ...outcome, kind: "fallback", fallbackReason: "unknown_key" },
        events: [],
      };
    }
    if (iee.revealDropsInFeed) {
      events.push({
        eventType: "item_granted",
        payload: { itemKey: row.itemKey, inventoryId: row.id, source, polarity },
      });
    }
    return { outcome, events };
  }

  // --- effect ---------------------------------------------------------------
  // Strength, duration and the stacking policy all come from `grantEffect`,
  // which is also what an item and a challenge reward call. Before that, this
  // was the only one of the three that read the season's tuning at all.
  const granted = await grantEffect(tx, {
    seasonId: params.seasonId,
    seasonPlayerId: sp.id,
    effectKey: outcome.key,
    config: iee,
    anchorRollSeq: params.nextRollSeq,
    seasonRollSeq: context.seasonRollSeq,
    source,
    sourceMoveId: params.moveId,
  });
  if (!granted) {
    return {
      outcome: { ...outcome, kind: "fallback", fallbackReason: "unknown_key" },
      events: [],
    };
  }
  if (granted.state === "blocked_unique") {
    // Unreachable from here in practice — the picker gates a duplicate `unique`
    // out before the wheel is built — but if it ever is reached, the honest
    // thing to show the player is an empty slot rather than a status they did
    // not receive.
    log.debug("iee.grant.blocked_unique", { key: granted.def.key });
    return { outcome: { ...outcome, kind: "nothing", key: null }, events: [] };
  }
  if (iee.revealDropsInFeed) {
    events.push({
      eventType: "effect_applied",
      payload: {
        effectKey: granted.def.key,
        effectId: granted.row?.id ?? null,
        refreshed: granted.state === "refreshed",
        source,
        polarity,
      },
    });
  }
  return { outcome, events };
}

/**
 * Marks statuses whose duration has run out. Lazy by design — there is no
 * scheduler, so expiry happens on the next resolve that touches the player.
 *
 * `reveal` is the season's `revealDropsInFeed`. A season that chose to hide
 * what a cell handed out used to announce each of those statuses anyway a few
 * rolls later, by their ending — the secret was kept exactly as long as it was
 * interesting. A partial secret is not one, so the feed says nothing about
 * statuses when the flag is off. The rows are still marked expired; only the
 * announcement is suppressed.
 */
export async function expireEffectsFor(
  tx: Tx,
  seasonPlayerId: string,
  rollSeq: number,
  reveal = true,
): Promise<FeedEntry[]> {
  const rows = await getActiveEffectRows(seasonPlayerId, tx);
  const projected = rows.map(toActiveEffectLike);
  const gone = expiredEffects(projected, rollSeq);
  if (gone.length === 0) return [];

  await markEffectsEnded(
    gone.map((e) => e.id),
    "expired",
    tx,
  );
  if (!reveal) return [];
  return gone.map((e) => ({
    eventType: "effect_expired" as EventType,
    payload: { effectKey: e.effectKey, effectId: e.id },
  }));
}

/** Statuses still in force for a player at `rollSeq` — used by the hook runner. */
export async function loadActiveEffects(seasonPlayerId: string, rollSeq: number) {
  const rows = await getActiveEffectRows(seasonPlayerId);
  return activeEffects(rows.map(toActiveEffectLike), rollSeq);
}

// ---------------------------------------------------------------------------
// Hook dispatch for one turn
// ---------------------------------------------------------------------------

/**
 * A player's statuses, loaded once and then queried synchronously at each hook
 * point of a turn. Loading per hook would issue half a dozen queries for one
 * move and — worse — let the set change midway through a turn.
 */
export interface TurnHooks {
  run: (hook: HookName, turn: HookTurnContext) => IeeModifiers;
  /** Effect rows that asked for a charge, accumulated across every hook. */
  consumed: Set<string>;
  active: ActiveEffectLike[];
}

const NO_HOOKS: TurnHooks = {
  run: () => emptyModifiers(),
  consumed: new Set(),
  active: [],
};

export async function loadTurnHooks(
  sp: SeasonPlayer,
  enabled: boolean,
  /**
   * The number of the roll being resolved — `sp.rollSeq + 1`, not `sp.rollSeq`.
   *
   * A duration is stored as `expiresAfterRollSeq`, and `expireEffectsFor` ends
   * a status by comparing that against the roll that just finished. Filtering
   * here against the roll that came *before* it meant the two ends of the same
   * rule ran one apart, and every `rolls` duration silently lasted one roll
   * longer than the catalog declares: `heavy_boots` (1) shortened two moves,
   * `slowed` (2) three, and so on. Caught end to end, not by a unit test —
   * `iee-scenarios.test.ts` exercised the pure helper with the turn number the
   * runtime never passed it.
   */
  turnRollSeq: number,
): Promise<TurnHooks> {
  if (!enabled) return { ...NO_HOOKS, consumed: new Set() };

  const rows = await getActiveEffectRows(sp.id);
  const active = activeEffects(rows.map(toActiveEffectLike), turnRollSeq);
  if (active.length === 0) return { ...NO_HOOKS, consumed: new Set(), active };

  // The real snapshot, not an approximation of one.
  //
  // This used to build its own with `moveCount: sp.rollSeq` and `rank: 1`
  // hardcoded. `moveCount` is `count(moves)` everywhere else — `counters.ts`
  // carries a comment explaining exactly why it must not be the roll counter —
  // and rank is a real query. No catalog entry reads either field today, which
  // is the only reason nothing was broken by it, and precisely why the first
  // one that does would have been wrong without anyone noticing. Two queries,
  // and only when the player is actually carrying something.
  const self: IeePlayerSnapshot = await toPlayerSnapshot(sp);
  const consumed = new Set<string>();

  return {
    active,
    consumed,
    run: (hook, turn) => {
      const mods = runHook({ hook, effects: active, registry: EFFECTS, self, turn });
      for (const id of mods.consumed) consumed.add(id);
      if (mods.conflicts.length > 0) {
        log.debug("iee.hook.conflicts", { hook, conflicts: mods.conflicts });
      }
      return mods;
    },
  };
}

/** Spends one charge on every effect that asked during the turn. */
export async function settleTurnHooks(tx: Tx, hooks: TurnHooks): Promise<void> {
  if (hooks.consumed.size === 0) return;
  await spendEffectCharges([...hooks.consumed], tx);
}
