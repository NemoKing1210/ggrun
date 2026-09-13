import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { adminAuditLog, eventLog, seasonPlayers, users } from "@/db/schema";
import type { AdminAuditLog } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";
import { publish } from "@/lib/realtime/bus";
import { AUDIT_ROOM, seasonRoom } from "@/lib/realtime/protocol";
import type { FiltrableEventType } from "@/lib/engine/feed/filters";

export type EventType =
  | "game_rolled"
  | "game_passed"
  | "game_dropped"
  | "game_rerolled"
  | "moved"
  | "season_started"
  | "player_joined"
  | "player_left"
  | "player_finished"
  | "admin_adjustment"
  | "season_reset"
  // --- items / effects / events ---
  | "item_granted"
  | "item_used"
  | "item_expired"
  | "item_revoked"
  | "effect_applied"
  | "effect_expired"
  | "effect_cleansed"
  | "effect_revoked"
  | "event_assigned"
  | "event_submitted"
  | "event_approved"
  | "event_rejected"
  // --- moderation of a pass/drop request ---
  // These three are written by direct `db.insert(eventLog)` calls in
  // lib/modules/game, so the union never had to list them. It should: they
  // are event types, they reach the public feed, and leaving them out let the
  // check below pass while two of them had no filter tab.
  | "completion_requested"
  | "completion_approved"
  | "completion_rejected";

/**
 * Every event type must belong to a feed filter tab.
 *
 * `AGENTS.md` §10 used to warn that new types "render under All until a filter
 * is added" — an instruction nobody reads at the moment they add a type. This
 * turns it into a compile error that names the offender: add the type to
 * FEED_FILTER_TYPES and the error goes away.
 */
type UnfiltrableEventType = Exclude<EventType, FiltrableEventType>;
const _everyEventTypeHasATab: UnfiltrableEventType extends never
  ? true
  : ["event types with no feed filter tab:", UnfiltrableEventType] = true;
