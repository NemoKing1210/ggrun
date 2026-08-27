import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  eventLog,
  gameRolls,
  gamesCatalog,
  ledgerEntries,
  moves,
  seasonPlayers,
  users,
  type GameRoll,
  type SeasonPlayer,
} from "@/db/schema";

export type LeaderboardRow = SeasonPlayer & {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  links: unknown;
};

const leaderboardSelection = {
  player: seasonPlayers,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  bannerUrl: users.bannerUrl,
  bio: users.bio,
  links: users.links,
} as const;

function flattenLeaderboardRows(
  rows: Array<{
    player: SeasonPlayer;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bannerUrl: string | null;
    bio: string | null;
    links: unknown;
  }>,
): LeaderboardRow[] {
  return rows.map((r) => ({
    ...r.player,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    bannerUrl: r.bannerUrl,
    bio: r.bio,
    links: r.links,
  }));
}

export async function getLeaderboard(seasonId: string): Promise<LeaderboardRow[]> {
  const rows = await db
    .select(leaderboardSelection)
    .from(seasonPlayers)
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .where(eq(seasonPlayers.seasonId, seasonId))
    // Finished players first, then by position descending, then by balance
    .orderBy(
      asc(seasonPlayers.status),
      desc(seasonPlayers.position),
      desc(seasonPlayers.balancePoints),
    );
  return flattenLeaderboardRows(rows);
}

export async function getSeasonPlayerForUser(
  seasonId: string,
  userId: string,
): Promise<SeasonPlayer | null> {
  const rows = await db
    .select()
    .from(seasonPlayers)
    .where(
      and(eq(seasonPlayers.seasonId, seasonId), eq(seasonPlayers.playerId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getSeasonPlayerById(
  id: string,
): Promise<SeasonPlayer | null> {
  const rows = await db
    .select()
    .from(seasonPlayers)
    .where(eq(seasonPlayers.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function addPlayerToSeason(
  seasonId: string,
  playerId: string,
): Promise<void> {
  await db.insert(seasonPlayers).values({ seasonId, playerId });
}

export async function removePlayerFromSeason(
  seasonId: string,
  playerId: string,
): Promise<void> {
  await db
    .delete(seasonPlayers)
    .where(
      and(eq(seasonPlayers.seasonId, seasonId), eq(seasonPlayers.playerId, playerId)),
    );
}

export async function updateSeasonPlayer(
  id: string,
  patch: Partial<
    Pick<
      SeasonPlayer,
      "position" | "balancePoints" | "status" | "streakPass" | "streakDrop" | "rerollsUsed"
    >
  >,
): Promise<void> {
  await db.update(seasonPlayers).set(patch).where(eq(seasonPlayers.id, id));
}

// --- Player history -------------------------------------------------------

export type PlayerMoveRow = typeof moves.$inferSelect;

export async function getPlayerMoves(
  seasonPlayerId: string,
  limit = 50,
): Promise<PlayerMoveRow[]> {
  return db
    .select()
    .from(moves)
    .where(eq(moves.seasonPlayerId, seasonPlayerId))
    .orderBy(desc(moves.createdAt))
    .limit(limit);
}

export async function getPlayerLedger(
  seasonPlayerId: string,
  limit = 50,
): Promise<Array<typeof ledgerEntries.$inferSelect>> {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.seasonPlayerId, seasonPlayerId))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(limit);
}

// --- Event feed -----------------------------------------------------------

export type FeedRow = typeof eventLog.$inferSelect & {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export async function getEventFeed(
  seasonId: string,
  limit = 30,
): Promise<FeedRow[]> {
  const rows = await db
    .select({
      entry: eventLog,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(eventLog)
    .leftJoin(seasonPlayers, eq(seasonPlayers.id, eventLog.seasonPlayerId))
    .leftJoin(users, eq(users.id, seasonPlayers.playerId))
    .where(eq(eventLog.seasonId, seasonId))
    .orderBy(desc(eventLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.entry,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
  }));
}


// --- Board page live data --------------------------------------------------

export type ActiveRollRow = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  gameTitle: string | null;
  platform: string | null;
  rolledAt: Date;
};

/** Rolls that are currently being played (rolled / in_progress). */
export async function getActiveRolls(seasonId: string): Promise<ActiveRollRow[]> {
  return db
    .select({
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      gameTitle: gamesCatalog.title,
      platform: gamesCatalog.platform,
      rolledAt: gameRolls.rolledAt,
    })
    .from(gameRolls)
    .innerJoin(seasonPlayers, eq(gameRolls.seasonPlayerId, seasonPlayers.id))
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(
      and(
        eq(seasonPlayers.seasonId, seasonId),
        inArray(gameRolls.status, ["rolled", "in_progress"]),
      ),
    )
    .orderBy(asc(gameRolls.rolledAt));
}

export type SeasonStats = {
  totalMoves: number;
  passedRolls: number;
  droppedRolls: number;
  rerolls: number;
};

/** Aggregate activity counters for the board page stats bar. */
export async function getSeasonStats(seasonId: string): Promise<SeasonStats> {
  const [moveRow] = await db
    .select({ n: count() })
    .from(moves)
    .innerJoin(seasonPlayers, eq(moves.seasonPlayerId, seasonPlayers.id))
    .where(eq(seasonPlayers.seasonId, seasonId));

  const rollRows = await db
    .select({ status: gameRolls.status, n: count() })
    .from(gameRolls)
    .innerJoin(seasonPlayers, eq(gameRolls.seasonPlayerId, seasonPlayers.id))
    .where(eq(seasonPlayers.seasonId, seasonId))
    .groupBy(gameRolls.status);

  const rollCount = (status: GameRoll["status"]) =>
    rollRows.find((r) => r.status === status)?.n ?? 0;
  return {
    totalMoves: Number(moveRow?.n ?? 0),
    passedRolls: rollCount("passed"),
    droppedRolls: rollCount("dropped"),
    rerolls: rollCount("rerolled"),
  };
}