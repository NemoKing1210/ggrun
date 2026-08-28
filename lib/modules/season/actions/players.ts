"use server";

import { adminAddPlayer, adminAdjustPlayer } from "@/lib/modules/season/service";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { log } from "@/lib/infrastructure/logger";

import { revalidateAdmin, toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

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
  const actor = await getCurrentUser();
  const seasonPlayerId = String(formData.get("seasonPlayerId"));
  const seasonId = String(formData.get("seasonId"));
  const position = formData.get("position");
  const balancePoints = formData.get("balancePoints");
  const status = formData.get("status");
  try {
    await adminAdjustPlayer({
      seasonPlayerId,
      reason: String(formData.get("reason") || ""),
      ...(String(position || "") !== "" ? { position: Number(position) } : {}),
      ...(String(balancePoints || "") !== ""
        ? { balancePoints: Number(balancePoints) }
        : {}),
      ...(String(status || "") !== ""
        ? { status: String(status) as "active" | "finished" | "eliminated" | "withdrawn" }
        : {}),
    });
    log.info("season.adjust_player", {
      actorId: actor?.id ?? null,
      seasonId,
      seasonPlayerId,
    });
    revalidateAdmin(seasonId);
    return { ok: (await getT()).t.admin.feedback.adjustmentApplied };
  } catch (e) {
    return await toError(e, "season.adjust_player", {
      actorId: actor?.id ?? null,
      seasonId,
      seasonPlayerId,
    });
  }
}

// --- Games catalog ---------------------------------------------------------

