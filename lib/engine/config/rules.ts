import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";

export const RulesConfigSchema = z.object({
  mode: z.enum(["auto", "manual"]).default(DEFAULT_SEASON_CONFIG.rules.mode),
});
