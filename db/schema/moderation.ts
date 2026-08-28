import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { completionRequestStatusEnum, rerollRequestStatusEnum } from "./enums";
import { gameRolls, gamesCatalog } from "./games";
import { seasonPlayers } from "./players";
import { users } from "./users";

// Moderation requests (rerolls & completion claims)

export const rerollRequests = pgTable(
  "reroll_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonPlayerId: uuid("season_player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    gameRollId: uuid("game_roll_id")
      .notNull()
      .references(() => gameRolls.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: rerollRequestStatusEnum("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("reroll_requests_sp_idx").on(t.seasonPlayerId),
    index("reroll_requests_game_roll_idx").on(t.gameRollId),
    index("reroll_requests_status_idx").on(t.status),
  ],
);

export const completionRequests = pgTable(
  "completion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonPlayerId: uuid("season_player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    gameRollId: uuid("game_roll_id")
      .notNull()
      .references(() => gameRolls.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(), // passed | dropped
    reason: text("reason"),
    rating: integer("rating"),
    status: completionRequestStatusEnum("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("completion_requests_sp_idx").on(t.seasonPlayerId),
    index("completion_requests_game_roll_idx").on(t.gameRollId),
    index("completion_requests_status_idx").on(t.status),
  ],
);

export type RerollRequest = typeof rerollRequests.$inferSelect;
export type CompletionRequest = typeof completionRequests.$inferSelect;