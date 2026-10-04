import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { seasonPlayers, seasons, users } from "@/db/schema";
import { activeEffects, type BotOtherPlayer } from "@/lib/engine";
import {
  getActiveEffectRows,
  getActiveEffectsBySeason,
  getHeldItems,
  listTargetOptions,
  toActiveEffectLike,
} from "@/lib/modules/iee/repository";
import { publish } from "@/lib/realtime/bus";
import {
  botsRoom,
  type BotActivityBroadcast,
  type BotLogBroadcast,
  type BotRunBroadcast,
} from "@/lib/realtime/protocol";

import {
  botLogs,
  botRuns,
  normalizeBotConfig,
  type BotLog,
  type BotLogLevel,
  type BotRun,
} from "@/db/schema/bots";

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

export interface BotRunListRow {
  run: BotRun;
  seasonTitle: string;
  seasonSlug: string;
}

/** Every run with its season, newest first — console listing + completions. */
export async function listAllBotRuns(limit = 50): Promise<BotRunListRow[]> {
  return db
    .select({ run: botRuns, seasonTitle: seasons.title, seasonSlug: seasons.slug })
    .from(botRuns)
    .innerJoin(seasons, eq(botRuns.seasonId, seasons.id))
    .orderBy(desc(botRuns.createdAt))
    .limit(limit);
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
  /** Needed to address the live console room (`bots:<seasonId>`). */
  seasonId: string;
  level: BotLogLevel;
  action: string;
  seasonPlayerId?: string | null;
  botUsername?: string | null;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const [row] = await db
    .insert(botLogs)
    .values({
      runId: entry.runId,
      level: entry.level,
      action: entry.action,
      seasonPlayerId: entry.seasonPlayerId ?? null,
      botUsername: entry.botUsername ?? null,
      message: entry.message,
      payload: entry.payload ?? {},
    })
    .returning();
  // Every journal line reaches the open console as it is written — the log tab
  // is live, not polled. `publish` never throws; a realtime failure must not
  // break the write it announces.
  if (row) {
    const payload: BotLogBroadcast = {
      id: row.id,
      runId: row.runId,
      level: row.level,
      action: row.action,
      botUsername: row.botUsername,
      message: row.message,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    };
    publish(botsRoom(entry.seasonId), "bots:log", payload);
  }
}

/** Serializes and publishes a run's live state into its season's console room. */
export function publishBotRun(run: BotRun): void {
  const payload: BotRunBroadcast = {
    runId: run.id,
    seasonId: run.seasonId,
    status: run.status,
    // Normalized, never raw: the console reads the item-policy fields straight
    // off this object, and a run saved before they existed would publish a
    // config with holes the client would have to know about.
    config: { ...(normalizeBotConfig(run.config) as unknown as Record<string, unknown>) },
    totalTicks: run.totalTicks,
    totalActions: run.totalActions,
    totalErrors: run.totalErrors,
    lastError: run.lastError,
    updatedAt: run.updatedAt.toISOString(),
  };
  publish(botsRoom(run.seasonId), "bots:run", payload);
}

