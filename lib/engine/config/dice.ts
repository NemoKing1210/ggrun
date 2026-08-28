import { z } from "zod";
import { DEFAULT_SEASON_CONFIG } from "./defaults";
import { int } from "./helpers";

export const DiceConfigSchema = z.object({
  sides: int(2).default(DEFAULT_SEASON_CONFIG.dice.sides),
  passDiceCount: int(0).default(DEFAULT_SEASON_CONFIG.dice.passDiceCount),
  dropDiceCount: int(0).default(DEFAULT_SEASON_CONFIG.dice.dropDiceCount),
  dropStreakMultiplier: z.boolean().default(DEFAULT_SEASON_CONFIG.dice.dropStreakMultiplier),
});
