/**
 * The events lifecycle: assigned on a cell, proved by the player, judged by
 * staff, rewarded on approval.
 *
 * Events are the one part of IEE that is content rather than code, so this
 * reuses the moderation *pattern* the reroll and completion queues already
 * established rather than their tables — `completion_requests` is bound to
 * `game_rolls` by a non-null foreign key.
 */
import { eq } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { ledgerEntries, seasonPlayers, type PlayerEventRow, type SeasonPlayer } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction, logEvent, type EventType } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import {
  assignEvent,
  getAssignedEventKeys,
  getEventTemplatesByKeys,
  getPlayerEvent,
  getSeasonRollSeq,
  resolveEvent,
  submitEventProof,
} from "@/lib/modules/iee/repository";
import { parseEventReward, pickEventKey, type EventReward } from "@/lib/engine";

import { grant, type DecisionNote, type GrantState } from "@/lib/modules/iee/executor";
import { executionContext } from "@/lib/modules/iee/executor/context";
import { announceDecisions } from "@/lib/modules/iee/decisions";

import { GameLoopError } from "./errors";
import { parseSeasonConfig } from "./helpers";
import type { FeedEntry } from "./iee";

type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Hands out one challenge when a player lands on an `event` cell.
 *
 * Silent when the pool is empty or the player already has everything in it —
 * an event cell then behaves like a plain one, which is better than failing
 * the turn over missing content.
 */
export async function assignEventFromCell(
  tx: Tx,
  params: {
    seasonId: string;
    seasonPlayerId: string;
    pool: readonly string[];
    moveId: string;
    rng: () => number;
  },
): Promise<FeedEntry[]> {
  if (params.pool.length === 0) return [];

  const assigned = await getAssignedEventKeys(params.seasonPlayerId);
  const key = pickEventKey(params.pool, assigned, params.rng);
  if (!key) return [];

  const [template] = await getEventTemplatesByKeys([key]);
  if (!template) return [];

  const row = await assignEvent(
    {
      seasonId: params.seasonId,
      seasonPlayerId: params.seasonPlayerId,
      template,
      source: "cell_event",
      sourceMoveId: params.moveId,
    },
    tx,
  );
  // Null means the unique index caught a race the pre-filter did not.
  if (!row) return [];

  return [
    {
      eventType: "event_assigned",
      payload: { eventKey: row.eventKey, title: row.title, playerEventId: row.id },
    },
  ];
}

/** The player attaches proof. Guarded, so a double submit cannot re-open a row. */
export async function submitEventProofUseCase(params: {
  playerEventId: string;
  proof: string | null;
}): Promise<PlayerEventRow> {
  const actor = await getCurrentUser();
  if (!actor) throw new GameLoopError("gameLoginRequired");

  const row = await getPlayerEvent(params.playerEventId);
  if (!row) throw new GameLoopError("ieeEventNotFound");

  const sp = await getSeasonPlayerRow(row.seasonPlayerId);
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  if (sp.playerId !== actor.id) throw new GameLoopError("gameNotAllowed");

  const proof = params.proof?.trim() || null;
  if (row.requiresProof && (!proof || proof.length < 5)) {
    throw new GameLoopError("ieeProofRequired");
  }

  const updated = await submitEventProof(row.id, proof);
  if (!updated) throw new GameLoopError("ieeEventNotOpen");

  await logEvent({
    seasonId: row.seasonId,
    seasonPlayerId: row.seasonPlayerId,
    eventType: "event_submitted",
    payload: { eventKey: row.eventKey, title: row.title },
  });
  log.info("iee.event.submitted", { actorId: actor.id, playerEventId: row.id });
  return updated;
}

