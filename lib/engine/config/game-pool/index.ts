import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "../defaults";
import { int } from "../helpers";
import { GamePoolCatalogSchema } from "./catalog";
import { GamePoolFiltersSchema } from "./filters";
import { TEMPLATE_PRIMARY_TAG } from "../../pool/primary";

export const GamePoolConfigSchema = z
  .object({
    source: z.enum(["catalog", "api", "hybrid"]).default(DEFAULT_SEASON_CONFIG.gamePool.source),
    provider: z.enum(["internal", "rawg", "igdb", "steam", "freetogame", "gamespot"]).default(DEFAULT_SEASON_CONFIG.gamePool.provider),
    templateId: z.union([z.string(), z.null()]).default(null),
    filters: GamePoolFiltersSchema.default(DEFAULT_SEASON_CONFIG.gamePool.filters),
    catalog: GamePoolCatalogSchema.default(DEFAULT_SEASON_CONFIG.gamePool.catalog),
    maxCandidates: int(1).max(100).default(DEFAULT_SEASON_CONFIG.gamePool.maxCandidates),
    cacheTtlHours: int(0).max(720).default(DEFAULT_SEASON_CONFIG.gamePool.cacheTtlHours),
    autoFetchOnRoll: z.boolean().default(DEFAULT_SEASON_CONFIG.gamePool.autoFetchOnRoll),
  })
  // A season saved before primary tags existed has no `primaryTag` key. If it
  // was set up from a template, it gets that template's primary tag — the host
  // picked "Horror" to get horror games, which is the whole point of the
  // field. A season without a template, or one saved since (the form always
  // sends the key, `null` included), is left as it is.
  .transform((pool) => ({
    ...pool,
    filters: {
      ...pool.filters,
      primaryTag:
        pool.filters.primaryTag !== undefined
          ? pool.filters.primaryTag
          : pool.templateId
            ? (TEMPLATE_PRIMARY_TAG[pool.templateId] ?? null)
            : null,
    },
  }));
