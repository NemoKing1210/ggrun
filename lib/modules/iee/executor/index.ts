/**
 * The executor — the one place IEE state is written
 * (docs/IEE_CONSTRUCTOR_SPEC.md §9).
 *
 * Every operation runs inside the caller's transaction and journals what it
 * did and why. Counters are eager (§7.9): they move in the transaction of the
 * event that consumes them, and an instance that runs out ends right there.
 *
 * Feed rows are *returned*, not written: the turn inserts its feed in one
 * ordered batch, and the item and admin paths decide what is public, so the
 * executor projects and the caller publishes (§9.3).
 */
import { randomUUID } from "node:crypto";

import type { EventType } from "@/lib/infrastructure/events";
import type {
  CopyItemIntent,
  DecideIntent,
  IeeConfig,
  IeeIntent,
  IeeParams,
  IeePlayerSnapshot,
  MoveIntent,
  MoveItemsIntent,
  MoveWho,
  PlaceIntent,
  Rarity,
  RemoveIntent,
  SwapItemsIntent,
  UsePick,
  FiredObject,
  TurnObject,
} from "@/lib/engine";
import {
  UsePickSchema,
  factsOf,
  isItem,
  type ArrivalView,
  type CompiledEffect,
  type CompiledEntry,
  type EntryFacts,
  type IncomingAnswer,
  type Localized,
  type ObjectAnswer,
  type SetFailure,
} from "@/lib/engine/iee/dsl";
import { answerOf, standingOf, type AnsweringSource } from "@/lib/engine/iee/resolve/incoming";
import type { PoolShape, PoolSource } from "@/lib/engine/iee/resolve/pool";
import {
  checkChoice,
  defaultChoiceOf,
  holdQuestion,
  victimQuestion,
  type Candidate,
  type DecisionChoice,
  type DecisionOption,
  type DefaultRule,
  type Question,
} from "@/lib/engine/iee/resolve/decisions";
import {
  countingFrom,
  participates,
  refreshCounter,
  tickAmount,
  type FiredRule,
  type TurnTicks,
} from "@/lib/engine/iee/resolve/live";
import type { HookPatch } from "@/lib/engine";
import type { IeeDecisionRow, IeeInstanceRow } from "@/db/schema";

import type { SeasonRegistry } from "../registry";
import type { EndReason, IeeStore, NewJournalRow, PlayerPlace } from "./store";

export { pgStore, type IeeStore, type Tx, type EndReason, type PlayerPlace } from "./store";

/**
 * Reaction chains are at most two deep (spec §7.8): a grant's own grants,
 * once; an answer to what arrives, and one more to what it turned back.
 */
export const MAX_CHAIN_DEPTH = 2;

/**
 * A feed row the caller publishes. `seasonPlayerId` names whom it is about
 * when that is not the caller's own player — a rival moved out of turn.
 */
export type IeeFeedEntry = { eventType: EventType; payload: Record<string, unknown>; seasonPlayerId?: string };

/** The board as an out-of-turn move needs it (spec §7.3). */
export interface BoardInfo {
  size: number;
  loop: boolean;
  /** The finish cell; null on a board without one. */
  finishAt: number | null;
}

export interface ExecContext {
  store: IeeStore;
  seasonId: string;
  /** What the season plays and how it tunes each entry (its catalog). */
  registry: SeasonRegistry;
  /** The season's IEE settings and season-wide limits (`seasons.config.iee`). */
  config: IeeConfig;
  /** Season-wide resolved-roll counter — `turn_seq` and the cooldown clock. */
  seasonRollSeq: number;
  /** Who acts, for attribution. */
  actorPlayerId?: string | null;
  actorUserId?: string | null;
  /** Server randomness for rules run here (`onApply`, `onExpire`). */
  rng: () => number;
  /** A participant as rules see them. */
  snapshot(seasonPlayerId: string): Promise<IeePlayerSnapshot>;
  /**
   * The roll a grant to this participant counts from: their counter now, and
   * the anchor — one roll later while they have a game in flight.
   */
  anchorFor(seasonPlayerId: string): Promise<{ anchorRollSeq: number }>;
  /**
   * The season's board, for out-of-turn moves. Without one a move is kept at
   * cell 0 and above, and nothing finishes.
   */
  board?: () => Promise<BoardInfo>;
  /**
   * Decisions opened or settled here (wave B, spec §7.6) — the caller announces
   * them once its transaction commits: the player's page refreshes, a new
   * question sends a notification. Nothing is collected when absent.
   */
  decisions?: DecisionNote[];
}

/** A decision that changed, for the caller to announce after its commit (§7.6). */
export interface DecisionNote {
  decisionId: string;
  playerId: string;
  kind: IeeDecisionRow["kind"];
  status: IeeDecisionRow["status"];
}

type JournalInput = Partial<Omit<NewJournalRow, "seasonId" | "turnSeq">> & { op: string };

async function journal(ctx: ExecContext, row: JournalInput, draws: readonly number[] = []): Promise<number> {
  return ctx.store.journal({
    seasonId: ctx.seasonId,
    turnSeq: ctx.seasonRollSeq,
    op: row.op,
    actorPlayerId: row.actorPlayerId ?? ctx.actorPlayerId ?? null,
    targetPlayerId: row.targetPlayerId ?? null,
    actorUserId: row.actorUserId ?? ctx.actorUserId ?? null,
    instanceId: row.instanceId ?? null,
    revisionId: row.revisionId ?? null,
    ruleIndex: row.ruleIndex ?? null,
    intent: row.intent ?? {},
    outcome: row.outcome ?? {},
    rng: draws.length > 0 ? [...draws] : null,
    causeId: row.causeId ?? null,
    visibility: row.visibility ?? "staff",
  });
}

/** Wraps an rng so the draws a rule made can be journaled with it. */
function recording(rng: () => number): { rng: () => number; draws: number[] } {
  const draws: number[] = [];
  return {
    rng: () => {
      const value = rng();
      draws.push(value);
      return value;
    },
    draws,
  };
}

// ---------------------------------------------------------------------------
// Feed projection — the existing IEE event types (§9.3)
// ---------------------------------------------------------------------------

function itemGranted(entry: CompiledEntry, instanceId: string, source: string): IeeFeedEntry {
  return {
    eventType: "item_granted",
    payload: { itemKey: entry.key, instanceId, source, polarity: entry.polarity, name: entry.names },
  };
}

function effectApplied(entry: CompiledEntry, instanceId: string, source: string, refreshed: boolean): IeeFeedEntry {
  return {
    eventType: "effect_applied",
    payload: { effectKey: entry.key, instanceId, refreshed, source, polarity: entry.polarity, name: entry.names },
  };
}

function itemExpired(entry: CompiledEntry | null, row: IeeInstanceRow): IeeFeedEntry {
  return {
    eventType: "item_expired",
    payload: { itemKey: entry?.key ?? null, instanceId: row.id, name: entry?.names ?? null, character: entry?.character ?? null },
  };
}

function effectExpired(entry: CompiledEntry | null, row: IeeInstanceRow): IeeFeedEntry {
  return {
    eventType: "effect_expired",
    payload: { effectKey: entry?.key ?? null, instanceId: row.id, name: entry?.names ?? null },
  };
}

/** What an answer to an arrival did, as the feed calls it (spec §6.13). */
const ANSWER_HOW: Record<IncomingAnswer["kind"], "blocked" | "reflected" | "amplified" | "replaced"> = {
  block: "blocked",
  reflect: "reflected",
  amplify: "amplified",
  replace: "replaced",
};

/** What other rules see of a participant's active instances. */
export function factsOfRows(registry: SeasonRegistry, rows: readonly IeeInstanceRow[]): EntryFacts[] {
  const out: EntryFacts[] = [];
  for (const row of rows) {
    const entry = registry.get(row.revisionId);
    if (entry) out.push(factsOf(entry));
  }
  return out;
}

// ---------------------------------------------------------------------------
// grant
// ---------------------------------------------------------------------------

export type GrantState =
  | "granted"
  | "refreshed"
  | "blocked_unique"
  | "blocked_stack"
  /** A season-wide limit (spec §4.5): a disabled tag, the effect cap or a tag limit. */
  | "blocked_limit"
  | "unknown_entry"
  | "chain_depth"
  /** The recipient's entries answered it (spec §6.13): blocked, or replaced by a move. */
  | "intercepted";

/**
 * The season-wide limits a new instance would break (spec §4.5), as a journal
 * reason; null when it fits. They count instances, so a refresh never trips
 * them — it adds none.
 */
async function limitReached(ctx: ExecContext, holder: string, entry: CompiledEntry): Promise<string | null> {
  const { maxActiveEffectsPerPlayer, tagLimits } = ctx.config;
  const limited = entry.tags.filter((tag) => tagLimits[tag] !== undefined);
  const capped = entry.kind === "effect" && maxActiveEffectsPerPlayer !== null;
  if (!capped && limited.length === 0) return null;
  const active = await ctx.store.activeForHolder(holder);
  if (capped && active.filter((row) => row.kind === "effect").length >= maxActiveEffectsPerPlayer!) {
    return "max_active_effects";
  }
  for (const tag of limited) {
    const count = active.filter((row) => ctx.registry.get(row.revisionId)?.tags.includes(tag)).length;
    if (count >= tagLimits[tag]!) return `tag_limit:${tag}`;
  }
  return null;
}

export interface GrantInput {
  /** Key, entry id or revision id. */
  entry: string | CompiledEntry;
  /** Recipient seasonPlayerId. */
  to: string;
  source: string;
  sourceMoveId?: string | null;
  /** Who cast it, for "the victim learns who hit them". */
  ownerPlayerId?: string | null;
  /** Project feed rows for this grant. */
  reveal: boolean;
  /** The turn passes the roll it is resolving; everyone else asks `anchorFor`. */
  anchor?: { anchorRollSeq: number };
  causeId?: number | null;
  depth?: number;
  /** Server random draws that decided this grant — the wheel's pick (spec §4.3, `rng`). */
  draws?: readonly number[];
  /**
   * The player the item that handed this effect to its user was aimed at —
   * the effect remembers them (spec §6.11, «Магнит»).
   */
  aimedAt?: string | null;
  /** What the use that handed this effect to its user picked for their next game — the effect remembers it (wave C, spec §6.16). */
  chosen?: UsePick | null;
  /**
   * It reaches its recipient through the game — a drop, a rule's grant, a copy
   * — so their entries may answer it (spec §6.13): who sent it (the holder of
   * the rule, a rival, or null for the wheel) and the answers given already in
   * its chain, and whether an answer shows in the feed (the grant's own
   * `reveal` unless set — a use names what answered it, as it names its moves).
   * Absent for what staff and rewards hand out.
   */
  arrival?: { from: string | null; reactions?: number; reveal?: boolean };
  /** It comes this much stronger — an answer amplified it (spec §6.13). */
  factor?: number;
}

export interface GrantResult {
  state: GrantState;
  entry: CompiledEntry | null;
  instanceId: string | null;
  journalId: number;
  feed: IeeFeedEntry[];
}

/**
 * Hands an entry to a participant. What reaches them through the game —
 * `arrival` — is first put to their entries (spec §6.13): stopped, replaced by
 * a move, or made stronger; then it lands as `grantOne` lands it.
 */
export async function grant(ctx: ExecContext, input: GrantInput): Promise<GrantResult> {
  const entry = typeof input.entry === "string" ? ctx.registry.get(input.entry) : input.entry;
  const reactions = input.arrival?.reactions ?? 0;
  let factor = input.factor ?? 1;
  const before: IeeFeedEntry[] = [];
  // Only what would land is asked about: a missing entry, a chain too deep or a tag the season removed is refused first.
  const asks =
    entry !== null &&
    input.arrival !== undefined &&
    reactions < MAX_CHAIN_DEPTH &&
    (input.depth ?? 0) <= MAX_CHAIN_DEPTH &&
    !entry.tags.some((tag) => ctx.config.disabledTags.includes(tag));
  if (asks) {
    const answered = await answerArrival(ctx, {
      to: input.to,
      from: input.arrival!.from,
      arrival: { is: "entry", entry: factsOf(entry) },
      amplifiable: !(entry.kind === "effect" && entry.duration.unit === "permanent"),
      reveal: input.arrival!.reveal ?? input.reveal,
      causeId: input.causeId ?? null,
      what: { entry: entry.key, source: input.source },
      draws: input.draws ?? [],
    });
    if (answered?.answer.kind === "amplify") {
      factor *= answered.answer.factor;
      before.push(...answered.feed);
    } else if (answered) {
      const feed = [...answered.feed];
      if (answered.answer.kind === "replace" && answered.answer.with > 0) {
        feed.push(...(await movePlayer(ctx, { intent: { kind: "move", who: input.to, to: { by: answered.answer.with }, key: answered.entry.key }, causeId: answered.journalId, reveal: input.arrival!.reveal ?? input.reveal })));
      }
      return { state: "intercepted", entry, instanceId: null, journalId: answered.journalId, feed };
    }
  }
  if (entry && isItem(entry) && factor > 1) {
    // An item comes as copies: each one lands as a grant of its own — a unique one only once.
    const first = await grantOne(ctx, { ...input, entry, factor: 1 });
    const feed = [...before, ...first.feed];
    for (let i = 1; i < factor; i++) feed.push(...(await grantOne(ctx, { ...input, entry, factor: 1, causeId: first.journalId })).feed);
    return { ...first, feed };
  }
  const result = await grantOne(ctx, { ...input, factor });
  return before.length > 0 ? { ...result, feed: [...before, ...result.feed] } : result;
}

