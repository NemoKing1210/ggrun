"use server";

import { revalidatePath } from "next/cache";

import { addCatalogGame } from "@/lib/modules/catalog/repository";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/errors";
import { format } from "@/lib/i18n/format";
import { log } from "@/lib/infrastructure/logger";

import { toError } from "@/lib/use-cases/admin/actions/helpers";
import type { AdminFormState, ExternalSearchState, UrlImportState } from "@/lib/use-cases/admin/actions/types";

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
    const { isProviderConfiguredAsync } = await import("@/lib/modules/catalog/providers/keys");
    const configured = await isProviderConfiguredAsync(providerId);
    if (!configured) {
      const { t } = await getT();
      const msg = (t.admin.catalog as unknown as Record<string, string>).providerNotConfigured ?? `Provider "${providerId}" is not configured. Add its API key in Settings → Integrations or .env.`;
      return { error: msg };
    }
    const { getProvider } = await import("@/lib/modules/catalog/providers");
    const provider = getProvider(providerId);
    const filters: import("@/lib/engine/types").GamePoolFilters = {
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
    const { resolveGameFromUrl } = await import("@/lib/modules/catalog/providers/url-import");
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

