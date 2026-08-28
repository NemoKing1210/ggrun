import { relations } from "drizzle-orm";

import { seasonPlayers } from "./players";
import { seasons } from "./seasons";
import { users } from "./users";

// Drizzle relations (lazy query helpers; safe to extend per feature)

export const seasonsRelations = relations(seasons, ({ many }) => ({
  players: many(seasonPlayers),
}));

export const seasonPlayersRelations = relations(seasonPlayers, ({ one }) => ({
  season: one(seasons, {
    fields: [seasonPlayers.seasonId],
    references: [seasons.id],
  }),
  user: one(users, {
    fields: [seasonPlayers.playerId],
    references: [users.id],
  }),
}));