/** Lands one grant: refusals, stacking, the instance, its arrival rules. */
async function grantOne(ctx: ExecContext, input: GrantInput): Promise<GrantResult> {
  const depth = input.depth ?? 0;
  const factor = input.factor ?? 1;
  const draws = input.draws ?? [];
  const entry = typeof input.entry === "string" ? ctx.registry.get(input.entry) : input.entry;
  const owner = input.ownerPlayerId ?? null;
  const intent = {
    entry: entry?.key ?? (typeof input.entry === "string" ? input.entry : null),
    source: input.source,
    depth,
  };
  const refuse = async (state: GrantState, reason: string): Promise<GrantResult> => ({
    state,
    entry,
    instanceId: null,
    feed: [],
    journalId: await journal(ctx, {
      op: "noop",
      targetPlayerId: input.to,
      actorPlayerId: owner ?? undefined,
      revisionId: entry?.revisionId ?? null,
      intent,
      outcome: { reason },
      causeId: input.causeId ?? null,
    }, draws),
  });

  if (!entry) return refuse("unknown_entry", "unknown_entry");
  if (depth > MAX_CHAIN_DEPTH) return refuse("chain_depth", "chain_depth");
  // Removed from the season entirely, whoever hands it out (spec §4.5).
  const disabledTag = entry.tags.find((tag) => ctx.config.disabledTags.includes(tag));
  if (disabledTag) return refuse("blocked_limit", `disabled_tag:${disabledTag}`);

  const start = ctx.registry.start(entry);
  const problems = start.problems.length > 0 ? { overrideProblems: start.problems } : {};
  const visibility = input.reveal ? ("public" as const) : ("staff" as const);
  const instanceId = randomUUID();

  if (isItem(entry)) {
    // One in the season (wave D, spec §6.19): once handed out, it only changes hands.
    if (entry.usage.seasonUnique && (await ctx.store.handedOut(ctx.seasonId, entry.entryId))) return refuse("blocked_unique", "unique_season");
    // At most one per holder — cursed items always (spec §6.10).
    if (entry.usage.unique) {
      const held = await ctx.store.activeForHolder(input.to);
      if (held.some((row) => row.kind === "item" && row.entryId === entry.entryId)) return refuse("blocked_unique", "unique");
    }
    const limit = await limitReached(ctx, input.to, entry);
    if (limit) return refuse("blocked_limit", limit);
    // A passive or cursed item acts at its holder's turns, so it counts from a
    // roll as an effect does: never the game in flight, never the roll that dropped it.
    const anchor = entry.usage.activation === "active" ? null : (input.anchor ?? (await ctx.anchorFor(input.to)));
    const journalId = await journal(ctx, {
      op: "grant",
      instanceId,
      revisionId: entry.revisionId,
      targetPlayerId: input.to,
      actorPlayerId: owner ?? undefined,
      intent,
      outcome: {
        state: "granted",
        charges: start.charges,
        params: start.params,
        ...(anchor ? { anchorRollSeq: anchor.anchorRollSeq } : {}),
        ...problems,
      },
      causeId: input.causeId ?? null,
      visibility,
    }, draws);
    await ctx.store.insertInstance({
      id: instanceId,
      seasonId: ctx.seasonId,
      entryId: entry.entryId,
      revisionId: entry.revisionId,
      kind: "item",
      holderKind: "player",
      holderPlayerId: input.to,
      ownerPlayerId: owner,
      params: start.params,
      chargesLeft: start.charges,
      remaining: null,
      remainingUnit: null,
      anchorRollSeq: anchor?.anchorRollSeq ?? null,
      source: input.source,
      sourceMoveId: input.sourceMoveId ?? null,
      causeJournalId: journalId,
      grantedRollSeq: ctx.seasonRollSeq,
    });
    const feed: IeeFeedEntry[] = input.reveal ? [itemGranted(entry, instanceId, input.source)] : [];
    if (entry.onPickup.length > 0) {
      feed.push(
        ...(await runLifecycle(ctx, entry, "onPickup", {
          holder: input.to,
          params: start.params,
          instanceId,
          causeId: journalId,
          depth,
          reveal: input.reveal,
        })),
      );
    }
    // One more bonus item than the holder may hold asks which to keep (§6.14).
    if (entry.character === "bonus" || entry.standing.length > 0) {
      feed.push(...(await enforceHoldLimit(ctx, input.to, journalId, input.reveal)));
    }
    return { state: "granted", entry, instanceId, journalId, feed };
  }

  const effect = entry;
  if (effect.duration.unit === "instant") return grantInstant(ctx, effect, input, { intent, visibility, problems, start, factor });
  // Stronger, it lasts that many times as long (spec §6.13); a permanent effect lasts as it does.
  if (factor > 1 && start.remaining !== null) start.remaining *= factor;
  const anchor = input.anchor ?? (await ctx.anchorFor(input.to));
  const held = (await ctx.store.activeForHolder(input.to)).filter(
    (row) => row.kind === "effect" && row.entryId === effect.entryId,
  );

  if (effect.stacking.mode === "unique" && held.length > 0) return refuse("blocked_unique", "unique");

  if (effect.stacking.mode === "refresh" && held.length > 0) {
    const current = held[0]!;
    // A renewal counts like a fresh copy: from the roll a fresh copy would
    // count from, so the roll underway stays with the old count (§7.10).
    const next = refreshCounter({
      existing: {
        remaining: current.remaining,
        anchorRollSeq: current.anchorRollSeq,
        countFromRollSeq: current.countFromRollSeq,
      },
      incoming: { remaining: start.remaining, anchorRollSeq: anchor.anchorRollSeq },
    });
    if (next && (next.remaining !== current.remaining || next.countFromRollSeq !== current.countFromRollSeq)) {
      await ctx.store.renew(current.id, next);
    }
    // A renewal aimed at someone else remembers the new player (§6.11), one that picked again its new pick (§6.16).
    const reaimed = input.aimedAt ? input.aimedAt !== current.aimedPlayerId : false;
    if (reaimed) await ctx.store.aim(current.id, input.aimedAt!);
    const repicked = input.chosen ? JSON.stringify(input.chosen) !== JSON.stringify(current.chosen ?? null) : false;
    if (repicked) await ctx.store.choose(current.id, input.chosen!);
    const journalId = await journal(ctx, {
      op: "grant",
      instanceId: current.id,
      revisionId: current.revisionId,
      targetPlayerId: input.to,
      actorPlayerId: owner ?? undefined,
      intent,
      outcome: {
        state: "refreshed",
        before: current.remaining,
        after: next?.remaining ?? current.remaining,
        ...(next ? { countFromRollSeq: next.countFromRollSeq } : {}),
        ...(reaimed ? { aimedAt: input.aimedAt } : {}),
        ...(repicked ? { chosen: input.chosen } : {}),
        ...problems,
      },
      causeId: input.causeId ?? null,
      visibility,
    }, draws);
    return {
      state: "refreshed",
      entry,
      instanceId: current.id,
      journalId,
      feed: input.reveal ? [effectApplied(effect, current.id, input.source, true)] : [],
    };
  }

  if (effect.stacking.mode === "stack" && effect.stacking.maxStacks !== null && held.length >= effect.stacking.maxStacks) {
    return refuse("blocked_stack", "max_stacks");
  }

  const limit = await limitReached(ctx, input.to, effect);
  if (limit) return refuse("blocked_limit", limit);

  const journalId = await journal(ctx, {
    op: "grant",
    instanceId,
    revisionId: effect.revisionId,
    targetPlayerId: input.to,
    actorPlayerId: owner ?? undefined,
    intent,
    outcome: {
      state: "granted",
      remaining: start.remaining,
      unit: start.unit,
      anchorRollSeq: anchor.anchorRollSeq,
      params: start.params,
      ...(input.aimedAt ? { aimedAt: input.aimedAt } : {}),
      ...(input.chosen ? { chosen: input.chosen } : {}),
      ...problems,
    },
    causeId: input.causeId ?? null,
    visibility,
  }, draws);
  await ctx.store.insertInstance({
    id: instanceId,
    seasonId: ctx.seasonId,
    entryId: effect.entryId,
    revisionId: effect.revisionId,
    kind: "effect",
    holderKind: "player",
    holderPlayerId: input.to,
    ownerPlayerId: owner,
    aimedPlayerId: input.aimedAt ?? null,
    chosen: input.chosen ?? null,
    params: start.params,
    chargesLeft: null,
    remaining: start.remaining,
    remainingUnit: start.unit,
    anchorRollSeq: anchor.anchorRollSeq,
    source: input.source,
    sourceMoveId: input.sourceMoveId ?? null,
    causeJournalId: journalId,
    grantedRollSeq: ctx.seasonRollSeq,
  });

  const feed: IeeFeedEntry[] = input.reveal ? [effectApplied(effect, instanceId, input.source, false)] : [];
  if (effect.onApply.length > 0) {
    feed.push(
      ...(await runLifecycle(ctx, effect, "onApply", {
        holder: input.to,
        params: start.params,
        instanceId,
        causeId: journalId,
        depth,
        reveal: input.reveal,
      })),
    );
  }
  // A hold limit asks as it starts (§6.14).
  if (effect.standing.length > 0) feed.push(...(await enforceHoldLimit(ctx, input.to, journalId, input.reveal)));
  return { state: "granted", entry, instanceId, journalId, feed };
}

/**
 * An instant effect (spec §6.4): it acts once, as it arrives, and keeps
 * nothing — no stacking, no counter, no season-wide limit on what is active.
 * Its row is written and ended in the same breath, so the wheel's per-season
 * and per-player counts, which count rows, still see it dropped.
 */
async function grantInstant(
  ctx: ExecContext,
  effect: CompiledEffect,
  input: GrantInput,
  at: {
    intent: Record<string, unknown>;
    visibility: "public" | "staff";
    problems: Record<string, unknown>;
    start: ReturnType<SeasonRegistry["start"]>;
    /** Stronger, it acts that many times (spec §6.13). */
    factor: number;
  },
): Promise<GrantResult> {
  const instanceId = randomUUID();
  const journalId = await journal(ctx, {
    op: "grant",
    instanceId,
    revisionId: effect.revisionId,
    targetPlayerId: input.to,
    actorPlayerId: input.ownerPlayerId ?? undefined,
    intent: at.intent,
    outcome: { state: "granted", instant: true, params: at.start.params, ...(at.factor > 1 ? { factor: at.factor } : {}), ...at.problems },
    causeId: input.causeId ?? null,
    visibility: at.visibility,
  }, input.draws ?? []);
  await ctx.store.insertInstance({
    id: instanceId,
    seasonId: ctx.seasonId,
    entryId: effect.entryId,
    revisionId: effect.revisionId,
    kind: "effect",
    holderKind: "player",
    holderPlayerId: input.to,
    ownerPlayerId: input.ownerPlayerId ?? null,
    params: at.start.params,
    chargesLeft: null,
    remaining: null,
    remainingUnit: null,
    anchorRollSeq: null,
    source: input.source,
    sourceMoveId: input.sourceMoveId ?? null,
    causeJournalId: journalId,
    grantedRollSeq: ctx.seasonRollSeq,
  });
  const feed: IeeFeedEntry[] = input.reveal ? [effectApplied(effect, instanceId, input.source, false)] : [];
  for (let time = 0; time < at.factor && effect.onApply.length > 0; time++) {
    feed.push(
      ...(await runLifecycle(ctx, effect, "onApply", {
        holder: input.to,
        params: at.start.params,
        instanceId,
        causeId: journalId,
        depth: input.depth ?? 0,
        reveal: input.reveal,
      })),
    );
  }
  // Done as soon as it has acted: `triggered`, not `expired` — nothing ran out.
  if (await ctx.store.end(instanceId, "triggered")) {
    await journal(ctx, {
      op: "end",
      instanceId,
      revisionId: effect.revisionId,
      targetPlayerId: input.to,
      outcome: { reason: "triggered", instant: true },
      causeId: journalId,
    });
  }
  return { state: "granted", entry: effect, instanceId, journalId, feed };
}

// ---------------------------------------------------------------------------
// Lifecycle rules and intents
// ---------------------------------------------------------------------------

async function runLifecycle(
  ctx: ExecContext,
  effect: CompiledEntry,
  trigger: "onApply" | "onExpire" | "onPickup",
  at: { holder: string; params: IeeInstanceRow["params"]; instanceId: string; causeId: number; depth: number; reveal: boolean },
): Promise<IeeFeedEntry[]> {
  const rules = isItem(effect)
    ? trigger === "onPickup"
      ? effect.onPickup
      : []
    : trigger === "onApply"
      ? effect.onApply
      : trigger === "onExpire"
        ? effect.onExpire
        : [];
  const self = await ctx.snapshot(at.holder);
  const selfEntries = factsOfRows(ctx.registry, await ctx.store.activeForHolder(at.holder));
  const intents: IeeIntent[] = [];
  let causeId = at.causeId;
  for (const rule of rules) {
    const rec = recording(ctx.rng);
    const out = rule.run({
      trigger,
      params: (at.params ?? {}) as Record<string, number | string | boolean>,
      self,
      target: null,
      turn: null,
      selfEntries,
      targetEntries: [],
      rng: rec.rng,
      instanceId: at.instanceId,
    });
    if (out === null) continue;
    causeId = await journal(
      ctx,
      {
        op: "fire",
        instanceId: at.instanceId,
        revisionId: effect.revisionId,
        ruleIndex: rule.ruleIndex,
        targetPlayerId: at.holder,
        intent: { hook: trigger },
        outcome: { intents: out },
        causeId: at.causeId,
      },
      rec.draws,
    );
    intents.push(...out);
  }
  if (intents.length === 0) return [];
  return runIntents(ctx, intents, {
    source: `rule:${effect.key}`,
    causeId,
    depth: at.depth + 1,
    reveal: at.reveal,
    // The holder's own rule sent it: what it hands them or moves them arrives (§6.13).
    from: at.holder,
  });
}

export interface IntentOptions {
  /** `source` for instances the intents create. */
  source: string;
  causeId?: number | null;
  depth?: number;
  /** Project feed rows for grants made here. */
  reveal: boolean;
  /**
   * Name the entry on the feed row of a player it moves; `reveal` unless set.
   * An item's use is public anyway, so its moves may name it.
   */
  nameMoves?: boolean;
  /** Anchor for grants to the holder of a turn in progress; others use `anchorFor`. */
  anchor?: { seasonPlayerId: string; anchorRollSeq: number };
  ownerPlayerId?: string | null;
  /**
   * Whose rules asked (spec §6.13): the user of an item, the holder of an
   * instance — what they aim at a rival arrives as harm, and what they hand
   * themselves arrives too; null for nobody. `ownerPlayerId` unless set.
   */
  from?: string | null;
  /** These intents were turned back on whoever aimed them: they are never turned back again. */
  reflected?: boolean;
  /** Answers given already in this chain — none past `MAX_CHAIN_DEPTH`. */
  reactions?: number;
  /** The item being used (its row as the use left it): what a `place` puts on the board (wave D, §6.18). */
  using?: IeeInstanceRow | null;
}

