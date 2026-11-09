/**
 * Using an item, apart from the database: whether it may be used now and on
 * whom, what its rules ask for, and — once that is settled — spending the
 * charge and carrying the intents out through the executor.
 *
 * The game's item path (`lib/modules/game/service/use-item.ts`) loads the rows
 * and calls these; the simulations (`../sim`) call the same two functions over
 * an in-memory store, so a scenario that uses an item uses it the way a player
 * does — the same guards, the same refusals, the same charge.
 */
import {
  checkItemUse,
  pickKindOf,
  type EntryChoice,
  type IeeParams,
  type IeePlayerSnapshot,
  type PickRequest,
  type Standing,
  type UseChoice,
  type UsePick,
} from "@/lib/engine";
import type { CompiledItem, ItemUseOutcome } from "@/lib/engine/iee/dsl";
import type { IeeInstanceRow } from "@/db/schema";

import * as executor from "../executor";
import { factsOfRows, runIntents, standingFor, type ExecContext, type IeeFeedEntry } from "../executor";
import type { SeasonRegistry } from "../registry";

export interface ItemUseQuestion {
  registry: SeasonRegistry;
  item: CompiledItem;
  /** The held instance's parameter snapshot. */
  params: IeeParams;
  /** Whether the holder has a game in flight. */
  hasOpenRoll: boolean;
  actor: IeePlayerSnapshot;
  /** The player the user named, or null. */
  candidate: IeePlayerSnapshot | null;
  /** False when the named player belongs to another season. */
  targetInSameSeason: boolean;
  allowTargetingOthers: boolean;
  pvpProtectionMoves: number;
  /** A participant's active instances, newest first. */
  rowsOf: (seasonPlayerId: string) => Promise<IeeInstanceRow[]>;
  rng: () => number;
  /** The instance the user picked, for an item that asks for one (spec §6.10). */
  choice?: string | null;
  /** The entry the user picked from the season's catalog — id or key — for an item that asks for one (spec §6.12). */
  entryChoice?: string | null;
  /** The held instance being used: an item operation never hands it over or copies it. */
  instanceId?: string | null;
  /** The season's participants as they stand — a target filter reads them. */
  standings?: readonly Standing[];
  /** A question waits for the user (wave B, §7.6): they answer it first. */
  decisionPending?: boolean;
  /** The named player's reaction window is open (wave B, §7.4): they are out of reach meanwhile. */
  targetReacting?: boolean;
  /** What the user picked for their next game, for an item that asks (wave C, `usage.pick`, spec §6.16). */
  pick?: PickRequest | null;
  /**
   * The pick as the season's pool offers it to the user — a game with its
   * title — or null when it offers no such thing (spec §6.16); a cell, as the
   * board offers it: a cell an object may stand on (wave D, §6.18). Asked only
   * for an item that asks for a pick; without it, every pick is refused.
   */
  offeredPick?: (pick: PickRequest) => Promise<UsePick | null>;
  /** The objects the user has standing on the board, and how many the season lets one player have (wave D, §6.18). */
  objects?: { owned: number; limit: number };
}

/** Whether one of the holder's rows is what an item's choice may pick. */
export function choiceMatches(choice: UseChoice, row: IeeInstanceRow, registry: SeasonRegistry): boolean {
  if (row.status !== "active") return false;
  if (choice.what !== "any" && row.kind !== choice.what) return false;
  if (choice.entryId !== null && row.entryId !== choice.entryId) return false;
  const entry = registry.get(row.revisionId);
  if (choice.rarity !== null && (!entry || !choice.rarity.includes(entry.rarity))) return false;
  if (choice.character === null) return true;
  return entry?.character === choice.character;
}

/**
 * What a pick from the season's catalog may take (wave B, `grantChosen`, spec
 * §6.12): a bonus item attached and switched on — what drops from the wheel —
 * of the rarities and activation asked, and never the item being used.
 */
export function entryChoiceOptions(choice: EntryChoice, registry: SeasonRegistry, using: CompiledItem): CompiledItem[] {
  return registry.items().filter((item) => {
    if (item.entryId === using.entryId || item.character !== "bonus") return false;
    if (registry.tuning(item.entryId)?.enabled !== true) return false;
    if (choice.rarity !== null && !choice.rarity.includes(item.rarity)) return false;
    return choice.activation === null || item.usage.activation === choice.activation;
  });
}

export type ItemUseDecision =
  | { ok: false; code: string }
  | {
      ok: true;
      /** Whom the use reaches: the holder, the named player, or nobody. */
      target: IeePlayerSnapshot | null;
      outcome: ItemUseOutcome;
    };

/**
 * Everything that may refuse a use, before anything is spent: the use guards
 * (window, target, season settings), what holds on the user and the chosen
 * player (wave B: items forbidden, out of reach), the entry's own rules, and a
 * `unique` status already on its recipient — refusing costs the user nothing
 * but a click, spending a charge on nothing would be a worse answer than either.
 */
