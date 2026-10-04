import { isAppError } from "@/lib/errors/app-error";

import type { PoolClient } from "pg";

import { db, pool } from "@/lib/infrastructure/db";
import { seasonPlayers, users, type SeasonPlayer, type User } from "@/db/schema";
import {
  BOT_TARGET_STRATEGIES,
  DEFAULT_BOT_RUN_CONFIG,
  normalizeBotConfig,
  type BotRun,
  type BotRunConfig,
  type BotTargetStrategy,
} from "@/db/schema/bots";
import {
  activeEffects,
  nextBotStepKind,
  pickBotComment,
  pickBotOutcome,
  pickBotRating,
  pickBotReason,
  planBotItemUse,
  type IeeConfig,
  type IeeParams,
} from "@/lib/engine";
import type { BotActivityBroadcast } from "@/lib/realtime/protocol";
import { getOpenRollRow, parseSeasonConfig } from "@/lib/modules/game/service/helpers";
import { activateInventoryItem, resolveGameRoll, rollNewGame } from "@/lib/modules/game";
import { getActiveEffectRows, getHeldItems, toActiveEffectLike } from "@/lib/modules/iee/repository";
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
  listBotItemTargets,
  listBotOwnedPlayers,
  listRunningBotRuns,
  publishBotActivity,
  publishBotRun,
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
  const strategyRaw = String(formData.get("targetStrategy") ?? "");
  const targetStrategy: BotTargetStrategy = (BOT_TARGET_STRATEGIES as readonly string[]).includes(
    strategyRaw,
  )
    ? (strategyRaw as BotTargetStrategy)
    : DEFAULT_BOT_RUN_CONFIG.targetStrategy;
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
    enableItems: truthy("enableItems"),
    itemChance: clampInt(formData.get("itemChance"), DEFAULT_BOT_RUN_CONFIG.itemChance, 0, 100),
    autoCleanse: truthy("autoCleanse"),
    targetStrategy,
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
    seasonId,
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
  publishBotRun(run);
  return run;
}

