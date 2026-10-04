import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { seasons } from "./seasons";

/**
 * Test bots: synthetic players that exercise the real game loop
 * (rollNewGame / resolveGameRoll) so staff can see what works and what
 * breaks under load. Runs are driven by the admin bots console (manual step
 * or page-driven loop) or autonomously — POST /api/bots/tick (CRON_SECRET)
 * and `pnpm bots:tick` tick every `running` run whose cadence came due. A
 * tick is one batch of a few real player steps.
 */

export type BotRunStatus = "running" | "paused" | "stopped";

/**
 * Who offensive items are aimed at. Kept in sync with the engine's
 * `BOT_TARGET_STRATEGIES` (a parity test in `lib/modules/bots` asserts it):
 * the engine may not import the drizzle schema, so the list is stated twice on
 * purpose and the test is what keeps the two copies honest.
 */
export const BOT_TARGET_STRATEGIES = ["leader", "random", "nearest"] as const;
export type BotTargetStrategy = (typeof BOT_TARGET_STRATEGIES)[number];

export interface BotRunConfig {
  /** How many synthetic players this run owns. */
  botCount: number;
  /** Real player steps attempted per tick (server action call). */
  actionsPerTick: number;
  /** Desired pause between ticks in ms (console-side loop). */
  tickIntervalMs: number;
  /** Weighted draw for the resolve outcome. */
  passWeight: number;
  dropWeight: number;
  rerollWeight: number;
  /** Which real endpoints the run may call. */
  enableRoll: boolean;
  enableResolve: boolean;
  /**
   * Activate held items the way a player would — cleanse a debuff, buff before
   * a roll, hex a rival. Off means the bots still *collect* items from the
   * wheel but never spend them.
   */
  enableItems: boolean;
  /** 0-100: chance per step to attempt an item action when one is possible. */
  itemChance: number;
  /** Spend a cleanse item as soon as a negative status lands on the bot. */
  autoCleanse: boolean;
  /** Who an offensive item is aimed at. */
  targetStrategy: BotTargetStrategy;
  /** Stop the whole run on the first step error instead of logging on. */
  stopOnError: boolean;
}

export const DEFAULT_BOT_RUN_CONFIG: BotRunConfig = {
  botCount: 3,
  actionsPerTick: 2,
  tickIntervalMs: 2000,
  passWeight: 70,
  dropWeight: 20,
  rerollWeight: 10,
  enableRoll: true,
  enableResolve: true,
  enableItems: true,
  itemChance: 60,
  autoCleanse: true,
  targetStrategy: "leader",
  stopOnError: false,
};

function bool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "on" || value === "true" || value === "1") return true;
  if (value === "off" || value === "false" || value === "0") return false;
  return fallback;
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * Fills in fields added after a run was created. Runs are JSONB, so a row
 * written before the item policy existed carries no `enableItems` at all —
 * reading `run.config.enableItems` straight off it would be `undefined` (falsy)
 * and silently disable the feature for every existing run. Everything that
 * consumes a stored config goes through here.
 */
export function normalizeBotConfig(raw: unknown): BotRunConfig {
  const source = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_BOT_RUN_CONFIG;
  const strategy = (BOT_TARGET_STRATEGIES as readonly string[]).includes(
    String(source.targetStrategy),
  )
    ? (source.targetStrategy as BotTargetStrategy)
    : d.targetStrategy;
  return {
    botCount: int(source.botCount, d.botCount, 1, 20),
    actionsPerTick: int(source.actionsPerTick, d.actionsPerTick, 1, 10),
    tickIntervalMs: int(source.tickIntervalMs, d.tickIntervalMs, 250, 30000),
    passWeight: int(source.passWeight, d.passWeight, 0, 100),
    dropWeight: int(source.dropWeight, d.dropWeight, 0, 100),
    rerollWeight: int(source.rerollWeight, d.rerollWeight, 0, 100),
    enableRoll: bool(source.enableRoll, d.enableRoll),
    enableResolve: bool(source.enableResolve, d.enableResolve),
    enableItems: bool(source.enableItems, d.enableItems),
    itemChance: int(source.itemChance, d.itemChance, 0, 100),
    autoCleanse: bool(source.autoCleanse, d.autoCleanse),
    targetStrategy: strategy,
    stopOnError: bool(source.stopOnError, d.stopOnError),
  };
}

export const botRuns = pgTable("bot_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("paused"),
  config: jsonb("config").notNull().$type<BotRunConfig>().default(DEFAULT_BOT_RUN_CONFIG),
  totalTicks: integer("total_ticks").notNull().default(0),
  totalActions: integer("total_actions").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  lastError: text("last_error"),
  createdById: uuid("created_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BotRun = typeof botRuns.$inferSelect;

export type BotLogLevel = "info" | "error";

/**
 * Per-step journal of a bot run: every roll/resolve attempt plus lifecycle
 * transitions. Separate from event_log (public feed) and admin_audit_log
 * (staff mutations) — this is the debugging trace for the run itself.
 *
 * `seasonPlayerId` / `botUsername` are plain data, not foreign keys: cleanup
 * deletes the synthetic users (cascading their players, rolls and moves) and
 * the trace must survive that.
 */
export const botLogs = pgTable(
  "bot_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => botRuns.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    /** roll | resolve | tick | run_created | run_paused | run_resumed | run_stopped | cleanup | ensure_players */
    action: text("action").notNull(),
    seasonPlayerId: uuid("season_player_id"),
    botUsername: text("bot_username"),
    message: text("message").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bot_logs_run_created_idx").on(t.runId, t.createdAt),
    index("bot_logs_run_level_idx").on(t.runId, t.level),
  ],
);

export type BotLog = typeof botLogs.$inferSelect;
