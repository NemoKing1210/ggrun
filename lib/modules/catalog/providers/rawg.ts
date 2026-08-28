import type { ExternalGame, GameProvider, ProviderSearchParams } from "./provider";
import { PLATFORMS } from "@/lib/modules/catalog/pool/constants";
import { getEffectiveProviderKeys } from "./keys";
import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";

const RAWG_BASE = "https://api.rawg.io/api";

async function buildQuery(filters: ProviderSearchParams["filters"], pageSize: number, page: number): Promise<string> {
  const p = new URLSearchParams();
  const { rawgApiKey } = await getEffectiveProviderKeys();
  if (rawgApiKey) p.set("key", rawgApiKey);
  p.set("page_size", String(pageSize));
  p.set("page", String(page));
  if (filters.genres.length) p.set("genres", filters.genres.join(","));
  if (filters.platforms.length) {
    const ids = filters.platforms
      .map((v) => PLATFORMS.find((pl) => pl.value === v)?.rawgId ?? v)
      .join(",");
    p.set("platforms", ids);
  }
  if (filters.tags.length) p.set("tags", filters.tags.join(","));
  if (filters.searchQuery) p.set("search", filters.searchQuery);
  if (filters.metacriticMin !== null || filters.metacriticMax !== null) {
    const lo = filters.metacriticMin ?? 0;
    const hi = filters.metacriticMax ?? 100;
    p.set("metacritic", `${lo},${hi}`);
  }
  if (filters.yearMin !== null || filters.yearMax !== null) {
    const lo = filters.yearMin ?? 1970;
    const hi = filters.yearMax ?? new Date().getFullYear() + 1;
    p.set("dates", `${lo}-01-01,${hi}-12-31`);
  }
  if (filters.esrb.length) p.set("esrb", filters.esrb.join(","));
  p.set("ordering", filters.ordering || "-metacritic");
  return p.toString();
}

export const rawgProvider: GameProvider = {
  id: "rawg",
  async search({ filters, pageSize = 20, page = 1, cacheTtlHours = 24 }): Promise<ExternalGame[]> {
    const { rawgApiKey: key } = await getEffectiveProviderKeys();
    if (!key) {
      // no key configured — caller will fallback to catalog
      return [];
    }
    const qs = await buildQuery(filters, pageSize, page);
    const fetchOpts: RequestInit & { next?: { revalidate?: number } } =
      cacheTtlHours === 0 ? { cache: "no-store" } : { next: { revalidate: Math.max(60, cacheTtlHours * 3600) } };
    const res = await fetchExternal(`${RAWG_BASE}/games?${qs}`, fetchOpts);
    if (!res.ok) {
      console.warn(`[rawg] search failed ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      results: Array<{
        id: number;
        name: string;
        genres: Array<{ slug: string }>;
        platforms: Array<{ platform: { slug: string } }>;
        background_image: string | null;
        metacritic: number | null;
        rating: number | null;
        rating_top?: number | null;
        released: string | null;
        esrb_rating: { slug: string } | null;
        tags: Array<{ slug: string }>;
        playtime?: number | null;
        website?: string | null;
        stores?: Array<{ url: string | null; store: { slug: string; name: string } }> | null;
      }>;
    };
    return data.results.map((r) => {
      const stores =
        (r.stores ?? [])
          .filter((s) => s.url && s.store?.name)
          .map((s) => ({ store: s.store.name, url: s.url as string }));
      return {
      externalId: `rawg:${r.id}`,
      title: r.name,
      genres: r.genres.map((g) => g.slug),
      platforms: r.platforms.map((p) => p.platform.slug),
      coverUrl: r.background_image,
      metacritic: r.metacritic,
      rating: r.rating,
      releasedAt: r.released,
      esrb: r.esrb_rating?.slug ?? null,
      tags: r.tags.slice(0, 10).map((t) => t.slug),
      playtimeHours: r.playtime ?? null,
      website: r.website ?? null,
      stores,
      };
    });
  },
  async getById(id: string): Promise<ExternalGame | null> {
    const { rawgApiKey: key } = await getEffectiveProviderKeys();
    if (!key) return null;
    const rawId = id.replace(/^rawg:/, "");
    const res = await fetchExternal(`${RAWG_BASE}/games/${rawId}?key=${key}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const r = (await res.json()) as {
      id: number;
      name: string;
      genres: Array<{ slug: string }>;
      platforms: Array<{ platform: { slug: string } }>;
      background_image: string | null;
      metacritic: number | null;
      rating: number | null;
      rating_top?: number | null;
      released: string | null;
      esrb_rating: { slug: string } | null;
      tags: Array<{ slug: string }>;
      description_raw?: string | null;
      playtime?: number | null;
      website?: string | null;
      stores?: Array<{ url: string | null; store: { slug: string; name: string } }> | null;
    };
    const stores =
      (r.stores ?? [])
        .filter((s) => s.url && s.store?.name)
        .map((s) => ({ store: s.store.name, url: s.url as string }));
    return {
      externalId: `rawg:${r.id}`,
      title: r.name,
      genres: r.genres.map((g) => g.slug),
      platforms: r.platforms.map((p) => p.platform.slug),
      coverUrl: r.background_image,
      metacritic: r.metacritic,
      rating: r.rating,
      releasedAt: r.released,
      esrb: r.esrb_rating?.slug ?? null,
      tags: r.tags.slice(0, 10).map((t) => t.slug),
      description: r.description_raw?.trim() ? r.description_raw.trim() : null,
      playtimeHours: r.playtime ?? null,
      website: r.website ?? null,
      stores,
    };
  },
};
