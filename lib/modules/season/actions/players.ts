"use server";

import { adminAddPlayer, adminAdjustPlayer, adminRemovePlayer } from "@/lib/modules/season/service";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { log } from "@/lib/infrastructure/logger";

import { revalidateAdmin, toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

type PlayerStatus = "active" | "finished" | "eliminated" | "withdrawn";

function adjustFields(formData: FormData) {
  return {
    seasonPlayerId: String(formData.get("seasonPlayerId")),
    seasonId: String(formData.get("seasonId")),
    position: formData.get("position"),
    balancePoints: formData.get("balancePoints"),
    status: formData.get("status"),
    reason: String(formData.get("reason") || ""),
  };
}

/** Shared adjust logic for both the useActionState and the plain form action. */
async function runAdjust(formData: FormData): Promise<string> {
  const actor = await getCurrentUser();
  const { seasonPlayerId, seasonId, position, balancePoints, status, reason } =
    adjustFields(formData);
  await adminAdjustPlayer({
    seasonPlayerId,
    reason,
    ...(String(position || "") !== "" ? { position: Number(position) } : {}),
    ...(String(balancePoints || "") !== ""
      ? { balancePoints: Number(balancePoints) }
      : {}),
    ...(String(status || "") !== ""
      ? { status: String(status) as PlayerStatus }
      : {}),
  });
  log.info("season.adjust_player", {
    actorId: actor?.id ?? null,
    seasonId,
    seasonPlayerId,
  });
  return seasonId;
}

export async function addPlayerToSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  const userId = String(formData.get("userId"));
  try {
    await adminAddPlayer(seasonId, userId);
    log.info("season.add_player", { actorId: actor?.id ?? null, seasonId, userId });
    revalidateAdmin(seasonId);
    return { ok: (await getT()).t.admin.feedback.playerAdded };
  } catch (e) {
    return await toError(e, "season.add_player", {
      actorId: actor?.id ?? null,
      seasonId,
      userId,
    });
  }
}

export async function adjustPlayerAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const seasonId = await runAdjust(formData);
    revalidateAdmin(seasonId);
    return { ok: (await getT()).t.admin.feedback.adjustmentApplied };
  } catch (e) {
    const { seasonId, seasonPlayerId } = adjustFields(formData);
    return await toError(e, "season.adjust_player", {
      actorId: (await getCurrentUser())?.id ?? null,
      seasonId,
      seasonPlayerId,
    });
  }
}

/** Plain <form action> variant used by the roster table rows. */
export async function submitAdjustPlayerAction(formData: FormData): Promise<void> {
  try {
    const seasonId = await runAdjust(formData);
    revalidateAdmin(seasonId);
  } catch (e) {
    const { seasonId, seasonPlayerId } = adjustFields(formData);
    log.error("season.adjust_player", {
      actorId: (await getCurrentUser())?.id ?? null,
      seasonId,
      seasonPlayerId,
      err: e,
    });
    throw e;
  }
}

export async function removePlayerFromSeasonAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  const playerId = String(formData.get("playerId"));
  try {
    await adminRemovePlayer(seasonId, playerId);
    log.info("season.remove_player", { actorId: actor?.id ?? null, seasonId, playerId });
  } catch (e) {
    log.error("season.remove_player", {
      actorId: actor?.id ?? null,
      seasonId,
      playerId,
      err: e,
    });
    throw e;
  }
  revalidateAdmin(seasonId);
}

// --- Games catalog ---------------------------------------------------------