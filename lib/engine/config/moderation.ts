import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";

export const ModerationConfigSchema = z.object({
  completionRequireApproval: z.boolean().default(DEFAULT_SEASON_CONFIG.moderation.completionRequireApproval),
});
