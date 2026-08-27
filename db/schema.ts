import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "judge",
  "player",
  "viewer",
]);
export const seasonStatusEnum = pgEnum("season_status", [
  "draft",
  "active",
  "paused",
  "finished",
  "archived",
]);
export const cellTypeEnum = pgEnum("cell_type", [
  "start",
  "finish",
  "normal",
  "penalty",
  "event",
  "bonus",
  "teleport",
  "custom",
]);
export const rollStatusEnum = pgEnum("roll_status", [
  "rolled",
  "in_progress",
  "passed",
  "dropped",
  "rerolled",
]);
export const rerollRequestStatusEnum = pgEnum("reroll_request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const completionRequestStatusEnum = pgEnum("completion_request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const playerStatusEnum = pgEnum("player_status", [
  "active",
  "finished",
  "eliminated",
  "withdrawn",
]);
export const registrationModeEnum = pgEnum("registration_mode", [
  "open",
  "manual_approval",
  "email_link",
]);

// ---------------------------------------------------------------------------
// Users & sessions (local replacement for Supabase Auth: profiles on top of our own users)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  /** Wide profile banner (3:1), cropped & resized on upload; shown on the public profile. */
  bannerUrl: text("banner_url"),
  twitchLogin: text("twitch_login"),
  role: userRoleEnum("role").notNull().default("viewer"),
  isBlocked: boolean("is_blocked").notNull().default(false),
  /** Short self-description shown on the public profile. */
  bio: text("bio"),
  /** External profile links: [{ network, url }] shown on the public profile. */
  links: jsonb("links").notNull().default([]),
  /** Accent color key from the ACCENTS palette (lib/accent.ts). */
  accent: text("accent").notNull().default("amber"),
  /** Preferred site language; overrides the locale cookie when set. */
  locale: text("locale"),
  /** Email verification & manual approval flags for registration flows. */
  isApproved: boolean("is_approved").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Seasons / boards
// ---------------------------------------------------------------------------

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique().notNull(),
    title: text("title").notNull(),
    status: seasonStatusEnum("status").notNull().default("draft"),
    /** Season rules (dice, points, board) — see game-engine/types.ts SeasonConfig */
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

// ---------------------------------------------------------------------------
// Participants & games
// ---------------------------------------------------------------------------

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
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("season_players_season_player_uq").on(t.seasonId, t.playerId),
    index("season_players_season_pos_idx").on(t.seasonId, t.position),
  ],
);

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

export const siteSettings = pgTable("site_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  registrationMode: registrationModeEnum("registration_mode").notNull().default("open"),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  // External game provider API keys — DB overrides env when set. Null/empty means fallback to env.
  rawgApiKey: text("rawg_api_key"),
  igdbClientId: text("igdb_client_id"),
  igdbClientSecret: text("igdb_client_secret"),
  steamApiKey: text("steam_api_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses").notNull().default(1),
    usesCount: integer("uses_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invite_tokens_token_idx").on(t.token)],
);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id"),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

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

export type User = typeof users.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type BoardCell = typeof boardCells.$inferSelect;
export type SeasonPlayer = typeof seasonPlayers.$inferSelect;
export type CatalogGame = typeof gamesCatalog.$inferSelect;
export type GameRoll = typeof gameRolls.$inferSelect;
export type RerollRequest = typeof rerollRequests.$inferSelect;
export type CompletionRequest = typeof completionRequests.$inferSelect;
export type Move = typeof moves.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type EventLogEntry = typeof eventLog.$inferSelect;
