export function parseSeasonSettingsForm(formData: FormData): { config: unknown; rulesMd?: string | null; error?: string } {
  const rawRulesMode = String(formData.get("rulesMode") ?? "auto").toLowerCase();
  const rulesMode: "auto" | "manual" = rawRulesMode === "manual" ? "manual" : "auto";
  const rulesMdRaw = formData.has("rulesMd") ? String(formData.get("rulesMd") ?? "") : undefined;
  const rulesMd = rulesMode === "manual" ? rulesMdRaw : undefined;

  const legacy = formData.get("config");
  const structured = formData.get("structured");
  let config: unknown;

  if (structured === "1") {
    const parseIntOrNull = (key: string): number | null => {
      const v = formData.get(key);
      if (v === null || String(v).trim() === "") return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };
    const parseIntOr = (key: string, fallback: number): number => {
      const v = formData.get(key);
      if (v === null || String(v).trim() === "") return fallback;
      const n = Number(v);
      return Number.isNaN(n) ? fallback : n;
    };
    const parseBool = (key: string, fallback = false): boolean => {
      const v = formData.get(key);
      if (v === null) return fallback;
      const s = String(v).toLowerCase();
      return s === "true" || s === "1" || s === "on" || s === "yes";
    };
    const parseArray = (key: string): string[] => {
      const raw = formData.get(key);
      if (raw === null) {
        const all = formData.getAll(key);
        if (all.length > 1) return all.map((x) => String(x).trim()).filter(Boolean);
        return [];
      }
      const s = String(raw).trim();
      if (!s) return [];
      if (s.startsWith("[")) {
        try {
          const arr = JSON.parse(s);
          if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
        } catch {}
      }
      return s.split(",").map((x) => x.trim()).filter(Boolean);
    };

    const genres = parseArray("genres");
    const platforms = parseArray("platforms");
    const tags = parseArray("tags");
    const esrb = parseArray("esrb");

    config = {
      dice: {
        sides: parseIntOr("dice_sides", 6),
        passDiceCount: parseIntOr("dice_passDiceCount", 1),
        dropDiceCount: parseIntOr("dice_dropDiceCount", 2),
        dropStreakMultiplier: parseBool("dice_dropStreakMultiplier", true),
      },
      points: {
        startingBalance: parseIntOr("points_startingBalance", 0),
        bonusAddsToRollOnPass: parseBool("points_bonusAddsToRollOnPass", true),
        resetBalanceAfterUse: parseBool("points_resetBalanceAfterUse", true),
      },
      board: {
        size: parseIntOr("board_size", 40),
        loop: parseBool("board_loop", false),
        bonusCount: parseIntOr("board_bonusCount", 4),
        penaltyCount: parseIntOr("board_penaltyCount", 4),
        teleportCount: parseIntOr("board_teleportCount", 2),
        eventCount: parseIntOr("board_eventCount", 3),
        distribution: String(formData.get("board_distribution") || "random"),
        regenerateOnSave: parseBool("board_regenerateOnSave", false),
      },
      rerolls: {
        allowed: parseBool("rerolls_allowed", true),
        limitPerGame: parseIntOr("rerolls_limitPerGame", 1),
        requireApproval: parseBool("rerolls_requireApproval", true),
      },
      moderation: {
        completionRequireApproval: parseBool("moderation_completionRequireApproval", false),
      },
      rules: { mode: rulesMode },
      gamePool: {
        source: (() => {
          const s = String(formData.get("gamePool_source") || "catalog").toLowerCase();
          return s === "catalog" || s === "api" || s === "hybrid" ? s : "catalog";
        })(),
        provider: (() => {
          const raw = String(formData.get("gamePool_provider") || "internal").toLowerCase();
          const src = String(formData.get("gamePool_source") || "catalog").toLowerCase();
          if (src === "catalog") return "internal";
          return raw === "rawg" || raw === "igdb" || raw === "steam" || raw === "internal" ? raw : "internal";
        })(),
        templateId: (() => {
          const v = formData.get("gamePool_templateId");
          const s = v ? String(v).trim() : "";
          return s ? s : null;
        })(),
        filters: {
          genres, platforms, tags,
          metacriticMin: parseIntOrNull("filters_metacriticMin"),
          metacriticMax: parseIntOrNull("filters_metacriticMax"),
          ratingMin: (() => {
            const v = formData.get("filters_ratingMin");
            if (v === null || String(v).trim() === "") return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
          })(),
          ratingMax: (() => {
            const v = formData.get("filters_ratingMax");
            if (v === null || String(v).trim() === "") return null;
            const n = Number(v);
            return Number.isNaN(n) ? null : n;
          })(),
          yearMin: parseIntOrNull("filters_yearMin"),
          yearMax: parseIntOrNull("filters_yearMax"),
          esrb,
          players: String(formData.get("filters_players") || "any"),
          onlyWithCover: parseBool("filters_onlyWithCover", false),
          ordering: String(formData.get("filters_ordering") || "-metacritic"),
          searchQuery: (() => {
            const v = formData.get("filters_searchQuery");
            const s = v ? String(v).trim() : "";
            return s ? s : null;
          })(),
        },
        catalog: {
          allowManualAdd: parseBool("catalog_allowManualAdd", true),
          fallbackToCatalog: parseBool("catalog_fallbackToCatalog", true),
        },
        maxCandidates: parseIntOr("gamePool_maxCandidates", 20),
        cacheTtlHours: parseIntOr("gamePool_cacheTtlHours", 24),
        autoFetchOnRoll: parseBool("gamePool_autoFetchOnRoll", false),
      },
    };
  } else if (legacy !== null && String(legacy).trim() !== "") {
    const configRaw = String(legacy || "{}");
    try {
      config = JSON.parse(configRaw);
    } catch {
      return { config: null, error: "formConfigInvalidJson", rulesMd };
    }
  } else {
    return { config: null, error: "formUnknown", rulesMd };
  }

  return { config, rulesMd };
}
