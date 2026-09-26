import { z } from "zod";

export const GamePoolCatalogSchema = z.object({
  allowManualAdd: z.boolean().default(true),
  // `fallbackToCatalog` used to live here. It let an API season hand out a
  // random local game whenever its provider failed or came up empty, and it was
  // on by default. Removed rather than defaulted off: an API season draws only
  // from its provider. Stored configs that still carry the key parse fine —
  // z.object strips unknown keys.
});
