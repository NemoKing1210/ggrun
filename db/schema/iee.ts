import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  ieeCharacterEnum,
  ieeDecisionKindEnum,
  ieeDecisionStatusEnum,
  ieeDurationUnitEnum,
  ieeEndReasonEnum,
  ieeEntryKindEnum,
  ieeEventStatusEnum,
  ieeHolderKindEnum,
  ieeInstanceKindEnum,
  ieeInstanceStatusEnum,
  ieePackVisibilityEnum,
  ieeRarityEnum,
  ieeVisibilityEnum,
} from "./enums";
import { files } from "./files";
import { gameRolls } from "./games";
import { moves } from "./moves";
import { seasonPlayers } from "./players";
import { seasons } from "./seasons";
import { users } from "./users";

// Items / Effects / Events (docs/IEE_CONSTRUCTOR_SPEC.md §4).
//
// Definitions: entries live in packs; publishing an entry's draft inserts an
// immutable, numbered revision; a season pins revisions in its catalog
// (`season_catalog`). Runtime: what players hold and suffer lives in
// `iee_instances`, and every change to it in `iee_journal` — both written by
// the executor only (lib/modules/iee/executor). Event templates are
// admin-authored content with a table of their own.
//
// `season_id` is denormalized alongside the participant (the same pattern as
// `event_log`) so per-season counters and admin views are single-table.

// ---------------------------------------------------------------------------
// Definitions (§4.2) — written by lib/modules/iee/library only
// ---------------------------------------------------------------------------

/** A named set of entries. Ids survive export and import (D11); `core` is the system pack. */
export const ieePacks = pgTable(
  "iee_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** For URLs, files and search — free to change; the id is the identity. */
    slug: text("slug").notNull().unique(),
    /** `{ ru, en?, uk? }`. */
    names: jsonb("names").notNull(),
    description: jsonb("description"),
    iconFileId: uuid("icon_file_id").references(() => files.id, { onDelete: "set null" }),
    visibility: ieePackVisibilityEnum("visibility").notNull().default("draft"),
    defaultLocale: text("default_locale").notNull().default("ru"),
    isSystem: boolean("is_system").notNull().default(false),
    /** Engine capabilities the pack needs (e.g. `board_objects`). */
    capabilities: text("capabilities").array().notNull().default(sql`'{}'::text[]`),
    minDslVersion: integer("min_dsl_version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Packs are archived, never deleted. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    check("iee_packs_slug_format", sql`${t.slug} ~ '^[a-z0-9_]{2,48}$'`),
    check("iee_packs_default_locale", sql`${t.defaultLocale} in ('ru', 'en', 'uk')`),
  ],
);

/**
 * What a pack's entries reference outside it. Maintained by the library from
 * the references inside drafts and revisions; never edited by hand.
 */
export const ieePackDependencies = pgTable(
  "iee_pack_dependencies",
  {
    packId: uuid("pack_id")
      .notNull()
      .references(() => ieePacks.id, { onDelete: "cascade" }),
    dependsOnPackId: uuid("depends_on_pack_id")
      .notNull()
      .references(() => ieePacks.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.packId, t.dependsOnPackId] })],
);

/** An item or an effect: its editable draft and a pointer to its latest revision. */
export const ieeEntries = pgTable(
  "iee_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: uuid("pack_id")
      .notNull()
      .references(() => ieePacks.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    /** Immutable after the first publish. */
    kind: ieeEntryKindEnum("kind").notNull(),
    /** An entry document (§5) — may be invalid while it is being edited. */
    draft: jsonb("draft").notNull(),
    iconFileId: uuid("icon_file_id").references(() => files.id, { onDelete: "set null" }),
    /** Denormalised convenience: the highest-numbered revision. */
    latestRevisionId: uuid("latest_revision_id").references((): AnyPgColumn => ieeEntryRevisions.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Entries are archived, never deleted. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    unique("iee_entries_pack_slug_uq").on(t.packId, t.slug),
    check("iee_entries_slug_format", sql`${t.slug} ~ '^[a-z0-9_]{2,48}$'`),
  ],
);

/**
 * Immutable, numbered snapshots of a draft — the only thing a season plays.
 * Insert-only: no code path updates or deletes a row (an architecture test
 * holds that), and a revision a season or an instance pins cannot be deleted
 * by anything else either (`RESTRICT`).
 */
export const ieeEntryRevisions = pgTable(
  "iee_entry_revisions",
  {
    /** The runtime reference (D11). */
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => ieeEntries.id, { onDelete: "restrict" }),
    /** 1, 2, … per entry. */
    number: integer("number").notNull(),
    /** A validated entry document. */
    doc: jsonb("doc").notNull(),
    dslVersion: integer("dsl_version").notNull(),
    /** sha-256 of the canonical JSON of `doc`: the same content twice is one revision. */
    contentHash: text("content_hash").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("iee_entry_revisions_number_uq").on(t.entryId, t.number),
    unique("iee_entry_revisions_hash_uq").on(t.entryId, t.contentHash),
    check("iee_entry_revisions_number_positive", sql`${t.number} >= 1`),
  ],
);

