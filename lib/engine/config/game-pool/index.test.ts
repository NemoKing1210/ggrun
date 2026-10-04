import { describe, expect, it } from "vitest";
import { GamePoolConfigSchema } from "./index";

describe("GamePoolConfigSchema", () => {
  it("fills every field from the season defaults", () => {
    const parsed = GamePoolConfigSchema.parse({});
    expect(parsed.source).toBe("catalog");
    expect(parsed.provider).toBe("internal");
    expect(parsed.templateId).toBeNull();
    expect(parsed.maxCandidates).toBe(20);
    expect(parsed.cacheTtlHours).toBe(24);
    expect(parsed.autoFetchOnRoll).toBe(false);
  });

  it("accepts exactly the wiring combinations it knows", () => {
    for (const source of ["catalog", "api", "hybrid"] as const) {
      expect(GamePoolConfigSchema.parse({ source }).source).toBe(source);
    }
    for (const provider of ["internal", "rawg", "igdb", "steam", "freetogame", "gamespot"] as const) {
      expect(GamePoolConfigSchema.parse({ provider }).provider).toBe(provider);
    }
    expect(() => GamePoolConfigSchema.parse({ source: "local" })).toThrow();
    expect(() => GamePoolConfigSchema.parse({ provider: "metacritic" })).toThrow();
  });

  it("keeps maxCandidates between 1 and 100", () => {
    expect(GamePoolConfigSchema.parse({ maxCandidates: 1 }).maxCandidates).toBe(1);
    expect(GamePoolConfigSchema.parse({ maxCandidates: 100 }).maxCandidates).toBe(100);
    expect(() => GamePoolConfigSchema.parse({ maxCandidates: 0 })).toThrow();
    expect(() => GamePoolConfigSchema.parse({ maxCandidates: 101 })).toThrow();
  });

  it("keeps the cache TTL between 0 and 720 hours", () => {
    expect(GamePoolConfigSchema.parse({ cacheTtlHours: 0 }).cacheTtlHours).toBe(0);
    expect(GamePoolConfigSchema.parse({ cacheTtlHours: 720 }).cacheTtlHours).toBe(720);
    expect(() => GamePoolConfigSchema.parse({ cacheTtlHours: -1 })).toThrow();
    expect(() => GamePoolConfigSchema.parse({ cacheTtlHours: 721 })).toThrow();
  });

  it("defaults the missing primary tag to null when there is no template", () => {
    expect(GamePoolConfigSchema.parse({}).filters.primaryTag).toBeNull();
  });
});
