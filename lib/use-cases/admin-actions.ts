"use server";

import { revalidatePath } from "next/cache";

import {
  adminAddPlayer,
  adminAdjustPlayer,
  changeSeasonStatus,
  createSeason,
  resetSeason,
  setBoardCell,
  updateSeasonSettings,
  AdminError,
} from "@/lib/use-cases/admin";
import {
  approveRerollRequest,
  rejectRerollRequest,
} from "@/lib/use-cases/resolve-game-roll";
import {
  addCatalogGame,
  bulkDeleteGames,
  bulkSetGamesBlacklisted,
  deleteCatalogGame,
  setGameBlacklisted,
} from "@/lib/repositories/games.repo";
import { getCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { format } from "@/lib/i18n/format";
import { log } from "@/lib/log";
import {
  makeToError,
  type ActionState,
} from "@/lib/use-cases/action-error";

export type AdminFormState = ActionState;
export type ExternalSearchState = ActionState & {
  results?: Array<{
    title: string;
    genres: string[];
    coverUrl: string | null;
    platform: string | null;
    externalId: string;
    provider: string;
    metacritic: number | null;
    rating: number | null;
    description?: string | null;
    playtimeHours?: number | null;
    stores?: Array<{ store: string; url: string }> | null;
    website?: string | null;
  }>;
};

export type UrlImportState = ActionState & {
  game?: {
    title: string;
    coverUrl: string | null;
    description: string | null;
    platform: string | null;
    genres: string[];
    tags: string[];
    metacritic: number | null;
    rating: number | null;
    website: string | null;
    stores: Array<{ store: string; url: string }>;
    detectedProvider: string;
    sourceUrl: string;
    externalId?: string;
  };
};

const toError = makeToError(AdminError);

function revalidateAdmin(seasonId?: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/seasons");
  if (seasonId) revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function createSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  try {
    const id = await createSeason({
      title: formData.get("title"),
      slug: formData.get("slug"),
      cloneBoardFromSeasonId:
        String(formData.get("cloneFrom") || "") || undefined,
    });
    log.info("season.create", { actorId: actor?.id ?? null, seasonId: id });
    revalidateAdmin();
    return { ok: format((await getT()).t.admin.feedback.seasonCreated, { id }) };
  } catch (e) {
    return await toError(e, "season.create", { actorId: actor?.id ?? null });
  }
}

export async function changeStatusAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  const newStatus = String(formData.get("status")) as
    | "draft"
    | "active"
    | "paused"
    | "finished"
    | "archived";
  try {
    await changeSeasonStatus(seasonId, newStatus);
    log.info("season.status_change", {
      actorId: actor?.id ?? null,
      seasonId,
      newStatus,
    });
    revalidateAdmin(seasonId);
    return {
      ok: format((await getT()).t.admin.feedback.statusChanged, { status: newStatus }),
    };
  } catch (e) {
    return await toError(e, "season.status_change", {
      actorId: actor?.id ?? null,
      seasonId,
      newStatus,
    });
  }
}

export async function resetSeasonAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  try {
    await resetSeason(seasonId);
    log.info("season.reset", { actorId: actor?.id ?? null, seasonId });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath("/feed");
    return { ok: (await getT()).t.admin.feedback.seasonReset ?? "Season reset" };
  } catch (e) {
    return await toError(e, "season.reset", { actorId: actor?.id ?? null, seasonId });
  }
}

export async function resetSeasonDirectAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  await resetSeason(seasonId);
  log.info("season.reset", { actorId: actor?.id ?? null, seasonId });
  revalidateAdmin(seasonId);
  revalidatePath("/board");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/feed");
}

export async function updateSeasonSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const seasonId = String(formData.get("seasonId"));
  const rawRulesMode = String(formData.get("rulesMode") ?? "auto").toLowerCase();
  const rulesMode: "auto" | "manual" = rawRulesMode === "manual" ? "manual" : "auto";
  const rulesMdRaw = formData.has("rulesMd") ? String(formData.get("rulesMd") ?? "") : undefined;
  // When auto, keep stored rulesMd untouched (ignore textarea payload) — generated view is used.
  const rulesMd = rulesMode === "manual" ? rulesMdRaw : undefined;

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
      if (s.startsWith("[")) {
        try {
          const arr = JSON.parse(s);
          if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
        } catch {
          /* fall through to CSV */
        }
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
        requireApproval: parseBool("rerolls_requireApproval", true),
      },
      moderation: {
        completionRequireApproval: parseBool("moderation_completionRequireApproval", false),
      },
      rules: {
        mode: rulesMode,
      },
      gamePool: {
        source: (() => {
          const s = String(formData.get("gamePool_source") || "catalog").toLowerCase();
          return s === "catalog" || s === "api" || s === "hybrid" ? s : "catalog";
        })(),
        provider: (() => {
          const raw = String(formData.get("gamePool_provider") || "internal").toLowerCase();
          const src = String(formData.get("gamePool_source") || "catalog").toLowerCase();
          // reliability: catalog mode always uses internal (no external calls)
          if (src === "catalog") return "internal";
          return raw === "rawg" || raw === "igdb" || raw === "steam" || raw === "internal" ? raw : "internal";
        })(),
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
      const debug =
        process.env.NODE_ENV === "development"
          ? `JSON.parse failed: ${configRaw.slice(0, 200)}`
          : undefined;
      return {
        error: errorText((await getT()).t.core.errors, "formConfigInvalidJson"),
        debug,
      };
    }
  } else {
    return { error: errorText((await getT()).t.core.errors, "formUnknown") };
  }

  try {
    await updateSeasonSettings({ seasonId, config, rulesMd });
    log.info("season.settings.update", { actorId: actor?.id ?? null, seasonId });
    revalidateAdmin(seasonId);
    revalidatePath("/rules");
    revalidatePath("/board");
    return { ok: (await getT()).t.admin.feedback.settingsSaved };
  } catch (e) {
    return await toError(e, "season.settings.update", {
      actorId: actor?.id ?? null,
      seasonId,
    });
  }
}

