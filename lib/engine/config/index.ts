export { DEFAULT_SEASON_CONFIG } from "./defaults";
export * from "./dice";
export * from "./board";
export * from "./points";
export * from "./rerolls";
export * from "./moderation";
export * from "./rules";
export * from "./game-pool/index";
export * from "./game-pool/filters";
export * from "./game-pool/catalog";

import { z } from "zod";
import type { SeasonConfig } from "../types/season";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { DiceConfigSchema } from "./dice";
import { PointsConfigSchema } from "./points";
import { BoardConfigSchema } from "./board";
import { RerollsConfigSchema } from "./rerolls";
import { ModerationConfigSchema } from "./moderation";
import { RulesConfigSchema } from "./rules";
import { GamePoolConfigSchema } from "./game-pool/index";

export const SeasonConfigSchema = z
  .object({
    dice: DiceConfigSchema.default(DEFAULT_SEASON_CONFIG.dice),
    points: PointsConfigSchema.default(DEFAULT_SEASON_CONFIG.points),
    board: BoardConfigSchema.default(DEFAULT_SEASON_CONFIG.board),
    rerolls: RerollsConfigSchema.default(DEFAULT_SEASON_CONFIG.rerolls),
    moderation: ModerationConfigSchema.default(DEFAULT_SEASON_CONFIG.moderation),
    rules: RulesConfigSchema.default(DEFAULT_SEASON_CONFIG.rules),
    gamePool: GamePoolConfigSchema.default(DEFAULT_SEASON_CONFIG.gamePool),
  })
  .transform((parsed): SeasonConfig => parsed);
