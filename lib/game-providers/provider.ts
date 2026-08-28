import type { GamePoolFilters } from "@/game-engine/types";

export interface ExternalGame {
  externalId: string;
  title: string;
  genres: string[];
  platforms: string[];
  coverUrl: string | null;
  metacritic: number | null;
  rating: number | null;
  releasedAt: string | null;
  esrb: string | null;
  tags: string[];
  description?: string | null;
  /** Average playtime in hours when the provider exposes it. */
  playtimeHours?: number | null;
  /** Direct store links: [{ store, url }]. */
  stores?: Array<{ store: string; url: string | null }> | null;
  /** Official website. */
  website?: string | null;
}

export interface ProviderSearchParams {
  filters: GamePoolFilters;
  pageSize?: number;
  page?: number;
  /** Cache TTL in hours: 0 = no cache (no-store), otherwise seconds for revalidate */
  cacheTtlHours?: number;
}

export interface GameProvider {
  id: string;
  search(params: ProviderSearchParams): Promise<ExternalGame[]>;
  getById(id: string): Promise<ExternalGame | null>;
}

/**
 * Sync check against env only (used at build-time). For request-time DB-aware
 * check use isProviderConfiguredAsync from ./keys.
 */
export function isProviderConfigured(provider: string): boolean {
  if (provider === "rawg") return Boolean(process.env.RAWG_API_KEY);
  if (provider === "igdb") return Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
  if (provider === "steam") return Boolean(process.env.STEAM_WEB_API_KEY);
  if (provider === "gamespot") return Boolean(process.env.GAMESPOT_API_KEY);
  if (provider === "freetogame") return true; // no key required
  return true; // internal always configured
}
