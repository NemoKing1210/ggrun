import { z } from "zod";

export const GamePoolCatalogSchema = z.object({
  allowManualAdd: z.boolean().default(true),
  fallbackToCatalog: z.boolean().default(true),
});
