import type { GamePoolFilters } from "@/lib/engine/types";
import { primaryTagSlugs } from "@/lib/engine/pool/primary";

import { GENRES } from "./constants";

const GENRE_VALUES = new Set<string>(GENRES.map((g) => g.value));

/**
 * The filter a provider that speaks our vocabulary (RAWG, GameSpot) should be
 * asked with. Under a primary tag that is the primary tag alone — as a genre or
 * as a tag, whichever list it belongs to — because the season's other genres
 * and tags only rank: sending them along would make the provider require them,
 * which is the dilution the primary tag exists to remove (or, for RAWG's
 * comma-separated OR, widen the pool past the category). They are applied as a
 * ranking once the results are in the catalog.
 *
 * FreeToGame has its own vocabulary and plans its requests itself
 * (`freetogame-taxonomy.ts`).
 */
export function hardProviderFilters(filters: GamePoolFilters): GamePoolFilters {
  const slugs = primaryTagSlugs(filters.primaryTag);
  if (slugs.length === 0 || !filters.primaryTag) return filters;
  const asGenre = GENRE_VALUES.has(filters.primaryTag);
  return { ...filters, genres: asGenre ? slugs : [], tags: asGenre ? [] : slugs };
}
