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
    const rulesMd = formData.has("rulesMd") ? String(formData.get("rulesMd") ?? "") : undefined;

    // Back-compat: legacy textarea `config` JSON.
    let config: unknown;
    const legacy = formData.get("config");
    const structured = formData.get("structured");
    if (structured === "1") {
      // New beautiful form — build config from individual fields.
      const parseIntOrNull = (key: string): number | null => {
        const v = formData.get(key);
        if (v === null || String(v).trim() === "") return null;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
      };
      const parseIntOr = (key: string, fallback: number): number => {
        const v = formData.get(key);
        if (v === null || String(v).trim() === "") return fallback;
        const n = Number(v);
        return Number.isNaN(n) ? fallback : n;
      };
      const parseBool = (key: string, fallback = false): boolean => {
        const v = formData.get(key);
        if (v === null) return fallback;
        const s = String(v).toLowerCase();
        return s === "true" || s === "1" || s === "on" || s === "yes";
      };
      const parseArray = (key: string): string[] => {
        const raw = formData.get(key);
        if (raw === null) {
          // also support getAll for checkbox groups
          const all = formData.getAll(key);
          if (all.length > 1) return all.map((x) => String(x).trim()).filter(Boolean);
          return [];
        }
        const s = String(raw).trim();
        if (!s) return [];
        // try JSON first
        if (s.startsWith("[") ) {
          try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
          } catch {}
        }
        return s.split(",").map((x) => x.trim()).filter(Boolean);
      };

      const genres = parseArray("genres");
      const platforms = parseArray("platforms");
      const tags = parseArray("tags");
      const esrb = parseArray("esrb");

      config = {
        dice: {
          sides: parseIntOr("dice_sides", 6),
          passDiceCount: parseIntOr("dice_passDiceCount", 1),
          dropDiceCount: parseIntOr("dice_dropDiceCount", 2),
          dropStreakMultiplier: parseBool("dice_dropStreakMultiplier", true),
        },
        points: {
          startingBalance: parseIntOr("points_startingBalance", 0),
          bonusAddsToRollOnPass: parseBool("points_bonusAddsToRollOnPass", true),
          resetBalanceAfterUse: parseBool("points_resetBalanceAfterUse", true),
        },
        board: {
          size: parseIntOr("board_size", 40),
          loop: parseBool("board_loop", false),
          bonusCount: parseIntOr("board_bonusCount", 4),
          penaltyCount: parseIntOr("board_penaltyCount", 4),
          teleportCount: parseIntOr("board_teleportCount", 2),
          eventCount: parseIntOr("board_eventCount", 3),
          distribution: String(formData.get("board_distribution") || "random"),
          regenerateOnSave: parseBool("board_regenerateOnSave", false),
        },
        rerolls: {
          allowed: parseBool("rerolls_allowed", true),
          limitPerGame: parseIntOr("rerolls_limitPerGame", 1),
        },
        gamePool: {
          source: String(formData.get("gamePool_source") || "catalog"),
          provider: String(formData.get("gamePool_provider") || "internal"),
          templateId: (() => {
            const v = formData.get("gamePool_templateId");
            const s = v ? String(v).trim() : "";
            return s ? s : null;
          })(),
          filters: {
            genres,
            platforms,
            tags,
            metacriticMin: parseIntOrNull("filters_metacriticMin"),
            metacriticMax: parseIntOrNull("filters_metacriticMax"),
            ratingMin: (() => {
              const v = formData.get("filters_ratingMin");
              if (v === null || String(v).trim() === "") return null;
              const n = Number(v);
              return Number.isNaN(n) ? null : n;
            })(),
            ratingMax: (() => {
              const v = formData.get("filters_ratingMax");
              if (v === null || String(v).trim() === "") return null;
              const n = Number(v);
              return Number.isNaN(n) ? null : n;
            })(),
            yearMin: parseIntOrNull("filters_yearMin"),
            yearMax: parseIntOrNull("filters_yearMax"),
            esrb,
            players: String(formData.get("filters_players") || "any"),
            onlyWithCover: parseBool("filters_onlyWithCover", false),
            ordering: String(formData.get("filters_ordering") || "-metacritic"),
            searchQuery: (() => {
              const v = formData.get("filters_searchQuery");
              const s = v ? String(v).trim() : "";
              return s ? s : null;
            })(),
          },
          catalog: {
            allowManualAdd: parseBool("catalog_allowManualAdd", true),
            fallbackToCatalog: parseBool("catalog_fallbackToCatalog", true),
          },
          maxCandidates: parseIntOr("gamePool_maxCandidates", 20),
          cacheTtlHours: parseIntOr("gamePool_cacheTtlHours", 24),
          autoFetchOnRoll: parseBool("gamePool_autoFetchOnRoll", false),
        },
      };
    } else if (legacy !== null && String(legacy).trim() !== "") {
      const configRaw = String(legacy || "{}");
      try {
        config = JSON.parse(configRaw);
      } catch {
        return { error: errorText((await getT()).t.core.errors, "formConfigInvalidJson") };
      }
    } else {
      return { error: errorText((await getT()).t.core.errors, "formUnknown") };
    }

    await updateSeasonSettings({ seasonId, config, rulesMd });
    revalidateAdmin(seasonId);
    revalidatePath("/rules");
    revalidatePath("/board");
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
    const tags = String(formData.get("tags") || "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
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

export type ExternalSearchState = { error?: string; results?: Array<{ title: string; genres: string[]; coverUrl: string | null; platform: string | null; externalId: string; provider: string; metacritic: number | null; rating: number | null }> };

export async function searchExternalGamesAction(
  _prev: ExternalSearchState,
  formData: FormData,
): Promise<ExternalSearchState> {
  try {
    const providerId = String(formData.get("provider") || "rawg");
    const query = String(formData.get("query") || "").trim();
    const genre = String(formData.get("genre") || "").trim();
    const platform = String(formData.get("platform") || "").trim();
    const ordering = String(formData.get("ordering") || "-metacritic");
    const { getProvider } = await import("@/lib/game-providers");
    const provider = getProvider(providerId);
    const filters: import("@/game-engine/types").GamePoolFilters = {
      genres: genre ? [genre] : [],
      platforms: platform ? [platform] : [],
      tags: [],
      metacriticMin: null,
      metacriticMax: null,
      ratingMin: null,
      ratingMax: null,
      yearMin: null,
      yearMax: null,
      esrb: [],
      players: "any",
      onlyWithCover: false,
      ordering,
      searchQuery: query || null,
    };
    const results = await provider.search({ filters, pageSize: 12 });
    return {
      results: results.map((r) => ({
        title: r.title,
        genres: r.genres,
        coverUrl: r.coverUrl,
        platform: r.platforms[0] ?? null,
        externalId: r.externalId,
        provider: providerId,
        metacritic: r.metacritic,
        rating: r.rating,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Search failed" };
  }
}

export async function importExternalGameAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const title = String(formData.get("title") || "").trim();
    if (!title) return { error: "Title required" };
    const provider = String(formData.get("provider") || "rawg");
    const externalId = String(formData.get("externalId") || "").trim();
    const genres = String(formData.get("genres") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const platform = String(formData.get("platform") || "") || null;
    const coverUrl = String(formData.get("coverUrl") || "") || null;
    const metacritic = formData.get("metacritic") ? Number(formData.get("metacritic")) : null;
    const rating = formData.get("rating") ? Number(formData.get("rating")) : null;
    await addCatalogGame({
      title,
      genres,
      platform,
      coverUrl,
      metacritic,
      rating,
      externalSource: provider,
      externalRawId: externalId || null,
    });
    revalidatePath("/admin/games-catalog");
    return { ok: format((await getT()).t.admin.feedback.gameAdded, { title }) };
  } catch (e) {
    return await toError(e);
  }
}

/** Direct form action variant (single-arg) for plain <form action={}> usage. */
export async function importExternalGameDirectAction(formData: FormData): Promise<void> {
  await importExternalGameAction({} as never, formData);
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