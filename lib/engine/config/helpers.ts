import { z } from "zod";

export const int = (min: number) => z.number().int().min(min);
export const nullableInt = (min: number) =>
  z.union([z.number().int().min(min), z.null()]).default(null);
