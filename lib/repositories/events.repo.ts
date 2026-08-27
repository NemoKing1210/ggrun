import { db } from "@/lib/db";
import { adminAuditLog, eventLog } from "@/db/schema";
import { log } from "@/lib/log";

export type EventType =
  | "game_rolled"
  | "game_passed"
  | "game_dropped"
  | "game_rerolled"
  | "moved"
  | "season_started"
  | "player_joined"
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
