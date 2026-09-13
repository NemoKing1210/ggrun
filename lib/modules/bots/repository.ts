import { and, desc, eq, ilike, inArray } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { seasonPlayers, users } from "@/db/schema";

import { botLogs, botRuns, type BotLog, type BotLogLevel, type BotRun } from "@/db/schema/bots";

/** Username prefix binding synthetic users to one run: bot_<8 of runId>_<i>. */
export function botUsernamePrefix(runId: string): string {
  return `bot_${runId.slice(0, 8)}_`;
}

export function botUsername(runId: string, index: number): string {
  return `${botUsernamePrefix(runId)}${index}`;
}

export async function getBotRun(runId: string): Promise<BotRun | null> {
  const rows = await db.select().from(botRuns).where(eq(botRuns.id, runId)).limit(1);
  return rows[0] ?? null;
}

export async function listBotRuns(seasonId: string): Promise<BotRun[]> {
  return db.select().from(botRuns).where(eq(botRuns.seasonId, seasonId)).orderBy(desc(botRuns.createdAt));
}

/** Every run in `running` status across seasons — the autonomous ticker's input. */
export async function listRunningBotRuns(): Promise<BotRun[]> {
  return db.select().from(botRuns).where(eq(botRuns.status, "running")).orderBy(botRuns.updatedAt);
}

export async function createBotRunRow(params: {
  seasonId: string;
  config: BotRun["config"];
  createdById: string | null;
}): Promise<BotRun> {
  const rows = await db
    .insert(botRuns)
    .values({
      seasonId: params.seasonId,
      status: "paused",
      config: params.config,
      createdById: params.createdById,
    })
    .returning();
  const run = rows[0];
  if (!run) throw new Error("bot run insert returned nothing");
  return run;
}

export async function updateBotRun(
  runId: string,
  patch: Partial<Pick<BotRun, "status" | "totalTicks" | "totalActions" | "totalErrors" | "lastError" | "config">>,
): Promise<void> {
  await db
    .update(botRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(botRuns.id, runId));
}

export async function deleteBotRun(runId: string): Promise<void> {
  await db.delete(botRuns).where(eq(botRuns.id, runId));
}

export async function insertBotLog(entry: {
  runId: string;
  level: BotLogLevel;
  action: string;
  seasonPlayerId?: string | null;
  botUsername?: string | null;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(botLogs).values({
    runId: entry.runId,
    level: entry.level,
    action: entry.action,
    seasonPlayerId: entry.seasonPlayerId ?? null,
    botUsername: entry.botUsername ?? null,
    message: entry.message,
    payload: entry.payload ?? {},
  });
}

export async function listBotLogs(runId: string, limit = 200): Promise<BotLog[]> {
  return db
    .select()
    .from(botLogs)
    .where(eq(botLogs.runId, runId))
    .orderBy(desc(botLogs.createdAt))
    .limit(limit);
}

/** Latest trace across all runs of a season (console log viewer). */
export async function listSeasonBotLogs(seasonId: string, limit = 300): Promise<BotLog[]> {
  const runs = await listBotRuns(seasonId);
  if (runs.length === 0) return [];
  const rows = await db
    .select()
    .from(botLogs)
    .where(
      inArray(
        botLogs.runId,
        runs.map((r) => r.id),
      ),
    )
    .orderBy(desc(botLogs.createdAt))
    .limit(limit);
  return rows;
}

export interface BotOwnedPlayer {
  userId: string;
  username: string;
  seasonPlayerId: string | null;
}

/** Synthetic users of a run plus their season membership (if joined). */
export async function listBotOwnedPlayers(runId: string, seasonId: string): Promise<BotOwnedPlayer[]> {
  const prefix = botUsernamePrefix(runId);
  const botUsers = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(ilike(users.username, `${prefix}%`));
  if (botUsers.length === 0) return [];
  const memberships = await db
    .select({ playerId: seasonPlayers.playerId, id: seasonPlayers.id })
    .from(seasonPlayers)
    .where(
      and(
        eq(seasonPlayers.seasonId, seasonId),
        inArray(
          seasonPlayers.playerId,
          botUsers.map((u) => u.id),
        ),
      ),
    );
  const byPlayerId = new Map(memberships.map((m) => [m.playerId, m.id]));
  return botUsers.map((u) => ({
    userId: u.id,
    username: u.username,
    seasonPlayerId: byPlayerId.get(u.id) ?? null,
  }));
}

export interface BotRosterRow {
  username: string;
  seasonPlayerId: string | null;
  status: string | null;
  position: number | null;
  balancePoints: number | null;
}

/** Roster for the console: every synthetic user with live player state. */
export async function listBotRunRoster(runId: string, seasonId: string): Promise<BotRosterRow[]> {
  const owned = await listBotOwnedPlayers(runId, seasonId);
  return Promise.all(
    owned.map(async (o) => {
      if (!o.seasonPlayerId) {
        return { username: o.username, seasonPlayerId: null, status: null, position: null, balancePoints: null };
      }
      const rows = await db
        .select({
          status: seasonPlayers.status,
          position: seasonPlayers.position,
          balancePoints: seasonPlayers.balancePoints,
        })
        .from(seasonPlayers)
        .where(eq(seasonPlayers.id, o.seasonPlayerId))
        .limit(1);
      const sp = rows[0];
      if (!sp) {
        return { username: o.username, seasonPlayerId: o.seasonPlayerId, status: null, position: null, balancePoints: null };
      }
      return { username: o.username, seasonPlayerId: o.seasonPlayerId, ...sp };
    }),
  );
}

/** Delete every synthetic user of a run — season membership, rolls, moves and
 *  ledger entries cascade by design; the bot_logs trace survives (plain data). */
export async function deleteBotUsers(runId: string): Promise<number> {
  const prefix = botUsernamePrefix(runId);
  const botUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.username, `${prefix}%`));
  if (botUsers.length === 0) return 0;
  await db.delete(users).where(
    inArray(
      users.id,
      botUsers.map((u) => u.id),
    ),
  );
  return botUsers.length;
}
