"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { AdminError } from "@/lib/modules/season/service/errors";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";

import { adminRevokeEffect, adminRevokeItem } from "../service/intervene";

const toError = makeToError(AdminError);

/**
 * Every surface that shows what a player is carrying has to forget it.
 *
 * The item and status panels are rendered on the dashboard, the board and both
 * leaderboards; a revoke that leaves a stale badge on any of them is the same
 * lie the lazy-expiry bug produced.
 */
function revalidateEverywhere(seasonId: string): void {
  revalidatePath(`/admin/seasons/${seasonId}/players`);
  revalidatePath("/dashboard");
  revalidatePath("/board");
  revalidatePath("/leaderboard");
  revalidatePath("/feed");
}

export async function revokeItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  const inventoryId = String(formData.get("inventoryId") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  try {
    const { itemKey } = await adminRevokeItem({
      inventoryId,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidateEverywhere(seasonId);
    log.info("iee.item.revoke.action", { actorId: actor?.id ?? null, inventoryId, itemKey });
    return { ok: itemKey };
  } catch (e) {
    return await toError(e, "iee.item.revoke", { actorId: actor?.id ?? null, inventoryId });
  }
}

export async function revokeEffectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  const effectId = String(formData.get("effectId") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  try {
    const { effectKey } = await adminRevokeEffect({
      effectId,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidateEverywhere(seasonId);
    log.info("iee.effect.revoke.action", { actorId: actor?.id ?? null, effectId, effectKey });
    return { ok: effectKey };
  } catch (e) {
    return await toError(e, "iee.effect.revoke", { actorId: actor?.id ?? null, effectId });
  }
}
