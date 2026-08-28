import { and, desc, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { gameRolls } from "@/db/schema";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { DEFAULT_SEASON_CONFIG, SeasonConfigSchema, type SeasonConfig } from "@/lib/engine";

import { GameLoopError } from "./errors";

export function parseSeasonConfig(raw: unknown): SeasonConfig {
  const parsed = SeasonConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SEASON_CONFIG;
}

export async function assertActorAllowed(seasonPlayerId: string, playerId: string): Promise<void> {
  const actor = await getCurrentUser();
  if (actor && actor.id === playerId) return;
  if (actor && isStaff(actor)) return;
  throw new GameLoopError("gameNotAllowed");
}

export async function requireStaffActor() {
  const actor = await getCurrentUser();
  if (!actor || !isStaff(actor)) throw new GameLoopError("adminStaffRequired");
  return actor;
}

export async function getOpenRollRow(seasonPlayerId: string) {
  const rows = await db
    .select()
    .from(gameRolls)
    .where(and(eq(gameRolls.seasonPlayerId, seasonPlayerId), or(eq(gameRolls.status, "rolled"), eq(gameRolls.status, "in_progress")), isNull(gameRolls.resolvedAt)))
    .orderBy(desc(gameRolls.rolledAt))
    .limit(1);
  return rows[0] ?? null;
}
