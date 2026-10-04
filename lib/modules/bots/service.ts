import { isAppError } from "@/lib/errors/app-error";

import { db, pool } from "@/lib/infrastructure/db";
import { seasonPlayers, users } from "@/db/schema";
import { DEFAULT_BOT_RUN_CONFIG, type BotRun, type BotRunConfig } from "@/db/schema/bots";
import {
  nextBotStepKind,
  pickBotComment,
  pickBotOutcome,
  pickBotRating,
  pickBotReason,
} from "@/lib/engine/bots";
import { getOpenRollRow } from "@/lib/modules/game/service/helpers";
import { resolveGameRoll, rollNewGame } from "@/lib/modules/game";
import { getSeasonPlayerById } from "@/lib/modules/season/repository/players";
import { getSeasonById } from "@/lib/modules/season/repository/seasons";
import { getUserById } from "@/lib/modules/player/service/admin";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { logAdminAction } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";

import { BotError } from "./errors";
import {
  botUsername,
  createBotRunRow,
  deleteBotRun,
  deleteBotUsers,
  getBotRun,
  insertBotLog,
  listBotOwnedPlayers,
  listRunningBotRuns,
  updateBotRun,
} from "./repository";

async function requireStaff() {
  const actor = await getCurrentUser();
  if (!actor || !isStaff(actor)) throw new BotError("botRunNotFound");
  return actor;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function parseBotConfig(formData: FormData): BotRunConfig {
  const truthy = (key: string) => {
    const v = formData.get(key);
    return v === "on" || v === "true" || v === "1";
  };
  const config: BotRunConfig = {
    botCount: clampInt(formData.get("botCount"), DEFAULT_BOT_RUN_CONFIG.botCount, 1, 20),
    actionsPerTick: clampInt(formData.get("actionsPerTick"), DEFAULT_BOT_RUN_CONFIG.actionsPerTick, 1, 10),
    tickIntervalMs: clampInt(
      formData.get("tickIntervalMs"),
      DEFAULT_BOT_RUN_CONFIG.tickIntervalMs,
      250,
      30000,
    ),
    passWeight: clampInt(formData.get("passWeight"), DEFAULT_BOT_RUN_CONFIG.passWeight, 0, 100),
    dropWeight: clampInt(formData.get("dropWeight"), DEFAULT_BOT_RUN_CONFIG.dropWeight, 0, 100),
    rerollWeight: clampInt(formData.get("rerollWeight"), DEFAULT_BOT_RUN_CONFIG.rerollWeight, 0, 100),
    enableRoll: truthy("enableRoll"),
    enableResolve: truthy("enableResolve"),
    stopOnError: truthy("stopOnError"),
  };
  if (config.passWeight + config.dropWeight + config.rerollWeight <= 0) {
    throw new BotError("botInvalidConfig");
  }
  return config;
}

/** Create run + synthetic users + season membership. Starts paused. */
export async function createBotRun(seasonId: string, config: BotRunConfig): Promise<BotRun> {
  const actor = await requireStaff();
  const season = await getSeasonById(seasonId);
  if (!season) throw new BotError("botRunNotFound");
  const run = await createBotRunRow({ seasonId, config, createdById: actor.id });
  const ensured = await ensureBotPlayers(run);
  await insertBotLog({
    runId: run.id,
    level: "info",
    action: "run_created",
    message: `Run created with ${config.botCount} bots (${ensured} players ensured)`,
    payload: { config },
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "bot_run_created",
    targetType: "season",
    targetId: seasonId,
    payload: { runId: run.id, config },
  });
  log.info("bots.run_created", { actorId: actor.id, seasonId, runId: run.id });
  return run;
}

/** Idempotent: create missing synthetic users and join them to the season. */
export async function ensureBotPlayers(run: BotRun): Promise<number> {
  const owned = await listBotOwnedPlayers(run.id, run.seasonId);
  const byUsername = new Map(owned.map((o) => [o.username, o]));
  let ensured = 0;
  for (let i = 0; i < run.config.botCount; i++) {
    const username = botUsername(run.id, i);
    const existing = byUsername.get(username);
    let userId = existing?.userId ?? null;
    if (!userId) {
      const inserted = await db
        .insert(users)
        .values({
          username,
          displayName: `Test bot ${i + 1}`,
          role: "viewer",
        })
        .returning({ id: users.id });
      const row = inserted[0];
      if (!row) throw new Error(`bot user insert returned nothing for ${username}`);
      userId = row.id;
    }
    const member = existing?.seasonPlayerId ?? null;
    if (!member) {
      await db.insert(seasonPlayers).values({ seasonId: run.seasonId, playerId: userId });
    }
    ensured++;
  }
  return ensured;
}

export interface BotTickSummary {
  actions: number;
  errors: number;
  stopped: boolean;
  lastError: string | null;
}
/**
 * One tick: up to `actionsPerTick` real player steps (rollNewGame /
 * resolveGameRoll — the same use-cases the dashboard actions call) executed
 * as the staff actor, which the game loop authorizes for any participant.
 * Every step is journaled to bot_logs; failures never throw mid-tick, they
 * accumulate into the summary (unless stopOnError halts the run).
 */
/** Console entry: staff session required (manual step / page-driven loop). */
export async function tickBotRun(runId: string): Promise<BotTickSummary> {
  const actor = await requireStaff();
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  return tickBotRunAs(run, actor.id);
}

/**
 * Core tick: up to `actionsPerTick` real player steps as an automated
 * trigger (cron/CLI). The caller authorized via CRON_SECRET or host access,
 * so no staff session is needed. `triggeredBy` lands in the audit payload.
 */
export async function tickBotRunAs(run: BotRun, triggeredBy: string): Promise<BotTickSummary> {
  if (run.status === "stopped") throw new BotError("botRunStopped");
  const runId = run.id;
  const season = await getSeasonById(run.seasonId);
  if (!season || season.status !== "active") {
    const message = `Season is not active (status: ${season?.status ?? "missing"}) — pausing run`;
    await insertBotLog({ runId, level: "error", action: "tick", message });
    await updateBotRun(runId, { status: "paused", lastError: message });
    throw new BotError("botSeasonNotActive");
  }

  await ensureBotPlayers(run);
  const owned = await listBotOwnedPlayers(run.id, run.seasonId);
  const activeSpIds: Array<{ spId: string; username: string; userId: string }> = [];
  for (const o of owned) {
    if (!o.seasonPlayerId) continue;
    const sp = await getSeasonPlayerById(o.seasonPlayerId);
    if (sp && sp.status === "active") activeSpIds.push({ spId: sp.id, username: o.username, userId: o.userId });
  }
  if (activeSpIds.length === 0) {
    const message = "No active bot players — every bot finished, was eliminated or withdrawn";
    await insertBotLog({ runId, level: "error", action: "tick", message });
    await updateBotRun(runId, {
      totalTicks: run.totalTicks + 1,
      totalErrors: run.totalErrors + 1,
      lastError: message,
    });
    return { actions: 0, errors: 1, stopped: false, lastError: message };
  }

  let actions = 0;
  let errors = 0;
  let lastError: string | null = null;
  let stopped = false;

  for (let step = 0; step < run.config.actionsPerTick; step++) {
    const bot = activeSpIds[Math.floor(Math.random() * activeSpIds.length)];
    if (!bot) break;
    // The bot acts as itself (a real player step): explicit actor keeps the
    // game loop working outside a request scope, where cookies() throws.
    const botUser = await getUserById(bot.userId);
    if (!botUser) {
      lastError = `skipped ${bot.username}: synthetic user is gone`;
      errors++;
      await insertBotLog({
        runId,
        level: "error",
        action: "tick",
        seasonPlayerId: bot.spId,
        botUsername: bot.username,
        message: lastError,
      });
      if (run.config.stopOnError) {
        stopped = true;
        break;
      }
      continue;
    }
    const open = await getOpenRollRow(bot.spId);
    const kind = nextBotStepKind(open !== null, run.config);
    if (!kind) {
      await insertBotLog({
        runId,
        level: "info",
        action: "tick",
        seasonPlayerId: bot.spId,
        botUsername: bot.username,
        message: "Skipped: needed endpoint is switched off for this run",
      });
      continue;
    }
    // Whatever the step was attempting when it threw — surfaced in bot_logs
    // so the console can show *what* failed, not just the error code.
    const attempt: Record<string, unknown> = { step: step + 1, kind };
    try {
      if (kind === "roll") {
        const rollId = await rollNewGame(bot.spId, { actor: botUser });
        actions++;
        await insertBotLog({
          runId,
          level: "info",
          action: "roll",
          seasonPlayerId: bot.spId,
          botUsername: bot.username,
          message: `Rolled a new game (roll ${rollId.slice(0, 8)})`,
          payload: { rollId },
        });
        await logAdminAction({
          actorId: bot.userId,
          actionType: "bot_roll",
          targetType: "season_player",
          targetId: bot.spId,
          payload: { runId, triggeredBy, botUsername: bot.username, rollId },
        });
      } else {
        const outcome = pickBotOutcome(
          {
            passed: run.config.passWeight,
            dropped: run.config.dropWeight,
            rerolled: run.config.rerollWeight,
          },
          Math.random,
        );
        if (!open) continue;
        attempt.outcome = outcome;
        attempt.rollId = open.id;
        const result = await resolveGameRoll(
          {
            rollId: open.id,
            outcome,
            reason: pickBotReason(outcome, Math.random),
            comment: outcome === "passed" ? pickBotComment(Math.random) : undefined,
            rating: outcome === "passed" ? pickBotRating(Math.random) : undefined,
          },
          { actor: botUser },
        );
        await insertBotLog({
          runId,
          level: "info",
          action: "resolve",
          seasonPlayerId: bot.spId,
          botUsername: bot.username,
          message: `Resolved ${outcome}: ${result.fromPosition} → ${result.toPosition} (+${result.newBalancePoints} pts)`,
          payload: { rollId: open.id, outcome, ...result },
        });
        await logAdminAction({
          actorId: bot.userId,
          actionType: "bot_resolve",
          targetType: "season_player",
          targetId: bot.spId,
          payload: {
            runId,
            triggeredBy,
            botUsername: bot.username,
            rollId: open.id,
            outcome,
            fromPosition: result.fromPosition,
            toPosition: result.toPosition,
            newBalancePoints: result.newBalancePoints,
          },
        });
      }
    } catch (e) {
      const errorCode = isAppError(e) ? e.code : e instanceof Error ? e.message : "unknown";
      const outcomeSuffix = typeof attempt.outcome === "string" ? ` (${attempt.outcome})` : "";
      lastError = `${kind}${outcomeSuffix} failed for ${bot.username}: ${errorCode}`;
      errors++;
      await insertBotLog({
        runId,
        level: "error",
        action: kind,
        seasonPlayerId: bot.spId,
        botUsername: bot.username,
        message: lastError,
        payload: { errorCode, ...attempt },
      });
      if (run.config.stopOnError) {
        stopped = true;
        await insertBotLog({
          runId,
          level: "error",
          action: "run_stopped",
          message: `Run stopped on first error (stopOnError): ${lastError}`,
        });
        break;
      }
    }
  }

  await updateBotRun(runId, {
    totalTicks: run.totalTicks + 1,
    totalActions: run.totalActions + actions,
    totalErrors: run.totalErrors + errors,
    lastError,
    ...(stopped ? { status: "stopped" as const } : {}),
  });
  return { actions, errors, stopped, lastError };
}

async function setRunStatus(runId: string, status: BotRun["status"], action: string): Promise<BotRun> {
  const actor = await requireStaff();
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  await updateBotRun(runId, { status, ...(status === "running" ? { lastError: null } : {}) });
  await insertBotLog({
    runId,
    level: "info",
    action,
    message: `Run ${status}`,
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: action,
    targetType: "season",
    targetId: run.seasonId,
    payload: { runId },
  });
  const updated = await getBotRun(runId);
  if (!updated) throw new BotError("botRunNotFound");
  return updated;
}

export function pauseBotRun(runId: string): Promise<BotRun> {
  return setRunStatus(runId, "paused", "bot_run_paused");
}

export function resumeBotRun(runId: string): Promise<BotRun> {
  return setRunStatus(runId, "running", "bot_run_resumed");
}

/**
 * Restart a stopped run whose bots are still season members. Stopped is also
 * the post-cleanup state (synthetic users deleted) — resuming that would tick
 * nothing forever, so the restart is refused without live memberships.
 */
export async function restartBotRun(runId: string): Promise<BotRun> {
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  if (run.status !== "stopped") throw new BotError("botRunNotStopped");
  const owned = await listBotOwnedPlayers(run.id, run.seasonId);
  if (!owned.some((o) => o.seasonPlayerId !== null)) throw new BotError("botRunNoPlayers");
  return setRunStatus(runId, "running", "bot_run_restarted");
}

export function stopBotRun(runId: string): Promise<BotRun> {
  return setRunStatus(runId, "stopped", "bot_run_stopped");
}

/**
 * Full teardown: delete synthetic users (rolls, moves, ledger cascade),
 * drop the run row (logs cascade) — or keep the trace. Keeping the trace is
 * the default: delete players + stop the run, remove the run row only when
 * `deleteRun` is set.
 */
export async function cleanupBotRun(runId: string, deleteRun: boolean): Promise<{ removedPlayers: number }> {
  const actor = await requireStaff();
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  const removedPlayers = await deleteBotUsers(run.id);
  if (deleteRun) {
    await deleteBotRun(run.id);
  } else {
    await updateBotRun(run.id, { status: "stopped" });
    await insertBotLog({
      runId: run.id,
      level: "info",
      action: "cleanup",
      message: `Removed ${removedPlayers} synthetic players (their rolls, moves and balance entries cascaded)`,
      payload: { removedPlayers },
    });
  }
  await logAdminAction({
    actorId: actor.id,
    actionType: "bot_run_cleaned",
    targetType: "season",
    targetId: run.seasonId,
    payload: { runId, removedPlayers, deleteRun },
  });
  log.info("bots.run_cleaned", { actorId: actor.id, runId, removedPlayers, deleteRun });
  return { removedPlayers };
}

export async function updateBotRunConfig(runId: string, config: BotRunConfig): Promise<BotRun> {
  const actor = await requireStaff();
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  await updateBotRun(runId, { config });
  await insertBotLog({ runId, level: "info", action: "tick", message: "Run config updated", payload: { config } });
  await logAdminAction({
    actorId: actor.id,
    actionType: "bot_run_config_updated",
    targetType: "season",
    targetId: run.seasonId,
    payload: { runId, config },
  });
  const updated = await getBotRun(runId);
  if (!updated) throw new BotError("botRunNotFound");
  return updated;
}

export interface DueTickResult {
  runId: string;
  ticked: boolean;
  reason?: string;
  summary?: BotTickSummary;
}

/**
 * In-process guard against two overlapping ticks of the same run inside one
 * Node instance. Cross-process overlap is covered by the Postgres advisory
 * lock taken below — every ticker (API route, CLI, console step excluded)
 * must go through tickDueRuns, never tickBotRunAs directly.
 */
const tickInflight = new Set<string>();

function isTickDue(run: BotRun, now: number): boolean {
  const updated = run.updatedAt instanceof Date ? run.updatedAt.getTime() : new Date(run.updatedAt).getTime();
  return now - updated >= Math.max(0, run.config.tickIntervalMs);
}

/**
 * Tick every `running` run whose own cadence came due (updatedAt older than
 * its tickIntervalMs). One cron firing every 10–30s drives all runs; each run
 * keeps its own pace. Runs never tick twice: in-flight set for this process,
 * pg advisory lock across processes. Never throws — per-run failures are
 * collected into the results (the tick itself already journals bot_logs).
 */
export async function tickDueRuns(opts: { force?: boolean; triggeredBy?: string } = {}): Promise<DueTickResult[]> {
  const now = Date.now();
  const triggeredBy = opts.triggeredBy ?? "cron";
  const runs = await listRunningBotRuns();
  const results: DueTickResult[] = [];
  for (const run of runs) {
    if (!opts.force && !isTickDue(run, now)) {
      results.push({ runId: run.id, ticked: false, reason: "not-due" });
      continue;
    }
    if (tickInflight.has(run.id)) {
      results.push({ runId: run.id, ticked: false, reason: "inflight" });
      continue;
    }
    tickInflight.add(run.id);
    const client = await pool.connect();
    try {
      const locked = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [`bots:${run.id}`]);
      if (!locked.rows[0]?.ok) {
        results.push({ runId: run.id, ticked: false, reason: "locked" });
        continue;
      }
      try {
        const fresh = await getBotRun(run.id);
        if (!fresh || fresh.status !== "running") {
          results.push({ runId: run.id, ticked: false, reason: "no-longer-running" });
          continue;
        }
        const summary = await tickBotRunAs(fresh, triggeredBy);
        results.push({ runId: run.id, ticked: true, summary });
      } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`bots:${run.id}`]);
      }
    } catch (e) {
      const reason = e instanceof BotError ? e.code : e instanceof Error ? e.message : "unknown";
      results.push({ runId: run.id, ticked: false, reason });
    } finally {
      client.release();
      tickInflight.delete(run.id);
    }
  }
  return results;
}

/** System tick of one run: same steps, no staff session (cron/CLI caller). */
export async function tickBotRunSystem(runId: string, triggeredBy = "cron"): Promise<BotTickSummary> {
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  return tickBotRunAs(run, triggeredBy);
}