async function getSeasonPlayerRow(id: string): Promise<SeasonPlayer | null> {
  const rows = await db.select().from(seasonPlayers).where(eq(seasonPlayers.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Staff verdict. On approval the reward — points, an item, an effect, or any
 * combination — is granted in the same transaction as the status change, so an
 * approved event can never be left unpaid.
 */
export async function resolveEventUseCase(params: {
  playerEventId: string;
  outcome: "approved" | "rejected";
  adminNote?: string | null;
}): Promise<void> {
  const actor = await getCurrentUser();
  if (!actor || !isStaff(actor)) throw new GameLoopError("adminStaffRequired");

  const row = await getPlayerEvent(params.playerEventId);
  if (!row) throw new GameLoopError("ieeEventNotFound");

  const sp = await getSeasonPlayerRow(row.seasonPlayerId);
  if (!sp) throw new GameLoopError("gameParticipantNotFound");
  const season = await getSeasonById(row.seasonId);
  if (!season) throw new GameLoopError("gameSeasonNotFound");

  const config = parseSeasonConfig(season.config);

  const reward: EventReward =
    params.outcome === "approved" ? parseEventReward(row.reward) : {};
  const seasonRollSeq = await getSeasonRollSeq(row.seasonId);

  // A reward may ask its player to choose (§7.6): announced once this commits.
  const decisions: DecisionNote[] = [];
  await db.transaction(async (tx) => {
    const updated = await resolveEvent(
      row.id,
      params.outcome,
      actor.id,
      params.adminNote?.trim() || null,
      tx,
    );
    if (!updated) throw new GameLoopError("ieeEventNotOpen");

    if (reward.points) {
      // Points move through the ledger like every other point in the game.
      await tx.insert(ledgerEntries).values({
        seasonPlayerId: sp.id,
        delta: reward.points,
        reason: `event_reward:${row.eventKey}`,
        createdBy: actor.id,
      });
      await tx
        .update(seasonPlayers)
        .set({ balancePoints: sp.balancePoints + reward.points })
        .where(eq(seasonPlayers.id, sp.id));
    }

    // Both grants go through the executor, so a challenge reward obeys the
    // season's tuning and the effect's stacking policy like every other grant
    // — and, like every other grant, never touches a game already in flight.
    if (reward.itemKey || reward.effectKey) {
      const exec = await executionContext({
        tx,
        seasonId: row.seasonId,
        config: config.iee,
        seasonRollSeq,
        actorUserId: actor.id,
        decisions,
      });
      if (reward.itemKey) {
        const granted = await grant(exec, { entry: reward.itemKey, to: sp.id, source: "event_reward", reveal: false });
        noteRewardGrant(row.id, { itemKey: reward.itemKey }, granted.state);
      }
      if (reward.effectKey) {
        const granted = await grant(exec, { entry: reward.effectKey, to: sp.id, source: "event_reward", reveal: false });
        noteRewardGrant(row.id, { effectKey: reward.effectKey }, granted.state);
      }
    }
  });

  await announceDecisions(decisions);
  await logEvent({
    seasonId: row.seasonId,
    seasonPlayerId: row.seasonPlayerId,
    eventType: (params.outcome === "approved"
      ? "event_approved"
      : "event_rejected") as EventType,
    payload: { eventKey: row.eventKey, title: row.title, reward },
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: `iee_event_${params.outcome}`,
    targetType: "player_event",
    targetId: row.id,
    payload: { eventKey: row.eventKey, reward },
  });
  log.info("iee.event.resolved", {
    actorId: actor.id,
    playerEventId: row.id,
    outcome: params.outcome,
  });
}

/**
 * A reward cannot be refused the way an item use can — the challenge is
 * already approved — so a grant that does not land is only noted, and the
 * rest of the reward still lands. A `unique` effect the player already has is
 * expected; anything else means the season's catalog or limits keep the
 * reward out (the journal holds the refusal too).
 */
function noteRewardGrant(
  playerEventId: string,
  ref: { itemKey: string } | { effectKey: string },
  state: GrantState,
): void {
  if (state === "granted" || state === "refreshed") return;
  if (state === "blocked_unique") log.debug("iee.event.reward_blocked_unique", { playerEventId, ...ref });
  else log.warn("iee.event.reward_not_granted", { playerEventId, ...ref, state });
}
