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
import {
  approveRerollRequest,
  rejectRerollRequest,
} from "@/lib/use-cases/resolve-game-roll";
import { addCatalogGame, deleteCatalogGame, setGameBlacklisted } from "@/lib/repositories/games.repo";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { format } from "@/lib/i18n/format";

export type AdminFormState = { error?: string; ok?: string };

async function toError(e: unknown): Promise<AdminFormState> {
  const { t } = await getT();
  if (e instanceof AdminError) {
    return { error: errorText(t.core.errors, e.code, e.params) };
  }
  if (e instanceof Error) return { error: errorText(t.core.errors, e.message) };
  return { error: errorText(t.core.errors, "formUnknown") };
}

function revalidateAdmin(seasonId?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/seasons");
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
    return { ok: format((await getT()).t.admin.feedback.seasonCreated, { id }) };
  } catch (e) {
    return await toError(e);
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
    return {
      ok: format((await getT()).t.admin.feedback.statusChanged, { status: newStatus }),
    };
  } catch (e) {
    return await toError(e);
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
      return { error: errorText((await getT()).t.core.errors, "formConfigInvalidJson") };
    }
    await updateSeasonSettings({ seasonId, config, rulesMd });
    revalidateAdmin(seasonId);
    revalidatePath("/rules");
    return { ok: (await getT()).t.admin.feedback.settingsSaved };
  } catch (e) {
    return await toError(e);
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
    return {
      ok: format((await getT()).t.admin.feedback.cellSaved, { position }),
    };
  } catch (e) {
    return await toError(e);
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
    return { ok: (await getT()).t.admin.feedback.playerAdded };
  } catch (e) {
    return await toError(e);
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
    return { ok: (await getT()).t.admin.feedback.adjustmentApplied };
  } catch (e) {
    return await toError(e);
  }
}

// --- Games catalog ---------------------------------------------------------

export async function addCatalogGameAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const title = String(formData.get("title") || "").trim();
    if (!title) return { error: errorText((await getT()).t.core.errors, "formTitleRequired") };
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
    return {
      ok: format((await getT()).t.admin.feedback.gameAdded, { title }),
    };
  } catch (e) {
    return await toError(e);
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


// --- Reroll requests -------------------------------------------------------

export async function approveRerollAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  try {
    await approveRerollRequest(requestId);
  } catch (e) {
    return await toError(e);
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  return { ok: "approved" };
}

export async function rejectRerollAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  if (typeof adminNote !== "string" || !adminNote.trim()) return { error: "Reason required" };
  try {
    await rejectRerollRequest(requestId, adminNote);
  } catch (e) {
    return await toError(e);
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/dashboard");
  return { ok: "rejected" };
}