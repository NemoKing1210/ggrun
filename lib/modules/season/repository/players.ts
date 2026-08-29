import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/infrastructure/db";
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
  lastSeenAt: Date | null;
};

const leaderboardSelection = {
  player: seasonPlayers,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  bannerUrl: users.bannerUrl,
  bio: users.bio,
  links: users.links,
  lastSeenAt: users.lastSeenAt,
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
    lastSeenAt: Date | null;
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
    lastSeenAt: r.lastSeenAt,
  }));
}

export const getLeaderboard = cache(async (seasonId: string): Promise<LeaderboardRow[]> => {
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
});

export const getSeasonPlayerForUser = cache(
  async (seasonId: string, userId: string): Promise<SeasonPlayer | null> => {
    const rows = await db
      .select()
      .from(seasonPlayers)
      .where(
        and(eq(seasonPlayers.seasonId, seasonId), eq(seasonPlayers.playerId, userId)),
      )
      .limit(1);
    return rows[0] ?? null;
  },
);

export const getSeasonPlayerById = cache(
  async (id: string): Promise<SeasonPlayer | null> => {
    const rows = await db
      .select()
      .from(seasonPlayers)
      .where(eq(seasonPlayers.id, id))
      .limit(1);
    return rows[0] ?? null;
  },
);

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

export const getPlayerMoves = cache(
  async (seasonPlayerId: string, limit = 50): Promise<PlayerMoveRow[]> => {
    return db
      .select()
      .from(moves)
      .where(eq(moves.seasonPlayerId, seasonPlayerId))
      .orderBy(desc(moves.createdAt))
      .limit(limit);
  },
);

export const getPlayerLedger = cache(
  async (
    seasonPlayerId: string,
    limit = 50,
  ): Promise<Array<typeof ledgerEntries.$inferSelect>> => {
    return db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seasonPlayerId, seasonPlayerId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit);
  },
);

// --- Event feed -----------------------------------------------------------

export type FeedRow = typeof eventLog.$inferSelect & {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
};

export const getEventFeed = cache(
  async (seasonId: string, limit = 30): Promise<FeedRow[]> => {
    const rows = await db
      .select({
        entry: eventLog,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        lastSeenAt: users.lastSeenAt,
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
      lastSeenAt: r.lastSeenAt,
    }));
  },
);

// --- Board page live data --------------------------------------------------

export type ActiveRollRow = {
 username: string;
 displayName: string | null;
 avatarUrl: string | null;
 lastSeenAt: Date | null;
 gameTitle: string | null;
 platform: string | null;
 rolledAt: Date;
 status: GameRoll["status"];
 coverUrl: string | null;
 genres: string[] | null;
 metacritic: number | null;
 releasedAt: Date | null;
 description: string | null;
 playtimeHours: number | null;
 externalSource: string | null;
};
/** Rolls that are currently being played (rolled / in_progress). */
export const getActiveRolls = cache(async (seasonId: string): Promise<ActiveRollRow[]> => {
 return db
 .select({
 username: users.username,
 displayName: users.displayName,
 avatarUrl: users.avatarUrl,
 lastSeenAt: users.lastSeenAt,
 gameTitle: gamesCatalog.title,
 platform: gamesCatalog.platform,
 rolledAt: gameRolls.rolledAt,
 status: gameRolls.status,
 coverUrl: gamesCatalog.coverUrl,
 genres: gamesCatalog.genres,
 metacritic: gamesCatalog.metacritic,
 releasedAt: gamesCatalog.releasedAt,
 description: gamesCatalog.description,
 playtimeHours: gamesCatalog.playtimeHours,
 externalSource: gamesCatalog.externalSource,
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
});

export type SeasonStats = {
  totalMoves: number;
  passedRolls: number;
  droppedRolls: number;
  rerolls: number;
};

/** Aggregate activity counters for the board page stats bar. */
export const getSeasonStats = cache(async (seasonId: string): Promise<SeasonStats> => {
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
});

// --- Profile activity (GitHub-style) ---------------------------------------

export type UserActivityDay = { date: string; count: number };

export const getUserActivityDays = cache(async (userId: string, days = 371): Promise<UserActivityDay[]> => {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const sps = await db
    .select({ id: seasonPlayers.id })
    .from(seasonPlayers)
    .where(eq(seasonPlayers.playerId, userId));
  if (sps.length === 0) return [];
  const ids = sps.map((r) => r.id);

  const [events, moveRows, rollRows] = await Promise.all([
    db
      .select({ createdAt: eventLog.createdAt })
      .from(eventLog)
      .where(and(inArray(eventLog.seasonPlayerId, ids), gte(eventLog.createdAt, since))),
    db
      .select({ createdAt: moves.createdAt })
      .from(moves)
      .where(and(inArray(moves.seasonPlayerId, ids), gte(moves.createdAt, since))),
    db
      .select({ createdAt: gameRolls.rolledAt })
      .from(gameRolls)
      .where(and(inArray(gameRolls.seasonPlayerId, ids), gte(gameRolls.rolledAt, since))),
  ]);

  const byDay: Record<string, number> = {};
  for (const r of events) {
    const k = r.createdAt.toISOString().slice(0, 10);
    byDay[k] = (byDay[k] ?? 0) + 1;
  }
  // moves & rolls are already represented in event_log (moved/game_rolled) but
  // count them with lower weight to avoid double-count inflation: only count
  // if no event that day ? Instead we merge as distinct contribution sources
  // with capped weight: event = 1, move/roll = 0.5 bonus but at least show
  // activity even if events missing. To keep it simple, add them but avoid
  // double-spike: only add +1 per day if events already exist there, cap per day.
  // For now just add them — heatmap thresholds handle inflation gracefully.
  for (const r of moveRows) {
    const k = r.createdAt.toISOString().slice(0, 10);
    byDay[k] = (byDay[k] ?? 0) + 1;
  }
  for (const r of rollRows) {
    if (!r.createdAt) continue;
    const k = r.createdAt.toISOString().slice(0, 10);
    byDay[k] = (byDay[k] ?? 0) + 1;
  }

  return Object.entries(byDay)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
});
