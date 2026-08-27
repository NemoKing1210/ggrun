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
}

export interface ProviderSearchParams {
  filters: GamePoolFilters;
  pageSize?: number;
  page?: number;
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
  return true; // internal always configured
}
