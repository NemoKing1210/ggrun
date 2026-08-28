import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { adminAuditLog, eventLog, users } from "@/db/schema";
import type { AdminAuditLog } from "@/db/schema";
import { log } from "@/lib/infrastructure/logger";

export type EventType =
  | "game_rolled"
  | "game_passed"
  | "game_dropped"
  | "game_rerolled"
  | "moved"
  | "season_started"
  | "player_joined"
  | "player_left"
  | "admin_adjustment"
  | "season_reset";
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
}

export type AuditPeriod = "24h" | "7d" | "30d" | "all";

/** Hours per preset for the audit time range (null = no time filter). */
export const AUDIT_PERIOD_HOURS: Record<Exclude<AuditPeriod, "all">, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

/** One audit row: the entry itself plus the actor's username (join). */
export type AdminAuditRow = {
  entry: AdminAuditLog;
  username: string;
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
    .select({ entry: adminAuditLog, username: users.username })
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
  await db.insert(adminAuditLog).values({
    actorId: entry.actorId,
    actionType: entry.actionType,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    payload: entry.payload ?? {},
  });
}