export async function setBoardCellAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const boardId = String(formData.get("boardId"));
  const seasonId = String(formData.get("seasonId") || "");
  const position = Number(formData.get("position"));
  const cellType = String(formData.get("cellType")) as never;
  const label = String(formData.get("label") || "") || null;
  const amountRaw = formData.get("amount");
  const config =
    amountRaw !== null && String(amountRaw) !== ""
      ? { amount: Number(amountRaw) }
      : {};
  try {
    await setBoardCell({ boardId, position, cellType, label, config });
    log.info("board.cell_set", {
      actorId: actor?.id ?? null,
      seasonId,
      boardId,
      position,
      cellType,
    });
    revalidateAdmin(seasonId);
    revalidatePath("/board");
    return {
      ok: format((await getT()).t.admin.feedback.cellSaved, { position }),
    };
  } catch (e) {
    return await toError(e, "board.cell_set", {
      actorId: actor?.id ?? null,
      seasonId,
      position,
    });
  }
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

export async function searchExternalGamesAction(
  _prev: ExternalSearchState,
  formData: FormData,
): Promise<ExternalSearchState> {
  const actor = await getCurrentUser();
  const providerId = String(formData.get("provider") || "rawg");
  const query = String(formData.get("query") || "").trim();
  const genre = String(formData.get("genre") || "").trim();
  const platform = String(formData.get("platform") || "").trim();
  const ordering = String(formData.get("ordering") || "-metacritic");
  try {
    const { isProviderConfiguredAsync } = await import("@/lib/game-providers/keys");
    const configured = await isProviderConfiguredAsync(providerId);
    if (!configured) {
      const { t } = await getT();
      const msg = (t.admin.catalog as unknown as Record<string, string>).providerNotConfigured ?? `Provider "${providerId}" is not configured. Add its API key in Settings → Integrations or .env.`;
      return { error: msg };
    }
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
    log.debug("catalog.external_search", {
      actorId: actor?.id ?? null,
      provider: providerId,
      query,
      count: results.length,
    });
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
        description: r.description ?? null,
        playtimeHours: r.playtimeHours ?? null,
        stores: (r.stores ?? [])
          .filter((s) => s.url)
          .map((s) => ({ store: s.store, url: s.url as string })),
        website: r.website ?? null,
      })),
    };
  } catch (e) {
    log.error("catalog.external_search", {
      actorId: actor?.id ?? null,
      provider: providerId,
      query,
      err: e,
    });
    return await toError(e, "catalog.external_search", {
      actorId: actor?.id ?? null,
      provider: providerId,
    });
  }
}

export async function importExternalGameAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) {
    return {
      error: errorText((await getT()).t.core.errors, "formTitleRequired"),
    };
  }
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
  try {
    await addCatalogGame({
      title,
      genres,
      platform,
      coverUrl,
      metacritic,
      rating,
      externalSource: provider,
      externalRawId: externalId || null,
      description: String(formData.get("description") || "") || null,
      playtimeHours: (() => {
        const v = formData.get("playtimeHours");
        if (v === null || String(v).trim() === "") return null;
        const n = Number(v);
        return Number.isNaN(n) ? null : n;
      })(),
      stores: (() => {
        const raw = formData.get("stores");
        if (!raw || String(raw).trim() === "") return [];
        try {
          const arr = JSON.parse(String(raw));
          return Array.isArray(arr)
            ? arr.filter((s) => s && typeof s === "object" && s.store && s.url)
            : [];
        } catch {
          return [];
        }
      })(),
      website: String(formData.get("website") || "") || null,
    });
    log.info("catalog.game_import", {
      actorId: actor?.id ?? null,
      title,
      provider,
    });
    revalidatePath("/admin/games");
    revalidatePath("/admin/games-catalog");
    return { ok: format((await getT()).t.admin.feedback.gameAdded, { title }) };
  } catch (e) {
    return await toError(e, "catalog.game_import", {
      actorId: actor?.id ?? null,
      title,
      provider,
    });
  }
}

