import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { int } from "./helpers";

export const PointsConfigSchema = z.object({
  startingBalance: int(0).default(DEFAULT_SEASON_CONFIG.points.startingBalance),
  bonusAddsToRollOnPass: z.boolean().default(DEFAULT_SEASON_CONFIG.points.bonusAddsToRollOnPass),
  resetBalanceAfterUse: z.boolean().default(DEFAULT_SEASON_CONFIG.points.resetBalanceAfterUse),
});
