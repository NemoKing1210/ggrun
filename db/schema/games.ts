import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { rollStatusEnum } from "./enums";
import { seasonPlayers } from "./players";

// Game catalog & per-player rolls

export const gamesCatalog = pgTable("games_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  platform: text("platform"), // 'steam', 'nes', 'custom', ...
  externalIds: jsonb("external_ids").notNull().default({}),
  coverUrl: text("cover_url"),
  genres: text("genres").array().notNull().default([]),
  isBlacklisted: boolean("is_blacklisted").notNull().default(false),
  // Enriched metadata for API-sourced games (nullable for legacy rows)
  metacritic: integer("metacritic"),
  rating: numeric("rating"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  esrb: text("esrb"),
  externalSource: text("external_source"),
  externalRawId: text("external_raw_id"),
  tags: text("tags").array().notNull().default([]),
  /** Short game description (provider Deck / short_description / description_raw). */
  description: text("description"),
  /** Average playtime in hours (RAWG playtime), shown as “≈ N h”. */
  playtimeHours: integer("playtime_hours"),
  /** Store links: [{ store, url }] from the provider, e.g. Steam / GOG / FreeToGame. */
  stores: jsonb("stores").notNull().default([]),
  /** Official website when the provider exposes one. */
  website: text("website"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const gameRolls = pgTable(
  "game_rolls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonPlayerId: uuid("season_player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    gameId: uuid("game_id").references(() => gamesCatalog.id, {
      onDelete: "set null",
    }),
    status: rollStatusEnum("status").notNull().default("rolled"),
    hoursSpent: numeric("hours_spent"),
    difficultyLevel: integer("difficulty_level"),
    notes: text("notes"),
    /** Player rating 1-10 when the roll is marked as passed. */
    rating: integer("rating"),
    rolledAt: timestamp("rolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("game_rolls_sp_status_idx").on(t.seasonPlayerId, t.status)],
);

export type CatalogGame = typeof gamesCatalog.$inferSelect;
export type GameRoll = typeof gameRolls.$inferSelect;