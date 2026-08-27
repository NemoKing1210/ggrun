import type { ExternalGame, GameProvider } from "./provider";
import { fetchExternal } from "@/lib/external-fetch";

/**
 * FreeToGame — free-to-play PC/browser games database.
 * No API key, no registration; 10 req/s rate limit (https://www.freetogame.com/api-doc).
 * Covers ~1000 titles; deliberately small surface so it works out of the box.
 */

const F2G_BASE = "https://www.freetogame.com/api";

/** Our genre slugs that FreeToGame exposes as its `category` filter. */
const F2G_CATEGORIES = new Set([
  "action",
  "shooter",
  "strategy",
  "racing",
  "sports",
  "fighting",
  "card",
]);

/** Our tag slugs that map 1:1 to FreeToGame tags. */
const F2G_TAGS = new Set([
  "horror",
  "survival",
  "open-world",
  "zombie",
  "fantasy",
  "sci-fi",
  "space",
  "sandbox",
  "pixel",
  "pvp",
  "pve",
  "anime",
  "2d",
  "3d",
  "battle-royale",
  "tower-defense",
  "side-scroller",
  "turn-based",
]);

function sortBy(ordering: string): string {
  if (ordering === "-released" || ordering === "released") return "release-date";
  if (ordering === "name" || ordering === "-name") return "alphabetical";
  return "popularity";
}

function normalizeLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
}

function mapGame(g: F2GListItem): ExternalGame {
  const genre = normalizeLabel(g.genre);
  const platforms = toPlatforms(g.platform);
  return {
    externalId: `freetogame:${g.id}`,
    title: g.title,
    genres: genre ? [genre] : [],
    platforms,
    coverUrl: g.thumbnail ?? null,
    metacritic: null,
    rating: null,
    releasedAt: g.release_date || null,
    esrb: null,
    tags: genre ? [genre] : [],
    description: g.short_description ?? null,
  };
}

export const freetogameProvider: GameProvider = {
  id: "freetogame",
  async search({ filters, pageSize = 20 }): Promise<ExternalGame[]> {
    const params = new URLSearchParams();

    // Platform: FreeToGame speaks pc | browser — honor only when unambiguous.
    const wantsPc = filters.platforms.includes("pc");
    const wantsWeb = filters.platforms.includes("web");
    if (wantsPc && !wantsWeb) params.set("platform", "pc");
    else if (wantsWeb && !wantsPc) params.set("platform", "browser");

    // Genres -> exactly the category filter (FreeToGame accepts one).
    const genreHit = filters.genres.find((g) => F2G_CATEGORIES.has(g));
    if (genreHit) params.set("category", genreHit);

    // Tags -> comma-separated tag filter.
    const tagHits = filters.tags.filter((t) => F2G_TAGS.has(t)).slice(0, 5);
    if (tagHits.length > 0) params.set("tag", tagHits.join(","));

    params.set("sort-by", sortBy(filters.ordering));

    const res = await fetchExternal(`${F2G_BASE}/games?${params.toString()}`);
    if (!res.ok) {
      console.warn(`[freetogame] list failed ${res.status}`);
      return [];
    }
    const data = (await res.json()) as F2GListItem[];
    if (!Array.isArray(data)) return [];

    const query = filters.searchQuery?.trim().toLowerCase();
    let games = data.map(mapGame);

    // The API has no name search — post-filter titles locally.
    if (query) games = games.filter((g) => g.title.toLowerCase().includes(query));
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

    return games.slice(0, pageSize);
  },
  async getById(id: string): Promise<ExternalGame | null> {
    const rawId = id.replace(/^freetogame:/, "");
    const res = await fetchExternal(`${F2G_BASE}/game?id=${encodeURIComponent(rawId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as F2GListItem | null;
    if (!data || typeof data.id === "undefined") return null;
    return mapGame(data);
  },
};