export async function decideItemUse(q: ItemUseQuestion): Promise<ItemUseDecision> {
  const usage = q.item.usage;
  const verdict = checkItemUse({
    usage: { mode: usage.activation, window: usage.window, target: usage.target, filter: usage.filter },
    hasOpenRoll: q.hasOpenRoll,
    actor: q.actor,
    target: q.candidate,
    targetInSameSeason: q.targetInSameSeason,
    allowTargetingOthers: q.allowTargetingOthers,
    pvpProtectionMoves: q.pvpProtectionMoves,
    ...(q.standings ? { standings: q.standings } : {}),
  });
  if (!verdict.ok) return { ok: false, code: verdict.code };
  // Decide first (§7.6): nothing is spent while a choice waits.
  if (q.decisionPending) return { ok: false, code: "ieeDecisionPending" };

  const target = verdict.target === "self" ? q.actor : verdict.target === "other" ? q.candidate : null;
  const aimedAtRival = target !== null && target.seasonPlayerId !== q.actor.seasonPlayerId;
  // A rival choosing a reaction to their dice is out of reach until they have (§7.4).
  if (aimedAtRival && q.targetReacting) return { ok: false, code: "ieeTargetReacting" };
  const actorRows = await q.rowsOf(q.actor.seasonPlayerId);
  const targetRows = aimedAtRival ? await q.rowsOf(target.seasonPlayerId) : [];
  // What holds (§6.13): a user kept from their items, a rival out of reach — refused, nothing spent.
  if (standingFor(q.registry, actorRows, q.actor, q.rng).forbidItems) return { ok: false, code: "ieeItemsForbidden" };
  if (aimedAtRival && standingFor(q.registry, targetRows, target, q.rng).untargetable) {
    return { ok: false, code: "ieeTargetUntargetable" };
  }
  // A choice among the user's own instances: asked for, and one the item may pick.
  if (usage.choice) {
    if (!q.choice) return { ok: false, code: "ieeChoiceRequired" };
    const chosen = actorRows.find((r) => r.id === q.choice);
    if (!chosen || !choiceMatches(usage.choice, chosen, q.registry)) return { ok: false, code: "ieeChoiceInvalid" };
  }
  // A pick from the season's catalog (§6.12): asked for, and one the filter lets through.
  let entryChoice: string | null = null;
  if (usage.entryChoice) {
    if (!q.entryChoice) return { ok: false, code: "ieeEntryChoiceRequired" };
    const picked = entryChoiceOptions(usage.entryChoice, q.registry, q.item).find(
      (e) => e.entryId === q.entryChoice || e.key === q.entryChoice,
    );
    if (!picked) return { ok: false, code: "ieeEntryChoiceInvalid" };
    entryChoice = picked.entryId;
  }
  // A pick for the next game (§6.16): of the kind asked, and one the season's pool offers the user;
  // a cell (wave D, §6.18): one the board lets an object stand on.
  let pick: UsePick | null = null;
  if (usage.pick) {
    if (!q.pick || pickKindOf(q.pick) !== usage.pick) return { ok: false, code: "ieePickRequired" };
    pick = q.offeredPick ? await q.offeredPick(q.pick) : null;
    if (!pick) return { ok: false, code: usage.pick === "cell" ? "ieeCellUnavailable" : "ieePickInvalid" };
  }
  const outcome = q.item.use({
    params: q.params,
    actor: q.actor,
    target,
    actorEntries: factsOfRows(q.registry, actorRows),
    targetEntries: factsOfRows(q.registry, targetRows),
    rng: q.rng,
    choice: usage.choice ? (q.choice ?? null) : null,
    entryChoice,
    instanceId: q.instanceId ?? null,
    pick,
  });
  if (outcome.rejected) return { ok: false, code: outcome.rejected };
  // An object needs room among its owner's (§6.18): the season says how many one player may have standing.
  if (outcome.intents.some((i) => i.kind === "place") && (!q.objects || q.objects.owned >= q.objects.limit)) {
    return { ok: false, code: "ieeObjectLimit" };
  }

  // Handing a unique status or item to someone who has it would do nothing (spec §6.10).
  for (const intent of outcome.intents) {
    if (intent.kind !== "grant") continue;
    const entry = q.registry.get(intent.entryId);
    if (!entry) continue;
    const unique = entry.kind === "effect" ? entry.stacking.mode === "unique" : entry.usage.unique;
    if (!unique) continue;
    const recipientRows =
      intent.to === q.actor.seasonPlayerId
        ? actorRows
        : target && intent.to === target.seasonPlayerId
          ? targetRows
          : await q.rowsOf(intent.to);
    if (recipientRows.some((r) => r.kind === entry.kind && r.entryId === entry.entryId)) {
      return { ok: false, code: "ieeTargetAlreadyAffected" };
    }
  }
  return { ok: true, target, outcome };
}

/**
 * Spends one charge and carries the use out, inside the caller's transaction.
 * Null when there was no charge to spend — the guard is the store's UPDATE,
 * so a second submit matches nothing.
 */
export async function carryOutItemUse(
  ctx: ExecContext,
  input: { instanceId: string; holder: string; target: string | null; outcome: ItemUseOutcome },
): Promise<{ journalId: number; feed: IeeFeedEntry[] } | null> {
  // Through the namespace: a bare `useCharge(…)` inside a named function reads
  // as a React hook to the rules-of-hooks lint.
  const used = await executor.useCharge(ctx, { instanceId: input.instanceId, targetPlayerId: input.target });
  if (!used) return null;
  // A status never touches a move already in flight: grants count from the
  // recipient's next roll when they have a game open (SC-HEXSCROLL-7) — the
  // context's `anchorFor` owns the rule.
  const feed = await runIntents(ctx, input.outcome.intents, {
    source: "item",
    reveal: false,
    // The use itself is public (§8.3): a player it moves may see what moved them.
    nameMoves: true,
    causeId: used.journalId,
    ownerPlayerId: input.holder,
    // An item that places itself puts this on the board (wave D, §6.18).
    using: used.row,
  });
  return { journalId: used.journalId, feed };
}
