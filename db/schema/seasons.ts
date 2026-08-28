import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { cellTypeEnum, seasonStatusEnum } from "./enums";
import { users } from "./users";

// Seasons / boards

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique().notNull(),
    title: text("title").notNull(),
    status: seasonStatusEnum("status").notNull().default("draft"),
    /** Season rules (dice, points, board) — see lib/engine/types.ts SeasonConfig */
    config: jsonb("config").notNull().default({}),
    /** Rules page text (markdown), edited from the admin area */
    rulesMd: text("rules_md"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // At most one active season may exist at any time — enforced by the DB
  // itself, so even concurrent requests cannot start two runs.
  () => [
    uniqueIndex("seasons_single_active_uq")
      .on(sql`(status)`)
      .where(sql`status = 'active'`),
  ],
);

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Main board"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const boardCells = pgTable(
  "board_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    cellType: cellTypeEnum("cell_type").notNull().default("normal"),
    label: text("label"),
    /** Cell params: { amount } for penalty/bonus, { effectKey, ... } for custom */
    config: jsonb("config").notNull().default({}),
  },
  (t) => [unique("board_cells_board_position_uq").on(t.boardId, t.position)],
);

export type Season = typeof seasons.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type BoardCell = typeof boardCells.$inferSelect;