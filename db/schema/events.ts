import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { seasonPlayers } from "./players";
import { seasons } from "./seasons";

// Public event feed

export const eventLog = pgTable(
  "event_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    seasonPlayerId: uuid("season_player_id").references(
      () => seasonPlayers.id,
      { onDelete: "set null" },
    ),
    // 'game_rolled', 'game_passed', 'game_dropped', 'moved', ...
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("event_log_season_created_idx").on(t.seasonId, t.createdAt)],
);

export type EventLogEntry = typeof eventLog.$inferSelect;