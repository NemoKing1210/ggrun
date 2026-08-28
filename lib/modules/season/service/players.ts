import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { addPlayerToSeason, getSeasonPlayerById, getSeasonPlayerForUser, removePlayerFromSeason, updateSeasonPlayer } from "@/lib/modules/season/repository/players";
import { logAdminAction, logEvent } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";

import { AdminError } from "./errors";

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) throw new AdminError("adminStaffRequired");
  return user;
}

export async function adminAddPlayer(seasonId: string, userId: string): Promise<void> {
  const actor = await requireStaff();
  await addPlayerToSeason(seasonId, userId);
  log.info("season.player_added.persisted", { actorId: actor.id, seasonId, userId });
  await logAdminAction({ actorId: actor.id, actionType: "player_added", targetType: "season_player", payload: { seasonId, userId } });
  await logEvent({ seasonId, eventType: "player_joined", payload: { userId } });
}

export async function adminRemovePlayer(seasonId: string, userId: string): Promise<void> {
  const actor = await requireStaff();
  const sp = await getSeasonPlayerForUser(seasonId, userId);
  if (!sp) throw new AdminError("adminPlayerNotFound");
  await removePlayerFromSeason(seasonId, userId);
  log.info("season.player_removed.persisted", { actorId: actor.id, seasonId, userId });
  await logAdminAction({ actorId: actor.id, actionType: "player_removed", targetType: "season_player", targetId: sp.id, payload: { seasonId, userId } });
  await logEvent({ seasonId, eventType: "player_left", payload: { userId } });
}

export async function adminAdjustPlayer(input: {
  seasonPlayerId: string;
  position?: number;
  balancePoints?: number;
  status?: "active" | "finished" | "eliminated" | "withdrawn";
  reason: string;
}): Promise<void> {
  const actor = await requireStaff();
  const sp = await getSeasonPlayerById(input.seasonPlayerId);
  if (!sp) throw new AdminError("adminPlayerNotFound");
  const patch: Parameters<typeof updateSeasonPlayer>[1] = {};
  if (input.position !== undefined) patch.position = input.position;
  if (input.balancePoints !== undefined) patch.balancePoints = input.balancePoints;
  if (input.status !== undefined) patch.status = input.status;
  await updateSeasonPlayer(sp.id, patch);
  await logAdminAction({ actorId: actor.id, actionType: "player_adjusted", targetType: "season_player", targetId: sp.id, payload: { ...patch, reason: input.reason } });
  log.info("season.player_adjusted.persisted", { actorId: actor.id, seasonId: sp.seasonId, seasonPlayerId: sp.id, patch });
}