/** What an answer can make stronger (spec §6.13): a grant, and a move of one player. */
function amplifiable(intent: IeeIntent): boolean {
  return intent.kind === "grant" || (intent.kind === "move" && !("swapWith" in intent.to));
}

/**
 * A harmful intent turned back on whoever aimed it (`reflect`, spec §6.13):
 * the victim and the sender change places in it. A swap — of places or of
 * items — turned back is the same swap, so it comes back as nothing: blocked.
 */
export function turnBack(intent: IeeIntent, sender: string, victim: string): IeeIntent[] {
  const flip = (id: string) => (id === victim ? sender : id === sender ? victim : id);
  switch (intent.kind) {
    case "grant":
      return [{ ...intent, to: flip(intent.to), harmTo: sender }];
    case "balance":
      return [{ ...intent, to: flip(intent.to), harmTo: sender }];
    case "cleanse":
    case "remove":
      return [{ ...intent, from: flip(intent.from), harmTo: sender }];
    case "move": {
      const to = intent.to;
      if ("swapWith" in to) return [];
      const who = typeof intent.who === "string" ? flip(intent.who) : intent.who;
      const where = "player" in to ? { ...to, player: flip(to.player) } : "halfwayTo" in to ? { halfwayTo: flip(to.halfwayTo) } : to;
      return [{ ...intent, who, to: where, harmTo: sender }];
    }
    case "moveItems":
      return [{ ...intent, from: flip(intent.from), to: typeof intent.to === "string" ? flip(intent.to) : intent.to, harmTo: sender }];
    case "copyItem":
      return [{ ...intent, from: flip(intent.from), to: flip(intent.to), harmTo: sender }];
    case "swapItems":
    case "decide":
    case "game":
    case "place":
      return [];
  }
}

/**
 * Carries out what rules asked for: grants, points, cleanses, moves, items
 * changing hands. Everything harmful the call aims at a rival arrives together
 * first and may be answered (spec §6.13): stopped, turned back, made stronger
 * or replaced; what is carried out then arrives as what it is — an entry, a move.
 */
export async function runIntents(
  ctx: ExecContext,
  intents: readonly IeeIntent[],
  options: IntentOptions,
): Promise<IeeFeedEntry[]> {
  const feed: IeeFeedEntry[] = [];
  const reactions = options.reactions ?? 0;
  const sender = options.from !== undefined ? options.from : (options.ownerPlayerId ?? null);
  const plan = intents.map((intent) => ({ intent, factor: 1, reactions }));
  if (sender !== null && reactions < MAX_CHAIN_DEPTH) {
    const harmed = [...new Set(intents.flatMap((i) => (i.harmTo !== undefined && i.harmTo !== sender ? [i.harmTo] : [])))];
    for (const to of harmed) {
      const group = plan.filter((p) => p.intent.harmTo === to);
      const answered = await answerArrival(ctx, {
        to,
        from: sender,
        arrival: { is: "harm", entry: null },
        reflected: options.reflected ?? false,
        amplifiable: group.some((p) => amplifiable(p.intent)),
        // A rival's use is public, and so is what answered it.
        reveal: true,
        causeId: options.causeId ?? null,
        what: { intents: group.map((p) => p.intent) },
      });
      if (!answered) continue;
      feed.push(...answered.feed);
      if (answered.answer.kind === "amplify") {
        for (const p of group) {
          p.factor = answered.answer.factor;
          p.reactions = reactions + 1;
        }
        continue;
      }
      for (const p of group) plan.splice(plan.indexOf(p), 1);
      if (answered.answer.kind === "reflect") {
        const turned = group.flatMap((p) => turnBack(p.intent, sender, to));
        if (turned.length > 0) {
          feed.push(
            ...(await runIntents(ctx, turned, {
              ...options,
              from: to,
              ownerPlayerId: to,
              reflected: true,
              reactions: reactions + 1,
              causeId: answered.journalId,
            })),
          );
        }
      } else if (answered.answer.kind === "replace" && answered.answer.with > 0) {
        feed.push(
          ...(await movePlayer(ctx, {
            intent: { kind: "move", who: to, to: { by: answered.answer.with }, key: answered.entry.key },
            causeId: answered.journalId,
            reveal: true,
          })),
        );
      }
    }
  }
  for (const { intent, factor, reactions: answeredSoFar } of plan) {
    // What arrives through a use shows as its moves do: the use is public (§8.3).
    const arrival = { from: sender, reactions: answeredSoFar, reveal: options.nameMoves ?? options.reveal };
    switch (intent.kind) {
      case "grant": {
        const anchor =
          options.anchor && options.anchor.seasonPlayerId === intent.to
            ? { anchorRollSeq: options.anchor.anchorRollSeq }
            : undefined;
        const result = await grant(ctx, {
          entry: intent.entryId,
          to: intent.to,
          source: options.source,
          reveal: options.reveal,
          causeId: options.causeId ?? null,
          depth: options.depth ?? 0,
          ownerPlayerId: options.ownerPlayerId ?? null,
          arrival,
          factor,
          ...(anchor ? { anchor } : {}),
          ...(intent.aimedAt ? { aimedAt: intent.aimedAt } : {}),
          ...(intent.chosen ? { chosen: intent.chosen } : {}),
        });
        feed.push(...result.feed);
        break;
      }
      case "balance":
        await applyBalance(ctx, {
          to: intent.to,
          delta: intent.delta,
          reason: intent.reason,
          causeId: options.causeId ?? null,
        });
        break;
      case "cleanse":
        await cleanse(ctx, {
          from: intent.from,
          character: intent.character,
          tags: intent.tags,
          count: intent.count,
          causeId: options.causeId ?? null,
        });
        break;
      case "remove":
        await removeInstances(ctx, intent, options.causeId ?? null);
        break;
      case "move":
        feed.push(
          ...(await movePlayer(ctx, { intent, causeId: options.causeId ?? null, reveal: options.nameMoves ?? options.reveal, arrival, factor })),
        );
        break;
      case "moveItems":
        feed.push(...(await moveItems(ctx, intent, { ...options, from: sender, reactions: answeredSoFar })));
        break;
      case "swapItems":
        feed.push(...(await swapItems(ctx, intent, { ...options, from: sender, reactions: answeredSoFar })));
        break;
      case "copyItem":
        feed.push(...(await copyItem(ctx, intent, { ...options, from: sender, reactions: answeredSoFar })));
        break;
      case "decide":
        feed.push(...(await decide(ctx, intent, { causeId: options.causeId ?? null, reveal: options.nameMoves ?? options.reveal })));
        break;
      case "game":
        // The game in flight (wave C, §6.16): the executor writes no rolls — the
        // game's item path carries it out, in the same transaction.
        break;
      case "place":
        feed.push(...(await placeObject(ctx, intent, { using: options.using ?? null, causeId: options.causeId ?? null })));
        break;
    }
  }
  return feed;
}

// ---------------------------------------------------------------------------
// Objects on the board (spec §6.18, wave D)
// ---------------------------------------------------------------------------

/**
 * The item being used stands on the cell its use picked (spec §6.18): an
 * instance of kind `board_object` held by the cell — the item's revision and
 * parameters, its user the owner. The use checked the cell; a cell taken
 * meanwhile places nothing (`noop`, `cell_taken`).
 */
export async function placeObject(
  ctx: ExecContext,
  intent: PlaceIntent,
  input: { using: IeeInstanceRow | null; causeId: number | null },
): Promise<IeeFeedEntry[]> {
  const using = input.using;
  if (!using) return [];
  if ((await ctx.store.activeObjects(ctx.seasonId)).some((o) => o.holderCellIndex === intent.cell)) {
    await journal(ctx, {
      op: "noop",
      instanceId: using.id,
      revisionId: using.revisionId,
      actorPlayerId: intent.by,
      intent: { place: intent.cell },
      outcome: { reason: "cell_taken" },
      causeId: input.causeId,
    });
    return [];
  }
  const id = randomUUID();
  const journalId = await journal(ctx, {
    op: "place",
    instanceId: id,
    revisionId: using.revisionId,
    actorPlayerId: intent.by,
    intent: { key: intent.key, cell: intent.cell },
    outcome: { cell: intent.cell, item: using.id },
    causeId: input.causeId,
    visibility: "public",
  });
  await ctx.store.insertInstance({
    id,
    seasonId: ctx.seasonId,
    entryId: using.entryId,
    revisionId: using.revisionId,
    kind: "board_object",
    holderKind: "cell",
    holderPlayerId: null,
    holderCellIndex: intent.cell,
    ownerPlayerId: intent.by,
    params: using.params,
    chargesLeft: null,
    remaining: null,
    remainingUnit: null,
    anchorRollSeq: null,
    source: `item:${using.id}`,
    sourceMoveId: null,
    causeJournalId: journalId,
    grantedRollSeq: ctx.seasonRollSeq,
  });
  const entry = ctx.registry.get(using.revisionId);
  return [
    {
      eventType: "object_placed",
      seasonPlayerId: intent.by,
      payload: { itemKey: entry?.key ?? intent.key, name: entry?.names ?? null, instanceId: id, cell: intent.cell },
    },
  ];
}

/**
 * The objects on a season's board as a mover's walk meets them (spec §7.7):
 * each is asked what it does — its item's rules at `onObjectEntered`, the mover
 * the one they speak of — as the walk enters its cell, and its draws are kept
 * for its journal row. An object whose item the season no longer plays does
 * nothing and stays.
 */
export function boardObjects(
  ctx: Pick<ExecContext, "registry" | "rng">,
  objects: readonly IeeInstanceRow[],
  mover: { self: IeePlayerSnapshot; selfEntries: readonly EntryFacts[] },
): { objectAt: (position: number) => TurnObject | null; draws: (instanceId: string) => readonly number[] } {
  const byCell = new Map<number, IeeInstanceRow>();
  for (const row of objects) if (row.holderCellIndex !== null && !byCell.has(row.holderCellIndex)) byCell.set(row.holderCellIndex, row);
  const drawn = new Map<string, number[]>();
  return {
    objectAt(position) {
      const row = byCell.get(position);
      const item = row ? ctx.registry.get(row.revisionId) : null;
      if (!row || !item || item.kind !== "item" || item.objectEntered.length === 0) return null;
      return {
        instanceId: row.id,
        enter(turn) {
          const recorded = recording(ctx.rng);
          drawn.set(row.id, recorded.draws);
          const answer: ObjectAnswer = { stop: false, push: 0, extend: 0, spin: null };
          for (const rule of item.objectEntered) {
            const out = rule.run({
              trigger: "onObjectEntered",
              params: (row.params ?? {}) as IeeParams,
              self: mover.self,
              target: null,
              turn,
              selfEntries: mover.selfEntries,
              targetEntries: [],
              rng: recorded.rng,
              instanceId: row.id,
            });
            if (!out) continue;
            answer.stop ||= out.stop;
            answer.push += out.push;
            answer.extend += out.extend;
            answer.spin = out.spin ?? answer.spin;
          }
          return answer;
        },
      };
    },
    draws: (instanceId) => drawn.get(instanceId) ?? [],
  };
}

/**
 * The objects a mover's walk met (spec §6.18): each is journaled with what it
 * did to the mover (`trigger_object`) and ends (`triggered`) — an object acts
 * once — in the order the walk met them. Public, as objects are.
 */
export async function triggerObjects(
  ctx: ExecContext,
  input: { mover: string; fired: readonly FiredObject[]; draws?: (instanceId: string) => readonly number[]; causeId?: number | null },
): Promise<IeeFeedEntry[]> {
  const feed: IeeFeedEntry[] = [];
  const board = input.fired.some((f) => f.answer.stop && f.answer.push !== 0) && ctx.board ? await ctx.board() : null;
  for (const f of input.fired) {
    const row = await ctx.store.getInstance(f.instanceId);
    if (!row || row.status !== "active") continue;
    const entry = ctx.registry.get(row.revisionId);
    const did = {
      stopped: f.answer.stop,
      pushed: f.answer.push,
      // Where a push left the mover — as the turn moved them (§6.18).
      ...(f.answer.stop && f.answer.push !== 0 ? { to: outOfTurnLanding(board, f.position, f.answer.push) } : {}),
      extended: f.answer.extend,
      spun: f.answer.spin,
    };
    const journalId = await journal(
      ctx,
      {
        op: "trigger_object",
        instanceId: row.id,
        revisionId: row.revisionId,
        actorPlayerId: row.ownerPlayerId,
        targetPlayerId: input.mover,
        intent: { cell: f.position },
        outcome: did,
        causeId: input.causeId ?? null,
        visibility: "public",
      },
      input.draws?.(row.id) ?? [],
    );
    if (!(await ctx.store.end(row.id, "triggered"))) continue;
    await journal(ctx, { op: "end", instanceId: row.id, revisionId: row.revisionId, outcome: { reason: "triggered" }, causeId: journalId });
    feed.push({
      eventType: "object_triggered",
      seasonPlayerId: input.mover,
      payload: {
        itemKey: entry?.key ?? null,
        name: entry?.names ?? null,
        instanceId: row.id,
        cell: f.position,
        ownerSeasonPlayerId: row.ownerPlayerId,
        ownerUsername: row.ownerPlayerId ? await ctx.store.nameOf(row.ownerPlayerId) : null,
        ...did,
      },
    });
  }
  return feed;
}

// ---------------------------------------------------------------------------
// The same cell (spec §6.19, wave D)
// ---------------------------------------------------------------------------

/**
 * A rival's regular move ended where other players stand (spec §6.19): each of
 * them, in seat order, has their entries' rules at `onSameCell` run — an
 * effect's, a passive or cursed item's, the oldest first — with them as the
 * holder. What a rule asks is carried out as a lifecycle rule's is; with
 * `takeEntry` the rival who arrived takes the item, as it is (`move`,
 * `how: "taken"`), and its later rules no longer run for the holder. A firing
 * counts down an effect of `triggers` and spends a held item's charge, as a
 * turn hook's does — unless the item went to the rival.
 */
