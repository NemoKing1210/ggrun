import type { ExternalGame, GameProvider } from "./provider";
import { fetchExternal } from "@/lib/infrastructure/http/external-fetch";
import { sampleUniform } from "@/lib/engine";
import { f2gMainGenre, mergeF2gResults, planF2gQueries } from "@/lib/modules/catalog/pool/freetogame-taxonomy";

/**
 * FreeToGame — free-to-play PC/browser games database.
 * No API key, no registration; 10 req/s rate limit (https://www.freetogame.com/api-doc).
 * Covers ~400 titles, and answers each request with its whole matching list.
 */

const F2G_BASE = "https://www.freetogame.com/api";

function sortBy(ordering: string): string {
  if (ordering === "-released" || ordering === "released") return "release-date";
  if (ordering === "name" || ordering === "-name") return "alphabetical";
  return "popularity";
}

/** F2G `platform` field ("PC (Windows)" / "Web Browser") -> our platform slugs. */
function toPlatforms(platform: string | null): string[] {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("web")) return ["web"];
  if (p.includes("pc")) return ["pc"];
  return [];
}

interface F2GListItem {
  id: number;
  title: string;
  thumbnail: string | null;
  short_description: string | null;
  genre: string | null;
  platform: string | null;
  release_date: string | null;
  game_url?: string | null;
}

/**
 * `known` is what the requests that returned this game establish about it, in
 * our vocabulary (see `mergeF2gResults`); the main genre is translated too. The
 * season's filter is applied to these stored values, so they must be ours — the
 * rows used to carry FreeToGame's own labels ("shooter", "mmorpg") in both
 * columns, which no season filter could ever match.
 */
function mapGame(g: F2GListItem, known: { genres: readonly string[]; tags: readonly string[] } = { genres: [], tags: [] }): ExternalGame {
  const main = f2gMainGenre(g.genre);
  const platforms = toPlatforms(g.platform);
  return {
    externalId: `freetogame:${g.id}`,
    title: g.title,
    genres: [...new Set([...main.genres, ...known.genres])],
    platforms,
    coverUrl: g.thumbnail ?? null,
    metacritic: null,
    rating: null,
    releasedAt: g.release_date || null,
    esrb: null,
    tags: [...new Set([...main.tags, ...known.tags])],
    description: g.short_description ?? null,
    playtimeHours: null,
    stores: g.game_url ? [{ store: "FreeToGame", url: g.game_url }] : [],
  };
}

export const freetogameProvider: GameProvider = {
  id: "freetogame",
  async search({ filters, pageSize = 20 }): Promise<ExternalGame[]> {
    // The season's genres and tags, in FreeToGame's categories: one request per
    // (genre, tag) pair, unioned — see freetogame-taxonomy.ts for why. `null`
    // means FreeToGame cannot answer this filter at all, so nothing is fetched.
    const plan = planF2gQueries(filters, Math.random);
    if (!plan) return [];

    const sort = sortBy(filters.ordering);
    const results = await Promise.all(
      plan.queries.map(async (query) => {
        const params = new URLSearchParams();
        if (query.categories.length > 0) params.set("tag", query.categories.join("."));
        if (plan.platform) params.set("platform", plan.platform);
        params.set("sort-by", sort);
        const endpoint = query.categories.length > 0 ? "filter" : "games";
        const res = await fetchExternal(`${F2G_BASE}/${endpoint}?${params.toString()}`);
        if (!res.ok) {
          console.warn(`[freetogame] ${endpoint} failed ${res.status}`);
          return { query, games: [] as F2GListItem[] };
        }
        // "Nothing matches" is a 201 carrying an object, not an empty array.
        const data = (await res.json()) as unknown;
        return { query, games: Array.isArray(data) ? (data as F2GListItem[]) : [] };
      }),
    );

    let games = mergeF2gResults(results).map(({ game, genres, tags }) => mapGame(game, { genres, tags }));

    const nameQuery = filters.searchQuery?.trim().toLowerCase();

    // The API has no name search — post-filter titles locally.
    if (nameQuery) games = games.filter((g) => g.title.toLowerCase().includes(nameQuery));
    if (filters.yearMin !== null) {
      games = games.filter((g) => {
        const y = g.releasedAt ? new Date(g.releasedAt).getUTCFullYear() : NaN;
        return !Number.isNaN(y) && y >= filters.yearMin!;
      });
    }
    if (filters.yearMax !== null) {
      games = games.filter((g) => {
        const y = g.releasedAt ? new Date(g.releasedAt).getUTCFullYear() : NaN;
        return !Number.isNaN(y) && y <= filters.yearMax!;
      });
    }

    // Each endpoint returns its entire matching list (up to ~400 titles) in one
    // response. Taking the first `pageSize` of a popularity-sorted list meant
    // every roll saw the same twenty games; a random window lets a season
    // reach the whole catalogue. Server-side randomness, per the house rule.
    return sampleUniform(games, pageSize, Math.random);
  },
  async getById(id: string): Promise<ExternalGame | null> {
    const rawId = id.replace(/^freetogame:/, "");
    const res = await fetchExternal(`${F2G_BASE}/game?id=${encodeURIComponent(rawId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as F2GListItem | null;
    if (!data || typeof data.id === "undefined") return null;
    const mapped = mapGame(data);
    // The detail endpoint carries the full description.
    const fullDescription = (data as F2GListItem & { description?: string | null }).description;
    if (fullDescription?.trim()) mapped.description = fullDescription.trim();
    return mapped;
  },
};