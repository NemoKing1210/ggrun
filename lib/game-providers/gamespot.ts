import type { ExternalGame, GameProvider } from "./provider";
import { getEffectiveProviderKeys } from "./keys";
import { fetchExternal } from "@/lib/external-fetch";

/**
 * GameSpot API — free key at https://www.gamespot.com/api.
 * Returns structured JSON for games (name, image, release date, genres, platforms).
 */

const GS_BASE = "https://www.gamespot.com/api";

/** GameSpot genre display names -> our genre slugs. */
const GENRE_MAP: Record<string, string> = {
  action: "action",
  adventure: "adventure",
  "role-playing": "rpg",
  strategy: "strategy",
  shooter: "shooter",
  puzzle: "puzzle",
  arcade: "arcade",
  racing: "racing",
  sports: "sports",
  simulation: "simulation",
  fighting: "fighting",
  family: "family",
  card: "card",
  casual: "casual",
  indie: "indie",
  "massively multiplayer": "massively-multiplayer",
  platformer: "platformer",
};

/** GameSpot platform display names -> our platform slugs (contains-match). */
const PLATFORM_MAP: Array<[string, string]> = [
  ["playstation 5", "playstation5"],
  ["playstation 4", "playstation4"],
  ["ps vita", "ps-vita"],
  ["xbox series", "xbox-series-x"],
  ["xbox one", "xbox-one"],
  ["nintendo switch", "nintendo-switch"],
  ["3ds", "nintendo-3ds"],
  ["ios", "ios"],
  ["android", "android"],
  ["mac", "mac"],
  ["linux", "linux"],
  ["web browser", "web"],
  ["pc", "pc"],
];

function mapGenres(names: Array<{ name?: string } | null>): string[] {
  const out: string[] = [];
  for (const g of names ?? []) {
    const key = (g?.name ?? "").toLowerCase();
    const mapped = GENRE_MAP[key];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function mapPlatforms(names: Array<{ name?: string } | null>): string[] {
  const out: string[] = [];
  for (const p of names ?? []) {
    const key = (p?.name ?? "").toLowerCase();
    for (const [needle, slug] of PLATFORM_MAP) {
      if (key.includes(needle) && !out.includes(slug)) out.push(slug);
    }
  }
  return out;
}

interface GSResult {
  id?: number | string;
  name?: string;
  image?: { square_tiny?: string | null } | null;
  release_date?: string | null;
  original_release_date?: string | null;
  genres?: Array<{ name?: string }> | null;
  platforms?: Array<{ name?: string }> | null;
  deck?: string | null;
}

function mapGame(r: GSResult): ExternalGame {
  const year = r.original_release_date || r.release_date || null;
  return {
    externalId: `gamespot:${r.id ?? ""}`,
    title: r.name ?? "Untitled",
    genres: mapGenres(r.genres ?? []),
    platforms: mapPlatforms(r.platforms ?? []),
    coverUrl: r.image?.square_tiny ?? null,
    metacritic: null,
    rating: null,
    releasedAt: year,
    esrb: null,
    tags: [],
    description: r.deck ?? null,
    playtimeHours: null,
    stores: [],
  };
}

export const gamespotProvider: GameProvider = {
  id: "gamespot",
  async search({ filters, pageSize = 20 }): Promise<ExternalGame[]> {
    const { gamespotApiKey: key } = await getEffectiveProviderKeys();
    if (!key) return [];

    const params = new URLSearchParams({
      api_key: key,
      format: "json",
      limit: String(Math.min(100, Math.max(pageSize, 20))),
    });
    const query = filters.searchQuery?.trim();
    if (query) params.set("filter", `name:${query}`);
    params.set("sort", filters.ordering === "-released" || filters.ordering === "released" ? "original_release_date:desc" : "name:asc");
    params.set("field_list", "id,name,image,release_date,original_release_date,genres,platforms,deck");

    const res = await fetchExternal(`${GS_BASE}/games/?${params.toString()}`, { next: { revalidate: 86400 } });
    if (!res.ok) {
      console.warn(`[gamespot] search failed ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { results?: GSResult[] };
    const results = data.results ?? [];

    const games = results
      .map((r) => mapGame(r))
      .filter((g) => {
        if (filters.genres.length) {
          if (!filters.genres.some((gen) => g.genres.includes(gen))) return false;
        }
        if (filters.platforms.length) {
          if (!filters.platforms.some((p) => g.platforms.includes(p))) return false;
        }
        if (filters.yearMin !== null || filters.yearMax !== null) {
          const y = g.releasedAt ? new Date(g.releasedAt).getUTCFullYear() : NaN;
          if (Number.isNaN(y)) return false;
          if (filters.yearMin !== null && y < filters.yearMin) return false;
          if (filters.yearMax !== null && y > filters.yearMax) return false;
        }
        return true;
      });

    return games.slice(0, pageSize);
  },
  async getById(id: string): Promise<ExternalGame | null> {
    const { gamespotApiKey: key } = await getEffectiveProviderKeys();
    if (!key) return null;
    const rawId = id.replace(/^gamespot:/, "");
    const params = new URLSearchParams({
      api_key: key,
      format: "json",
      filter: `id:${rawId}`,
      field_list: "id,name,image,release_date,original_release_date,genres,platforms,deck",
    });
    const res = await fetchExternal(`${GS_BASE}/games/?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: GSResult[] };
    const row = data.results?.[0];
    return row ? mapGame(row) : null;
  },
};