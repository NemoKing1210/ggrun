import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "../defaults";
import { int } from "../helpers";
import { GamePoolCatalogSchema } from "./catalog";
import { GamePoolFiltersSchema } from "./filters";

export const GamePoolConfigSchema = z.object({
  source: z.enum(["catalog", "api", "hybrid"]).default(DEFAULT_SEASON_CONFIG.gamePool.source),
  provider: z.enum(["internal", "rawg", "igdb", "steam", "freetogame", "gamespot"]).default(DEFAULT_SEASON_CONFIG.gamePool.provider),
  templateId: z.union([z.string(), z.null()]).default(null),
  filters: GamePoolFiltersSchema.default(DEFAULT_SEASON_CONFIG.gamePool.filters),
  catalog: GamePoolCatalogSchema.default(DEFAULT_SEASON_CONFIG.gamePool.catalog),
  maxCandidates: int(1).max(100).default(DEFAULT_SEASON_CONFIG.gamePool.maxCandidates),
  cacheTtlHours: int(0).max(720).default(DEFAULT_SEASON_CONFIG.gamePool.cacheTtlHours),
  autoFetchOnRoll: z.boolean().default(DEFAULT_SEASON_CONFIG.gamePool.autoFetchOnRoll),
});
