import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { cellTypeEnum } from "./enums";
import { gameRolls } from "./games";
import { seasonPlayers } from "./players";
import { users } from "./users";

// Board movement & balance ledger

export const moves = pgTable("moves", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonPlayerId: uuid("season_player_id")
    .notNull()
    .references(() => seasonPlayers.id, { onDelete: "cascade" }),
  gameRollId: uuid("game_roll_id").references(() => gameRolls.id),
  fromPosition: integer("from_position").notNull(),
  toPosition: integer("to_position").notNull(),
  diceResults: integer("dice_results").array().notNull(),
  cellLandedType: cellTypeEnum("cell_landed_type"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonPlayerId: uuid("season_player_id")
    .notNull()
    .references(() => seasonPlayers.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  // 'game_pass_bonus', 'penalty_cell', 'bonus_cell', 'admin_adjustment', ...
  reason: text("reason").notNull(),
  relatedMoveId: uuid("related_move_id").references(() => moves.id),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Move = typeof moves.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;