/** Publishes one synthetic player's step as it happens (structured, not rendered). */
export function publishBotActivity(activity: Omit<BotActivityBroadcast, "seq">): void {
  publish(botsRoom(activity.seasonId), "bots:activity", activity);
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

export interface BotRosterItem {
  inventoryId: string;
  itemKey: string;
  chargesLeft: number;
}

export interface BotRosterEffect {
  effectId: string;
  effectKey: string;
  polarity: string;
}

export interface BotRosterCounts {
  roll: number;
  resolve: number;
  item: number;
  errors: number;
}

export interface BotRosterLastAction {
  action: string;
  level: string;
  message: string;
  createdAt: string;
}

export interface BotRosterRow {
  username: string;
  seasonPlayerId: string | null;
  status: string | null;
  position: number | null;
  balancePoints: number | null;
  /** Items the bot can still spend (held + charges). */
  items: BotRosterItem[];
  /** Statuses actually in force right now (lazy expiry applied). */
  effects: BotRosterEffect[];
  /** Lifetime step counters, folded from the run's journal. */
  counts: BotRosterCounts;
  lastAction: BotRosterLastAction | null;
}

const EMPTY_COUNTS = (): BotRosterCounts => ({ roll: 0, resolve: 0, item: 0, errors: 0 });

/**
 * Lifetime step counters per bot, aggregated in SQL.
 *
 * Folding the newest N journal rows was the obvious shortcut and the wrong
 * one: a long run's tail is entirely one repeating line (or its latest
 * checkpoint), so the counters silently read zero for exactly the runs worth
 * looking at. The group-by sees every row.
 */
async function countBotActionsByBot(runId: string): Promise<Map<string, BotRosterCounts>> {
  const rows = await db
    .select({
      username: botLogs.botUsername,
      action: botLogs.action,
      level: botLogs.level,
      n: sql<number>`count(*)::int`,
    })
    .from(botLogs)
    .where(eq(botLogs.runId, runId))
    .groupBy(botLogs.botUsername, botLogs.action, botLogs.level);

  const out = new Map<string, BotRosterCounts>();
  for (const row of rows) {
    if (!row.username) continue;
    const counts = out.get(row.username) ?? EMPTY_COUNTS();
    if (row.level === "error") counts.errors += row.n;
    if (row.action === "roll") counts.roll += row.n;
    else if (row.action === "resolve") counts.resolve += row.n;
    else if (row.action === "item") counts.item += row.n;
    out.set(row.username, counts);
  }
  return out;
}

/** The bot's newest journal line, for the "last action" readout. */
async function lastLogForBot(runId: string, username: string): Promise<BotRosterLastAction | null> {
  const rows = await db
    .select({
      action: botLogs.action,
      level: botLogs.level,
      message: botLogs.message,
      createdAt: botLogs.createdAt,
    })
    .from(botLogs)
    .where(and(eq(botLogs.runId, runId), eq(botLogs.botUsername, username)))
    .orderBy(desc(botLogs.createdAt))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
}

/**
 * Roster for the console: every synthetic user with live player state, its
 * spendable items, the statuses actually in force, lifetime step counters and
 * its last journal line.
 */
export async function listBotRunRoster(runId: string, seasonId: string): Promise<BotRosterRow[]> {
  const owned = await listBotOwnedPlayers(runId, seasonId);
  const countsByBot = await countBotActionsByBot(runId);

  return Promise.all(
    owned.map(async (o): Promise<BotRosterRow> => {
      const counts = countsByBot.get(o.username) ?? EMPTY_COUNTS();
      const lastAction = await lastLogForBot(runId, o.username);
      if (!o.seasonPlayerId) {
        return {
          username: o.username,
          seasonPlayerId: null,
          status: null,
          position: null,
          balancePoints: null,
          items: [],
          effects: [],
          counts,
          lastAction,
        };
      }
      const rows = await db
        .select({
          status: seasonPlayers.status,
          position: seasonPlayers.position,
          balancePoints: seasonPlayers.balancePoints,
          rollSeq: seasonPlayers.rollSeq,
        })
        .from(seasonPlayers)
        .where(eq(seasonPlayers.id, o.seasonPlayerId))
        .limit(1);
      const sp = rows[0];
      const [held, effectRows] = await Promise.all([
        getHeldItems(o.seasonPlayerId),
        getActiveEffectRows(o.seasonPlayerId),
      ]);
      // Same lazy-expiry rule the game loop uses: a status means nothing until
      // the roll it is measured against says so.
      const inForce = activeEffects(effectRows.map(toActiveEffectLike), (sp?.rollSeq ?? 0) + 1);
      const polarityById = new Map(effectRows.map((e) => [e.id, e.polarity]));
      return {
        username: o.username,
        seasonPlayerId: o.seasonPlayerId,
        status: sp?.status ?? null,
        position: sp?.position ?? null,
        balancePoints: sp?.balancePoints ?? null,
        items: held.map((row) => ({
          inventoryId: row.id,
          itemKey: row.itemKey,
          chargesLeft: row.chargesLeft,
        })),
        effects: inForce.map((row) => ({
          effectId: row.id,
          effectKey: row.effectKey,
          polarity: polarityById.get(row.id) ?? "negative",
        })),
        counts,
        lastAction,
      };
    }),
  );
}

/**
 * Candidates an item may be aimed at, with their in-force statuses — the
 * planner's `BotOtherPlayer[]`. Reuses the season-wide status map so this is
 * one extra query, not one per candidate.
 */
export async function listBotItemTargets(
  seasonId: string,
  excludeSeasonPlayerId: string,
  pvpProtectionMoves: number,
): Promise<BotOtherPlayer[]> {
  const [options, effects] = await Promise.all([
    listTargetOptions(seasonId, excludeSeasonPlayerId, pvpProtectionMoves),
    getActiveEffectsBySeason(seasonId),
  ]);
  return options.map((o) => ({
    seasonPlayerId: o.seasonPlayerId,
    username: o.username,
    position: o.position,
    moveCount: o.moveCount,
    status: o.status,
    effects: (effects.get(o.seasonPlayerId) ?? []).map((b) => b.effectKey),
  }));
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
