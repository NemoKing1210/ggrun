import { index, integer, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { playerStatusEnum } from "./enums";
import { seasons } from "./seasons";
import { users } from "./users";

// Participants

export const seasonPlayers = pgTable(
  "season_players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    balancePoints: integer("balance_points").notNull().default(0),
    status: playerStatusEnum("status").notNull().default("active"),
    streakPass: integer("streak_pass").notNull().default(0),
    streakDrop: integer("streak_drop").notNull().default(0),
    rerollsUsed: integer("rerolls_used").notNull().default(0),
    /**
     * Monotonic count of resolved rolls — the clock IEE effect durations are
     * measured in. Incremented in the same transaction that inserts the move,
     * so it cannot drift from the move history.
     */
    rollSeq: integer("roll_seq").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * When this participant reached the finish cell.
     *
     * Set by the turn that lands them there, in the same transaction as the
     * move, together with `status = 'finished'`. Null for everyone still
     * running — and for anyone a judge marked finished by hand, which is why
     * the leaderboard sorts by it with a null-last rule rather than assuming
     * every finisher has one.
     *
     * It is the only ordering that means anything among finishers: they all
     * stand on the same cell, so position and balance cannot separate them.
     */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("season_players_season_player_uq").on(t.seasonId, t.playerId),
    index("season_players_season_pos_idx").on(t.seasonId, t.position),
  ],
);

export type SeasonPlayer = typeof seasonPlayers.$inferSelect;