void _everyEventTypeHasATab;
export async function logEvent(entry: {
  seasonId: string;
  seasonPlayerId?: string | null;
  eventType: EventType;
  payload?: Record<string, unknown>;
}): Promise<void> {
  log.debug("event.log.write", {
    seasonId: entry.seasonId,
    seasonPlayerId: entry.seasonPlayerId ?? null,
    eventType: entry.eventType,
  });
  await db.insert(eventLog).values({
    seasonId: entry.seasonId,
    seasonPlayerId: entry.seasonPlayerId ?? null,
    eventType: entry.eventType,
    payload: entry.payload ?? {},
  });
  // Live mirror for `season:<id>` subscribers (board activity feeds). The
  // payload reuses the input — no re-read, so this stays correct inside the
  // caller's transaction. Best-effort: never breaks the write it announces.
  try {
    let username: string | null = null;
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    if (entry.seasonPlayerId) {
      const [row] = await db
        .select({
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(seasonPlayers)
        .innerJoin(users, eq(users.id, seasonPlayers.playerId))
        .where(eq(seasonPlayers.id, entry.seasonPlayerId))
        .limit(1);
      username = row?.username ?? null;
      displayName = row?.displayName ?? null;
      avatarUrl = row?.avatarUrl ?? null;
    }
    publish(seasonRoom(entry.seasonId), "board:event", {
      seasonId: entry.seasonId,
      seasonPlayerId: entry.seasonPlayerId ?? null,
      eventType: entry.eventType,
      payload: entry.payload ?? {},
      createdAt: new Date().toISOString(),
      username,
      displayName,
      avatarUrl,
    });
  } catch (error) {
    log.warn("event.log.realtime.failed", {
      seasonId: entry.seasonId,
      eventType: entry.eventType,
      err: error instanceof Error ? error : undefined,
    });
  }
}

export type AuditPeriod = "24h" | "7d" | "30d" | "all";

/** Hours per preset for the audit time range (null = no time filter). */
export const AUDIT_PERIOD_HOURS: Record<Exclude<AuditPeriod, "all">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

/** One audit row: the entry itself plus the actor's username + avatar (join). */
export type AdminAuditRow = {
  entry: AdminAuditLog;
  username: string;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
};

/** Search/filter options for the admin audit log. */
export type AdminAuditFilters = {
  q?: string;
  actionType?: string;
  targetType?: string;
  period?: AuditPeriod;
  page?: number;
  pageSize?: number;
};

export type AdminAuditResult = {
  rows: AdminAuditRow[];
  total: number;
  pages: number;
  /** Distinct action types present in the log, for filter chips/selects. */
  actionTypes: string[];
  /** Distinct target types present in the log, for filter chips/selects. */
  targetTypes: string[];
};

/**
 * Paginated, filterable read of the admin audit log (most recent first).
 * `q` matches the actor username, the target id and the payload text.
 */
export async function searchAdminAudit(
  filters: AdminAuditFilters = {},
): Promise<AdminAuditResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 40));

  const conds = [];
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(
        ilike(users.username, like),
        sql`${adminAuditLog.targetId}::text ilike ${like}`,
        sql`${adminAuditLog.payload}::text ilike ${like}`,
      ),
    );
  }
  if (filters.actionType) conds.push(eq(adminAuditLog.actionType, filters.actionType));
  if (filters.targetType) conds.push(eq(adminAuditLog.targetType, filters.targetType));
  const hours =
    filters.period && filters.period !== "all" ? AUDIT_PERIOD_HOURS[filters.period] : null;
  if (hours) {
    conds.push(gte(adminAuditLog.createdAt, sql`now() - make_interval(hours => ${hours})`));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [{ value: totalRaw }] = await db
    .select({ value: count() })
    .from(adminAuditLog)
    .innerJoin(users, eq(users.id, adminAuditLog.actorId))
    .where(where);
  const total = Number(totalRaw);

  const rows = await db
    .select({ entry: adminAuditLog, username: users.username, avatarUrl: users.avatarUrl, lastSeenAt: users.lastSeenAt })
    .from(adminAuditLog)
    .innerJoin(users, eq(users.id, adminAuditLog.actorId))
    .where(where)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [actionTypes, targetTypes] = await Promise.all([
    db
      .selectDistinct({ value: adminAuditLog.actionType })
      .from(adminAuditLog)
      .orderBy(adminAuditLog.actionType),
    db
      .selectDistinct({ value: adminAuditLog.targetType })
      .from(adminAuditLog)
      .orderBy(adminAuditLog.targetType),
  ]);

  return {
    rows,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    actionTypes: actionTypes.map((r) => r.value),
    targetTypes: targetTypes.map((r) => r.value),
  };
}

export async function logAdminAction(entry: {
  actorId: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  log.debug("event.admin_audit.write", {
    actorId: entry.actorId,
    actionType: entry.actionType,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
  });
  const [inserted] = await db
    .insert(adminAuditLog)
    .values({
      actorId: entry.actorId,
      actionType: entry.actionType,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      payload: entry.payload ?? {},
    })
    .returning();
  // Live mirror for `audit` subscribers (staff-only room, enforced on join).
  // Best-effort: never breaks the audit write it announces.
  if (inserted) {
    try {
      const [actor] = await db
        .select({
          username: users.username,
          avatarUrl: users.avatarUrl,
          lastSeenAt: users.lastSeenAt,
        })
        .from(users)
        .where(eq(users.id, entry.actorId))
        .limit(1);
      publish(AUDIT_ROOM, "audit:created", {
        entry: {
          id: inserted.id,
          actorId: inserted.actorId,
          actionType: inserted.actionType,
          targetType: inserted.targetType,
          targetId: inserted.targetId,
          payload: (inserted.payload ?? {}) as Record<string, unknown>,
          createdAt: inserted.createdAt.toISOString(),
        },
        username: actor?.username ?? "unknown",
        avatarUrl: actor?.avatarUrl ?? null,
        lastSeenAt: actor?.lastSeenAt ? actor.lastSeenAt.toISOString() : null,
      });
    } catch (error) {
      log.warn("event.admin_audit.realtime.failed", {
        actorId: entry.actorId,
        actionType: entry.actionType,
        err: error instanceof Error ? error : undefined,
      });
    }
  }
}
