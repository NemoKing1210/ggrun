/**
 * Bot brain, part two: which item to activate, and on whom.
 *
 * The plain roll/resolve policy lives in `policy.ts`; this file decides the
 * *item* half of a synthetic player's turn. It is deliberately catalog-driven:
 * instead of hardcoding "hex the leader with hex_scroll", it asks every held
 * item's compiled `use` what it *would* do to each candidate target and scores
 * the resulting intents. A new entry — or a season param override — changes
 * bot behavior without touching this file, exactly like it changes a real
 * player's options.
 *
 * Pure: no DB, no next/*, no react, no drizzle or pg. The caller supplies the
 * inventory, the statuses, the candidates and the season's compiled entries;
 * randomness arrives as `rng`.
 */

import type { IeeIntent, IeeParams, IeePlayerSnapshot, PickKind, Rarity, UseChoice, UsePick } from "../types/iee";
import type { CompiledEffect, CompiledItem } from "../iee/dsl/runtime";
import { checkItemUse, filterAllows, type Standing } from "../iee/use-guards";

import type { Rng } from "./policy";

/** The season's compiled entries, looked up by key, entry id or revision id. */
export interface BotCatalog {
  item(ref: string): CompiledItem | null;
  effect(ref: string): CompiledEffect | null;
}

/**
 * Who offensive items are aimed at. Mirrored by `BOT_TARGET_STRATEGIES` in
 * `db/schema/bots.ts` (the config is JSONB there); a parity test in
 * `lib/modules/bots` asserts the two lists never drift.
 */
export const BOT_TARGET_STRATEGIES = ["leader", "random", "nearest"] as const;
export type BotTargetStrategy = (typeof BOT_TARGET_STRATEGIES)[number];

/** One item the bot can still spend. `params` are the instance's snapshot. */
export interface BotItemHold {
  /** The item instance. */
  inventoryId: string;
  itemKey: string;
  /** The revision it plays; the key is the fallback when absent. */
  revisionId?: string;
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
  /** Bonus items they hold — what a steal, a trade or a copy may take (spec §6.12); unknown when absent. */
  bonusItems?: number;
  /** Out of reach now — an effect of theirs says nobody may aim at them (wave B, spec §6.13). */
  untargetable?: boolean;
}

/** One of the bot's own instances an item may ask it to pick (spec §6.10), newest first. */
export interface BotChoosable {
  instanceId: string;
  kind: "item" | "effect";
  entryId: string;
  character: "bonus" | "penalty";
  /** Its entry's own rarity — what a pick of some rarities may take («Философский камень», wave B); any when absent. */
  rarity?: Rarity;
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
  /** The season's compiled entries. */
  catalog: BotCatalog;
  /** The bot's own instances, newest first — what an item that asks for a pick may take. */
  choosable?: readonly BotChoosable[];
  /**
   * What an item that asks for a pick from the season's catalog may take
   * (spec §6.12) — the server's own rule, worked out by the caller.
   */
  entryOptions?: (item: CompiledItem) => readonly CompiledItem[];
  /**
   * What the season's pool offers a pick for the next game of a kind (wave C,
   * `usage.pick`, spec §6.16): its genres, its decades, games it could hand
   * the bot; the cells the item would serve the bot on (wave D, §6.18,
   * `objectCellsFor`) — worked out by the caller. Nothing to pick, no use.
   */
  picks?: (kind: PickKind, item: CompiledItem) => readonly UsePick[];
  /** The bot cannot use items now (wave B, spec §6.13): nothing is planned. */
  forbidden?: boolean;
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
  /** The bot's own instance picked, for an item that asks for one. */
  choiceInstanceId?: string | null;
  /** The entry of the season's catalog picked, for an item that asks for one (spec §6.12). */
  chosenEntryId?: string | null;
  /** What it picked for its next game, for an item that asks (wave C, spec §6.16). */
  pick?: UsePick | null;
}

/** Whether one of the bot's instances is what a pick or a removal may take. */
function choosableMatches(
  spec: Pick<UseChoice, "what" | "character" | "entryId"> & { rarity?: UseChoice["rarity"] },
  c: BotChoosable,
): boolean {
  return (
    (spec.what === "any" || c.kind === spec.what) &&
    (spec.entryId === null || c.entryId === spec.entryId) &&
    (spec.character === null || c.character === spec.character) &&
    (!spec.rarity || c.rarity === undefined || spec.rarity.includes(c.rarity))
  );
}

