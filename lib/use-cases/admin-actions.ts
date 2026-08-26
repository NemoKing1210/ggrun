"use server";

import { revalidatePath } from "next/cache";

import {
  adminAddPlayer,
  adminAdjustPlayer,
  changeSeasonStatus,
  createSeason,
  setBoardCell,
  updateSeasonSettings,
  AdminError,
} from "@/lib/use-cases/admin";
import { addCatalogGame, deleteCatalogGame, setGameBlacklisted } from "@/lib/repositories/games.repo";

export type AdminFormState = { error?: string; ok?: string };

function toError(e: unknown): AdminFormState {
  if (e instanceof AdminError) return { error: e.message };
  if (e instanceof Error) return { error: e.message };
  return { error: "Неизвестная ошибка" };
}

function revalidateAdmin(seasonId?: string): void {
  revalidatePath("/admin");
  if (seasonId) revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function createSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const id = await createSeason({
      title: formData.get("title"),
      slug: formData.get("slug"),
      cloneBoardFromSeasonId:
        String(formData.get("cloneFrom") || "") || undefined,
    });
    revalidateAdmin();
    return { ok: `Сезон создан (${id})` };
  } catch (e) {
    return toError(e);
  }
}

export async function changeStatusAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const seasonId = String(formData.get("seasonId"));
    const newStatus = String(formData.get("status")) as
      | "draft"
      | "active"
      | "paused"
      | "finished"
      | "archived";
    await changeSeasonStatus(seasonId, newStatus);
    revalidateAdmin(seasonId);
    return { ok: `Статус изменён на ${newStatus}` };
  } catch (e) {
    return toError(e);
  }
}

export async function updateSeasonSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const seasonId = String(formData.get("seasonId"));
    const configRaw = String(formData.get("config") || "{}");
    const rulesMd = String(formData.get("rulesMd") ?? "");
    let config: unknown;
    try {
      config = JSON.parse(configRaw);
    } catch {
      return { error: "config — некорректный JSON" };
    }
    await updateSeasonSettings({ seasonId, config, rulesMd });
    revalidateAdmin(seasonId);
    revalidatePath("/rules");
    return { ok: "Настройки сохранены" };
  } catch (e) {
    return toError(e);
  }
}

export async function setBoardCellAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const boardId = String(formData.get("boardId"));
    const position = Number(formData.get("position"));
    const cellType = String(formData.get("cellType")) as never;
    const label = String(formData.get("label") || "") || null;
    const amountRaw = formData.get("amount");
    const config =
      amountRaw !== null && String(amountRaw) !== ""
        ? { amount: Number(amountRaw) }
        : {};
    await setBoardCell({ boardId, position, cellType, label, config });
    revalidateAdmin(String(formData.get("seasonId") || ""));
    revalidatePath("/board");
    return { ok: `Клетка ${position} обновлена` };
  } catch (e) {
    return toError(e);
  }
}

export async function addPlayerToSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const seasonId = String(formData.get("seasonId"));
    await adminAddPlayer(seasonId, String(formData.get("userId")));
    revalidateAdmin(seasonId);
    return { ok: "Участник добавлен" };
  } catch (e) {
    return toError(e);
  }
}

export async function adjustPlayerAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const seasonPlayerId = String(formData.get("seasonPlayerId"));
    const seasonId = String(formData.get("seasonId"));
    const position = formData.get("position");
    const balancePoints = formData.get("balancePoints");
    const status = formData.get("status");
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
    revalidateAdmin(seasonId);
    return { ok: "Корректировка применена" };
  } catch (e) {
    return toError(e);
  }
}

// --- Каталог игр -----------------------------------------------------------

export async function addCatalogGameAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const title = String(formData.get("title") || "").trim();
    if (!title) return { error: "Укажите название игры" };
    const genres = String(formData.get("genres") || "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    await addCatalogGame({
      title,
      platform: String(formData.get("platform") || "") || null,
      coverUrl: String(formData.get("coverUrl") || "") || null,
      genres,
    });
    revalidatePath("/admin/games-catalog");
    return { ok: `Игра «${title}» добавлена` };
  } catch (e) {
    return toError(e);
  }
}

export async function toggleBlacklistAction(formData: FormData): Promise<void> {
  const gameId = String(formData.get("gameId"));
  const blacklisted = String(formData.get("blacklisted")) === "true";
  await setGameBlacklisted(gameId, blacklisted);
  revalidatePath("/admin/games-catalog");
}

export async function deleteGameAction(formData: FormData): Promise<void> {
  await deleteCatalogGame(String(formData.get("gameId")));
  revalidatePath("/admin/games-catalog");
}