/**
 * The revisions a season plays — one per entry — with the season's tuning.
 * Replaces `seasons.config.iee.entries`. A pinned revision cannot be deleted
 * (`RESTRICT`); switching to a newer one affects future grants only.
 */
export const seasonCatalog = pgTable(
  "season_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => ieeEntries.id, { onDelete: "restrict" }),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => ieeEntryRevisions.id, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(true),
    /** The wheel it drops from — the revision's `character` unless the season moves it. */
    pool: ieeCharacterEnum("pool").notNull(),
    /** Overrides the revision's rarity for display and the default weight. */
    rarity: ieeRarityEnum("rarity"),
    weight: integer("weight").notNull(),
    maxPerSeason: integer("max_per_season"),
    maxPerPlayer: integer("max_per_player"),
    cooldownRolls: integer("cooldown_rolls").notNull().default(0),
    minPosition: integer("min_position").notNull().default(0),
    unlockAfterMove: integer("unlock_after_move").notNull().default(0),
    /** Keyed by declared parameter (§5.1). */
    paramOverrides: jsonb("param_overrides").notNull().default({}),
    durationOverride: integer("duration_override"),
    targetOverride: text("target_override"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("season_catalog_season_entry_uq").on(t.seasonId, t.entryId),
    index("season_catalog_revision_idx").on(t.revisionId),
    check("season_catalog_weight_nonnegative", sql`${t.weight} >= 0`),
    check(
      "season_catalog_target_override",
      sql`${t.targetOverride} is null or ${t.targetOverride} in ('self', 'other', 'any', 'none')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Runtime state (§4.3) — written by lib/modules/iee/executor only
// ---------------------------------------------------------------------------

/**
 * The IEE journal — append-only, one row per change with its cause
 * (docs/IEE_CONSTRUCTOR_SPEC.md §4.3, §9). Only the executor writes here; the
 * public feed and the staff turn trace are projections of it.
 *
 * `instance_id` and `revision_id` carry no foreign key on purpose: history
 * must outlive what it describes.
 */
export const ieeJournal = pgTable(
  "iee_journal",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** The season's resolved-roll counter when the row was written. */
    turnSeq: integer("turn_seq"),
    /** spec §9.2 — `grant`, `fire`, `tick`, `expire`, `use`, `end`, … */
    op: text("op").notNull(),
    actorPlayerId: uuid("actor_player_id").references(() => seasonPlayers.id, { onDelete: "set null" }),
    targetPlayerId: uuid("target_player_id").references(() => seasonPlayers.id, { onDelete: "set null" }),
    /** Staff member behind an admin operation. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    instanceId: uuid("instance_id"),
    revisionId: uuid("revision_id"),
    /** Which rule of the revision fired. */
    ruleIndex: integer("rule_index"),
    /** What was asked. */
    intent: jsonb("intent").notNull().default({}),
    /** What happened — including `blocked`, `noop`, `refreshed`. */
    outcome: jsonb("outcome").notNull().default({}),
    /** Every server random draw the change used. */
    rng: jsonb("rng"),
    causeId: bigint("cause_id", { mode: "number" }).references((): AnyPgColumn => ieeJournal.id, {
      onDelete: "set null",
    }),
    visibility: ieeVisibilityEnum("visibility").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("iee_journal_season_id_idx").on(t.seasonId, t.id),
    index("iee_journal_season_turn_idx").on(t.seasonId, t.turnSeq),
  ],
);

/**
 * Live items and effects — one row per instance, whoever holds it
 * (docs/IEE_CONSTRUCTOR_SPEC.md §4.3); only the executor writes here.
 *
 * `entry_id` / `revision_id` point at the library from stage 2 on; until then
 * they name the code fixture's ids and carry no foreign key.
 *
 * Counters are **eager**: they change in the transaction of the event that
 * consumes them, and an instance whose counter reaches zero is ended there and
 * then (§7.9). `status = 'active'` therefore means "in force": nothing is
 * left to sweep later.
 */
export const ieeInstances = pgTable(
  "iee_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Limits, stacking and cooldowns count per entry, never per revision. */
    entryId: uuid("entry_id")
      .notNull()
      .references(() => ieeEntries.id, { onDelete: "restrict" }),
    /** The revision it was granted with — it keeps playing that one (§8). */
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => ieeEntryRevisions.id, { onDelete: "restrict" }),
    kind: ieeInstanceKindEnum("kind").notNull(),
    holderKind: ieeHolderKindEnum("holder_kind").notNull(),
    holderPlayerId: uuid("holder_player_id").references(() => seasonPlayers.id, { onDelete: "cascade" }),
    holderCellIndex: integer("holder_cell_index"),
    holderRollId: uuid("holder_roll_id").references(() => gameRolls.id, { onDelete: "cascade" }),
    /** Who cast or placed it — null for cell drops and for a deleted participant. */
    ownerPlayerId: uuid("owner_player_id").references((): AnyPgColumn => seasonPlayers.id, {
      onDelete: "set null",
    }),
    /**
     * The player the item that handed this effect to its user was aimed at —
     * whom its rules read as the chosen player at the turn's hooks (wave A,
     * «Магнит», spec §6.11). Null when nobody was, or the participant is gone.
     */
    aimedPlayerId: uuid("aimed_player_id").references((): AnyPgColumn => seasonPlayers.id, {
      onDelete: "set null",
    }),
    /**
     * What the use that handed this effect to its user picked for their next
     * game (wave C, spec §6.16): `{ genre }`, `{ years: [from, to] }` or
     * `{ gameId, title }` — what `"picked"` reads at `beforeGameRoll`. Null
     * when nothing was picked.
     */
    chosen: jsonb("chosen"),
    /** Parameter snapshot at grant: declared defaults with the season's overrides. */
    params: jsonb("params").notNull().default({}),
    /** Items: uses left. */
    chargesLeft: integer("charges_left"),
    /** Effects: what is left of the duration, in `remaining_unit`. Null = permanent. */
    remaining: integer("remaining"),
    remainingUnit: ieeDurationUnitEnum("remaining_unit"),
    /**
     * The holder's roll counter the instance counts from: it takes part in the
     * holder's rolls after this one. A status granted while the holder has a
     * game in flight starts after that game (SC-HEXSCROLL-7).
     */
    anchorRollSeq: integer("anchor_roll_seq"),
    /**
     * Where the counter counts from once a `refresh` grant has renewed it: the
     * counter goes down only on the holder's rolls after this one, while the
     * rules keep taking part from `anchor_roll_seq`. A renewal counts like a
     * fresh copy, so the roll already underway when it arrived stays with the
     * old count (spec §7.10). Null = the anchor.
     */
    countFromRollSeq: integer("count_from_roll_seq"),
    status: ieeInstanceStatusEnum("status").notNull().default("active"),
    endReason: ieeEndReasonEnum("end_reason"),
    /** `cell_bonus`, `cell_penalty`, `item`, `event_reward`, `admin`, `seed`, … */
    source: text("source").notNull(),
    sourceMoveId: uuid("source_move_id").references(() => moves.id, { onDelete: "set null" }),
    /** The journal row that created it. */
    causeJournalId: bigint("cause_journal_id", { mode: "number" }).references(() => ieeJournal.id, {
      onDelete: "set null",
    }),
    /** Season-wide resolved-roll counter at grant — the cooldown clock. */
    grantedRollSeq: integer("granted_roll_seq").notNull().default(0),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("iee_instances_holder_idx").on(t.seasonId, t.holderPlayerId, t.status),
    index("iee_instances_entry_idx").on(t.seasonId, t.entryId, t.status),
    index("iee_instances_cell_idx")
      .on(t.seasonId, t.holderCellIndex)
      .where(sql`${t.status} = 'active'`),
    // The completion conditions a roll holds (wave C, spec §6.17) — read and ended with it.
    index("iee_instances_roll_idx")
      .on(t.holderRollId)
      .where(sql`${t.holderRollId} is not null`),
    check(
      "iee_instances_one_holder",
      sql`(${t.holderKind} = 'player' and ${t.holderPlayerId} is not null and ${t.holderCellIndex} is null and ${t.holderRollId} is null)
        or (${t.holderKind} = 'cell' and ${t.holderCellIndex} is not null and ${t.holderPlayerId} is null and ${t.holderRollId} is null)
        or (${t.holderKind} = 'roll' and ${t.holderRollId} is not null and ${t.holderPlayerId} is null and ${t.holderCellIndex} is null)`,
    ),
    check(
      "iee_instances_ended_has_reason",
      sql`(${t.status} = 'active' and ${t.endReason} is null) or (${t.status} = 'ended' and ${t.endReason} is not null)`,
    ),
  ],
);

/**
 * Decisions — a pause that waits for a player (docs/IEE_CONSTRUCTOR_SPEC.md
 * §4.3, §7.4, §7.6): a victim's choice of what to give up or keep, the
 * reaction window after the dice. Only the executor writes here.
 *
 * At most one pending decision of each kind per player — the partial unique
 * index holds it, so a second question can never slip in beside the first.
 * `instance_id` / `revision_id` carry no foreign key, as in the journal: a
 * decision outlives the instance that asked.
 */
export const ieeDecisions = pgTable(
  "iee_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Who decides. */
    playerId: uuid("player_id")
      .notNull()
      .references(() => seasonPlayers.id, { onDelete: "cascade" }),
    kind: ieeDecisionKindEnum("kind").notNull(),
    status: ieeDecisionStatusEnum("status").notNull().default("pending"),
    /** The instance whose rule asked, and its revision. */
    instanceId: uuid("instance_id"),
    revisionId: uuid("revision_id"),
    ruleIndex: integer("rule_index"),
    /** What was offered: `[{ id, kind, params }]`. */
    options: jsonb("options").notNull().default([]),
    /** `{ option, picks? }` — the default as it stood when asked; recomputed when applied. */
    defaultChoice: jsonb("default_choice").notNull().default({}),
    /** What carrying the decision out needs — the entry that asked, the default's rule, the stored roll. */
    context: jsonb("context").notNull().default({}),
    /** `{ option, picks? }` — what was decided. */
    choice: jsonb("choice"),
    /** The player, or the judge who chose for them; null when defaulted. */
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** The `decision_open` journal row. */
    causeJournalId: bigint("cause_journal_id", { mode: "number" }).references(() => ieeJournal.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("iee_decisions_season_status_idx").on(t.seasonId, t.status),
    uniqueIndex("iee_decisions_one_pending_uq")
      .on(t.playerId, t.kind)
      .where(sql`${t.status} = 'pending'`),
    check(
      "iee_decisions_settled",
      sql`(${t.status} = 'pending' and ${t.resolvedAt} is null) or (${t.status} <> 'pending' and ${t.resolvedAt} is not null)`,
    ),
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

export type IeePackRow = typeof ieePacks.$inferSelect;
export type IeeEntryRow = typeof ieeEntries.$inferSelect;
export type IeeEntryRevisionRow = typeof ieeEntryRevisions.$inferSelect;
export type SeasonCatalogRow = typeof seasonCatalog.$inferSelect;
export type IeeInstanceRow = typeof ieeInstances.$inferSelect;
export type IeeJournalRow = typeof ieeJournal.$inferSelect;
export type IeeDecisionRow = typeof ieeDecisions.$inferSelect;
export type EventTemplate = typeof eventTemplates.$inferSelect;
export type PlayerEventRow = typeof playerEvents.$inferSelect;
