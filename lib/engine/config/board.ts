import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { int } from "./helpers";

export const BoardConfigSchema = z.object({
  size: int(1).max(200).default(DEFAULT_SEASON_CONFIG.board.size),
  loop: z.boolean().default(DEFAULT_SEASON_CONFIG.board.loop),
  bonusCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.bonusCount),
  penaltyCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.penaltyCount),
  teleportCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.teleportCount),
  eventCount: int(0).max(100).default(DEFAULT_SEASON_CONFIG.board.eventCount),
  distribution: z.enum(["random", "even", "clustered", "manual"]).default(DEFAULT_SEASON_CONFIG.board.distribution),
  regenerateOnSave: z.boolean().default(DEFAULT_SEASON_CONFIG.board.regenerateOnSave),
  perCellGenre: z.boolean().default(DEFAULT_SEASON_CONFIG.board.perCellGenre),
});