export async function sameCell(
  ctx: ExecContext,
  input: { arrived: string; at: number; causeId?: number | null; reveal: boolean },
): Promise<IeeFeedEntry[]> {
  const feed: IeeFeedEntry[] = [];
  const holders = (await ctx.store.places(ctx.seasonId))
    .filter((p) => p.id !== input.arrived && p.status === "active" && p.position === input.at)
    .map((p) => p.id)
    .sort();
  for (const holder of holders) {
    const rows = await ctx.store.activeForHolder(holder);
    const sources = answeringSources(ctx.registry, rows).filter((source) => source.entry.sameCell.length > 0);
    if (sources.length === 0) continue;
    const self = await ctx.snapshot(holder);
    const selfEntries = factsOfRows(ctx.registry, rows);
    for (const source of sources) {
      let fired = false;
      let taken = false;
      for (const rule of source.entry.sameCell) {
        const rec = recording(ctx.rng);
        const out = rule.run({
          trigger: "onSameCell",
          params: source.params,
          self,
          target: null,
          turn: null,
          selfEntries,
          targetEntries: [],
          rng: rec.rng,
          instanceId: source.instanceId,
        });
        if (!out) continue;
        fired = true;
        const causeId = await journal(
          ctx,
          {
            op: "fire",
            instanceId: source.instanceId,
            revisionId: source.entry.revisionId,
            ruleIndex: rule.ruleIndex,
            targetPlayerId: holder,
            intent: { hook: "onSameCell", arrived: input.arrived, cell: input.at },
            outcome: { intents: out.intents, take: out.take },
            causeId: input.causeId ?? null,
          },
          rec.draws,
        );
        if (out.intents.length > 0) {
          feed.push(...(await runIntents(ctx, out.intents, { source: `rule:${source.entry.key}`, causeId, depth: 1, reveal: input.reveal, from: holder })));
        }
        if (out.take) {
          const moved = await takeItem(ctx, { instanceId: source.instanceId, from: holder, to: input.arrived, causeId });
          feed.push(...moved.feed);
          if (moved.taken) {
            taken = true;
            break;
          }
        }
      }
      if (!fired || taken) continue;
      const row = await ctx.store.getInstance(source.instanceId);
      if (!row || row.status !== "active") continue;
      if (row.kind === "item") feed.push(...(await spendHeldCharge(ctx, row, input.reveal)));
      else if (row.remainingUnit === "triggers") feed.push(...(await countDown(ctx, row, 1, { reveal: input.reveal, why: "fired" })));
    }
  }
  return feed;
}

/**
 * The rival who arrived takes an item from the player whose cell they ended
 * on (`takeEntry`, spec §6.19): the same instance, its charges and parameters
 * with it — counting from their next roll, as anything handed over does
 * (§6.12). Nothing aims it, so nothing answers it; one they may not hold more
 * of stays. Public, as the board is.
 */
async function takeItem(
  ctx: ExecContext,
  input: { instanceId: string; from: string; to: string; causeId: number },
): Promise<{ taken: boolean; feed: IeeFeedEntry[] }> {
  const row = await ctx.store.getInstance(input.instanceId);
  const entry = row ? ctx.registry.get(row.revisionId) : null;
  if (!row || !entry || row.status !== "active" || row.kind !== "item" || row.holderPlayerId !== input.from) return { taken: false, feed: [] };
  const refused = await receiveRefusal(ctx, entry, await ctx.store.activeForHolder(input.to), input.to);
  if (refused) {
    await journal(ctx, {
      op: "noop",
      instanceId: row.id,
      revisionId: row.revisionId,
      targetPlayerId: input.to,
      intent: { from: input.from, how: "taken" },
      outcome: { reason: refused },
      causeId: input.causeId,
    });
    return { taken: false, feed: [] };
  }
  const anchor = await rehomeAnchor(ctx, entry, input.to, { source: `rule:${entry.key}`, reveal: true });
  const moved = await ctx.store.rehome(row.id, input.to, anchor);
  if (!moved) return { taken: false, feed: [] };
  await journal(ctx, {
    op: "move",
    instanceId: row.id,
    revisionId: row.revisionId,
    targetPlayerId: input.to,
    intent: { from: input.from, how: "taken" },
    outcome: { from: input.from, to: input.to, ...(anchor !== null ? { anchorRollSeq: anchor } : {}) },
    causeId: input.causeId,
    visibility: "public",
  });
  const feed: IeeFeedEntry[] = [itemMoved(entry, row, { to: input.to, from: input.from, fromUsername: await ctx.store.nameOf(input.from), how: "taken" }, true)];
  // More bonus items than the rival may hold ask which to keep (§6.14).
  feed.push(...(await enforceHoldLimit(ctx, input.to, input.causeId, true)));
  return { taken: true, feed };
}

// ---------------------------------------------------------------------------
// What arrives (spec §6.13, wave B)
// ---------------------------------------------------------------------------

/**
 * The instances whose rules may answer what arrives at a holder: effects and
 * passive or cursed items the season plays — oldest first, as they are asked.
 */
export function answeringSources(registry: SeasonRegistry, rows: readonly IeeInstanceRow[]): AnsweringSource[] {
  return [...rows]
    .sort((a, b) => a.grantedAt.getTime() - b.grantedAt.getTime() || (a.causeJournalId ?? 0) - (b.causeJournalId ?? 0))
    .flatMap((row): AnsweringSource[] => {
      const entry = row.holderKind === "player" ? registry.get(row.revisionId) : null;
      if (!entry || (isItem(entry) && entry.usage.activation === "active")) return [];
      return [{ instanceId: row.id, entry, params: (row.params ?? {}) as IeeParams }];
    });
}

/** What an instance remembers of its use's pick (wave C, spec §6.16): null for nothing, or what no longer reads. */
export function chosenOf(row: Pick<IeeInstanceRow, "chosen">): UsePick | null {
  const parsed = UsePickSchema.safeParse(row.chosen);
  return parsed.success ? parsed.data : null;
}

/**
 * The instances whose rules shape the pick of a holder's next game (wave C,
 * spec §7.12): those that may answer, as `answeringSources` orders them, that
 * take part in the roll the game is picked for — never a status granted while
 * the game it would replace was in flight (§7.9).
 */
export function poolSources(registry: SeasonRegistry, rows: readonly IeeInstanceRow[], rollSeq: number): PoolSource[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return answeringSources(registry, rows).flatMap((source): PoolSource[] => {
    const row = byId.get(source.instanceId)!;
    if (source.entry.pool.length === 0 || !participates(row.anchorRollSeq, rollSeq)) return [];
    return [{ ...source, chosen: chosenOf(row) }];
  });
}

/**
 * Where a pick went (spec §7.12): the roll created with its game — whether a
 * favoured game came up — or the choice opened with the games it offers.
 */
export type PoolOutcome = { rollId: string; gameId: string; favoured: boolean } | { decisionId: string; offered: readonly string[] };

/**
 * Journals what shaped the pick of a holder's game (wave C, `pool`, spec
 * §7.12, §9.2): one row per rule that spoke — what it excluded, required,
 * favoured and how many games it offered — with what came of it: the roll or
 * the choice, and whether the exclusions and requirements were set aside
 * because nothing was left (`relaxed`).
 */
