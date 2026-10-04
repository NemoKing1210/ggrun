import { describe, expect, it } from "vitest";

import { parseSeasonSettingsForm } from "./form";

type GamePool = {
  source: unknown;
  provider: unknown;
  templateId: unknown;
  filters: Record<string, unknown>;
  catalog: Record<string, unknown>;
  maxCandidates: unknown;
  cacheTtlHours: unknown;
  autoFetchOnRoll: unknown;
};

type Config = {
  dice: Record<string, unknown>;
  points: Record<string, unknown>;
  board: Record<string, unknown>;
  rerolls: Record<string, unknown>;
  rules: Record<string, unknown>;
  gamePool: GamePool;
  iee?: unknown;
};

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) for (const v of value) fd.append(key, v);
    else fd.set(key, value);
  }
  return fd;
}

function structured(entries: Record<string, string | string[]> = {}): FormData {
  return form({ structured: "1", ...entries });
}

function configOf(fd: FormData): Config {
  return parseSeasonSettingsForm(fd).config as Config;
}

describe("parseSeasonSettingsForm", () => {
  it("builds the full default config from explicit or absent structured fields", () => {
    const { config, rulesMd } = parseSeasonSettingsForm(structured());
    expect(rulesMd).toBeUndefined();
    expect(config).toEqual({
      dice: { sides: 6, passDiceCount: 1, dropDiceCount: 2, dropStreakMultiplier: true },
      points: { startingBalance: 0, bonusAddsToRollOnPass: true, resetBalanceAfterUse: true },
      board: {
        size: 40,
        loop: false,
        bonusCount: 4,
        penaltyCount: 4,
        teleportCount: 2,
        eventCount: 3,
        distribution: "random",
        regenerateOnSave: false,
        perCellGenre: false,
      },
      rerolls: { allowed: true, limitPerGame: 1, requireApproval: true },
      rules: { mode: "auto" },
      gamePool: {
        source: "catalog",
        provider: "internal",
        templateId: null,
        filters: {
          genres: [],
          platforms: [],
          tags: [],
          metacriticMin: null,
          metacriticMax: null,
          ratingMin: null,
          ratingMax: null,
          yearMin: null,
          yearMax: null,
          esrb: [],
          players: "any",
          onlyWithCover: false,
          ordering: "-metacritic",
          searchQuery: null,
          primaryTag: null,
        },
        catalog: { allowManualAdd: true },
        maxCandidates: 20,
        cacheTtlHours: 24,
        autoFetchOnRoll: false,
      },
    });
  });

  it("coerces numbers, booleans, arrays and game-pool fields from the form", () => {
    const config = configOf(
      structured({
        dice_sides: "20",
        dice_passDiceCount: "2",
        dice_dropDiceCount: "3",
        dice_dropStreakMultiplier: "false",
        points_startingBalance: "150",
        points_bonusAddsToRollOnPass: "0",
        points_resetBalanceAfterUse: "off",
        board_size: "30",
        board_loop: "on",
        board_bonusCount: "2",
        board_penaltyCount: "1",
        board_teleportCount: "0",
        board_eventCount: "5",
        board_distribution: "even",
        board_regenerateOnSave: "yes",
        board_perCellGenre: "1",
        rerolls_allowed: "no",
        rerolls_limitPerGame: "7",
        rerolls_requireApproval: "false",
        genres: "rpg, action",
        platforms: '["ps5","pc"]',
        tags: "indie",
        esrb: "T,M",
        filters_metacriticMin: "70",
        filters_metacriticMax: "95",
        filters_ratingMin: "3.5",
        filters_ratingMax: "4.9",
        filters_yearMin: "2015",
        filters_yearMax: "2024",
        filters_players: "multi",
        filters_onlyWithCover: "yes",
        filters_ordering: "-rating",
        filters_searchQuery: "  zelda  ",
        filters_primaryTag: "  rpg  ",
        gamePool_source: "api",
        gamePool_provider: "rawg",
        gamePool_templateId: "  tpl-1  ",
        gamePool_maxCandidates: "5",
        gamePool_cacheTtlHours: "12",
        gamePool_autoFetchOnRoll: "1",
        catalog_allowManualAdd: "0",
      }),
    );

    expect(config.dice).toEqual({ sides: 20, passDiceCount: 2, dropDiceCount: 3, dropStreakMultiplier: false });
    expect(config.points).toEqual({
      startingBalance: 150,
      bonusAddsToRollOnPass: false,
      resetBalanceAfterUse: false,
    });
    expect(config.board).toEqual({
      size: 30,
      loop: true,
      bonusCount: 2,
      penaltyCount: 1,
      teleportCount: 0,
      eventCount: 5,
      distribution: "even",
      regenerateOnSave: true,
      perCellGenre: true,
    });
    expect(config.rerolls).toEqual({ allowed: false, limitPerGame: 7, requireApproval: false });
    expect(config.gamePool).toEqual({
      source: "api",
      provider: "rawg",
      templateId: "tpl-1",
      filters: {
        genres: ["rpg", "action"],
        platforms: ["ps5", "pc"],
        tags: ["indie"],
        metacriticMin: 70,
        metacriticMax: 95,
        ratingMin: 3.5,
        ratingMax: 4.9,
        yearMin: 2015,
        yearMax: 2024,
        esrb: ["T", "M"],
        players: "multi",
        onlyWithCover: true,
        ordering: "-rating",
        searchQuery: "zelda",
        primaryTag: "rpg",
      },
      catalog: { allowManualAdd: false },
      maxCandidates: 5,
      cacheTtlHours: 12,
      autoFetchOnRoll: true,
    });
  });

  it("falls back on blank or non-numeric integers instead of writing NaN", () => {
    const config = configOf(
      structured({
        dice_sides: "abc",
        board_size: "",
        rerolls_limitPerGame: "  ",
        gamePool_maxCandidates: "oops",
        filters_metacriticMin: "",
        filters_metacriticMax: "abc",
        filters_yearMin: "nope",
        filters_ratingMin: "abc",
        filters_ratingMax: "",
      }),
    );

    expect(config.dice["sides"]).toBe(6);
    expect(config.board["size"]).toBe(40);
    expect(config.rerolls["limitPerGame"]).toBe(1);
    expect(config.gamePool.maxCandidates).toBe(20);
    expect(config.gamePool.filters["metacriticMin"]).toBeNull();
    expect(config.gamePool.filters["metacriticMax"]).toBeNull();
    expect(config.gamePool.filters["yearMin"]).toBeNull();
    expect(config.gamePool.filters["ratingMin"]).toBeNull();
    expect(config.gamePool.filters["ratingMax"]).toBeNull();
  });

  it("treats every truthy spelling and non-truthy value distinctly", () => {
    for (const value of ["true", "1", "on", "yes", "TRUE", "On"]) {
      expect(configOf(structured({ board_loop: value })).board["loop"]).toBe(true);
    }
    for (const value of ["false", "0", "off", "no", ""]) {
      expect(configOf(structured({ board_regenerateOnSave: value })).board["regenerateOnSave"]).toBe(false);
    }
  });

  it("parses JSON arrays, comma lists and malformed bracket input", () => {
    expect(configOf(structured({ genres: '["RPG"," Action ",""]' })).gamePool.filters["genres"]).toEqual([
      "RPG",
      "Action",
    ]);
    expect(configOf(structured({ tags: " a , b ,, c " })).gamePool.filters["tags"]).toEqual(["a", "b", "c"]);
    expect(configOf(structured({ platforms: "[not json" })).gamePool.filters["platforms"]).toEqual(["[not json"]);
    expect(configOf(structured({ esrb: "" })).gamePool.filters["esrb"]).toEqual([]);
  });

  it("forces provider internal for catalog sources and unknown provider names", () => {
    expect(configOf(structured({ gamePool_source: "catalog", gamePool_provider: "rawg" })).gamePool.provider).toBe(
      "internal",
    );

    const unknownProvider = configOf(structured({ gamePool_source: "api", gamePool_provider: "bogus" })).gamePool;
    expect(unknownProvider.source).toBe("api");
    expect(unknownProvider.provider).toBe("internal");

    const unknownSource = configOf(structured({ gamePool_source: "bogus", gamePool_provider: "rawg" })).gamePool;
    expect(unknownSource.source).toBe("catalog");
    expect(unknownSource.provider).toBe("internal");

    const hybrid = configOf(structured({ gamePool_source: "hybrid", gamePool_provider: "igdb" })).gamePool;
    expect(hybrid.source).toBe("hybrid");
    expect(hybrid.provider).toBe("igdb");
  });

  it("carries valid iee JSON and drops unparseable iee rather than the whole form", () => {
    expect(configOf(structured({ iee: '{"enabled":true,"inventorySize":9}' })).iee).toEqual({
      enabled: true,
      inventorySize: 9,
    });
    expect(configOf(structured({ iee: "{not json" })).iee).toBeUndefined();
  });

  it("keeps rules only in manual mode and only when the field is present", () => {
    const manual = parseSeasonSettingsForm(structured({ rulesMode: "MANUAL", rulesMd: "# Rules" }));
    expect(manual.rulesMd).toBe("# Rules");
    expect((manual.config as Config).rules).toEqual({ mode: "manual" });

    const auto = parseSeasonSettingsForm(structured({ rulesMode: "auto", rulesMd: "# ignored" }));
    expect(auto.rulesMd).toBeUndefined();
    expect((auto.config as Config).rules).toEqual({ mode: "auto" });

    expect(configOf(structured({ rulesMode: "wat" })).rules).toEqual({ mode: "auto" });
    expect(parseSeasonSettingsForm(form({ structured: "1", rulesMode: "manual" })).rulesMd).toBeUndefined();
  });

  it("parses the legacy JSON config payload", () => {
    const parsed = parseSeasonSettingsForm(form({ config: '{"a":1,"dice":{"sides":8}}' }));
    expect(parsed.error).toBeUndefined();
    expect(parsed.config).toEqual({ a: 1, dice: { sides: 8 } });
    expect(parsed.rulesMd).toBeUndefined();
  });

  it("reports malformed legacy JSON without touching the config", () => {
    expect(parseSeasonSettingsForm(form({ config: "{oops" }))).toEqual({
      config: null,
      error: "formConfigInvalidJson",
      rulesMd: undefined,
    });
  });

  it("rejects a form that carries neither structured nor a non-empty legacy config", () => {
    expect(parseSeasonSettingsForm(form({})).error).toBe("formUnknown");
    expect(parseSeasonSettingsForm(form({ config: "   " })).error).toBe("formUnknown");
    expect(parseSeasonSettingsForm(form({ structured: "0" })).error).toBe("formUnknown");
  });

  it("prefers the structured payload over a coexisting legacy config", () => {
    const parsed = parseSeasonSettingsForm(form({ structured: "1", config: '{"a":1}', dice_sides: "10" }));
    expect(parsed.error).toBeUndefined();
    expect((parsed.config as Config).dice).toEqual({
      sides: 10,
      passDiceCount: 1,
      dropDiceCount: 2,
      dropStreakMultiplier: true,
    });
  });
});
