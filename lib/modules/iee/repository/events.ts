import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import {
  eventTemplates,
  playerEvents,
  seasonPlayers,
  seasons,
  users,
  type EventTemplate,
  type PlayerEventRow,
} from "@/db/schema";

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// --- templates (admin-authored content) -------------------------------------

export async function listEventTemplates(
  onlyActive = false,
): Promise<EventTemplate[]> {
  const rows = db.select().from(eventTemplates);
  return onlyActive
    ? rows.where(eq(eventTemplates.isActive, true)).orderBy(asc(eventTemplates.title))
    : rows.orderBy(asc(eventTemplates.title));
}

export async function getEventTemplateByKey(
  key: string,
): Promise<EventTemplate | null> {
  const rows = await db
    .select()
    .from(eventTemplates)
    .where(eq(eventTemplates.key, key))
    .limit(1);
  return rows[0] ?? null;
}

export async function getEventTemplatesByKeys(
  keys: readonly string[],
): Promise<EventTemplate[]> {
  if (keys.length === 0) return [];
  return db
    .select()
    .from(eventTemplates)
    .where(
      and(inArray(eventTemplates.key, [...keys]), eq(eventTemplates.isActive, true)),
    );
}

export async function createEventTemplate(
  input: {
    key: string;
    title: string;
    descriptionMd: string;
    reward: Record<string, unknown>;
    requiresProof: boolean;
    defaultDeadlineHours: number | null;
    createdBy: string | null;
  },
  tx: Db = db,
): Promise<EventTemplate> {
  const [row] = await tx.insert(eventTemplates).values(input).returning();
  return row!;
}

export async function updateEventTemplate(
  id: string,
  patch: Partial<{
    title: string;
    descriptionMd: string;
    reward: Record<string, unknown>;
    requiresProof: boolean;
    defaultDeadlineHours: number | null;
    isActive: boolean;
  }>,
  tx: Db = db,
): Promise<void> {
  await tx
    .update(eventTemplates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(eventTemplates.id, id));
}

export async function deleteEventTemplate(id: string, tx: Db = db): Promise<void> {
  // Assignments keep their snapshotted title/description/reward and lose only
  // the foreign key, so deleting a template never rewrites history.
  await tx.delete(eventTemplates).where(eq(eventTemplates.id, id));
}

// --- assignments ------------------------------------------------------------

export type AssignEventInput = {
  seasonId: string;
  seasonPlayerId: string;
  template: EventTemplate;
  source: string;
  sourceMoveId?: string | null;
  assignedBy?: string | null;
};

/**
 * Assigns a challenge, snapshotting its text and reward.
 * Returns null when the participant already has this event (F6: once per
 * player per season) — enforced by a unique index, not by a prior SELECT.
 */