export async function recordPool(
  ctx: ExecContext,
  input: { playerId: string; shape: PoolShape; to: PoolOutcome; relaxed: boolean },
): Promise<number[]> {
  const ids: number[] = [];
  const outcome = { ...input.to, ...("offered" in input.to ? { offered: [...input.to.offered] } : {}), relaxed: input.relaxed };
  for (const firing of input.shape.firings) {
    ids.push(
      await journal(
        ctx,
        {
          op: "pool",
          instanceId: firing.instanceId,
          revisionId: firing.revisionId,
          ruleIndex: firing.ruleIndex,
          targetPlayerId: input.playerId,
          intent: { entry: firing.key, contributions: firing.contributions },
          outcome,
          causeId: null,
        },
        firing.draws,
      ),
    );
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Completion conditions (wave C, spec §6.17)
// ---------------------------------------------------------------------------

/**
 * The instances whose rules at `onRollCreated` speak for a roll of the
 * holder's (spec §6.17): those that may answer, as `answeringSources` orders
 * them, that take part in that roll — never a status granted while the game
 * it replaces was in flight (§7.9).
 */
export function rollCreatedSources(registry: SeasonRegistry, rows: readonly IeeInstanceRow[], rollSeq: number): AnsweringSource[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return answeringSources(registry, rows).filter(
    (source) => source.entry.rollCreated.length > 0 && participates(byId.get(source.instanceId)!.anchorRollSeq, rollSeq),
  );
}

/**
 * Whether an entry the season plays gives games completion conditions (§6.17)
 * — a season without one asks and ends nothing, and spends no query on it.
 */
export function givesConditions(registry: SeasonRegistry): boolean {
  return registry.set.entries.some((entry) => entry.rollCreated.length > 0);
}

/** What a completion condition holds of its text (§4.3: its `params`). */
function conditionParams(text: Localized): IeeParams {
  return { ru: text.ru, ...(text.en ? { en: text.en } : {}), ...(text.uk ? { uk: text.uk } : {}) };
}

/** A completion condition's text, as its row holds it; null for a row that is not one. */
export function conditionTextOf(row: Pick<IeeInstanceRow, "kind" | "params">): Localized | null {
  if (row.kind !== "roll_condition") return null;
  const p = (row.params ?? {}) as Record<string, unknown>;
  if (typeof p.ru !== "string") return null;
  return { ru: p.ru, ...(typeof p.en === "string" ? { en: p.en } : {}), ...(typeof p.uk === "string" ? { uk: p.uk } : {}) };
}

/**
 * A game was assigned to a participant — a roll, a reroll, a game taken from
 * a choice, a set-aside game come back (spec §6.17, §7.12 step 6): their rules
 * at `onRollCreated` run, oldest first, and each condition they give is a
 * `roll_condition` held by the roll — the entry that added it, its text —
 * journaled as a grant to them. While a `conditionImmunity` holds for them,
 * nothing is added: a `noop`, `immune`. Returns the conditions written.
 */
export async function addRollConditions(
  ctx: ExecContext,
  input: { playerId: string; rollId: string; rollSeq: number },
): Promise<IeeInstanceRow[]> {
  const rows = await ctx.store.activeForHolder(input.playerId);
  const sources = rollCreatedSources(ctx.registry, rows, input.rollSeq);
  if (sources.length === 0) return [];
  const self = await ctx.snapshot(input.playerId);
  const selfEntries = factsOfRows(ctx.registry, rows);
  const immune = standingFor(ctx.registry, rows, self, ctx.rng).conditionImmunity;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const added: IeeInstanceRow[] = [];
  let keptOff = false;
  for (const source of sources) {
    for (const rule of source.entry.rollCreated) {
      const drawn = recording(ctx.rng);
      const texts = rule.run({
        trigger: "onRollCreated",
        params: source.params,
        self,
        target: null,
        turn: null,
        selfEntries,
        targetEntries: [],
        rng: drawn.rng,
        instanceId: source.instanceId,
      });
      for (const [i, text] of (texts ?? []).entries()) {
        // The draws that let the rule speak, with its first row.
        const draws = i === 0 ? drawn.draws : [];
        const intent = { entry: source.entry.key, source: source.instanceId, rollId: input.rollId, text };
        if (immune) {
          await journal(ctx, {
            op: "noop",
            instanceId: source.instanceId,
            revisionId: source.entry.revisionId,
            ruleIndex: rule.ruleIndex,
            targetPlayerId: input.playerId,
            intent,
            outcome: { reason: "immune" },
          }, draws);
          keptOff = true;
          continue;
        }
        const instanceId = randomUUID();
        const journalId = await journal(ctx, {
          op: "grant",
          instanceId,
          revisionId: source.entry.revisionId,
          ruleIndex: rule.ruleIndex,
          targetPlayerId: input.playerId,
          intent,
          outcome: { state: "granted", kind: "roll_condition", rollId: input.rollId },
        }, draws);
        added.push(
          await ctx.store.insertInstance({
            id: instanceId,
            seasonId: ctx.seasonId,
            entryId: source.entry.entryId,
            revisionId: source.entry.revisionId,
            kind: "roll_condition",
            holderKind: "roll",
            holderPlayerId: null,
            holderRollId: input.rollId,
            // Whoever cast the entry that added it — a rival's, or nobody's.
            ownerPlayerId: byId.get(source.instanceId)?.ownerPlayerId ?? null,
            params: conditionParams(text),
            chargesLeft: null,
            remaining: null,
            remainingUnit: null,
            anchorRollSeq: null,
            source: `rule:${source.instanceId}`,
            sourceMoveId: null,
            causeJournalId: journalId,
            grantedRollSeq: ctx.seasonRollSeq,
          }),
        );
      }
    }
  }
  if (keptOff) await spendImmunity(ctx, rows, self);
  return added;
}

/**
 * An immunity that kept a game's conditions off (spec §6.17): the oldest that
 * holds answers, and one that waits — an effect of `triggers`, a passive or
 * cursed item with charges — spends a firing on that game, as an answer to
 * what arrives does (§6.13). One that lasts a span spends nothing.
 */
async function spendImmunity(ctx: ExecContext, rows: readonly IeeInstanceRow[], self: IeePlayerSnapshot): Promise<void> {
  const base = { self, selfEntries: factsOfRows(ctx.registry, rows), rng: ctx.rng };
  const source = answeringSources(ctx.registry, rows).find((s) => standingOf([s], base).conditionImmunity);
  const row = source ? rows.find((r) => r.id === source.instanceId) : undefined;
  if (!row) return;
  if (row.kind === "item") await spendHeldCharge(ctx, row, false);
  else if (row.remainingUnit === "triggers") await countDown(ctx, row, 1, { reveal: false, why: "fired" });
}

/**
 * A roll ended — passed, dropped, rerolled or set aside (spec §6.17): the
 * completion conditions it holds end with it (`expired`), each journaled. A
 * game that comes back asks its holder's rules again.
 */
export async function endRollConditions(ctx: ExecContext, input: { rollId: string; playerId: string }): Promise<number> {
  let ended = 0;
  for (const row of await ctx.store.activeForRoll(input.rollId)) {
    if (!(await ctx.store.end(row.id, "expired"))) continue;
    ended += 1;
    await journal(ctx, {
      op: "expire",
      instanceId: row.id,
      revisionId: row.revisionId,
      targetPlayerId: input.playerId,
      outcome: { reason: "roll_ended", rollId: input.rollId },
    });
  }
  return ended;
}

/** What a participant's standing rules say holds now (spec §6.13): the use checks ask it. */
export function standingFor(
  registry: SeasonRegistry,
  rows: readonly IeeInstanceRow[],
  self: IeePlayerSnapshot,
  rng: () => number,
): ReturnType<typeof standingOf> {
  return standingOf(answeringSources(registry, rows), { self, selfEntries: factsOfRows(registry, rows), rng });
}

interface ArrivalInput {
  to: string;
  /** Who sent it: a rival, the holder's own rule, or null for the wheel. */
  from: string | null;
  arrival: ArrivalView;
  reflected?: boolean;
  amplifiable: boolean;
  reveal: boolean;
  causeId: number | null;
  /** What arrives, for the journal: the entry, the intents, the move. */
  what: Record<string, unknown>;
  /** Draws that decided what arrives — the wheel's pick — journaled with an answer that stops it. */
  draws?: readonly number[];
}

interface Answered {
  answer: IncomingAnswer;
  /** The entry that answered. */
  entry: CompiledEntry;
  journalId: number;
  feed: IeeFeedEntry[];
}

/**
 * Puts an arrival to its holder's entries (spec §6.13): the first rule that
 * answers is journaled (`block`, `reflect`, `amplify`, `replace`), spends what
 * a firing spends, and shows on the holder's line where it is revealed. The
 * caller carries the answer out. Null when nothing answers.
 */
async function answerArrival(ctx: ExecContext, input: ArrivalInput): Promise<Answered | null> {
  const rows = await ctx.store.activeForHolder(input.to);
  const sources = answeringSources(ctx.registry, rows);
  if (!sources.some((source) => source.entry.incoming.length > 0)) return null;
  const base = { self: await ctx.snapshot(input.to), selfEntries: factsOfRows(ctx.registry, rows), rng: ctx.rng };
  const harm = input.arrival.is === "harm";
  // A harmful action pierces what the holder's standing rules say; nothing else carries a pierce.
  const pierce = harm ? standingOf(sources, base).pierce : 0;
  const found = answerOf(sources, input.arrival, base, { pierce, reflected: input.reflected ?? false, amplifiable: input.amplifiable });
  if (!found) return null;
  const row = rows.find((r) => r.id === found.source.instanceId)!;
  const answer = found.answer;
  const stops = answer.kind !== "amplify";
  const journalId = await journal(
    ctx,
    {
      op: answer.kind,
      instanceId: row.id,
      revisionId: row.revisionId,
      ruleIndex: found.ruleIndex,
      targetPlayerId: input.to,
      ...(input.from !== null ? { actorPlayerId: input.from } : {}),
      intent: { scope: input.arrival.is, ...input.what },
      outcome: {
        ...(harm ? { tier: found.source.entry.protectionTier, pierce } : {}),
        ...(answer.kind === "amplify" ? { factor: answer.factor } : {}),
        ...(answer.kind === "replace" ? { with: answer.with } : {}),
      },
      causeId: input.causeId,
      visibility: input.reveal ? "public" : "staff",
    },
    [...(stops ? (input.draws ?? []) : []), ...found.draws],
  );
  const feed: IeeFeedEntry[] = [];
  if (input.reveal) {
    const rival = input.from !== null && input.from !== input.to ? input.from : null;
    feed.push({
      eventType: "intercepted",
      seasonPlayerId: input.to,
      payload: {
        how: ANSWER_HOW[answer.kind],
        scope: input.arrival.is,
        instanceId: row.id,
        key: found.source.entry.key,
        name: found.source.entry.names,
        kind: found.source.entry.kind,
        ...(rival ? { fromSeasonPlayerId: rival, fromUsername: await ctx.store.nameOf(rival) } : {}),
        ...(answer.kind === "amplify" ? { factor: answer.factor } : {}),
        ...(answer.kind === "replace" ? { with: answer.with } : {}),
      },
    });
  }
  // It spends what a firing does: a held item's charge, an effect's count of triggers.
  if (row.kind === "item") feed.push(...(await spendHeldCharge(ctx, row, input.reveal)));
  else if (row.remainingUnit === "triggers") feed.push(...(await countDown(ctx, row, 1, { reveal: input.reveal, causeId: journalId, why: "fired" })));
  return { answer, entry: found.source.entry, journalId, feed };
}

// ---------------------------------------------------------------------------
// Item operations (spec §6.12, wave B)
// ---------------------------------------------------------------------------

/**
 * The items an operation may take from a holder: bonus items only — a cursed
 * item cannot be stolen, passed or copied (§7.5) — of the rarities asked, and
 * never the item whose rule asked.
 */
function movableItems(
  ctx: ExecContext,
  rows: readonly IeeInstanceRow[],
  rarity: readonly Rarity[] | null,
  except: string | null,
): IeeInstanceRow[] {
  return rows.filter((row) => {
    if (row.kind !== "item" || row.holderKind !== "player" || row.id === except) return false;
    const entry = ctx.registry.get(row.revisionId);
    if (!entry || entry.character !== "bonus") return false;
    return rarity === null || rarity.includes(entry.rarity);
  });
}

/** A server draw, kept for the journal. */
function drawer(ctx: ExecContext): { draws: number[]; index: (length: number) => number } {
  const draws: number[] = [];
  return {
    draws,
    index: (length) => {
      const r = ctx.rng();
      draws.push(r);
      return Math.min(length - 1, Math.floor(r * length));
    },
  };
}

/**
 * Why an item cannot go to a holder, or null when it may: a unique item they
 * already hold one of (§6.10), or a season-wide limit (§4.5) — it lands as a
 * grant by a rule does; the inventory cap gates the wheel only (§7.11).
 */
async function receiveRefusal(
  ctx: ExecContext,
  entry: CompiledEntry,
  receiverRows: readonly IeeInstanceRow[],
  to: string,
  leaving: string | null = null,
): Promise<string | null> {
  if (isItem(entry) && entry.usage.unique && receiverRows.some((r) => r.id !== leaving && r.kind === "item" && r.entryId === entry.entryId)) {
    return "unique";
  }
  return limitReached(ctx, to, entry);
}

/** The roll a held item counts from at its new holder: their next one (§6.12); an active item counts nothing. */
async function rehomeAnchor(ctx: ExecContext, entry: CompiledEntry, to: string, options: IntentOptions): Promise<number | null> {
  if (!isItem(entry) || entry.usage.activation === "active") return null;
  if (options.anchor && options.anchor.seasonPlayerId === to) return options.anchor.anchorRollSeq;
  return (await ctx.anchorFor(to)).anchorRollSeq;
}

/** The feed row of an item that changed hands: on the receiver's line, named where the caller reveals it. */
function itemMoved(
  entry: CompiledEntry,
  row: IeeInstanceRow,
  move: { to: string; from: string; fromUsername: string | null; how: "stolen" | "given" | "traded" | "taken" },
  reveal: boolean,
): IeeFeedEntry {
  return {
    eventType: "item_moved",
    seasonPlayerId: move.to,
    payload: {
      how: move.how,
      instanceId: row.id,
      fromSeasonPlayerId: move.from,
      fromUsername: move.fromUsername,
      ...(reveal ? { itemKey: entry.key, name: entry.names } : {}),
    },
  };
}

/**
 * Bonus items change hands (`stealItem`, `transferItem`): random ones of the
 * giver's go to the receiver — a participant, or a random active rival — as
 * the same instances, charges and parameters with them (journal op `move`).
 */
export async function moveItems(ctx: ExecContext, intent: MoveItemsIntent, options: IntentOptions): Promise<IeeFeedEntry[]> {
  const causeId = options.causeId ?? null;
  const pick = drawer(ctx);
  const nothing = async (reason: string): Promise<IeeFeedEntry[]> => {
    await journal(ctx, { op: "noop", targetPlayerId: intent.from, intent: { moveItems: intent }, outcome: { reason }, causeId }, pick.draws);
    return [];
  };
  let to: string;
  if (typeof intent.to === "string") {
    to = intent.to;
  } else {
    const of = intent.to.randomRivalOf;
    const rivals = (await ctx.store.places(ctx.seasonId)).filter((p) => p.status === "active" && p.id !== of);
    if (rivals.length === 0) return nothing("no_rival");
    to = rivals[pick.index(rivals.length)]!.id;
  }
  if (to === intent.from) return nothing("self");
  const pool = movableItems(ctx, await ctx.store.activeForHolder(intent.from), intent.rarity, intent.except);
  if (pool.length === 0) return nothing("nothing_to_move");
  const chosen: IeeInstanceRow[] = [];
  while (chosen.length < intent.count && pool.length > 0) chosen.push(pool.splice(pick.index(pool.length), 1)[0]!);

  const reveal = options.nameMoves ?? options.reveal;
  const receiverRows = await ctx.store.activeForHolder(to);
  const fromUsername = await ctx.store.nameOf(intent.from);
  const feed: IeeFeedEntry[] = [];
  for (const row of chosen) {
    const entry = ctx.registry.get(row.revisionId)!;
    const refused = await receiveRefusal(ctx, entry, receiverRows, to);
    if (refused) {
      await journal(
        ctx,
        { op: "noop", instanceId: row.id, revisionId: row.revisionId, targetPlayerId: to, intent: { from: intent.from, how: intent.how }, outcome: { reason: refused }, causeId },
        pick.draws,
      );
      continue;
    }
    // The receiver's entries may answer what reaches them (§6.13); it is the same instance, so nothing makes it stronger.
    const answered = await answerItemArrival(ctx, { to, entry, row, how: intent.how, giver: intent.from, options, draws: pick.draws });
    if (answered) {
      feed.push(...answered);
      continue;
    }
    const anchor = await rehomeAnchor(ctx, entry, to, options);
    const moved = await ctx.store.rehome(row.id, to, anchor);
    if (!moved) continue;
    receiverRows.unshift(moved);
    await journal(
      ctx,
      {
        op: "move",
        instanceId: row.id,
        revisionId: row.revisionId,
        targetPlayerId: to,
        intent: { from: intent.from, how: intent.how },
        outcome: { from: intent.from, to, ...(anchor !== null ? { anchorRollSeq: anchor } : {}) },
        causeId,
        visibility: "public",
      },
      pick.draws,
    );
    feed.push(itemMoved(entry, row, { to, from: intent.from, fromUsername, how: intent.how }, reveal));
  }
  // More bonus items than the receiver may hold ask which to keep (§6.14).
  if (feed.some((f) => f.eventType === "item_moved")) feed.push(...(await enforceHoldLimit(ctx, to, causeId, reveal)));
  return feed;
}

/**
 * A trade (`swapItems`): one random bonus item of each to the other, both
 * picked before either moves. Nothing moves when either has none, or when
 * either may not receive what comes to them.
 */
export async function swapItems(ctx: ExecContext, intent: SwapItemsIntent, options: IntentOptions): Promise<IeeFeedEntry[]> {
  const causeId = options.causeId ?? null;
  const pick = drawer(ctx);
  const nothing = async (reason: string): Promise<IeeFeedEntry[]> => {
    await journal(ctx, { op: "noop", targetPlayerId: intent.b, intent: { swapItems: intent }, outcome: { reason }, causeId }, pick.draws);
    return [];
  };
  if (intent.a === intent.b) return nothing("self");
  const rowsA = await ctx.store.activeForHolder(intent.a);
  const rowsB = await ctx.store.activeForHolder(intent.b);
  const poolA = movableItems(ctx, rowsA, intent.rarity, intent.except);
  const poolB = movableItems(ctx, rowsB, intent.rarity, intent.except);
  if (poolA.length === 0 || poolB.length === 0) return nothing("nothing_to_trade");
  const fromA = poolA[pick.index(poolA.length)]!;
  const fromB = poolB[pick.index(poolB.length)]!;
  const entryA = ctx.registry.get(fromA.revisionId)!;
  const entryB = ctx.registry.get(fromB.revisionId)!;
  const refused = (await receiveRefusal(ctx, entryA, rowsB, intent.b, fromB.id)) ?? (await receiveRefusal(ctx, entryB, rowsA, intent.a, fromA.id));
  if (refused) return nothing(refused);
  // Each side's entries may answer what reaches them (§6.13): an answer on either side, and nothing is traded.
  for (const [entry, row, giver, to] of [
    [entryA, fromA, intent.a, intent.b],
    [entryB, fromB, intent.b, intent.a],
  ] as const) {
    const answered = await answerItemArrival(ctx, { to, entry, row, how: "traded", giver, options, draws: pick.draws });
    if (answered) return answered;
  }

  const reveal = options.nameMoves ?? options.reveal;
  const names = { [intent.a]: await ctx.store.nameOf(intent.a), [intent.b]: await ctx.store.nameOf(intent.b) };
  const feed: IeeFeedEntry[] = [];
  for (const [row, entry, from, to] of [
    [fromA, entryA, intent.a, intent.b],
    [fromB, entryB, intent.b, intent.a],
  ] as const) {
    const anchor = await rehomeAnchor(ctx, entry, to, options);
    const moved = await ctx.store.rehome(row.id, to, anchor);
    if (!moved) continue;
    await journal(
      ctx,
      {
        op: "move",
        instanceId: row.id,
        revisionId: row.revisionId,
        targetPlayerId: to,
        intent: { from, how: "traded" },
        outcome: { from, to, ...(anchor !== null ? { anchorRollSeq: anchor } : {}) },
        causeId,
        visibility: "public",
      },
      pick.draws,
    );
    feed.push(itemMoved(entry, row, { to, from, fromUsername: names[from] ?? null, how: "traded" }, reveal));
  }
  for (const holder of [intent.a, intent.b]) feed.push(...(await enforceHoldLimit(ctx, holder, causeId, reveal)));
  return feed;
}

/**
 * A copy (`copyItem`): a fresh grant to the receiver of the entry behind a
 * random bonus item the other holds — the entry the season plays, tuned as it
 * tunes it, as the wheel would hand it out; the original stays where it is.
 */
export async function copyItem(ctx: ExecContext, intent: CopyItemIntent, options: IntentOptions): Promise<IeeFeedEntry[]> {
  const causeId = options.causeId ?? null;
  const pick = drawer(ctx);
  const nothing = async (reason: string): Promise<IeeFeedEntry[]> => {
    await journal(ctx, { op: "noop", targetPlayerId: intent.to, intent: { copyItem: intent }, outcome: { reason }, causeId }, pick.draws);
    return [];
  };
  const pool = movableItems(ctx, await ctx.store.activeForHolder(intent.from), intent.rarity, intent.except);
  if (pool.length === 0) return nothing("nothing_to_copy");
  const row = pool[pick.index(pool.length)]!;
  // By entry id: the revision the season's catalog plays, not the copied one's.
  const entry = ctx.registry.get(row.entryId);
  if (!entry) return nothing("not_played");
  const anchor = options.anchor && options.anchor.seasonPlayerId === intent.to ? { anchorRollSeq: options.anchor.anchorRollSeq } : undefined;
  const result = await grant(ctx, {
    entry,
    to: intent.to,
    source: options.source,
    reveal: options.reveal,
    causeId,
    depth: options.depth ?? 0,
    ownerPlayerId: options.ownerPlayerId ?? null,
    draws: pick.draws,
    // A copy is an entry received (§6.13).
    arrival: {
      from: options.from !== undefined ? options.from : (options.ownerPlayerId ?? null),
      reactions: options.reactions ?? 0,
      reveal: options.nameMoves ?? options.reveal,
    },
    ...(anchor ? { anchor } : {}),
  });
  return result.feed;
}

/**
 * An item handed over, put to the receiver's entries (§6.13): its feed when
 * they answer — it does not move, and a replacement moves the receiver
 * instead — null when nothing answers.
 */
async function answerItemArrival(
  ctx: ExecContext,
  input: {
    to: string;
    entry: CompiledEntry;
    row: IeeInstanceRow;
    how: "stolen" | "given" | "traded";
    giver: string;
    options: IntentOptions;
    draws: readonly number[];
  },
): Promise<IeeFeedEntry[] | null> {
  const { options } = input;
  if ((options.reactions ?? 0) >= MAX_CHAIN_DEPTH) return null;
  const reveal = options.nameMoves ?? options.reveal;
  const answered = await answerArrival(ctx, {
    to: input.to,
    from: options.from !== undefined ? options.from : (options.ownerPlayerId ?? null),
    arrival: { is: "entry", entry: factsOf(input.entry) },
    amplifiable: false,
    reveal,
    causeId: options.causeId ?? null,
    what: { entry: input.entry.key, instanceId: input.row.id, how: input.how, giver: input.giver },
    draws: input.draws,
  });
  if (!answered) return null;
  const feed = [...answered.feed];
  if (answered.answer.kind === "replace" && answered.answer.with > 0) {
    feed.push(...(await movePlayer(ctx, { intent: { kind: "move", who: input.to, to: { by: answered.answer.with }, key: answered.entry.key }, causeId: answered.journalId, reveal })));
  }
  return feed;
}

// ---------------------------------------------------------------------------
// The player's choices (spec §6.14, §7.6, wave B)
// ---------------------------------------------------------------------------

/** What a victim choice keeps beside its question: the entry that asked and how it is carried out. */
export interface VictimContext {
  /** The entry whose rule asked, and its names as they were — the feed and the dashboard read them. */
  key: string;
  names: CompiledEntry["names"];
  /** What the picks are: the items that go, or those that stay while the rest burn. */
  then: "discard" | "retain";
  count: number;
  /** Giving ends what asked; enduring keeps it. */
  orKeep: boolean;
  rule: DefaultRule;
  /** Whether the answer shows in the feed — where the arrival of what asked did. */
  reveal: boolean;
}

function noteDecision(ctx: ExecContext, row: IeeDecisionRow): void {
  ctx.decisions?.push({ decisionId: row.id, playerId: row.playerId, kind: row.kind, status: row.status });
}

/** A player's bonus items — passive ones too, never a cursed one (§7.5) — as a question offers them. */
async function bonusItemsOf(ctx: ExecContext, playerId: string): Promise<{ rows: IeeInstanceRow[]; candidates: Candidate[] }> {
  const rows = (await ctx.store.activeForHolder(playerId)).filter(
    (row) => row.kind === "item" && ctx.registry.get(row.revisionId)?.character === "bonus",
  );
  const candidates = rows.map((row) => ({
    instanceId: row.id,
    rarity: ctx.registry.get(row.revisionId)!.rarity,
    grantedAt: row.grantedAt.getTime(),
  }));
  return { rows, candidates };
}

/** Names of instances, for the feed. */
function namesOf(ctx: ExecContext, rows: readonly IeeInstanceRow[]): CompiledEntry["names"][] {
  return rows.flatMap((row) => {
    const entry = ctx.registry.get(row.revisionId);
    return entry ? [entry.names] : [];
  });
}

/** Ends a player's items for a decision, one `end` row each, as `remove` does. */
async function endForDecision(
  ctx: ExecContext,
  rows: readonly IeeInstanceRow[],
  reason: "discarded" | "burned",
  causeId: number | null,
  visibility: "public" | "holder" | "staff",
): Promise<IeeInstanceRow[]> {
  const ended: IeeInstanceRow[] = [];
  for (const row of rows) {
    const gone = await ctx.store.end(row.id, reason);
    if (!gone) continue;
    ended.push(gone);
    await journal(ctx, {
      op: "end",
      instanceId: gone.id,
      revisionId: gone.revisionId,
      targetPlayerId: gone.holderPlayerId,
      outcome: { reason },
      causeId,
      visibility,
    });
  }
  return ended;
}

/**
 * A `decide` intent (`victimChoice`, §6.14): the question, when there is a
 * choice to make; otherwise what has to go goes at once.
 */
async function decide(ctx: ExecContext, intent: DecideIntent, options: { causeId: number | null; reveal: boolean }): Promise<IeeFeedEntry[]> {
  const { rows, candidates } = await bonusItemsOf(ctx, intent.who);
  const asker = intent.instanceId ? await ctx.store.getInstance(intent.instanceId) : null;
  const entry = asker ? ctx.registry.get(asker.revisionId) : ctx.registry.get(intent.key);
  const asked = victimQuestion({ count: intent.count, orKeep: intent.orKeep, candidates });
  if (!asked.ask) {
    const going = rows.filter((row) => asked.discard.includes(row.id));
    if (going.length === 0) return [];
    // No choice to make: what has to go goes, and the feed says why.
    const gone = await endForDecision(ctx, going, "discarded", options.causeId, options.reveal ? "public" : "staff");
    if (!options.reveal || !entry || gone.length === 0) return [];
    return [
      {
        eventType: "decision_made",
        seasonPlayerId: intent.who,
        payload: { how: "forced", key: entry.key, name: entry.names, option: "discard", discarded: namesOf(ctx, gone), burned: [], kept: [] },
      },
    ];
  }
  return openVictimChoice(ctx, {
    player: intent.who,
    asker,
    context: {
      key: entry?.key ?? intent.key,
      names: entry?.names ?? { ru: intent.key, en: intent.key, uk: intent.key },
      then: "discard",
      count: intent.count,
      orKeep: intent.orKeep,
      rule: asked.question.rule,
      reveal: options.reveal,
    },
    question: asked.question,
    causeId: options.causeId,
  });
}

/**
 * Opens a victim choice (§7.6). One waits at a time: the one pending takes
 * its default first — unless it is the same hold limit asking again, which
 * updates its question instead.
 */
async function openVictimChoice(
  ctx: ExecContext,
  q: {
    player: string;
    asker: IeeInstanceRow | null;
    context: VictimContext;
    question: Question;
    causeId: number | null;
    /** A hold limit asks again: its own pending question is updated, not replaced. */
    reask?: boolean;
  },
): Promise<IeeFeedEntry[]> {
  const feed: IeeFeedEntry[] = [];
  const asking = {
    op: "decision_open" as const,
    instanceId: q.asker?.id ?? null,
    revisionId: q.asker?.revisionId ?? null,
    targetPlayerId: q.player,
    intent: { kind: "victim_choice", key: q.context.key, then: q.context.then, count: q.context.count, orKeep: q.context.orKeep },
    outcome: { options: q.question.options, default: q.question.defaultChoice, rule: q.question.rule },
    causeId: q.causeId,
    visibility: "holder" as const,
  };
  for (const pending of await ctx.store.pendingDecisions(q.player)) {
    if (pending.kind !== "victim_choice") continue;
    const same = q.reask === true && q.asker !== null && pending.instanceId === q.asker.id;
    if (same) {
      const updated = await ctx.store.reaskDecision(pending.id, {
        options: q.question.options,
        defaultChoice: q.question.defaultChoice,
        context: q.context,
      });
      if (updated) {
        await journal(ctx, { ...asking, outcome: { ...asking.outcome, reasked: pending.id } });
        noteDecision(ctx, updated);
        return feed;
      }
      continue;
    }
    const settled = await settleVictimChoice(ctx, pending, { choice: null, by: "default", why: "superseded", causeId: q.causeId });
    if (settled.ok) feed.push(...settled.feed);
  }
  const journalId = await journal(ctx, asking);
  const row = await ctx.store.insertDecision({
    id: randomUUID(),
    seasonId: ctx.seasonId,
    playerId: q.player,
    kind: "victim_choice",
    instanceId: q.asker?.id ?? null,
    revisionId: q.asker?.revisionId ?? null,
    ruleIndex: null,
    options: q.question.options,
    defaultChoice: q.question.defaultChoice,
    context: q.context,
    causeJournalId: journalId,
  });
  noteDecision(ctx, row);
  return feed;
}

/**
 * A hold limit (`holdLimit`, §6.14): a holder with more bonus items than
 * their strictest limit is asked which to keep — the question the limit
 * asked already, asked again with what they hold now.
 */
export async function enforceHoldLimit(ctx: ExecContext, playerId: string, causeId: number | null, reveal: boolean): Promise<IeeFeedEntry[]> {
  const rows = await ctx.store.activeForHolder(playerId);
  const sources = answeringSources(ctx.registry, rows);
  if (!sources.some((source) => source.entry.standing.length > 0)) return [];
  const standing = standingOf(sources, { self: await ctx.snapshot(playerId), selfEntries: factsOfRows(ctx.registry, rows), rng: ctx.rng });
  if (standing.holdLimit === null || standing.holdLimitBy === null) return [];
  const { candidates } = await bonusItemsOf(ctx, playerId);
  const question = holdQuestion(standing.holdLimit, candidates);
  if (!question) return [];
  const asker = rows.find((row) => row.id === standing.holdLimitBy) ?? null;
  const entry = asker ? ctx.registry.get(asker.revisionId) : null;
  if (!asker || !entry) return [];
  return openVictimChoice(ctx, {
    player: playerId,
    asker,
    context: {
      key: entry.key,
      names: entry.names,
      then: "retain",
      count: standing.holdLimit,
      orKeep: false,
      rule: "rarest",
      reveal,
    },
    question,
    causeId,
    reask: true,
  });
}

export type DecisionAnswer =
  | { ok: true; feed: IeeFeedEntry[] }
  | { ok: false; code: "ieeDecisionNotFound" | "ieeDecisionSettled" | "ieeDecisionChoiceInvalid" | "ieeDecisionKind" };

/**
 * Settles a victim choice (§7.6): the player's answer, a judge's, or the
 * default — `choice` null — computed over what the player holds now. The
 * guard is the store's UPDATE, so a second answer settles nothing.
 */
async function settleVictimChoice(
  ctx: ExecContext,
  row: IeeDecisionRow,
  input: { choice: DecisionChoice | null; by: "player" | "judge" | "default"; userId?: string | null; why?: string; causeId?: number | null },
): Promise<DecisionAnswer> {
  const context = row.context as VictimContext;
  const options = row.options as DecisionOption[];
  const { rows, candidates } = await bonusItemsOf(ctx, row.playerId);
  const asker = row.instanceId ? await ctx.store.getInstance(row.instanceId) : null;
  // With what asked gone, there is nothing left to be rid of: a discard has no reason to be paid.
  const askerGone = context.orKeep && asker?.status !== "active";
  let choice: DecisionChoice;
  if (input.choice === null) {
    choice = askerGone ? { option: "endure" } : defaultChoiceOf(context.rule, context.count, candidates);
  } else {
    const checked = checkChoice(options, input.choice, candidates);
    if (!checked.ok) return checked;
    choice = askerGone && checked.choice.option === "discard" ? { option: "endure" } : checked.choice;
  }
  const status = input.by === "player" ? "resolved" : input.by === "judge" ? "judged" : "defaulted";
  const settled = await ctx.store.settleDecision(row.id, { status, choice, resolvedByUserId: input.userId ?? null });
  if (!settled) return { ok: false, code: "ieeDecisionSettled" };

  const picks = new Set(choice.picks ?? []);
  const going = choice.option === "discard" ? rows.filter((r) => picks.has(r.id)) : choice.option === "retain" ? rows.filter((r) => !picks.has(r.id)) : [];
  const kept = choice.option === "retain" ? rows.filter((r) => picks.has(r.id)) : [];
  const paysOff = context.orKeep && choice.option === "discard" && going.length > 0 && asker !== null;
  const visibility = context.reveal ? ("public" as const) : ("holder" as const);
  const journalId = await journal(ctx, {
    op: input.by === "default" ? "decision_default" : "decision_resolve",
    instanceId: row.instanceId,
    revisionId: row.revisionId,
    targetPlayerId: row.playerId,
    ...(input.by === "judge" && input.userId ? { actorUserId: input.userId } : {}),
    intent: { decisionId: row.id, by: input.by, ...(input.why ? { why: input.why } : {}) },
    outcome: {
      option: choice.option,
      ...(choice.picks ? { picks: choice.picks } : {}),
      ending: going.map((r) => r.id),
      ...(paysOff ? { paidOff: asker.id } : {}),
    },
    causeId: input.causeId ?? row.causeJournalId ?? null,
    visibility,
  });
  const gone = await endForDecision(ctx, going, choice.option === "retain" ? "burned" : "discarded", journalId, visibility);
  // Giving ends what asked (`orKeep`): it was paid off.
  if (paysOff && (await ctx.store.end(asker.id, "triggered"))) {
    await journal(ctx, {
      op: "end",
      instanceId: asker.id,
      revisionId: asker.revisionId,
      targetPlayerId: row.playerId,
      outcome: { reason: "triggered", paidOff: true },
      causeId: journalId,
      visibility,
    });
  }
  noteDecision(ctx, settled);
  if (!context.reveal) return { ok: true, feed: [] };
  return {
    ok: true,
    feed: [
      {
        eventType: "decision_made",
        seasonPlayerId: row.playerId,
        payload: {
          how: input.by === "player" ? "chosen" : input.by === "judge" ? "judged" : "defaulted",
          key: context.key,
          name: context.names,
          option: choice.option,
          discarded: choice.option === "discard" ? namesOf(ctx, gone) : [],
          burned: choice.option === "retain" ? namesOf(ctx, gone) : [],
          kept: namesOf(ctx, kept),
        },
      },
    ],
  };
}

/**
 * Answers a decision (§7.6): the player's choice, a judge's for them, or —
 * `choice` null — the default. A reaction window is answered by the turn.
 */
export async function resolveDecision(
  ctx: ExecContext,
  input: { decisionId: string; choice: DecisionChoice | null; by: "player" | "judge" | "default"; userId?: string | null },
): Promise<DecisionAnswer> {
  const row = await ctx.store.getDecision(input.decisionId);
  if (!row || row.seasonId !== ctx.seasonId) return { ok: false, code: "ieeDecisionNotFound" };
  if (row.status !== "pending") return { ok: false, code: "ieeDecisionSettled" };
  if (row.kind !== "victim_choice") return { ok: false, code: "ieeDecisionKind" };
  return settleVictimChoice(ctx, row, input);
}

/**
 * The player starts their next game (§7.6): a victim choice still waiting
 * takes its default, journaled.
 */
export async function applyPendingDefaults(ctx: ExecContext, playerId: string): Promise<IeeFeedEntry[]> {
  const feed: IeeFeedEntry[] = [];
  for (const row of await ctx.store.pendingDecisions(playerId)) {
    if (row.kind !== "victim_choice") continue;
    const settled = await settleVictimChoice(ctx, row, { choice: null, by: "default", why: "next_game" });
    if (settled.ok) feed.push(...settled.feed);
  }
  return feed;
}

// ---------------------------------------------------------------------------
// The reaction window (spec §7.4)
// ---------------------------------------------------------------------------

/**
 * Opens the holder's reaction window: the decision that holds their turn —
 * `context` — until they accept or use one of the items offered.
 */
export async function openReactionWindow(
  ctx: ExecContext,
  input: {
    playerId: string;
    context: { rollId: string; view: { faces: readonly number[] } } & Record<string, unknown>;
    offers: readonly { instanceId: string; key: string }[];
  },
): Promise<IeeDecisionRow> {
  const options: DecisionOption[] = [
    { id: "accept", kind: "accept", params: {} },
    { id: "react", kind: "react", params: { among: input.offers.map((o) => o.instanceId) } },
  ];
  const journalId = await journal(ctx, {
    op: "decision_open",
    targetPlayerId: input.playerId,
    intent: { kind: "reaction_window", rollId: input.context.rollId },
    outcome: { options, default: { option: "accept" }, faces: [...input.context.view.faces], offers: input.offers.map((o) => ({ ...o })) },
    visibility: "holder",
  });
  const row = await ctx.store.insertDecision({
    id: randomUUID(),
    seasonId: ctx.seasonId,
    playerId: input.playerId,
    kind: "reaction_window",
    instanceId: null,
    revisionId: null,
    ruleIndex: null,
    options,
    defaultChoice: { option: "accept" },
    context: input.context,
    causeJournalId: journalId,
  });
  noteDecision(ctx, row);
  return row;
}

/**
 * Settles a reaction window with the turn it held (§7.4), inside that turn's
 * transaction: the answer — accepted, or the item used — and the faces it
 * acted on and those that counted. Null when it was settled already: the
 * guard is the UPDATE, so a second answer settles nothing.
 */
export async function settleReactionWindow(
  ctx: ExecContext,
  row: IeeDecisionRow,
  input: { choice: DecisionChoice; by: "player" | "judge"; userId: string | null; before: readonly number[]; after: readonly number[] },
): Promise<number | null> {
  const settled = await ctx.store.settleDecision(row.id, {
    status: input.by === "player" ? "resolved" : "judged",
    choice: input.choice,
    resolvedByUserId: input.userId,
  });
  if (!settled) return null;
  const used = input.choice.option === "react" ? (input.choice.picks?.[0] ?? null) : null;
  const journalId = await journal(ctx, {
    op: "decision_resolve",
    instanceId: used,
    revisionId: used ? ((await ctx.store.getInstance(used))?.revisionId ?? null) : null,
    targetPlayerId: row.playerId,
    ...(input.by === "judge" && input.userId ? { actorUserId: input.userId } : {}),
    intent: { decisionId: row.id, by: input.by },
    outcome: {
      option: input.choice.option,
      ...(input.choice.picks ? { picks: [...input.choice.picks] } : {}),
      before: [...input.before],
      after: [...input.after],
    },
    causeId: row.causeJournalId ?? null,
    visibility: "holder",
  });
  noteDecision(ctx, settled);
  return journalId;
}

// ---------------------------------------------------------------------------
// The choice of a game (wave C, spec §7.12)
// ---------------------------------------------------------------------------

/** A game a choice offers, as it was when offered — the dashboard shows it, the roll takes its id. */
export interface GameOffer {
  gameId: string;
  title: string;
  coverUrl: string | null;
  genres: string[];
  /** Release year; null when the catalog does not know it. */
  year: number | null;
  rating: number | null;
  platform: string | null;
}

/** How a game choice came about, and the games it offers (§4.3 `context`). */
export interface GameChoiceContext {
  /** A roll, or a reroll of the game in flight — the season's own, an item's, a game set aside. */
  origin: "roll" | "reroll" | "postpone";
  /** The roll it replaced, when it replaced one. */
  replacedRollId: string | null;
  /** The item that rerolled the game or set it aside — its key and its names as they were. */
  itemKey: string | null;
  names: CompiledEntry["names"] | null;
  games: GameOffer[];
}

/**
 * Opens a game choice (§7.12 step 5): the games the draw offers, waiting for
 * the player. No default — it is the player's game — and one at a time, as
 * every decision kind (the partial unique index holds it).
 */
export async function openGameChoice(ctx: ExecContext, input: { playerId: string; context: GameChoiceContext }): Promise<IeeDecisionRow> {
  const among = input.context.games.map((g) => g.gameId);
  const options: DecisionOption[] = [{ id: "take", kind: "take", params: { among } }];
  const journalId = await journal(ctx, {
    op: "decision_open",
    targetPlayerId: input.playerId,
    intent: { kind: "game_choice", origin: input.context.origin, replaced: input.context.replacedRollId, item: input.context.itemKey },
    outcome: { options, offered: among },
    visibility: "holder",
  });
  const row = await ctx.store.insertDecision({
    id: randomUUID(),
    seasonId: ctx.seasonId,
    playerId: input.playerId,
    kind: "game_choice",
    instanceId: null,
    revisionId: null,
    ruleIndex: null,
    options,
    // Nothing is taken for the player: the choice waits for them (§7.12).
    defaultChoice: { option: "take", picks: [] },
    context: input.context,
    causeJournalId: journalId,
  });
  noteDecision(ctx, row);
  return row;
}

/** The games a game choice offers, by id; empty for a row that is not one. */
export function offeredGames(row: Pick<IeeDecisionRow, "kind" | "context">): GameOffer[] {
  if (row.kind !== "game_choice") return [];
  const games = (row.context as Partial<GameChoiceContext>).games;
  return Array.isArray(games) ? games : [];
}

export type GameChoiceAnswer =
  | { ok: true; journalId: number; game: GameOffer }
  | { ok: false; code: "ieeDecisionNotFound" | "ieeDecisionSettled" | "ieeDecisionChoiceInvalid" | "ieeDecisionKind" };

/**
 * Settles a game choice with the game taken and the roll created with it
 * (§7.12), inside the transaction that created the roll: a game it did not
 * offer is refused, and a second answer settles nothing — the guard is the
 * UPDATE, so the caller rolls the roll back with it.
 */
export async function settleGameChoice(
  ctx: ExecContext,
  input: { decisionId: string; gameId: string; rollId: string; userId: string | null },
): Promise<GameChoiceAnswer> {
  const row = await ctx.store.getDecision(input.decisionId);
  if (!row || row.seasonId !== ctx.seasonId) return { ok: false, code: "ieeDecisionNotFound" };
  if (row.kind !== "game_choice") return { ok: false, code: "ieeDecisionKind" };
  if (row.status !== "pending") return { ok: false, code: "ieeDecisionSettled" };
  const game = offeredGames(row).find((g) => g.gameId === input.gameId);
  if (!game) return { ok: false, code: "ieeDecisionChoiceInvalid" };
  const settled = await ctx.store.settleDecision(row.id, {
    status: "resolved",
    choice: { option: "take", picks: [game.gameId] },
    resolvedByUserId: input.userId,
  });
  if (!settled) return { ok: false, code: "ieeDecisionSettled" };
  const journalId = await journal(ctx, {
    op: "decision_resolve",
    targetPlayerId: row.playerId,
    intent: { decisionId: row.id, by: "player" },
    outcome: { option: "take", gameId: game.gameId, rollId: input.rollId },
    causeId: row.causeJournalId ?? null,
    visibility: "holder",
  });
  noteDecision(ctx, settled);
  return { ok: true, journalId, game };
}

// ---------------------------------------------------------------------------
// Out-of-turn moves (spec §7.3)
// ---------------------------------------------------------------------------

/**
 * Where a move by `by` cells from `from` ends. Back never wraps — a penalty
 * must not turn into a jump to the front of a loop — and forward wraps on a
 * loop and stops at the last cell otherwise.
 */
export function outOfTurnLanding(board: BoardInfo | null, from: number, by: number): number {
  const raw = from + by;
  if (by <= 0) return Math.max(0, raw);
  if (!board) return raw;
  if (board.loop) return raw % board.size;
  return Math.min(board.size - 1, raw);
}

/**
 * An out-of-turn move: the position changes and nothing else does — no cell,
 * no wheel, no board objects, no `moves` counter — but reaching the finish
 * still counts. Positions are read as the move is carried out, so moves in a
 * row see each other. Returns a feed row per player who moved; the entry that
 * moved them is named only where the caller reveals it.
 */
export async function movePlayer(
  ctx: ExecContext,
  input: {
    intent: MoveIntent;
    causeId?: number | null;
    reveal: boolean;
    /** It reaches whoever it moves through the game: a move back may be answered (spec §6.13). */
    arrival?: { from: string | null; reactions?: number };
    /** It goes this much further — an answer amplified it (spec §6.13); a swap goes as it is. */
    factor?: number;
  },
): Promise<IeeFeedEntry[]> {
  const { intent } = input;
  const causeId = input.causeId ?? null;
  const places = await ctx.store.places(ctx.seasonId);
  const placeOf = (id: string) => places.find((p) => p.id === id) ?? null;
  const draws: number[] = [];
  /** A participant, or the active rival nearest behind one — a tie decided by the server. */
  const pick = (who: MoveWho): PlayerPlace | null => {
    if (typeof who === "string") return placeOf(who);
    const of = placeOf(who.nearestBehind);
    if (!of) return null;
    const behind = places.filter((p) => p.status === "active" && p.id !== of.id && p.position < of.position);
    if (behind.length === 0) return null;
    const nearest = Math.max(...behind.map((p) => p.position));
    const tied = behind.filter((p) => p.position === nearest);
    if (tied.length === 1) return tied[0]!;
    const r = ctx.rng();
    draws.push(r);
    return tied[Math.min(tied.length - 1, Math.floor(r * tied.length))]!;
  };
  const nothing = async (reason: string): Promise<IeeFeedEntry[]> => {
    await journal(ctx, { op: "noop", intent: { move: intent }, outcome: { reason }, causeId }, draws);
    return [];
  };

  const mover = pick(intent.who);
  if (!mover) return nothing(typeof intent.who === "string" ? "unknown_player" : "nobody_behind");
  if (mover.status !== "active") return nothing("not_active");
  const board = ctx.board ? await ctx.board() : null;

  const planned: { place: PlayerPlace; to: number; with?: string }[] = [];
  const to = intent.to;
  if ("by" in to) {
    planned.push({ place: mover, to: outOfTurnLanding(board, mover.position, to.by) });
  } else if ("player" in to) {
    const target = placeOf(to.player);
    if (!target) return nothing("unknown_player");
    planned.push({ place: mover, to: to.at === "cell" ? target.position : Math.max(0, target.position - 1) });
  } else if ("lastMoveStart" in to) {
    const from = await ctx.store.lastMoveStart(mover.id);
    if (from === null) return nothing("no_last_move");
    planned.push({ place: mover, to: from });
  } else if ("halfwayTo" in to) {
    const target = placeOf(to.halfwayTo);
    if (!target || target.position <= mover.position) return nothing("not_behind");
    planned.push({ place: mover, to: mover.position + Math.floor((target.position - mover.position) / 2) });
  } else {
    const other = pick(to.swapWith);
    if (!other) return nothing(typeof to.swapWith === "string" ? "unknown_player" : "nobody_behind");
    if (other.id === mover.id) return nothing("self");
    if (other.status !== "active") return nothing("not_active");
    planned.push({ place: mover, to: other.position, with: other.id }, { place: other, to: mover.position, with: mover.id });
  }

  const entry = ctx.registry.get(intent.key);
  const feed: IeeFeedEntry[] = [];
  /** A move made that many times as long, from where it starts — back never past the first cell. */
  const stretch = (move: (typeof planned)[number], factor: number) => ({
    ...move,
    to: outOfTurnLanding(board, move.place.position, (move.to - move.place.position) * factor),
  });
  if ((input.factor ?? 1) > 1 && planned.length === 1) planned[0] = stretch(planned[0]!, input.factor!);
  // A move back is put to the entries of whoever it moves (§6.13); a swap moves both or neither.
  if (input.arrival && (input.arrival.reactions ?? 0) < MAX_CHAIN_DEPTH) {
    for (const move of [...planned]) {
      if (move.to >= move.place.position) continue;
      const answered = await answerArrival(ctx, {
        to: move.place.id,
        from: input.arrival.from,
        arrival: { is: "moveBack", entry: null },
        amplifiable: planned.length === 1,
        reveal: input.reveal,
        causeId,
        what: { key: intent.key, move: intent.to, from: move.place.position, to: move.to },
        draws,
      });
      if (!answered) continue;
      feed.push(...answered.feed);
      if (answered.answer.kind === "amplify") {
        planned[planned.indexOf(move)] = stretch(move, answered.answer.factor);
        continue;
      }
      if (answered.answer.kind === "replace" && answered.answer.with > 0) {
        feed.push(
          ...(await movePlayer(ctx, {
            intent: { kind: "move", who: move.place.id, to: { by: answered.answer.with }, key: answered.entry.key },
            causeId: answered.journalId,
            reveal: input.reveal,
          })),
        );
      }
      return feed;
    }
  }
  for (const move of planned) {
    if (move.to === move.place.position) continue;
    const finished = board !== null && board.finishAt !== null && move.to === board.finishAt;
    await ctx.store.setPosition(move.place.id, move.to, finished);
    await journal(
      ctx,
      {
        op: "move_player",
        targetPlayerId: move.place.id,
        intent: { key: intent.key, to: intent.to },
        outcome: { from: move.place.position, to: move.to, finished, ...(move.with ? { swappedWith: move.with } : {}) },
        causeId,
        visibility: "public",
      },
      draws,
    );
    feed.push({
      eventType: "moved_out_of_turn",
      seasonPlayerId: move.place.id,
      payload: {
        from: move.place.position,
        to: move.to,
        ...(move.with ? { swappedWith: move.with } : {}),
        ...(input.reveal ? { key: intent.key, name: entry?.names ?? null } : {}),
      },
    });
    if (finished) feed.push({ eventType: "player_finished", seasonPlayerId: move.place.id, payload: { position: move.to, outOfTurn: true } });
  }
  return feed;
}

// ---------------------------------------------------------------------------
// use, fire, tick, end
// ---------------------------------------------------------------------------

/**
 * Spends one charge of a held item. Null when there was none to spend — a
 * double-submitted form, or an item already gone: the guard is the UPDATE.
 */
export async function useCharge(
  ctx: ExecContext,
  input: { instanceId: string; targetPlayerId?: string | null },
): Promise<{ row: IeeInstanceRow; ended: boolean; journalId: number } | null> {
  const row = await ctx.store.spendCharge(input.instanceId);
  if (!row) return null;
  const ended = (row.chargesLeft ?? 0) <= 0;
  if (ended) await ctx.store.end(row.id, "used");
  const journalId = await journal(ctx, {
    op: "use",
    instanceId: row.id,
    revisionId: row.revisionId,
    actorPlayerId: row.holderPlayerId,
    targetPlayerId: input.targetPlayerId ?? null,
    outcome: { chargesLeft: row.chargesLeft, ended },
    visibility: "public",
  });
  return { row: { ...row, ...(ended ? { status: "ended" as const, endReason: "used" as const } : {}) }, ended, journalId };
}

/** The fields of a patch worth keeping in the turn trace. */
function patchSummary(patch: HookPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "reason" || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

async function expire(
  ctx: ExecContext,
  row: IeeInstanceRow,
  options: { reveal: boolean; causeId?: number | null; depth?: number },
): Promise<IeeFeedEntry[]> {
  const ended = await ctx.store.end(row.id, "expired");
  if (!ended) return [];
  const entry = ctx.registry.get(row.revisionId);
  const journalId = await journal(ctx, {
    op: "expire",
    instanceId: row.id,
    revisionId: row.revisionId,
    targetPlayerId: row.holderPlayerId,
    outcome: { reason: "expired" },
    causeId: options.causeId ?? null,
    visibility: options.reveal ? "public" : "staff",
  });
  const feed: IeeFeedEntry[] = options.reveal ? [effectExpired(entry, row)] : [];
  if (entry && entry.kind === "effect" && entry.onExpire.length > 0 && row.holderPlayerId) {
    feed.push(
      ...(await runLifecycle(ctx, entry, "onExpire", {
        holder: row.holderPlayerId,
        params: row.params,
        instanceId: row.id,
        causeId: journalId,
        depth: options.depth ?? 0,
        reveal: options.reveal,
      })),
    );
  }
  return feed;
}

/** Brings a counter down by `by`, ending the instance at zero. */
async function countDown(
  ctx: ExecContext,
  row: IeeInstanceRow,
  by: number,
  options: { reveal: boolean; causeId?: number | null; why: string },
): Promise<IeeFeedEntry[]> {
  if (row.remaining === null || by <= 0) return [];
  const next = Math.max(0, row.remaining - by);
  await ctx.store.setRemaining(row.id, next);
  await journal(ctx, {
    op: "tick",
    instanceId: row.id,
    revisionId: row.revisionId,
    targetPlayerId: row.holderPlayerId,
    intent: { unit: row.remainingUnit, by: options.why },
    outcome: { before: row.remaining, after: next },
    causeId: options.causeId ?? null,
  });
  return next === 0 ? expire(ctx, { ...row, remaining: next }, options) : [];
}

/**
 * Records the rules that fired during a turn and spends the charges they
 * asked for (spec §9.1 `fire`): a `triggers` counter goes down by one per
 * consumed instance, and ends at zero.
 */
export async function fire(
  ctx: ExecContext,
  input: {
    fired: readonly FiredRule[];
    consumed: readonly string[];
    /** The holder's roll the rules fired on: a renewal's count starts after the roll it arrived in. */
    rollSeq: number;
    reveal: boolean;
  },
): Promise<IeeFeedEntry[]> {
  for (const f of input.fired) {
    await journal(
      ctx,
      {
        op: "fire",
        instanceId: f.instanceId,
        revisionId: f.revisionId,
        ruleIndex: f.ruleIndex,
        intent: { hook: f.hook },
        outcome: patchSummary(f.patch),
      },
      f.draws,
    );
  }
  const feed: IeeFeedEntry[] = [];
  for (const id of new Set(input.consumed)) {
    const row = await ctx.store.getInstance(id);
    if (!row || row.status !== "active") continue;
    if (!participates(countingFrom(row.anchorRollSeq, row.countFromRollSeq), input.rollSeq)) continue;
    if (row.kind === "item") feed.push(...(await spendHeldCharge(ctx, row, input.reveal)));
    else if (row.remainingUnit === "triggers") feed.push(...(await countDown(ctx, row, 1, { reveal: input.reveal, why: "fired" })));
  }
  return feed;
}

/**
 * A passive or cursed item that fired spends a charge; with none left it
 * vanishes — `triggered`, as it did its work (spec §6.10). The guard is the
 * store's UPDATE, as for a use.
 */
async function spendHeldCharge(ctx: ExecContext, row: IeeInstanceRow, reveal: boolean): Promise<IeeFeedEntry[]> {
  if (row.chargesLeft === null) return [];
  const spent = await ctx.store.spendCharge(row.id);
  if (!spent) return [];
  const left = spent.chargesLeft ?? 0;
  await journal(ctx, {
    op: "tick",
    instanceId: row.id,
    revisionId: row.revisionId,
    targetPlayerId: row.holderPlayerId,
    intent: { unit: "charges", by: "fired" },
    outcome: { before: row.chargesLeft, after: left },
  });
  if (left > 0) return [];
  const ended = await ctx.store.end(row.id, "triggered");
  if (!ended) return [];
  await journal(ctx, {
    op: "end",
    instanceId: row.id,
    revisionId: row.revisionId,
    targetPlayerId: row.holderPlayerId,
    outcome: { reason: "triggered" },
    visibility: reveal ? "public" : "staff",
  });
  return reveal ? [itemExpired(ctx.registry.get(row.revisionId), row)] : [];
}

/**
 * The end of a holder's turn: roll-, move- and pass-counted durations of the
 * instances that count this roll go down; those at zero end (§7.9). An
 * instance counts the rolls after its anchor — or after the roll a renewal
 * arrived in (§7.10).
 */
export async function tick(
  ctx: ExecContext,
  input: { holder: string; rollSeq: number; ticks: TurnTicks; reveal: boolean },
): Promise<IeeFeedEntry[]> {
  const feed: IeeFeedEntry[] = [];
  const rows = await ctx.store.activeForHolder(input.holder);
  for (const row of rows) {
    if (row.kind !== "effect" || !participates(countingFrom(row.anchorRollSeq, row.countFromRollSeq), input.rollSeq)) {
      continue;
    }
    const by = tickAmount(row.remainingUnit, input.ticks);
    feed.push(...(await countDown(ctx, row, by, { reveal: input.reveal, why: "turn" })));
  }
  return feed;
}

/**
 * Ends one instance for a reason other than running out — staff removal,
 * mostly. Null when it had already ended (a double submit).
 */
export async function endInstance(
  ctx: ExecContext,
  input: { instanceId: string; reason: Exclude<EndReason, "expired">; note?: string | null },
): Promise<IeeInstanceRow | null> {
  const row = await ctx.store.end(input.instanceId, input.reason);
  if (!row) return null;
  await journal(ctx, {
    op: "end",
    instanceId: row.id,
    revisionId: row.revisionId,
    targetPlayerId: row.holderPlayerId,
    outcome: { reason: input.reason, ...(input.note ? { note: input.note } : {}) },
    visibility: "public",
  });
  return row;
}

/**
 * Takes a player's instances away (spec §6.10, `remove`): the one chosen at
 * use, or the newest — or random — ones that match. An effect ends
 * `cleansed`, an item `removed`.
 */
export async function removeInstances(ctx: ExecContext, intent: RemoveIntent, causeId: number | null): Promise<IeeInstanceRow[]> {
  const rarity = intent.rarity ?? null;
  const rows = (await ctx.store.activeForHolder(intent.from)).filter((row) => {
    if (row.kind !== "effect" && row.kind !== "item") return false;
    if (intent.what !== "any" && row.kind !== intent.what) return false;
    if (intent.entryId !== null && row.entryId !== intent.entryId) return false;
    const entry = ctx.registry.get(row.revisionId);
    if (rarity !== null && (!entry || !rarity.includes(entry.rarity))) return false;
    return intent.character === null || entry?.character === intent.character;
  });
  const draws: number[] = [];
  let chosen: IeeInstanceRow[];
  if (typeof intent.pick === "object") {
    const id = intent.pick.instanceId;
    chosen = rows.filter((row) => row.id === id);
  } else if (intent.pick === "newest") {
    chosen = rows.slice(0, intent.count);
  } else {
    const pool = [...rows];
    chosen = [];
    while (chosen.length < intent.count && pool.length > 0) {
      const r = ctx.rng();
      draws.push(r);
      chosen.push(pool.splice(Math.min(pool.length - 1, Math.floor(r * pool.length)), 1)[0]!);
    }
  }
  const ended: IeeInstanceRow[] = [];
  for (const row of chosen) {
    const reason = row.kind === "effect" ? "cleansed" : "removed";
    const gone = await ctx.store.end(row.id, reason);
    if (!gone) continue;
    ended.push(gone);
    await journal(
      ctx,
      {
        op: "end",
        instanceId: gone.id,
        revisionId: gone.revisionId,
        targetPlayerId: intent.from,
        outcome: { reason, pick: typeof intent.pick === "object" ? "choice" : intent.pick },
        causeId,
      },
      draws,
    );
  }
  return ended;
}

/**
 * Removes a participant's effects (spec §6.7 `cleanse`): matching character
 * and any of the tags, newest first, up to `count`. Items stay — a cursed
 * item is answered by `remove`.
 */
export async function cleanse(
  ctx: ExecContext,
  input: {
    from: string;
    character: "bonus" | "penalty" | null;
    tags: readonly string[];
    count: number | "all";
    causeId?: number | null;
  },
): Promise<IeeInstanceRow[]> {
  const rows = (await ctx.store.activeForHolder(input.from)).filter((row) => {
    if (row.kind !== "effect") return false;
    const entry = ctx.registry.get(row.revisionId);
    if (!entry) return input.character === null && input.tags.length === 0;
    if (input.character !== null && entry.character !== input.character) return false;
    return input.tags.length === 0 || input.tags.some((t) => entry.tags.includes(t));
  });
  const chosen = input.count === "all" ? rows : rows.slice(0, input.count);
  const ended: IeeInstanceRow[] = [];
  for (const row of chosen) {
    const gone = await ctx.store.end(row.id, "cleansed");
    if (!gone) continue;
    ended.push(gone);
    await journal(ctx, {
      op: "end",
      instanceId: gone.id,
      revisionId: gone.revisionId,
      targetPlayerId: input.from,
      outcome: { reason: "cleansed" },
      causeId: input.causeId ?? null,
    });
  }
  return ended;
}

/**
 * Moves points through the ledger. The ledger records what actually moved:
 * a balance never goes below zero, and taking 3 from 1 records −1.
 */
export async function applyBalance(
  ctx: ExecContext,
  input: { to: string; delta: number; reason: string; causeId?: number | null },
): Promise<{ before: number; after: number } | null> {
  const before = await ctx.store.balanceOf(input.to);
  if (before === null) {
    await journal(ctx, {
      op: "noop",
      targetPlayerId: input.to,
      intent: { delta: input.delta, reason: input.reason },
      outcome: { reason: "unknown_player" },
      causeId: input.causeId ?? null,
    });
    return null;
  }
  const after = Math.max(0, before + input.delta);
  if (after !== before) {
    await ctx.store.writeBalance({ seasonPlayerId: input.to, delta: after - before, reason: input.reason, balance: after });
  }
  await journal(ctx, {
    op: "balance",
    targetPlayerId: input.to,
    intent: { delta: input.delta, reason: input.reason },
    outcome: { before, after },
    causeId: input.causeId ?? null,
  });
  return { before, after };
}

// ---------------------------------------------------------------------------
// Season-wide
// ---------------------------------------------------------------------------

/**
 * A season reset clears every instance and the journal with the rest of the
 * season's history (moves, rolls and the feed go in the same transaction),
 * then starts the new journal with the reset itself.
 */
export async function resetSeason(ctx: ExecContext): Promise<{ instances: number; journal: number }> {
  const cleared = await ctx.store.clearSeason(ctx.seasonId);
  await journal(ctx, { op: "reset", outcome: cleared });
  return cleared;
}

/**
 * Staff-visible notes for entries the registry could not load (§5.2). One
 * row per revision and season: reloading a registry does not repeat it.
 */
export async function journalCompileFailures(ctx: ExecContext, failures: readonly SetFailure[]): Promise<number> {
  if (failures.length === 0) return 0;
  const done = await ctx.store.compileFailuresJournaled(ctx.seasonId);
  let written = 0;
  for (const f of failures) {
    if (done.has(f.revisionId)) continue;
    await journal(ctx, {
      op: "compile_failed",
      revisionId: f.revisionId,
      intent: { entryId: f.entryId, slug: f.slug },
      outcome: { errors: f.errors.map((e) => ({ code: e.code, path: e.path, message: e.message })) },
    });
    written += 1;
  }
  return written;
}
