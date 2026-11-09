"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { activateInventoryItem, GameLoopError, searchPickGames } from "@/lib/modules/game";
import { makeToError, type ActionState } from "@/lib/use-cases/shared/action-error";

const toError = makeToError(GameLoopError);

export async function useItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  const inventoryId = String(formData.get("inventoryId") ?? "");
  const targetRaw = String(formData.get("targetSeasonPlayerId") ?? "").trim();
  const choiceRaw = String(formData.get("choiceInstanceId") ?? "").trim();
  const chosenRaw = String(formData.get("chosenEntryId") ?? "").trim();
  // What the item asks to pick for the next game (wave C, spec §6.16), or the cell it stands on (wave D,
  // §6.18): only the fields the form sent.
  const picked = Object.fromEntries(
    (["pickedGenre", "pickedYears", "pickedGameId", "pickedCell"] as const)
      .map((field) => [field, String(formData.get(field) ?? "").trim()] as const)
      .filter(([, value]) => value !== ""),
  ) as { pickedGenre?: string; pickedYears?: string; pickedGameId?: string; pickedCell?: string };
  try {
    const used = await activateInventoryItem({
      inventoryId,
      targetSeasonPlayerId: targetRaw || null,
      ...(choiceRaw ? { choiceInstanceId: choiceRaw } : {}),
      ...(chosenRaw ? { chosenEntryId: chosenRaw } : {}),
      ...picked,
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

/**
 * The games an item that asks for a game may pick, by title (wave C, spec
 * §6.16) — what the dashboard's picker shows as the player types. A refusal
 * reads as no games: the use itself says why when it is made.
 */
export async function pickGamesAction(inventoryId: string, query: string): Promise<{ id: string; title: string }[]> {
  try {
    return await searchPickGames(String(inventoryId), String(query ?? ""));
  } catch (e) {
    log.debug("iee.item.pick_games.refused", { inventoryId, err: e instanceof Error ? e : undefined });
    return [];
  }
}