export async function assignEvent(
  input: AssignEventInput,
  tx: Db = db,
): Promise<PlayerEventRow | null> {
  const t = input.template;
  const dueAt =
    t.defaultDeadlineHours === null
      ? null
      : new Date(Date.now() + t.defaultDeadlineHours * 3_600_000);

  const rows = await tx
    .insert(playerEvents)
    .values({
      seasonId: input.seasonId,
      seasonPlayerId: input.seasonPlayerId,
      eventTemplateId: t.id,
      eventKey: t.key,
      title: t.title,
      descriptionMd: t.descriptionMd,
      reward: t.reward,
      requiresProof: t.requiresProof,
      source: input.source,
      sourceMoveId: input.sourceMoveId ?? null,
      assignedBy: input.assignedBy ?? null,
      dueAt,
    })
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

/** Event keys the participant already has — excludes them from the pool. */
export async function getAssignedEventKeys(
  seasonPlayerId: string,
): Promise<string[]> {
  const rows = await db
    .select({ key: playerEvents.eventKey })
    .from(playerEvents)
    .where(eq(playerEvents.seasonPlayerId, seasonPlayerId));
  return rows.map((r) => r.key);
}

export async function getPlayerEvents(
  seasonPlayerId: string,
): Promise<PlayerEventRow[]> {
  return db
    .select()
    .from(playerEvents)
    .where(eq(playerEvents.seasonPlayerId, seasonPlayerId))
    .orderBy(desc(playerEvents.assignedAt));
}

export async function getPlayerEvent(id: string): Promise<PlayerEventRow | null> {
  const rows = await db
    .select()
    .from(playerEvents)
    .where(eq(playerEvents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Attaches proof and moves the assignment to `submitted`.
 * Guarded in the WHERE clause so a double submit cannot re-open a resolved row.
 */
export async function submitEventProof(
  id: string,
  proof: string | null,
  tx: Db = db,
): Promise<PlayerEventRow | null> {
  const rows = await tx
    .update(playerEvents)
    .set({ proof, status: "submitted", submittedAt: new Date() })
    .where(and(eq(playerEvents.id, id), eq(playerEvents.status, "assigned")))
    .returning();
  return rows[0] ?? null;
}

export async function resolveEvent(
  id: string,
  outcome: "approved" | "rejected",
  resolvedBy: string,
  adminNote: string | null,
  tx: Db = db,
): Promise<PlayerEventRow | null> {
  const rows = await tx
    .update(playerEvents)
    .set({ status: outcome, adminNote, resolvedBy, resolvedAt: new Date() })
    .where(
      and(
        eq(playerEvents.id, id),
        or(eq(playerEvents.status, "submitted"), eq(playerEvents.status, "assigned")),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

/**
 * Marks overdue assignments expired. Lazy: called on read, never scheduled.
 * Only unsubmitted rows expire — a submission already waiting on a judge is
 * never lost to a deadline.
 */
export async function expireOverdueEvents(
  seasonId: string,
  tx: Db = db,
): Promise<number> {
  const rows = await tx
    .update(playerEvents)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(
      and(
        eq(playerEvents.seasonId, seasonId),
        eq(playerEvents.status, "assigned"),
        lt(playerEvents.dueAt, new Date()),
      ),
    )
    .returning({ id: playerEvents.id });
  return rows.length;
}

/** Submissions waiting on a judge — feeds the moderation queue and its badge. */
export async function countPendingEventSubmissions(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playerEvents)
    .where(eq(playerEvents.status, "submitted"));
  return rows[0]?.n ?? 0;
}

export async function listPendingEventSubmissions(): Promise<
  Array<PlayerEventRow & { username: string }>
> {
  const rows = await db
    .select({ row: playerEvents, username: users.username })
    .from(playerEvents)
    .innerJoin(seasonPlayers, eq(seasonPlayers.id, playerEvents.seasonPlayerId))
    .innerJoin(users, eq(users.id, seasonPlayers.playerId))
    .where(eq(playerEvents.status, "submitted"))
    .orderBy(asc(playerEvents.submittedAt));
  return rows.map((r) => ({ ...r.row, username: r.username }));
}

/** Assignments with no deadline, for admin views that filter on it. */
export async function listOpenEventsWithoutDeadline(
  seasonId: string,
): Promise<PlayerEventRow[]> {
  return db
    .select()
    .from(playerEvents)
    .where(
      and(
        eq(playerEvents.seasonId, seasonId),
        eq(playerEvents.status, "assigned"),
        isNull(playerEvents.dueAt),
      ),
    );
}

/**
 * How many seasons have each IEE key in their pool, keyed by item/effect key.
 * Read straight from `seasons.config`, so the catalog browser can show where a
 * hardcoded entry is actually used without a join table.
 */
export async function getIeeUsageByKey(): Promise<Record<string, number>> {
  const rows = await db
    .select({ config: seasons.config })
    .from(seasons);
  const out: Record<string, number> = {};
  for (const row of rows) {
    const cfg = row.config as { iee?: { entries?: Record<string, unknown> } } | null;
    for (const key of Object.keys(cfg?.iee?.entries ?? {})) {
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}

/** Seasons whose pool lists an event template key. */
export async function getEventUsageByKey(): Promise<Record<string, number>> {
  const rows = await db.select({ config: seasons.config }).from(seasons);
  const out: Record<string, number> = {};
  for (const row of rows) {
    const cfg = row.config as { iee?: { events?: string[] } } | null;
    for (const key of cfg?.iee?.events ?? []) {
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}