const SCORE_CLEANSE = 1000;
const SCORE_BUFF = 500;
const SCORE_ATTACK = 400;
const SCORE_POINTS = 300;
/** How much randomness can override a score gap of this size. */
const JITTER = 20;

/** Targetable now: active, past newcomer protection, within reach (wave B), and not the actor. */
function eligible(other: BotOtherPlayer, pvpProtectionMoves: number): boolean {
  return other.status === "active" && other.moveCount >= pvpProtectionMoves && other.untargetable !== true;
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
 * Turns an item's intents into a number. Only intents a player would actually
 * want count: cleansing a status the bot is carrying, buffing itself, hexing a
 * rival, or gaining points.
 */
function scoreIntents(
  input: BotItemInput,
  intents: readonly IeeIntent[],
  targetEffectKeys: ReadonlySet<string>,
  opts: { autoCleanse: boolean; usingId: string },
): Scored | null {
  let best: Scored | null = null;
  const bump = (score: number, intent: BotItemIntentKind) => {
    if (!best || score > best.score) best = { score, intent };
  };

  const selfEffects = new Set(input.activeEffects.map((e) => e.effectKey));

  for (const intent of intents) {
    switch (intent.kind) {
      case "cleanse": {
        // Only worth it when every status it would lift is a debuff.
        if (!opts.autoCleanse || intent.from !== input.actor.seasonPlayerId) break;
        const matched = input.activeEffects.filter((e) => {
          const character = e.polarity === "negative" ? "penalty" : "bonus";
          if (intent.character !== null && character !== intent.character) return false;
          if (intent.tags.length === 0) return true;
          const tags = input.catalog.effect(e.effectKey)?.tags ?? [];
          return intent.tags.some((t) => tags.includes(t));
        });
        const lifted = intent.count === "all" ? matched : matched.slice(0, intent.count);
        const debuffs = lifted.filter((e) => e.polarity === "negative").length;
        // Cleansing a *positive* status would be self-harm: require that
        // nothing but debuffs is in its path.
        if (debuffs > 0 && debuffs === lifted.length) bump(SCORE_CLEANSE + debuffs * 25, "cleanse");
        break;
      }
      case "grant": {
        const toSelf = intent.to === input.actor.seasonPlayerId;
        if (intent.entryKind === "item") {
          // A bonus item is a small buff for the bot; a cursed one is planted on a rival («Свинцовые грузы»).
          const cursed = input.catalog.item(intent.entryId)?.usage.activation === "cursed";
          if (toSelf && !cursed) bump(SCORE_BUFF * 0.4, "buff");
          else if (!toSelf && cursed) bump(SCORE_ATTACK, "attack");
          break;
        }
        const def = input.catalog.effect(intent.entryId);
        if (!def) break;
        const activeOnRecipient = toSelf ? selfEffects : targetEffectKeys;
        if (toSelf) {
          if (def.polarity !== "positive") break;
          // A `unique` status already on the bot rejects the grant outright —
          // proposing it would only spend a charge on an error.
          if (def.stacking.mode === "unique" && activeOnRecipient.has(def.key)) break;
          // Refreshing an already-running buff is a much weaker play than casting it.
          bump(activeOnRecipient.has(def.key) ? SCORE_BUFF * 0.12 : SCORE_BUFF, "buff");
        } else {
          if (def.polarity !== "negative") break;
          if (def.stacking.mode === "unique" && activeOnRecipient.has(def.key)) break;
          bump(SCORE_ATTACK, "attack");
        }
        break;
      }
      case "balance":
        if (intent.to === input.actor.seasonPlayerId && intent.delta > 0) bump(SCORE_POINTS, "points");
        break;
      case "remove": {
        // Taking its own penalties away is a cleanse; a rival's bonuses, an attack (spec §6.10).
        if (intent.from === input.actor.seasonPlayerId) {
          if (!opts.autoCleanse) break;
          const mine = input.choosable ?? [];
          const pick = intent.pick;
          const taken =
            typeof pick === "object"
              ? mine.filter((c) => c.instanceId === pick.instanceId)
              : mine.filter((c) => choosableMatches(intent, c)).slice(0, intent.count);
          const penalties = taken.filter((c) => c.character === "penalty").length;
          if (penalties > 0 && penalties === taken.length) bump(SCORE_CLEANSE + penalties * 25, "cleanse");
        } else if (intent.character !== "penalty") {
          bump(SCORE_ATTACK, "attack");
        }
        break;
      }
      // Items changing hands (spec §6.12): taking a rival's is an attack, giving
      // the bot's own away never pays; a trade or a copy needs something to take.
      case "moveItems": {
        const self = input.actor.seasonPlayerId;
        if (intent.to === self && intent.from !== self && holdsBonus(input, intent.from)) bump(SCORE_ATTACK, "attack");
        break;
      }
      case "swapItems": {
        const other = intent.a === input.actor.seasonPlayerId ? intent.b : intent.a;
        // Something of its own to give besides the item in use, and something of theirs to get.
        const mine = input.held.filter((h) => h.inventoryId !== opts.usingId && input.catalog.item(h.revisionId ?? h.itemKey)?.character === "bonus");
        if (mine.length > 0 && holdsBonus(input, other)) bump(SCORE_ATTACK * 0.5, "attack");
        break;
      }
      case "copyItem":
        if (intent.to === input.actor.seasonPlayerId && holdsBonus(input, intent.from)) bump(SCORE_BUFF * 0.4, "buff");
        break;
      // Its own game in flight replaced or set aside (wave C, spec §6.16): a small buff —
      // the bot has no taste to judge a game by, so it spends one now and then.
      case "game":
        if (intent.who === input.actor.seasonPlayerId) bump(SCORE_BUFF * 0.3, "buff");
        break;
      // An object on the board (wave D, spec §6.18): one that stops a move, set on a rival's way, is an attack;
      // one that helps, set on the bot's own, a buff. The cell was picked for it (`objectCellsFor`).
      case "place": {
        if (intent.by !== input.actor.seasonPlayerId) break;
        const placed = input.catalog.item(intent.key);
        if (!placed) break;
        if (objectStops(placed)) bump(SCORE_ATTACK * 0.8, "attack");
        else bump(SCORE_BUFF * 0.6, "buff");
        break;
      }
      case "move": {
        // Out of turn (spec §7.3): forward for the bot, back for a rival, or a
        // jump or a swap that lands the bot ahead of where it stands.
        const self = input.actor.seasonPlayerId;
        const positionOf = (id: string) =>
          id === self ? input.actor.position : (input.others.find((o) => o.seasonPlayerId === id)?.position ?? null);
        const to = intent.to;
        if (typeof intent.who !== "string") break;
        if ("by" in to) {
          if (intent.who === self && to.by > 0) bump(SCORE_BUFF * 0.8, "buff");
          else if (intent.who !== self && to.by < 0) bump(SCORE_ATTACK, "attack");
        } else if ("player" in to || ("swapWith" in to && typeof to.swapWith === "string")) {
          const other = "player" in to ? to.player : (to.swapWith as string);
          const there = positionOf(other);
          if (intent.who === self && there !== null && there > input.actor.position + 1) bump(SCORE_BUFF * 0.9, "buff");
        }
        break;
      }
    }
  }

  return best;
}

/** Whether a rival holds a bonus item an operation may take — unknown counts as yes. */
function holdsBonus(input: BotItemInput, seasonPlayerId: string): boolean {
  const other = input.others.find((o) => o.seasonPlayerId === seasonPlayerId);
  return other !== undefined && (other.bonusItems ?? 1) > 0;
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
  // Kept from its items (wave B): the use checks would refuse whatever it tried.
  if (input.held.length === 0 || input.forbidden === true) return null;
  const rng = options.rng ?? Math.random;

  const ordered = orderTargets(input.others, input.actor.position, options.strategy, rng);
  const standings: Standing[] = [
    { seasonPlayerId: input.actor.seasonPlayerId, position: input.actor.position, status: input.actor.status },
    ...input.others.map((o) => ({ seasonPlayerId: o.seasonPlayerId, position: o.position, status: o.status as Standing["status"] })),
  ];
  /**
   * The first eligible player in the strategy's order — of those a target
   * filter allows, when the item has one. Exactly one is offered per item, so
   * "leader" stays a policy, not a tie-breaker.
   */
  const primaryFor = (def: CompiledItem): BotOtherPlayer | null => {
    if (!input.allowTargetingOthers) return null;
    const filter = def.usage.filter;
    return (
      ordered.find(
        (o) => eligible(o, input.pvpProtectionMoves) && (!filter || filterAllows(filter, input.actor, o, standings)),
      ) ?? null
    );
  };

  let best: BotItemPlan | null = null;

  for (const hold of input.held) {
    const def = input.catalog.item(hold.revisionId ?? hold.itemKey);
    if (!def) continue;
    const primary = primaryFor(def);
    // Rank is unused by the core entries today; it is passed for the entries
    // that may read it later, and computed relative to the actor.
    const primarySnapshot = primary
      ? snapshotOf(primary, input.others.filter((o) => o.position > primary.position).length + 1)
      : null;
    const primaryEffects = new Set(primary?.effects ?? []);
    // An item that asks for a pick takes the bot's newest instance it may (spec §6.10).
    const spec = def.usage.choice;
    const choice = spec ? ((input.choosable ?? []).find((c) => choosableMatches(spec, c) && c.instanceId !== hold.inventoryId)?.instanceId ?? null) : null;
    if (spec && !choice) continue;
    // One that asks for an item of the catalog takes one of what it may, at random (spec §6.12).
    const offered = def.usage.entryChoice ? (input.entryOptions?.(def) ?? []) : [];
    if (def.usage.entryChoice && offered.length === 0) continue;
    const chosenEntry = offered.length > 0 ? offered[Math.min(offered.length - 1, Math.floor(rng() * offered.length))]!.entryId : null;
    // One that asks for a pick for the next game takes one of what the pool offers, at random (wave C, §6.16).
    const pickable = def.usage.pick ? (input.picks?.(def.usage.pick, def) ?? []) : [];
    if (def.usage.pick && pickable.length === 0) continue;
    const pick = pickable.length > 0 ? pickable[Math.min(pickable.length - 1, Math.floor(rng() * pickable.length))]! : null;

    const verdict = checkItemUse({
      usage: { mode: def.usage.activation, window: def.usage.window, target: def.usage.target, filter: def.usage.filter },
      hasOpenRoll: input.hasOpenRoll,
      actor: input.actor,
      target: primarySnapshot,
      targetInSameSeason: true,
      allowTargetingOthers: input.allowTargetingOthers,
      pvpProtectionMoves: input.pvpProtectionMoves,
      standings,
    });
    if (!verdict.ok) continue;

    const target =
      verdict.target === "other"
        ? primarySnapshot
        : verdict.target === "self"
          ? input.actor
          : null;

    // What the item *would* do. A fixed rng: planning must not consume the
    // bot's random stream, and a random rule is scored by its middle.
    const result = def.use({
      params: hold.params,
      actor: input.actor,
      target,
      actorEntries: [],
      targetEntries: [],
      rng: () => 0.5,
      choice,
      entryChoice: chosenEntry,
      instanceId: hold.inventoryId,
      pick,
    });
    if (result.rejected) continue;

    const scored = scoreIntents(
      input,
      result.intents,
      target && target.seasonPlayerId !== input.actor.seasonPlayerId
        ? primaryEffects
        : new Set<string>(),
      { autoCleanse: options.autoCleanse, usingId: hold.inventoryId },
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
      ...(choice ? { choiceInstanceId: choice } : {}),
      ...(chosenEntry ? { chosenEntryId: chosenEntry } : {}),
      ...(pick ? { pick } : {}),
    };
  }

  return best;
}

/**
 * Whether an object stops the move that enters it (wave D, spec §6.18) — one a
 * bot places on a rival's way; one that does not, a longer move, on its own.
 */
export function objectStops(item: Pick<CompiledItem, "doc">): boolean {
  return item.doc.rules.some((r) => r.when === "onObjectEntered" && r.do.some((a) => a.op === "stopMove"));
}

/**
 * The cells a bot places an object on (wave D, spec §6.18): within a move
 * ahead of whom it is for — the nearest rival ahead for one that stops a move,
 * the bot itself for one that helps — among those an object may stand on. None
 * when nobody is ahead to stop.
 */
export function objectCellsFor(input: {
  item: Pick<CompiledItem, "doc">;
  free: readonly number[];
  self: number;
  /** Where the bot's rivals stand. */
  rivals: readonly number[];
  reach?: number;
}): UsePick[] {
  const reach = input.reach ?? 6;
  const ahead = input.rivals.filter((r) => r > input.self);
  const anchor = objectStops(input.item) ? (ahead.length > 0 ? Math.min(...ahead) : null) : input.self;
  if (anchor === null) return [];
  return input.free.filter((cell) => cell > anchor && cell <= anchor + reach).map((cell) => ({ cell }));
}
