import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import {
  completionRequests,
  gameRolls,
  gamesCatalog,
  rerollRequests,
  seasonPlayers,
  seasons,
  users,
  type CompletionRequest,
  type RerollRequest,
} from "@/db/schema";

export async function createRerollRequest(seasonPlayerId: string, gameRollId: string, reason: string): Promise<RerollRequest> {
  const [created] = await db.insert(rerollRequests).values({ seasonPlayerId, gameRollId, reason, status: "pending" }).returning();
  return created!;
}

export async function getPendingRerollForRoll(gameRollId: string): Promise<RerollRequest | null> {
  const rows = await db
    .select()
    .from(rerollRequests)
    .where(and(eq(rerollRequests.gameRollId, gameRollId), eq(rerollRequests.status, "pending")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPendingRerollForPlayer(seasonPlayerId: string): Promise<RerollRequest | null> {
  const rows = await db
    .select()
    .from(rerollRequests)
    .where(and(eq(rerollRequests.seasonPlayerId, seasonPlayerId), eq(rerollRequests.status, "pending")))
    .orderBy(desc(rerollRequests.requestedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRerollRequestById(id: string): Promise<RerollRequest | null> {
  const rows = await db.select().from(rerollRequests).where(eq(rerollRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

export type PendingRerollRow = RerollRequest & {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
  gameTitle: string | null;
  seasonTitle: string | null;
};

/** All reroll requests of one user (any status), newest first, for the admin user page. */
export type UserRerollRequestRow = RerollRequest & {
  seasonId: string;
  gameTitle: string | null;
  seasonTitle: string | null;
};

export async function listUserRerollRequests(userId: string, limit = 30): Promise<UserRerollRequestRow[]> {
  const rows = await db
    .select({
      request: rerollRequests,
      seasonId: seasonPlayers.seasonId,
      gameTitle: gamesCatalog.title,
      seasonTitle: seasons.title,
    })
    .from(rerollRequests)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, rerollRequests.seasonPlayerId))
    .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
    .leftJoin(gameRolls, eq(gameRolls.id, rerollRequests.gameRollId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(seasonPlayers.playerId, userId))
    .orderBy(desc(rerollRequests.requestedAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.request,
    seasonId: r.seasonId,
    gameTitle: r.gameTitle ?? null,
    seasonTitle: r.seasonTitle ?? null,
  }));
}
export async function createCompletionRequest(
  seasonPlayerId: string,
  gameRollId: string,
  outcome: "passed" | "dropped",
  reason: string | null,
  rating: number | null,
): Promise<CompletionRequest> {
  const [created] = await db
    .insert(completionRequests)
    .values({ seasonPlayerId, gameRollId, outcome, reason, rating, status: "pending" })
    .returning();
  return created!;
}

export async function getPendingCompletionForRoll(gameRollId: string): Promise<CompletionRequest | null> {
  const rows = await db
    .select()
    .from(completionRequests)
    .where(and(eq(completionRequests.gameRollId, gameRollId), eq(completionRequests.status, "pending")))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPendingCompletionForPlayer(seasonPlayerId: string): Promise<CompletionRequest | null> {
  const rows = await db
    .select()
    .from(completionRequests)
    .where(and(eq(completionRequests.seasonPlayerId, seasonPlayerId), eq(completionRequests.status, "pending")))
    .orderBy(desc(completionRequests.requestedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCompletionRequestById(id: string): Promise<CompletionRequest | null> {
  const rows = await db.select().from(completionRequests).where(eq(completionRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

export type PendingCompletionRow = CompletionRequest & {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
  gameTitle: string | null;
  seasonTitle: string | null;
};

/** All completion requests of one user (any status), newest first, for the admin user page. */
export type UserCompletionRequestRow = CompletionRequest & {
  seasonId: string;
  gameTitle: string | null;
  seasonTitle: string | null;
};

export async function listUserCompletionRequests(userId: string, limit = 30): Promise<UserCompletionRequestRow[]> {
  const rows = await db
    .select({
      request: completionRequests,
      seasonId: seasonPlayers.seasonId,
      gameTitle: gamesCatalog.title,
      seasonTitle: seasons.title,
    })
    .from(completionRequests)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, completionRequests.seasonPlayerId))
    .innerJoin(seasons, eq(seasons.id, seasonPlayers.seasonId))
    .leftJoin(gameRolls, eq(gameRolls.id, completionRequests.gameRollId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(seasonPlayers.playerId, userId))
    .orderBy(desc(completionRequests.requestedAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.request,
    seasonId: r.seasonId,
    gameTitle: r.gameTitle ?? null,
    seasonTitle: r.seasonTitle ?? null,
  }));
}
export async function listPendingCompletionRequests(): Promise<PendingCompletionRow[]> {
  const rows = await db
    .select({
      request: completionRequests,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      lastSeenAt: users.lastSeenAt,
      gameTitle: gamesCatalog.title,
      seasonTitle: sql<string | null>`(select title from seasons where id = ${seasonPlayers.seasonId})`,
    })
    .from(completionRequests)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, completionRequests.seasonPlayerId))
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .leftJoin(gameRolls, eq(gameRolls.id, completionRequests.gameRollId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(completionRequests.status, "pending"))
    .orderBy(desc(completionRequests.requestedAt));
  return rows.map((r) => ({
    ...r.request,
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    lastSeenAt: r.lastSeenAt,
    gameTitle: r.gameTitle ?? null,
    seasonTitle: r.seasonTitle ?? null,
  }));
}

export async function listPendingRerollRequests(): Promise<PendingRerollRow[]> {
  const rows = await db
    .select({
      request: rerollRequests,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      lastSeenAt: users.lastSeenAt,
      gameTitle: gamesCatalog.title,
      seasonTitle: sql<string | null>`(select title from seasons where id = ${seasonPlayers.seasonId})`,
    })
    .from(rerollRequests)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, rerollRequests.seasonPlayerId))
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .leftJoin(gameRolls, eq(gameRolls.id, rerollRequests.gameRollId))
    .leftJoin(gamesCatalog, eq(gamesCatalog.id, gameRolls.gameId))
    .where(eq(rerollRequests.status, "pending"))
    .orderBy(desc(rerollRequests.requestedAt));
  return rows.map((r) => ({
    ...r.request,
    userId: r.userId,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    lastSeenAt: r.lastSeenAt,
    gameTitle: r.gameTitle ?? null,
    seasonTitle: r.seasonTitle ?? null,
  }));
}
