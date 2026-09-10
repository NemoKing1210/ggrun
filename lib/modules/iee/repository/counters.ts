import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { moves, seasonPlayers, users, type SeasonPlayer } from "@/db/schema";
import type { IeePlayerSnapshot, PoolCounters } from "@/lib/engine";

import {
  countEffectsPerPlayer,
  countEffectsPerSeason,
  getActiveEffectRows,
  lastEffectDropSeq,
} from "./effects";
import {
  countHeldItems,
  countItemsPerPlayer,
  countItemsPerSeason,
  lastItemDropSeq,
} from "./inventory";

/** Total resolved rolls across the season — the cooldown clock. */
export async function getSeasonRollSeq(seasonId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`coalesce(sum(${seasonPlayers.rollSeq}), 0)::int` })
    .from(seasonPlayers)
    .where(eq(seasonPlayers.seasonId, seasonId));
  return rows[0]?.n ?? 0;
}

export async function countActivePlayers(seasonId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasonPlayers)
    .where(
      and(eq(seasonPlayers.seasonId, seasonId), eq(seasonPlayers.status, "active")),
    );
  return rows[0]?.n ?? 0;
}

/** 1 = leader. Ties share the better rank, matching the leaderboard. */
export async function getPlayerRank(
  seasonId: string,
  position: number,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasonPlayers)
    .where(
      and(
        eq(seasonPlayers.seasonId, seasonId),
        eq(seasonPlayers.status, "active"),
        gt(seasonPlayers.position, position),
      ),
    );
  return (rows[0]?.n ?? 0) + 1;
}

/**
 * Board moves this participant has made — gates `unlockAfterMove` and the PvP
 * protection window.
 *
 * Counted from `moves` rather than read from `season_players.roll_seq`: that
 * column is added by this feature's migration and backfills to 0, so a season
 * already in flight would report every veteran as a brand-new player. The
 * move history is accurate whenever the feature is switched on.
 */
export async function getMoveCount(seasonPlayerId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(moves)
    .where(eq(moves.seasonPlayerId, seasonPlayerId));
  return rows[0]?.n ?? 0;
}

export async function toPlayerSnapshot(
  sp: SeasonPlayer,
): Promise<IeePlayerSnapshot> {
  const [rank, moveCount] = await Promise.all([
    getPlayerRank(sp.seasonId, sp.position),
    getMoveCount(sp.id),
  ]);
  return {
    seasonPlayerId: sp.id,
    position: sp.position,
    balancePoints: sp.balancePoints,
    // Effect durations are relative, so a 0 baseline on an in-flight season
    // is harmless; the gates below need the real history, hence moveCount.
    rollSeq: sp.rollSeq,
    moveCount,
    rank,
    status: sp.status,
  };
}

/**
 * Everything `pickWheelOutcome` needs that lives in the database, in one
 * round of queries. Items and effects share one pool, so their counters are
 * merged by key — keys are unique across both registries.
 */
export async function loadPoolContext(sp: SeasonPlayer): Promise<{
  counters: PoolCounters;
  player: IeePlayerSnapshot;
  activeEffectKeys: string[];
  heldItemCount: number;
  seasonRollSeq: number;
  playerCount: number;
}> {
  const [
    itemsPerSeason,
    effectsPerSeason,
    itemsPerPlayer,
    effectsPerPlayer,
    itemDropSeq,
    effectDropSeq,
    activeRows,
    heldItemCount,
    seasonRollSeq,
    playerCount,
    player,
  ] = await Promise.all([
    countItemsPerSeason(sp.seasonId),
    countEffectsPerSeason(sp.seasonId),
    countItemsPerPlayer(sp.id),
    countEffectsPerPlayer(sp.id),
    lastItemDropSeq(sp.seasonId),
    lastEffectDropSeq(sp.seasonId),
    getActiveEffectRows(sp.id),
    countHeldItems(sp.id),
    getSeasonRollSeq(sp.seasonId),
    countActivePlayers(sp.seasonId),
    toPlayerSnapshot(sp),
  ]);

  return {
    counters: {
      perSeason: { ...itemsPerSeason, ...effectsPerSeason },
      perPlayer: { ...itemsPerPlayer, ...effectsPerPlayer },
      lastDropRollSeq: { ...itemDropSeq, ...effectDropSeq },
    },
    player,
    activeEffectKeys: activeRows.map((r) => r.effectKey),
    heldItemCount,
    seasonRollSeq,
    playerCount,
  };
}

/** Someone an item may be aimed at, as the target picker needs them. */
export type TargetOption = {
  seasonPlayerId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  position: number;
  /** False while the newcomer protection window is still open. */
  targetable: boolean;
};

/**
 * Active participants of a season, with the protection window already applied.
 * The flag is advisory for the UI — `activateInventoryItem` re-checks it server-side.
 */
export async function listTargetOptions(
  seasonId: string,
  excludeSeasonPlayerId: string,
  pvpProtectionMoves: number,
): Promise<TargetOption[]> {
  const rows = await db
    .select({
      seasonPlayerId: seasonPlayers.id,
      position: seasonPlayers.position,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      moves: sql<number>`(select count(*)::int from ${moves} m where m.season_player_id = ${seasonPlayers.id})`,
    })
    .from(seasonPlayers)
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .where(and(eq(seasonPlayers.seasonId, seasonId), eq(seasonPlayers.status, "active")))
    .orderBy(seasonPlayers.position);

  return rows
    .filter((r) => r.seasonPlayerId !== excludeSeasonPlayerId)
    .map((r) => ({
      seasonPlayerId: r.seasonPlayerId,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      position: r.position,
      targetable: r.moves >= pvpProtectionMoves,
    }));
}
