"use server";

import { revalidatePath } from "next/cache";

import {
  addCatalogGame,
  bulkDeleteGames,
  bulkSetGamesBlacklisted,
  deleteCatalogGame,
  setGameBlacklisted,
} from "@/lib/modules/catalog/repository";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { format } from "@/lib/i18n/format";
import { log } from "@/lib/infrastructure/logger";

import { toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState } from "@/lib/use-cases/admin/actions/types";

export async function addCatalogGameAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: errorText((await getT()).t.core.errors, "formTitleRequired") };
  const genres = String(formData.get("genres") || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  try {
    await addCatalogGame({
      title,
      platform: String(formData.get("platform") || "") || null,
      coverUrl: String(formData.get("coverUrl") || "") || null,
      genres,
      tags,
      metacritic: formData.get("metacritic") ? Number(formData.get("metacritic")) : null,
      rating: formData.get("rating") ? Number(formData.get("rating")) : null,
      esrb: String(formData.get("esrb") || "") || null,
    });
    log.info("catalog.game_add", { actorId: actor?.id ?? null, title });
    revalidatePath("/admin/games");
    revalidatePath("/admin/games-catalog");
    return {
      ok: format((await getT()).t.admin.feedback.gameAdded, { title }),
    };
  } catch (e) {
    return await toError(e, "catalog.game_add", { actorId: actor?.id ?? null, title });
  }
}

export async function toggleBlacklistAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const gameId = String(formData.get("gameId"));
  const blacklisted = String(formData.get("blacklisted")) === "true";
  try {
    await setGameBlacklisted(gameId, blacklisted);
    log.info("catalog.game_blacklist", {
      actorId: actor?.id ?? null,
      gameId,
      blacklisted,
    });
  } catch (e) {
    log.error("catalog.game_blacklist", {
      actorId: actor?.id ?? null,
      gameId,
      blacklisted,
      err: e,
    });
    throw e;
  }
  revalidatePath("/admin/games");
  revalidatePath("/admin/games-catalog");
}

export async function deleteGameAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const gameId = String(formData.get("gameId"));
  try {
    await deleteCatalogGame(gameId);
    log.info("catalog.game_delete", { actorId: actor?.id ?? null, gameId });
  } catch (e) {
    log.error("catalog.game_delete", {
      actorId: actor?.id ?? null,
      gameId,
      err: e,
    });
    throw e;
  }
  revalidatePath("/admin/games");
  revalidatePath("/admin/games-catalog");
}

export async function bulkSetBlacklistedAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const raw = String(formData.get("ids") ?? "");
  const blacklisted = String(formData.get("blacklisted")) === "true";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await bulkSetGamesBlacklisted(ids, blacklisted);
    log.info("catalog.bulk_blacklist", { actorId: actor?.id ?? null, count: ids.length, blacklisted });
  } catch (e) {
    log.error("catalog.bulk_blacklist", { actorId: actor?.id ?? null, err: e });
    throw e;
  }
  revalidatePath("/admin/games");
  revalidatePath("/admin/games-catalog");
}

export async function bulkDeleteGamesAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const raw = String(formData.get("ids") ?? "");
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await bulkDeleteGames(ids);
    log.info("catalog.bulk_delete", { actorId: actor?.id ?? null, count: ids.length });
  } catch (e) {
    log.error("catalog.bulk_delete", { actorId: actor?.id ?? null, err: e });
    throw e;
  }
  revalidatePath("/admin/games");
  revalidatePath("/admin/games-catalog");
}

