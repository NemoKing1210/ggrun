/**
 * Items and effects inside a turn, apart from the database: the holder's
 * statuses at each hook, the wheel of a landing cell, and the settlement at
 * the end — the rules that fired, the charges they spent, the intents they
 * asked for and the counters of the roll (docs/IEE_CONSTRUCTOR_SPEC.md §7.1,
 * §7.9).
 *
 * The game's turn (`lib/modules/game/service/turn.ts`) loads the instances and
 * calls these inside its transaction; the simulations (`../sim`) call the same
 * functions over an in-memory store, so an entry scenario and a sandbox run
 * settle a turn exactly the way a season does.
 */
import { log } from "@/lib/infrastructure/logger";
import type { EventType } from "@/lib/infrastructure/events";
import {
  emptyModifiers,
  pickWheelOutcome,
  type HookTurnContext,
  type IeeConfig,
  type IeeIntent,
  type IeeModifiers,
  type IeePlayerSnapshot,
  type PoolCounters,
  type Polarity,
  type WheelOutcome,
} from "@/lib/engine";
import { isEffect, isItem, type CompiledEntry, type EntryFacts } from "@/lib/engine/iee/dsl";
import { runLiveHook, type FiredRule, type LiveEffect, type TurnHook } from "@/lib/engine/iee/resolve/live";
import type { IeeInstanceRow } from "@/db/schema";

import { fire, grant, runIntents, tick, type ExecContext } from "../executor";
import type { SeasonRegistry } from "../registry";

export * from "./reaction";

/** A feed row; `seasonPlayerId` names whom it is about when that is not the turn's player. */
export type FeedEntry = { eventType: EventType; payload: Record<string, unknown>; seasonPlayerId?: string };

// ---------------------------------------------------------------------------
// The holder's statuses at each hook
// ---------------------------------------------------------------------------

/**
 * A player's effects, loaded once and then queried synchronously at each hook
 * of a turn. Loading per hook would issue half a dozen queries for one move
 * and — worse — let the set change midway through it.
 */
export interface TurnHooks {
  run: (hook: TurnHook, turn: HookTurnContext) => IeeModifiers;
  /** Instances that asked for a charge, across every hook of the turn. */
  consumed: Set<string>;
  /** Every rule that fired, for the journal. */
  fired: FiredRule[];
  /** What the rules asked the executor to do (grants, points, cleanses). */
  intents: IeeIntent[];
}

export function noHooks(): TurnHooks {
  return { run: () => emptyModifiers(), consumed: new Set(), fired: [], intents: [] };
}

/**
 * What of a holder's instances acts at the turn hooks: their effects, and the
 * passive or cursed items they hold (spec §6.10). An active item waits to be
 * used; a revision the season no longer plays is skipped, never thrown on.
 * An effect that remembers whom its item was aimed at sees them as they stand
 * in `targets` (spec §6.11) — nobody, when they are not there.
 */
export function liveSources(
  registry: SeasonRegistry,
  rows: readonly IeeInstanceRow[],
  targets: ReadonlyMap<string, IeePlayerSnapshot> = new Map(),
): LiveEffect[] {
  return rows.flatMap((row): LiveEffect[] => {
    const entry = row.kind === "effect" ? registry.effect(row.revisionId) : row.kind === "item" ? registry.item(row.revisionId) : null;
    if (!entry || (isItem(entry) && entry.usage.activation === "active")) return [];
    return [
      {
        instanceId: row.id,
        entry,
        params: (row.params ?? {}) as LiveEffect["params"],
        grantedAt: row.grantedAt.getTime(),
        anchorRollSeq: row.anchorRollSeq,
        target: row.aimedPlayerId ? (targets.get(row.aimedPlayerId) ?? null) : null,
      },
    ];
  });
}

/** The players a holder's effects remember their items were aimed at (spec §6.11). */
export function rememberedPlayers(rows: readonly IeeInstanceRow[]): string[] {
  return [...new Set(rows.flatMap((row) => (row.aimedPlayerId ? [row.aimedPlayerId] : [])))];
}

/**
 * The dispatch over a holder's live effects: each hook runs the effects that
 * take part in the roll and remembers what fired, what was asked for and
 * which charges to spend.
 */
