import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { seasons } from "./seasons";

/**
 * Test bots: synthetic players that exercise the real game loop
 * (rollNewGame / resolveGameRoll) so staff can see what works and what
 * breaks under load. Runs are driven by the admin bots console — a tick is
 * one server action call performing a few real player steps.
 */

export type BotRunStatus = "running" | "paused" | "stopped";

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
  stopOnError: false,
};

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
