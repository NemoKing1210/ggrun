import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { ieeEffectStateEnum, ieeEventStatusEnum, ieeItemStateEnum } from "./enums";
import { moves } from "./moves";
import { seasonPlayers } from "./players";
import { seasons } from "./seasons";
import { users } from "./users";

// Items / Effects / Events — runtime state (tier 3).
//
// The catalog of items and effects is developer-authored TypeScript in
// lib/engine/iee and is deliberately NOT in the database; only what players
// actually hold, suffer and are assigned lives here. Event templates are the
// exception: they are admin-authored content, so they get a real table.
//
// `season_id` is denormalized alongside `season_player_id` (the same pattern
// as `event_log`) so per-season counters and admin views are single-table.

/** Items a participant holds. One row per grant, never reused. */
export const playerInventory = pgTable(
  "player_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    seasonPlayerId: uuid("season_player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    /** Catalog key. Snapshotted: a key removed from the catalog stays readable. */
    itemKey: text("item_key").notNull(),
    /** Params resolved at grant time (catalog defaults + season overrides). */
    params: jsonb("params").notNull().default({}),
    chargesLeft: integer("charges_left").notNull().default(1),
    state: ieeItemStateEnum("state").notNull().default("held"),
    /** 'cell_bonus' | 'cell_penalty' | 'event_reward' | 'item' | 'admin' */
    source: text("source").notNull().default("cell_bonus"),
    /**
     * Season-wide resolved-roll counter at grant time — the clock per-entry
     * cooldowns are measured against. Stored rather than derived so the
     * cooldown never has to compare a per-player counter with a season total.
     */
    seasonRollSeq: integer("season_roll_seq").notNull().default(0),
    sourceMoveId: uuid("source_move_id").references(() => moves.id, {
      onDelete: "set null",
    }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    index("player_inventory_sp_state_idx").on(t.seasonPlayerId, t.state),
    index("player_inventory_season_key_idx").on(t.seasonId, t.itemKey),
  ],
);

/** Statuses applied to a participant. Expiry is lazy — there is no scheduler. */
export const playerEffects = pgTable(
  "player_effects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    seasonPlayerId: uuid("season_player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    effectKey: text("effect_key").notNull(),
    params: jsonb("params").notNull().default({}),
    /** Snapshot of the catalog polarity at grant time. */
    polarity: text("polarity").notNull().default("negative"),
    /** Null for duration kinds that do not count triggers. */
    chargesLeft: integer("charges_left"),
    /** Null = permanent. Compared against `season_players.roll_seq`. */
    expiresAfterRollSeq: integer("expires_after_roll_seq"),
    /**
     * `active` means "not yet swept", **not** "in force".
     *
     * Expiry is lazy — there is no scheduler — so a spent or elapsed status
     * keeps this state until the player's next resolve marks it. Anything
     * asking "is this doing something right now" must also check
     * `charges_left` and `expires_after_roll_seq`; four public pages read the
     * column alone and drew badges for statuses that had already ended. Ask
     * `getActiveEffectsBySeason` / `getActiveEffectsWithCaster` instead — they
     * carry the rule.
     */
    state: ieeEffectStateEnum("state").notNull().default("active"),
    /** Who cast it — null for cell drops and for a deleted participant. */
    appliedBySeasonPlayerId: uuid("applied_by_season_player_id").references(
      (): import("drizzle-orm/pg-core").AnyPgColumn => seasonPlayers.id,
      { onDelete: "set null" },
    ),
    source: text("source").notNull().default("cell_penalty"),
    /** Season-wide resolved-roll counter at grant time — the cooldown clock. */
    seasonRollSeq: integer("season_roll_seq").notNull().default(0),
    sourceMoveId: uuid("source_move_id").references(() => moves.id, {
      onDelete: "set null",
    }),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("player_effects_sp_state_idx").on(t.seasonPlayerId, t.state),
    index("player_effects_season_key_idx").on(t.seasonId, t.effectKey),
  ],
);

/**
 * Event templates — admin-authored content, the one part of IEE that is data
 * rather than code.
 */
export const eventTemplates = pgTable("event_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stable slug used by season pools and seeds. */
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  descriptionMd: text("description_md").notNull(),
  /** { points?, itemKey?, effectKey? } — one column covers every reward kind. */
  reward: jsonb("reward").notNull().default({}),
  requiresProof: boolean("requires_proof").notNull().default(true),
  defaultDeadlineHours: integer("default_deadline_hours"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * One challenge assigned to one participant. Title, description and reward are
 * snapshotted so editing or deleting a template never rewrites history.
 */
export const playerEvents = pgTable(
  "player_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    seasonPlayerId: uuid("season_player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    eventTemplateId: uuid("event_template_id").references(
      () => eventTemplates.id,
      { onDelete: "set null" },
    ),
    /** Snapshots — survive template edits and deletion. */
    eventKey: text("event_key").notNull(),
    title: text("title").notNull(),
    descriptionMd: text("description_md").notNull(),
    reward: jsonb("reward").notNull().default({}),
    requiresProof: boolean("requires_proof").notNull().default(true),
    status: ieeEventStatusEnum("status").notNull().default("assigned"),
    proof: text("proof"),
    adminNote: text("admin_note"),
    source: text("source").notNull().default("cell_event"),
    sourceMoveId: uuid("source_move_id").references(() => moves.id, {
      onDelete: "set null",
    }),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Null = no deadline. Checked lazily on read. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("player_events_sp_status_idx").on(t.seasonPlayerId, t.status),
    index("player_events_season_status_idx").on(t.seasonId, t.status),
    // F6: one assignment of a template per participant per season.
    unique("player_events_sp_template_uq").on(t.seasonPlayerId, t.eventKey),
  ],
);

export type PlayerInventoryRow = typeof playerInventory.$inferSelect;
export type PlayerEffectRow = typeof playerEffects.$inferSelect;
export type EventTemplate = typeof eventTemplates.$inferSelect;
export type PlayerEventRow = typeof playerEvents.$inferSelect;