/** Idempotent: create missing synthetic users and join them to the season. */
export async function ensureBotPlayers(run: BotRun): Promise<number> {
  const config = normalizeBotConfig(run.config);
  const owned = await listBotOwnedPlayers(run.id, run.seasonId);
  const byUsername = new Map(owned.map((o) => [o.username, o]));
  let ensured = 0;
  for (let i = 0; i < config.botCount; i++) {
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
 * One tick: up to `actionsPerTick` synthetic-player steps, each of which may be
 * two real actions — an item activation (`activateInventoryItem`) followed by the
 * roll/resolve the step would have taken anyway. All of them go through the same
 * use-cases the dashboard actions call, executed as the bot's own user (or as
 * staff for the console entry), which the game loop authorizes for any
 * participant. Every step is journaled to bot_logs and broadcast to the console
 * room; failures never throw mid-tick, they accumulate into the summary (unless
 * stopOnError halts the run).
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
  const seasonId = run.seasonId;
  // Runs are JSONB: a row written before the item policy existed has none of
  // its fields, so the stored config is completed once here and used throughout.
  const config = normalizeBotConfig(run.config);
  const season = await getSeasonById(seasonId);
  if (!season || season.status !== "active") {
    const message = `Season is not active (status: ${season?.status ?? "missing"}) — pausing run`;
    await insertBotLog({ runId, seasonId, level: "error", action: "tick", message });
    await updateBotRun(runId, { status: "paused", lastError: message });
    throw new BotError("botSeasonNotActive");
  }
  const iee = parseSeasonConfig(season.config).iee;
  // Items only mean something when the season runs the IEE subsystem: a status
  // granted while it is off would never reach a hook.
  const itemsEnabled = config.enableItems && iee.enabled;

  await ensureBotPlayers(run);
  const owned = await listBotOwnedPlayers(runId, seasonId);
  const activeSpIds: Array<{ spId: string; username: string; userId: string }> = [];
  for (const o of owned) {
    if (!o.seasonPlayerId) continue;
    const sp = await getSeasonPlayerById(o.seasonPlayerId);
    if (sp && sp.status === "active") activeSpIds.push({ spId: sp.id, username: o.username, userId: o.userId });
  }
  if (activeSpIds.length === 0) {
    // Nothing to tick — and left `running` this would be ticked (and error) on
    // every cron firing for the rest of the season. Pause it with the reason,
    // the same way an inactive season does, so the console shows *why* and the
    // ticker stops spending work on it.
    const message = "No active bot players — every bot finished, was eliminated or withdrawn";
    await insertBotLog({ runId, seasonId, level: "error", action: "tick", message });
    await updateBotRun(runId, {
      status: "paused",
      totalTicks: run.totalTicks + 1,
      totalErrors: run.totalErrors + 1,
      lastError: message,
    });
    const updated = await getBotRun(runId);
    if (updated) publishBotRun(updated);
    return { actions: 0, errors: 1, stopped: false, lastError: message };
  }

  /** Structured step broadcast — the console localizes it, the server does not. */
  const activity = (
    bot: { spId: string; username: string },
    kind: BotActivityBroadcast["kind"],
    fields: Partial<BotActivityBroadcast> & { detail: string },
  ): void => {
    publishBotActivity({
      runId,
      seasonId,
      seasonPlayerId: bot.spId,
      username: bot.username,
      kind,
      outcome: null,
      itemKey: null,
      targetUsername: null,
      position: null,
      balancePoints: null,
      at: new Date().toISOString(),
      ...fields,
    });
  };

  let actions = 0;
  let errors = 0;
  let lastError: string | null = null;
  let stopped = false;

  for (let step = 0; step < config.actionsPerTick; step++) {
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
        seasonId,
        level: "error",
        action: "tick",
        seasonPlayerId: bot.spId,
        botUsername: bot.username,
        message: lastError,
      });
      activity(bot, "error", { detail: lastError });
      if (config.stopOnError) {
        stopped = true;
        break;
      }
      continue;
    }
    const open = await getOpenRollRow(bot.spId);

    // --- item action: a *pre*-step, so a bot that can act on its inventory
    //     still rolls or resolves within the same step ---------------------
    if (itemsEnabled && Math.random() * 100 < config.itemChance) {
      const sp = await getSeasonPlayerById(bot.spId);
      if (sp && sp.status === "active") {
        try {
          const used = await tryBotItemUse({
            runId,
            seasonId,
            config,
            iee,
            bot,
            sp,
            botUser,
            hasOpenRoll: open !== null,
            triggeredBy,
          });
          if (used) {
            actions++;
            activity(bot, "item", {
              itemKey: used.itemKey,
              targetUsername: used.targetUsername,
              detail: `Used ${used.itemKey}${used.targetUsername ? ` on ${used.targetUsername}` : ""}`,
            });
          }
        } catch (e) {
          const errorCode = isAppError(e) ? e.code : e instanceof Error ? e.message : "unknown";
          lastError = `item failed for ${bot.username}: ${errorCode}`;
          errors++;
          await insertBotLog({
            runId,
            seasonId,
            level: "error",
            action: "item",
            seasonPlayerId: bot.spId,
            botUsername: bot.username,
            message: lastError,
            payload: { errorCode, step: step + 1 },
          });
          activity(bot, "error", { detail: lastError });
          if (config.stopOnError) {
            stopped = true;
            await insertBotLog({
              runId,
              seasonId,
              level: "error",
              action: "run_stopped",
              message: `Run stopped on first error (stopOnError): ${lastError}`,
            });
            break;
          }
        }
      }
    }

    const kind = nextBotStepKind(open !== null, config);
    if (!kind) {
      await insertBotLog({
        runId,
        seasonId,
        level: "info",
        action: "tick",
        seasonPlayerId: bot.spId,
        botUsername: bot.username,
        message: "Skipped: needed endpoint is switched off for this run",
      });
      activity(bot, "skip", { detail: "Skipped: needed endpoint is switched off for this run" });
      continue;
    }
    // Whatever the step was attempting when it threw — surfaced in bot_logs
    // so the console can show *what* failed, not just the error code.
    const attempt: Record<string, unknown> = { step: step + 1, kind };
    try {
      if (kind === "roll") {
        const rollId = await rollNewGame(bot.spId, { actor: botUser });
        actions++;
        const detail = `Rolled a new game (roll ${rollId.slice(0, 8)})`;
        await insertBotLog({
          runId,
          seasonId,
          level: "info",
          action: "roll",
          seasonPlayerId: bot.spId,
          botUsername: bot.username,
          message: detail,
          payload: { rollId },
        });
        activity(bot, "roll", { detail });
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
            passed: config.passWeight,
            dropped: config.dropWeight,
            rerolled: config.rerollWeight,
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
        const detail = `Resolved ${outcome}: ${result.fromPosition} → ${result.toPosition} (+${result.newBalancePoints} pts)`;
        await insertBotLog({
          runId,
          seasonId,
          level: "info",
          action: "resolve",
          seasonPlayerId: bot.spId,
          botUsername: bot.username,
          message: detail,
          payload: { rollId: open.id, outcome, ...result },
        });
        activity(bot, "resolve", {
          outcome,
          position: result.toPosition,
          balancePoints: result.newBalancePoints,
          detail,
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
        seasonId,
        level: "error",
        action: kind,
        seasonPlayerId: bot.spId,
        botUsername: bot.username,
        message: lastError,
        payload: { errorCode, ...attempt },
      });
      activity(bot, "error", { detail: lastError });
      if (config.stopOnError) {
        stopped = true;
        await insertBotLog({
          runId,
          seasonId,
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
  const updated = await getBotRun(runId);
  if (updated) publishBotRun(updated);
  return { actions, errors, stopped, lastError };
}

/**
 * The item half of a synthetic player's turn.
 *
 * It reuses the *real* activation path (`activateInventoryItem`) rather than
 * hand-writing the effects: charge guard, window/target guards, `unique`
 * stacking check, ledger writes, expiry anchoring and the public feed row all
 * happen exactly as they would for a person. The bot only decides *what* to
 * use and *on whom* — that decision is the pure `planBotItemUse`.
 *
 * Returns null when nothing worth doing is available (or the chance roll
 * skipped it — the caller owns that), or the used item and its target.
 */
async function tryBotItemUse(params: {
  runId: string;
  seasonId: string;
  config: BotRunConfig;
  iee: IeeConfig;
  bot: { spId: string; username: string };
  sp: SeasonPlayer;
  botUser: User;
  hasOpenRoll: boolean;
  triggeredBy: string;
}): Promise<{ itemKey: string; targetUsername: string | null } | null> {
  const { runId, seasonId, config, iee, bot, sp, botUser, hasOpenRoll, triggeredBy } = params;

  const [held, effectRows, others] = await Promise.all([
    getHeldItems(bot.spId),
    getActiveEffectRows(bot.spId),
    listBotItemTargets(seasonId, bot.spId, iee.pvpProtectionMoves),
  ]);
  if (held.length === 0) return null;

  const inForce = activeEffects(effectRows.map(toActiveEffectLike), sp.rollSeq + 1);
  const polarityById = new Map(effectRows.map((e) => [e.id, e.polarity]));
  const plan = planBotItemUse(
    {
      actor: {
        seasonPlayerId: sp.id,
        position: sp.position,
        balancePoints: sp.balancePoints,
        rollSeq: sp.rollSeq,
        // Not read by the guards (they use the target's count); passed for
        // parity with the snapshot the service builds for a real player.
        moveCount: 0,
        rank: 1,
        status: sp.status,
      },
      hasOpenRoll,
      held: held.map((row) => ({
        inventoryId: row.id,
        itemKey: row.itemKey,
        params: (row.params ?? {}) as IeeParams,
      })),
      activeEffects: inForce.map((row) => ({
        effectKey: row.effectKey,
        polarity: polarityById.get(row.id) ?? "negative",
      })),
      others,
      allowTargetingOthers: iee.allowTargetingOthers,
      pvpProtectionMoves: iee.pvpProtectionMoves,
    },
    { strategy: config.targetStrategy, autoCleanse: config.autoCleanse },
  );
  if (!plan) return null;

  const used = await activateInventoryItem(
    { inventoryId: plan.inventoryId, targetSeasonPlayerId: plan.targetSeasonPlayerId },
    { actor: botUser },
  );

  await insertBotLog({
    runId,
    seasonId,
    level: "info",
    action: "item",
    seasonPlayerId: bot.spId,
    botUsername: bot.username,
    message: `Used ${used.itemKey}${used.targetUsername ? ` on ${used.targetUsername}` : ""} (${plan.intent})`,
    payload: {
      itemKey: used.itemKey,
      inventoryId: plan.inventoryId,
      intent: plan.intent,
      targetSeasonPlayerId: plan.targetSeasonPlayerId,
      targetUsername: used.targetUsername,
    },
  });
  await logAdminAction({
    actorId: botUser.id,
    actionType: "bot_item",
    targetType: "season_player",
    targetId: bot.spId,
    payload: {
      runId,
      triggeredBy,
      botUsername: bot.username,
      itemKey: used.itemKey,
      intent: plan.intent,
      targetSeasonPlayerId: plan.targetSeasonPlayerId,
    },
  });
  return { itemKey: used.itemKey, targetUsername: used.targetUsername };
}

async function setRunStatus(runId: string, status: BotRun["status"], action: string): Promise<BotRun> {
  const actor = await requireStaff();
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  await updateBotRun(runId, { status, ...(status === "running" ? { lastError: null } : {}) });
  await insertBotLog({
    runId,
    seasonId: run.seasonId,
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
  publishBotRun(updated);
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
      seasonId: run.seasonId,
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
  // The row may be gone; announce the terminal state it reached so the open
  // console can react before its refresh drops the card.
  publishBotRun({ ...run, status: "stopped", updatedAt: new Date() });
  log.info("bots.run_cleaned", { actorId: actor.id, runId, removedPlayers, deleteRun });
  return { removedPlayers };
}

export async function updateBotRunConfig(runId: string, config: BotRunConfig): Promise<BotRun> {
  const actor = await requireStaff();
  const run = await getBotRun(runId);
  if (!run) throw new BotError("botRunNotFound");
  await updateBotRun(runId, { config });
  await insertBotLog({
    runId,
    seasonId: run.seasonId,
    level: "info",
    action: "tick",
    message: "Run config updated",
    payload: { config },
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "bot_run_config_updated",
    targetType: "season",
    targetId: run.seasonId,
    payload: { runId, config },
  });
  const updated = await getBotRun(runId);
  if (!updated) throw new BotError("botRunNotFound");
  publishBotRun(updated);
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
  return now - updated >= Math.max(0, normalizeBotConfig(run.config).tickIntervalMs);
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
    // A failed connect must still release the in-process guard, or the run
    // reports "inflight" forever in this process.
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
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
      client?.release();
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
