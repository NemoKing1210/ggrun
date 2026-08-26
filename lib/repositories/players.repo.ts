import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  eventLog,
  ledgerEntries,
  moves,
  seasonPlayers,
  users,
  type SeasonPlayer,
} from "@/db/schema";

export type LeaderboardRow = SeasonPlayer & {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

const leaderboardSelection = {
  player: seasonPlayers,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
} as const;

function flattenLeaderboardRows(
  rows: Array<{
    player: SeasonPlayer;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  }>,
): LeaderboardRow[] {
  return rows.map((r) => ({
    ...r.player,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
  }));
}

export async function getLeaderboard(seasonId: string): Promise<LeaderboardRow[]> {
  const rows = await db
    .select(leaderboardSelection)
    .from(seasonPlayers)
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .where(eq(seasonPlayers.seasonId, seasonId))
    // Финишировавшие сверху, далее по позиции убыв., затем по балансу
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

// --- История игрока -------------------------------------------------------

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

// --- Лента событий --------------------------------------------------------

export type FeedRow = typeof eventLog.$inferSelect & {
  username: string | null;
  displayName: string | null;
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
  }));
}
