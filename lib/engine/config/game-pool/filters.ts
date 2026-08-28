import { z } from "zod";
import { nullableInt } from "../helpers";

export const GamePoolFiltersSchema = z.object({
  genres: z.array(z.string().min(1)).default([]),
  platforms: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  metacriticMin: nullableInt(0).refine((v) => v === null || v <= 100, "max 100"),
  metacriticMax: nullableInt(0).refine((v) => v === null || v <= 100, "max 100"),
  ratingMin: z.union([z.number().min(0).max(5), z.null()]).default(null),
  ratingMax: z.union([z.number().min(0).max(5), z.null()]).default(null),
  yearMin: nullableInt(1970),
  yearMax: nullableInt(1970),
  esrb: z.array(z.string().min(1)).default([]),
  players: z.enum(["any", "single", "multi", "coop"]).default("any"),
  onlyWithCover: z.boolean().default(false),
  ordering: z.string().default("-metacritic"),
  searchQuery: z.union([z.string(), z.null()]).default(null),
});