export function hooksOver(input: {
  effects: readonly LiveEffect[];
  self: IeePlayerSnapshot;
  selfEntries: readonly EntryFacts[];
  rng: () => number;
}): TurnHooks {
  const hooks = noHooks();
  hooks.run = (hook, turn) => {
    const { mods, fired } = runLiveHook({
      hook,
      effects: input.effects,
      turn,
      base: { self: input.self, target: null, selfEntries: input.selfEntries, targetEntries: [], rng: input.rng },
    });
    for (const id of mods.consumed) hooks.consumed.add(id);
    hooks.fired.push(...fired);
    hooks.intents.push(...mods.intents);
    if (mods.conflicts.length > 0) {
      log.debug("iee.hook.conflicts", { hook, conflicts: mods.conflicts });
    }
    return mods;
  };
  return hooks;
}

/**
 * The end of a turn, inside its transaction: journal the rules that fired,
 * spend the charges they asked for, carry out their intents, and count the
 * durations of this roll down (spec §7.9). Returns the feed rows to publish.
 */
export async function settleTurnHooks(
  ctx: ExecContext,
  hooks: TurnHooks,
  turn: {
    seasonPlayerId: string;
    turnRollSeq: number;
    outcome: "passed" | "dropped";
    /** False when a rule cancelled the move. */
    moved: boolean;
    reveal: boolean;
  },
): Promise<FeedEntry[]> {
  const feed: FeedEntry[] = [];
  feed.push(
    ...(await fire(ctx, {
      fired: hooks.fired,
      consumed: [...hooks.consumed],
      rollSeq: turn.turnRollSeq,
      reveal: turn.reveal,
    })),
  );
  if (hooks.intents.length > 0) {
    feed.push(
      ...(await runIntents(ctx, hooks.intents, {
        source: "rule",
        reveal: turn.reveal,
        anchor: {
          seasonPlayerId: turn.seasonPlayerId,
          anchorRollSeq: turn.turnRollSeq,
        },
        // The holder's own rules asked: what they hand them or move them arrives (§6.13).
        from: turn.seasonPlayerId,
      })),
    );
  }
  feed.push(
    ...(await tick(ctx, {
      holder: turn.seasonPlayerId,
      rollSeq: turn.turnRollSeq,
      ticks: { roll: true, moved: turn.moved, passed: turn.outcome === "passed" },
      reveal: turn.reveal,
    })),
  );
  return feed;
}

// ---------------------------------------------------------------------------
// The wheel of a landing cell
// ---------------------------------------------------------------------------

/** What the wheel's picker reads about a player and the season. */
export interface PoolContext {
  counters: PoolCounters;
  player: IeePlayerSnapshot;
  activeEffectKeys: string[];
  /** Active instances per tag — the season's `tagLimits` count them. */
  activeTagCounts: Record<string, number>;
  heldItemCount: number;
  seasonRollSeq: number;
  playerCount: number;
  /** Active rivals behind the landing cell; unknown = someone is. */
  playersBehind?: number;
  /** Keys of the items the player holds — a unique one is not offered twice (spec §6.10). */
  heldItemKeys?: string[];
}

export interface WheelResult {
  outcome: WheelOutcome;
  /** Feed rows for the caller's batch insert — written in the same transaction. */
  events: FeedEntry[];
  /** The entry a new instance was made of; null when the spin handed nothing new out. */
  granted: CompiledEntry | null;
}

/**
 * Picks and grants what a bonus or penalty cell hands out.
 *
 * Returns `kind: "fallback"` without granting anything when the subsystem is
 * off or the pool is empty — the caller then applies the cell's plain point
 * value, so a mis-tuned season still plays.
 */