/** Direct form action variant (single-arg) for plain <form action={}> usage. */
export async function importExternalGameDirectAction(formData: FormData): Promise<void> {
  await importExternalGameAction({} as never, formData);
}

export async function resolveGameUrlAction(
  _prev: UrlImportState,
  formData: FormData,
): Promise<UrlImportState> {
  const actor = await getCurrentUser();
  const raw = String(formData.get("url") || "").trim();
  if (!raw) return { error: "Paste a link first" };
  try {
    const { resolveGameFromUrl } = await import("@/lib/game-providers/url-import");
    const game = await resolveGameFromUrl(raw);
    log.info("catalog.url_resolve", { actorId: actor?.id ?? null, url: raw, title: game.title });
    return { game };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn("catalog.url_resolve_failed", { actorId: actor?.id ?? null, url: raw, err: msg });
    return { error: msg };
  }
}

export async function importGameFromUrlAction(
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
  const platform = String(formData.get("platform") || "") || null;
  const coverUrl = String(formData.get("coverUrl") || "") || null;
  const description = String(formData.get("description") || "") || null;
  const website = String(formData.get("website") || "") || null;
  const storesRaw = String(formData.get("stores") || "");
  let stores: Array<{ store: string; url: string }> = [];
  if (storesRaw) {
    try {
      const arr = JSON.parse(storesRaw);
      if (Array.isArray(arr)) stores = arr.filter((s) => s && s.store && s.url);
    } catch {
      // single store from sourceUrl
      const src = String(formData.get("sourceUrl") || "");
      if (src) stores = [{ store: platform ?? "Store", url: src }];
    }
  } else {
    const src = String(formData.get("sourceUrl") || "");
    if (src) stores = [{ store: platform ?? "Store", url: src }];
  }
  const detectedProvider = String(formData.get("detectedProvider") || "generic");
  const externalId = String(formData.get("externalId") || "") || null;
  try {
    await addCatalogGame({
      title,
      platform,
      coverUrl,
      genres,
      tags,
      metacritic: formData.get("metacritic") ? Number(formData.get("metacritic")) : null,
      rating: formData.get("rating") ? Number(formData.get("rating")) : null,
      description,
      stores,
      website,
      externalSource: detectedProvider !== "generic" ? detectedProvider : null,
      externalRawId: externalId,
    });
    log.info("catalog.game_import_url", { actorId: actor?.id ?? null, title, platform });
    revalidatePath("/admin/games");
    revalidatePath("/admin/games-catalog");
    return { ok: format((await getT()).t.admin.feedback.gameAdded, { title }) };
  } catch (e) {
    return await toError(e, "catalog.game_import_url", { actorId: actor?.id ?? null, title });
  }
}

// --- Reroll requests -------------------------------------------------------

export async function approveRerollAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  try {
    await approveRerollRequest(requestId);
    log.info("reroll.approve", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "reroll.approve", {
      actorId: actor?.id ?? null,
      requestId,
    });
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
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  if (typeof adminNote !== "string" || !adminNote.trim())
    return { error: "Reason required" };
  try {
    await rejectRerollRequest(requestId, adminNote);
    log.info("reroll.reject", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "reroll.reject", {
      actorId: actor?.id ?? null,
      requestId,
    });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/dashboard");
  return { ok: "rejected" };
}

// --- Completion requests (passed/dropped) ---------------------------------

export async function approveCompletionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  try {
    const { approveCompletionRequest } = await import("@/lib/use-cases/resolve-game-roll");
    await approveCompletionRequest(requestId);
    log.info("completion.approve", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "completion.approve", { actorId: actor?.id ?? null, requestId });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/admin/completions");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  revalidatePath("/feed");
  return { ok: "approved" };
}

export async function rejectCompletionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const actor = await getCurrentUser();
  const requestId = formData.get("requestId");
  const adminNote = formData.get("adminNote");
  if (typeof requestId !== "string" || !requestId) return { error: "Missing request" };
  if (typeof adminNote !== "string" || !adminNote.trim()) return { error: "Reason required" };
  try {
    const { rejectCompletionRequest } = await import("@/lib/use-cases/resolve-game-roll");
    await rejectCompletionRequest(requestId, adminNote);
    log.info("completion.reject", { actorId: actor?.id ?? null, requestId });
  } catch (e) {
    return await toError(e, "completion.reject", { actorId: actor?.id ?? null, requestId });
  }
  revalidatePath("/admin/rerolls");
  revalidatePath("/admin/completions");
  revalidatePath("/dashboard");
  return { ok: "rejected" };
}
