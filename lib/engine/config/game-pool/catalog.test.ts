import { describe, expect, it } from "vitest";
import { GamePoolCatalogSchema } from "./catalog";

describe("GamePoolCatalogSchema", () => {
  it("defaults manual adds to on", () => {
    expect(GamePoolCatalogSchema.parse({})).toEqual({ allowManualAdd: true });
  });

  it("keeps the host's choice", () => {
    expect(GamePoolCatalogSchema.parse({ allowManualAdd: false })).toEqual({
      allowManualAdd: false,
    });
  });

  // A season saved before `fallbackToCatalog` was removed still carries the key;
  // z.object strips unknown keys rather than failing the parse.
  it("strips the removed fallbackToCatalog key", () => {
    const parsed = GamePoolCatalogSchema.parse({ allowManualAdd: false, fallbackToCatalog: true });
    expect(parsed).toEqual({ allowManualAdd: false });
    expect("fallbackToCatalog" in parsed).toBe(false);
  });

  it("rejects a non-boolean", () => {
    expect(() => GamePoolCatalogSchema.parse({ allowManualAdd: "yes" })).toThrow();
  });
});
