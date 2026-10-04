/**
 * Bot brain, part two: which item to activate, and on whom.
 *
 * The plain roll/resolve policy lives in `policy.ts`; this file decides the
 * *item* half of a synthetic player's turn. It is deliberately catalog-driven:
 * instead of hardcoding "hex the leader with hex_scroll", it asks every held
 * item's pure `apply` what it *would* do to each candidate target and scores
 * the resulting intent. A new catalog entry — or a season param override —
 * changes bot behavior without touching this file, exactly like it changes a
 * real player's options.
 *
 * Pure: no DB, no next/*, no react, no drizzle or pg. The caller supplies the
 * inventory, the statuses and the candidates; randomness arrives as `rng`.
 */

import type { IeeParams, IeePlayerSnapshot } from "../types/iee";
import { getEffect } from "../iee/effects/registry";
import { getItem } from "../iee/items/registry";
import { checkItemUse } from "../iee/use-guards";

import type { Rng } from "./policy";

/**
 * Who offensive items are aimed at. Mirrored by `BOT_TARGET_STRATEGIES` in
 * `db/schema/bots.ts` (the config is JSONB there); a parity test in
 * `lib/modules/bots` asserts the two lists never drift.
 */
export const BOT_TARGET_STRATEGIES = ["leader", "random", "nearest"] as const;
export type BotTargetStrategy = (typeof BOT_TARGET_STRATEGIES)[number];

/** One item the bot can still spend. `params` are the row's snapshot. */
export interface BotItemHold {
  inventoryId: string;
  itemKey: string;
  params: IeeParams;
}

/** Someone an item may be aimed at, as the planner needs them. */
export interface BotOtherPlayer {
  seasonPlayerId: string;
  username: string;
  position: number;
  moveCount: number;
  status: string;
  /** Effect keys currently in force on them — avoids wasting a `unique` grant. */
  effects: readonly string[];
}

export interface BotItemInput {
  actor: IeePlayerSnapshot;
  /** Whether the bot has an unresolved roll right now. */
  hasOpenRoll: boolean;
  held: readonly BotItemHold[];
  /** In-force statuses on the bot itself. */
  activeEffects: ReadonlyArray<{ effectKey: string; polarity: string }>;
  /** Every other participant, active or not — the planner applies the guards. */
  others: readonly BotOtherPlayer[];
  allowTargetingOthers: boolean;
  pvpProtectionMoves: number;
}

export interface BotItemOptions {
  strategy: BotTargetStrategy;
  /** Spend a cleanse-style item when the bot carries a negative status. */
  autoCleanse: boolean;
  rng?: Rng;
}

export type BotItemIntentKind = "cleanse" | "buff" | "attack" | "points";

export interface BotItemPlan {
  inventoryId: string;
  itemKey: string;
  /** Null for items with no target (usage.target === "none"). */
  targetSeasonPlayerId: string | null;
  /** Null for self/no-target plans. */
  targetUsername: string | null;
  intent: BotItemIntentKind;
  /** Higher wins; jitter is already included. */
  score: number;
}

const SCORE_CLEANSE = 1000;
const SCORE_BUFF = 500;
const SCORE_ATTACK = 400;
const SCORE_POINTS = 300;
/** How much randomness can override a score gap of this size. */
const JITTER = 20;

/** Targetable now: active, past newcomer protection, and not the actor. */
function eligible(other: BotOtherPlayer, pvpProtectionMoves: number): boolean {
  return other.status === "active" && other.moveCount >= pvpProtectionMoves;
}

/**
 * The order targets are considered in. Exactly one target is offered to an
 * offensive item — the first eligible in this order — so "leader" is a policy,
 * not a tie-breaker the scoring can accidentally override.
 */
function orderTargets(
  others: readonly BotOtherPlayer[],
  actorPosition: number,
  strategy: BotTargetStrategy,
  rng: Rng,
): BotOtherPlayer[] {
  const list = [...others];
  if (strategy === "leader") {
    return list.sort((a, b) => b.position - a.position);
  }
  if (strategy === "nearest") {
    return list.sort(
      (a, b) => Math.abs(a.position - actorPosition) - Math.abs(b.position - actorPosition),
    );
  }
  // Fisher–Yates, so the pick is uniformly random and still deterministic
  // against an injected rng.
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = list[i]!;
    list[i] = list[j]!;
    list[j] = tmp;
  }
  return list;
}

function snapshotOf(other: BotOtherPlayer, rank: number): IeePlayerSnapshot {
  return {
    seasonPlayerId: other.seasonPlayerId,
    position: other.position,
    balancePoints: 0,
    rollSeq: 0,
    moveCount: other.moveCount,
    rank,
    status: other.status as IeePlayerSnapshot["status"],
  };
}

interface Scored {
  score: number;
  intent: BotItemIntentKind;
}

/**
 * Turns a catalog intent into a number. Only intents a player would actually
 * want count: cleansing a status the bot is carrying, buffing itself, hexing a
 * rival, or gaining points.
 */
