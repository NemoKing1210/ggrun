import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { int } from "./helpers";

export const RerollsConfigSchema = z.object({
  allowed: z.boolean().default(DEFAULT_SEASON_CONFIG.rerolls.allowed),
  limitPerGame: int(0).default(DEFAULT_SEASON_CONFIG.rerolls.limitPerGame),
  requireApproval: z.boolean().default(DEFAULT_SEASON_CONFIG.rerolls.requireApproval),
});
