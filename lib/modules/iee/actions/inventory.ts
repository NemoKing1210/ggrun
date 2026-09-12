"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { activateInventoryItem, GameLoopError } from "@/lib/modules/game";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";

const toError = makeToError(GameLoopError);

export async function useItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  const inventoryId = String(formData.get("inventoryId") ?? "");
  const targetRaw = String(formData.get("targetSeasonPlayerId") ?? "").trim();
  try {
    const used = await activateInventoryItem({
      inventoryId,
      targetSeasonPlayerId: targetRaw || null,
    });
    revalidatePath("/dashboard");
    revalidatePath("/feed");
    revalidatePath("/board");
    log.info("iee.item.use.action", {
      actorId: actor?.id ?? null,
      inventoryId,
      itemKey: used.itemKey,
    });
    return { ok: used.itemKey };
  } catch (e) {
    return await toError(e, "iee.item.use", {
      actorId: actor?.id ?? null,
      inventoryId,
    });
  }
}