function scoreIntents(
  input: BotItemInput,
  result: {
    cleanse?: ReadonlyArray<{ effectKeys: readonly string[] | "all"; polarity?: string }>;
    grantEffects?: ReadonlyArray<{ effectKey: string; to: string }>;
    grantItems?: ReadonlyArray<{ itemKey: string; to: string }>;
    balance?: ReadonlyArray<{ to: string; delta: number }>;
  },
  targetEffectKeys: ReadonlySet<string>,
  opts: { autoCleanse: boolean },
): Scored | null {
  let best: Scored | null = null;
  const bump = (score: number, intent: BotItemIntentKind) => {
    if (!best || score > best.score) best = { score, intent };
  };

  const selfEffects = new Set(input.activeEffects.map((e) => e.effectKey));

  // --- cleanse: only worth it when every status it would lift is a debuff ---
  if (opts.autoCleanse) {
    for (const intent of result.cleanse ?? []) {
      const matched = input.activeEffects.filter((e) => {
        const keyMatch = intent.effectKeys === "all" || intent.effectKeys.includes(e.effectKey);
        const polarityMatch = intent.polarity ? e.polarity === intent.polarity : true;
        return keyMatch && polarityMatch;
      });
      const debuffs = matched.filter((e) => e.polarity === "negative").length;
      // Cleansing a *positive* status would be self-harm: require that nothing
      // but debuffs is in its path.
      if (debuffs > 0 && debuffs === matched.length) {
        bump(SCORE_CLEANSE + debuffs * 25, "cleanse");
      }
    }
  }

  // --- effects the item hands out ---
  for (const grant of result.grantEffects ?? []) {
    const def = getEffect(grant.effectKey);
    if (!def) continue;
    const toSelf = grant.to === input.actor.seasonPlayerId;
    const activeOnRecipient = toSelf ? selfEffects : targetEffectKeys;

    if (toSelf) {
      if (def.polarity !== "positive") continue;
      // A `unique` status already on the bot rejects the grant outright —
      // proposing it would only spend a charge on an error.
      if (def.stacking === "unique" && activeOnRecipient.has(def.key)) continue;
      // Refreshing an already-running buff is a much weaker play than casting it.
      bump(activeOnRecipient.has(def.key) ? SCORE_BUFF * 0.12 : SCORE_BUFF, "buff");
    } else {
      if (def.polarity !== "negative") continue;
      if (def.stacking === "unique" && activeOnRecipient.has(def.key)) continue;
      bump(SCORE_ATTACK, "attack");
    }
  }

  // --- items handed out ---
  for (const grant of result.grantItems ?? []) {
    if (grant.to !== input.actor.seasonPlayerId) continue;
    bump(SCORE_BUFF * 0.4, "buff");
  }

  // --- points ---
  for (const entry of result.balance ?? []) {
    if (entry.to === input.actor.seasonPlayerId && entry.delta > 0) {
      bump(SCORE_POINTS, "points");
    }
  }

  return best;
}

/**
 * Picks the single best item action for this step, or null when nothing worth
 * doing is available. The caller decides whether to attempt it at all (the
 * `itemChance` roll lives in the service).
 */
export function planBotItemUse(
  input: BotItemInput,
  options: BotItemOptions,
): BotItemPlan | null {
  if (input.held.length === 0) return null;
  const rng = options.rng ?? Math.random;

  const ordered = orderTargets(input.others, input.actor.position, options.strategy, rng);
  const primary = input.allowTargetingOthers
    ? (ordered.find((o) => eligible(o, input.pvpProtectionMoves)) ?? null)
    : null;
  // Rank is unused by the catalog's `apply` today; it is passed for the
  // entries that may read it later, and computed relative to the actor.
  const primarySnapshot = primary
    ? snapshotOf(primary, input.others.filter((o) => o.position > primary.position).length + 1)
    : null;
  const primaryEffects = new Set(primary?.effects ?? []);

  let best: BotItemPlan | null = null;

  for (const hold of input.held) {
    const def = getItem(hold.itemKey);
    if (!def || def.usage.mode !== "active") continue;

    const verdict = checkItemUse({
      usage: def.usage,
      hasOpenRoll: input.hasOpenRoll,
      actor: input.actor,
      target: primarySnapshot,
      targetInSameSeason: true,
      allowTargetingOthers: input.allowTargetingOthers,
      pvpProtectionMoves: input.pvpProtectionMoves,
    });
    if (!verdict.ok) continue;

    const target =
      verdict.target === "other"
        ? primarySnapshot
        : verdict.target === "self"
          ? input.actor
          : null;

    const result = def.apply({
      itemKey: def.key,
      params: hold.params,
      actor: input.actor,
      target,
    });
    if (result.rejected) continue;

    const scored = scoreIntents(
      input,
      result,
      target && target.seasonPlayerId !== input.actor.seasonPlayerId
        ? primaryEffects
        : new Set<string>(),
      { autoCleanse: options.autoCleanse },
    );
    if (!scored) continue;

    const score = scored.score + rng() * JITTER;
    if (best && score <= best.score) continue;
    best = {
      inventoryId: hold.inventoryId,
      itemKey: def.key,
      targetSeasonPlayerId: target?.seasonPlayerId ?? null,
      targetUsername: target && target.seasonPlayerId !== input.actor.seasonPlayerId ? (primary?.username ?? null) : null,
      intent: scored.intent,
      score,
    };
  }

  return best;
}
