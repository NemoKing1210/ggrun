import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { gameRolls, moves, seasonPlayers, users, type SeasonPlayer } from "@/db/schema";
import type { IeePlayerSnapshot, PoolCounters } from "@/lib/engine";

import type { SeasonRegistry } from "../registry";
import { listActiveInstances, poolCounters } from "./instances";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A participant row, read through the caller's transaction when it has one. */
export async function getSeasonPlayerRow(id: string, tx: Db = db): Promise<SeasonPlayer | null> {
  const rows = await tx.select().from(seasonPlayers).where(eq(seasonPlayers.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Whether a participant has a game in flight — rolled and not yet resolved.
 * The same rule as the game loop's `getOpenRollRow`, kept here so the IEE
 * slice does not reach into the game slice for it.
 */
export async function hasOpenRoll(seasonPlayerId: string, tx: Db = db): Promise<boolean> {
  const rows = await tx
    .select({ id: gameRolls.id })
    .from(gameRolls)
    .where(
      and(
        eq(gameRolls.seasonPlayerId, seasonPlayerId),
        or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")),
        isNull(gameRolls.resolvedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

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

/** Active rivals strictly behind a cell — whom «Погоня» and «Рокировка» would move. */
export async function countPlayersBehind(seasonId: string, seasonPlayerId: string, position: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasonPlayers)
    .where(
      and(
        eq(seasonPlayers.seasonId, seasonId),
        eq(seasonPlayers.status, "active"),
        sql`${seasonPlayers.id} <> ${seasonPlayerId}`,
        sql`${seasonPlayers.position} < ${position}`,
      ),
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

/**
 * The dice sum of a participant's last regular move — what «Магнит» compares
 * against (wave A). Out-of-turn moves write no `moves` row, so they never
 * count. Null before their first move.
 */
export async function getLastRoll(seasonPlayerId: string): Promise<number | null> {
  const rows = await db
    .select({ dice: moves.diceResults })
    .from(moves)
    .where(eq(moves.seasonPlayerId, seasonPlayerId))
    .orderBy(desc(moves.createdAt))
    .limit(1);
  const dice = rows[0]?.dice;
  return dice ? dice.reduce((a, b) => a + b, 0) : null;
}

export async function toPlayerSnapshot(
  sp: SeasonPlayer,
): Promise<IeePlayerSnapshot> {
  const [rank, moveCount, behind, lastRoll] = await Promise.all([
    getPlayerRank(sp.seasonId, sp.position),
    getMoveCount(sp.id),
    countPlayersBehind(sp.seasonId, sp.id, sp.position),
    getLastRoll(sp.id),
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
    behind,
    lastRoll,
    status: sp.status,
  };
}

/**
 * Where the given participants stand now — the players effects remember
 * their items were aimed at (spec §6.11). One gone from the season is left
 * out, and what reads them does not hold.
 */
export async function snapshotsOf(ids: readonly string[]): Promise<Map<string, IeePlayerSnapshot>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(seasonPlayers).where(inArray(seasonPlayers.id, unique));
  const snapshots = await Promise.all(rows.map((row) => toPlayerSnapshot(row)));
  return new Map(snapshots.map((s) => [s.seasonPlayerId, s]));
}

/**
 * Everything `pickWheelOutcome` needs that lives in the database, in one
 * round of queries. Items and effects share one pool, so their counters are
 * keyed by entry key — keys are unique across the season's catalog.
 *
 * The inventory cap counts **bonus** items only (spec §4.5): a cursed item a
 * rival planted must not block the player's own drops.
 */
export async function loadPoolContext(
  sp: SeasonPlayer,
  registry: SeasonRegistry,
  /** The cell the move lands on — who is behind is counted from there. */
  landedAt: number = sp.position,
): Promise<{
  counters: PoolCounters;
  player: IeePlayerSnapshot;
  activeEffectKeys: string[];
  /** Active instances per tag — the season's `tagLimits` count them. */
  activeTagCounts: Record<string, number>;
  heldItemCount: number;
  seasonRollSeq: number;
  playerCount: number;
  playersBehind: number;
  /** Keys of the items held — a unique one is not offered twice (spec §6.10). */
  heldItemKeys: string[];
}> {
  const [counters, active, seasonRollSeq, playerCount, player, playersBehind] = await Promise.all([
    poolCounters(sp.seasonId, sp.id, registry),
    listActiveInstances(sp.id),
    getSeasonRollSeq(sp.seasonId),
    countActivePlayers(sp.seasonId),
    toPlayerSnapshot(sp),
    countPlayersBehind(sp.seasonId, sp.id, landedAt),
  ]);

  const activeEffectKeys: string[] = [];
  const heldItemKeys: string[] = [];
  const activeTagCounts: Record<string, number> = {};
  let heldItemCount = 0;
  for (const row of active) {
    const entry = registry.get(row.revisionId);
    if (!entry) continue;
    for (const tag of entry.tags) activeTagCounts[tag] = (activeTagCounts[tag] ?? 0) + 1;
    if (row.kind === "effect") activeEffectKeys.push(entry.key);
    else if (row.kind === "item") {
      heldItemKeys.push(entry.key);
      // The inventory cap counts bonus items only: a cursed item takes no slot.
      if (entry.character === "bonus") heldItemCount += 1;
    }
  }

  return { counters, player, activeEffectKeys, activeTagCounts, heldItemCount, seasonRollSeq, playerCount, playersBehind, heldItemKeys };
}

/** Someone an item may be aimed at, as the target picker needs them. */
export type TargetOption = {
  seasonPlayerId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  position: number;
  /** Moves made so far — the raw number behind `targetable`. */
  moveCount: number;
  status: string;
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
      status: seasonPlayers.status,
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
      moveCount: r.moves,
      status: r.status,
      targetable: r.moves >= pvpProtectionMoves,
    }));
}