export async function applyWheel(
  ctx: ExecContext,
  params: {
    /** The participant who landed. */
    sp: { id: string };
    polarity: Polarity;
    iee: IeeConfig;
    context: PoolContext;
    /** The move that landed — null in a simulation, which writes no moves. */
    moveId: string | null;
    /** The roll being resolved: a drop counts from the roll after it. */
    turnRollSeq: number;
    rng: () => number;
  },
): Promise<WheelResult> {
  const { sp, polarity, iee, context } = params;
  // Every draw the pick makes is journaled with the grant it decides.
  const draws: number[] = [];
  const rng = () => {
    const value = params.rng();
    draws.push(value);
    return value;
  };

  const outcome = pickWheelOutcome({
    polarity,
    config: iee,
    catalog: ctx.registry.candidates(),
    entries: ctx.registry.entryConfigs(),
    catalogDefaults: ctx.registry.defaults(),
    player: context.player,
    counters: context.counters,
    activeEffectKeys: context.activeEffectKeys,
    activeTagCounts: context.activeTagCounts,
    heldItemCount: context.heldItemCount,
    seasonRollSeq: context.seasonRollSeq,
    playerCount: context.playerCount,
    playersBehind: context.playersBehind,
    heldItemKeys: context.heldItemKeys,
    rng,
  });

  if (outcome.kind === "fallback" || outcome.kind === "nothing" || !outcome.key) {
    return { outcome, events: [], granted: null };
  }

  const granted = await grant(ctx, {
    entry: outcome.key,
    to: sp.id,
    source: polarity === "positive" ? "cell_bonus" : "cell_penalty",
    sourceMoveId: params.moveId,
    reveal: iee.revealDropsInFeed,
    anchor: { anchorRollSeq: params.turnRollSeq },
    draws,
    // A drop reaches its player through the game: their entries may answer it (§6.13).
    arrival: { from: null },
  });

  if (granted.state === "unknown_entry") {
    // A key that survived selection but has no definition means the catalog
    // and the season pool have drifted. Fall back rather than crash a turn.
    return { outcome: { ...outcome, kind: "fallback", fallbackReason: "unknown_key" }, events: [], granted: null };
  }
  if (granted.state === "blocked_unique" || granted.state === "blocked_stack" || granted.state === "blocked_limit") {
    // Unreachable in practice — the picker gates a duplicate `unique` and the
    // season's limits out before the wheel is built — but if it is reached,
    // the honest thing to show is an empty slot rather than a status the
    // player did not receive.
    log.debug("iee.grant.blocked", { key: outcome.key, state: granted.state });
    return { outcome: { ...outcome, kind: "nothing", key: null }, events: [], granted: null };
  }
  // The wheel landed on it, and the player's entries answered it (§6.13): the spin shows what it
  // landed on, the feed says what stopped it, and nothing new is held.
  if (granted.state === "intercepted") return { outcome, events: granted.feed, granted: null };
  return { outcome, events: granted.feed, granted: granted.state === "granted" ? granted.entry : null };
}

/**
 * The picker's context once a spin has handed an entry out: the drop counted
 * to the season and the player, and what the player now holds — so the spin
 * after it sees it, as a unique entry just handed out is gated out (spec §6.12).
 */
export function countedIn(context: PoolContext, granted: CompiledEntry | null): PoolContext {
  if (!granted) return context;
  const key = granted.key;
  const add = (counts: Readonly<Record<string, number>>) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 });
  // An instant effect acts and is gone: a drop, never something held.
  const kept = !(isEffect(granted) && granted.duration.unit === "instant");
  const activeTagCounts = { ...context.activeTagCounts };
  if (kept) for (const tag of granted.tags) activeTagCounts[tag] = (activeTagCounts[tag] ?? 0) + 1;
  return {
    ...context,
    counters: {
      perSeason: add(context.counters.perSeason),
      perPlayer: add(context.counters.perPlayer),
      lastDropRollSeq: { ...context.counters.lastDropRollSeq, [key]: context.seasonRollSeq },
    },
    activeEffectKeys: isEffect(granted) && kept ? [...context.activeEffectKeys, key] : context.activeEffectKeys,
    activeTagCounts,
    heldItemCount: isItem(granted) && granted.character === "bonus" ? context.heldItemCount + 1 : context.heldItemCount,
    heldItemKeys: isItem(granted) ? [...(context.heldItemKeys ?? []), key] : context.heldItemKeys,
  };
}

/**
 * The wheels a turn spins, one after another: the landing's own, then each
 * one more a rule asked for (wave B, `extraSpin`, spec §6.12) — every spin
 * with the picker's usual gates, seeing what the spins before it handed out.
 */
export async function applyWheels(
  ctx: ExecContext,
  params: Omit<Parameters<typeof applyWheel>[1], "polarity"> & { wheels: readonly Polarity[] },
): Promise<{ outcomes: WheelOutcome[]; events: FeedEntry[] }> {
  const { wheels, ...rest } = params;
  let context = params.context;
  const outcomes: WheelOutcome[] = [];
  const events: FeedEntry[] = [];
  for (const polarity of wheels) {
    const spun = await applyWheel(ctx, { ...rest, polarity, context });
    outcomes.push(spun.outcome);
    events.push(...spun.events);
    context = countedIn(context, spun.granted);
  }
  return { outcomes, events };
}
