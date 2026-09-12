import { describe, expect, it } from "vitest";

import { DEFAULT_SEASON_CONFIG } from "../../../engine/config/defaults";
import type { SeasonConfig } from "../../../engine/types/season";
import { GAME_POOL_TEMPLATES } from "./templates";
import {
  applyTemplate,
  captureTemplateSnapshot,
  changedStages,
  editedStages,
  stageChanged,
  nextPendingStage,
  resetStage,
  revertTemplate,
  SEASON_STAGES,
  stageProgress,
  toggleTemplate,
} from "./season-setup";

const HORROR = GAME_POOL_TEMPLATES.find((t) => t.id === "horror")!;
const STRATEGY = GAME_POOL_TEMPLATES.find((t) => t.id === "strategy")!;

/** Deep clone so no test mutates the shared default. */
function freshConfig(): SeasonConfig {
  return structuredClone(DEFAULT_SEASON_CONFIG);
}

describe("applyTemplate", () => {
  it("writes the template's filters, board hint and id", () => {
    const cfg = applyTemplate(freshConfig(), HORROR);
    expect(cfg.gamePool.templateId).toBe("horror");
    expect(cfg.gamePool.filters.genres).toEqual(HORROR.filters.genres);
    expect(cfg.gamePool.filters.tags).toEqual(HORROR.filters.tags);
    expect(cfg.gamePool.filters.ordering).toBe(HORROR.filters.ordering);
    expect(cfg.board.bonusCount).toBe(HORROR.boardHint!.bonusCount);
    expect(cfg.board.penaltyCount).toBe(HORROR.boardHint!.penaltyCount);
    expect(cfg.board.eventCount).toBe(HORROR.boardHint!.eventCount);
  });

  it("leaves fields the template does not own alone", () => {
    const base = freshConfig();
    base.gamePool.source = "hybrid";
    base.gamePool.filters.metacriticMin = 70;
    base.board.size = 60;
    const cfg = applyTemplate(base, HORROR);
    expect(cfg.gamePool.source).toBe("hybrid");
    expect(cfg.gamePool.filters.metacriticMin).toBe(70);
    expect(cfg.board.size).toBe(60);
  });

  it("does not mutate the input config", () => {
    const base = freshConfig();
    applyTemplate(base, HORROR);
    expect(base.gamePool.templateId).toBeNull();
    expect(base.gamePool.filters.genres).toEqual([]);
  });
});

describe("revertTemplate", () => {
  // Regression: clearing a template used to null `templateId` only, stranding
  // the template's genres, tags, ordering and board counts in the config. A
  // season saved in that state silently filtered the roll pool down to the
  // template's genres, which surfaced to players as `catalogEmpty`.
  it("leaves no orphan filters behind after apply -> clear", () => {
    const snapshot = captureTemplateSnapshot(freshConfig());
    const applied = applyTemplate(freshConfig(), HORROR);
    const cleared = revertTemplate(applied, snapshot);

    expect(cleared.gamePool.templateId).toBeNull();
    expect(cleared.gamePool.filters.genres).toEqual([]);
    expect(cleared.gamePool.filters.tags).toEqual([]);
    expect(cleared.gamePool.filters.ordering).toBe(DEFAULT_SEASON_CONFIG.gamePool.filters.ordering);
    expect(cleared.board.bonusCount).toBe(DEFAULT_SEASON_CONFIG.board.bonusCount);
    expect(cleared.board.penaltyCount).toBe(DEFAULT_SEASON_CONFIG.board.penaltyCount);
    expect(cleared.board.eventCount).toBe(DEFAULT_SEASON_CONFIG.board.eventCount);
  });

  it("restores the admin's own values, not the defaults", () => {
    const base = freshConfig();
    base.gamePool.filters.genres = ["rpg"];
    base.gamePool.filters.tags = ["co-op"];
    base.board.penaltyCount = 9;
    const snapshot = captureTemplateSnapshot(base);

    const cleared = revertTemplate(applyTemplate(base, HORROR), snapshot);
    expect(cleared.gamePool.filters.genres).toEqual(["rpg"]);
    expect(cleared.gamePool.filters.tags).toEqual(["co-op"]);
    expect(cleared.board.penaltyCount).toBe(9);
  });

  it("falls back to defaults when no snapshot exists (season loaded from db)", () => {
    const stored = applyTemplate(freshConfig(), HORROR);
    const cleared = revertTemplate(stored, null);
    expect(cleared.gamePool.filters.genres).toEqual([]);
    expect(cleared.gamePool.filters.tags).toEqual([]);
    expect(cleared.board.penaltyCount).toBe(DEFAULT_SEASON_CONFIG.board.penaltyCount);
  });

  it("keeps non-template pool settings intact", () => {
    const base = freshConfig();
    base.gamePool.source = "api";
    base.gamePool.provider = "freetogame";
    base.gamePool.filters.metacriticMin = 80;
    base.gamePool.maxCandidates = 50;
    const cleared = revertTemplate(applyTemplate(base, HORROR), null);
    expect(cleared.gamePool.source).toBe("api");
    expect(cleared.gamePool.provider).toBe("freetogame");
    expect(cleared.gamePool.filters.metacriticMin).toBe(80);
    expect(cleared.gamePool.maxCandidates).toBe(50);
  });
});

describe("toggleTemplate", () => {
  it("selects on first click and deselects on second", () => {
    const snapshot = captureTemplateSnapshot(freshConfig());
    const on = toggleTemplate(freshConfig(), HORROR, snapshot);
    expect(on.gamePool.templateId).toBe("horror");

    const off = toggleTemplate(on, HORROR, snapshot);
    expect(off.gamePool.templateId).toBeNull();
    expect(off.gamePool.filters.tags).toEqual([]);
  });

  it("switches between templates without stacking their filters", () => {
    const snapshot = captureTemplateSnapshot(freshConfig());
    const horror = toggleTemplate(freshConfig(), HORROR, snapshot);
    const strategy = toggleTemplate(horror, STRATEGY, snapshot);

    expect(strategy.gamePool.templateId).toBe("strategy");
    expect(strategy.gamePool.filters.genres).toEqual(STRATEGY.filters.genres);
    expect(strategy.gamePool.filters.tags).toEqual(STRATEGY.filters.tags);
    expect(strategy.gamePool.filters.tags).not.toContain("horror");
  });

  it("reverts to the pre-template state after switching templates", () => {
    const base = freshConfig();
    base.gamePool.filters.genres = ["indie"];
    const snapshot = captureTemplateSnapshot(base);

    const horror = toggleTemplate(base, HORROR, snapshot);
    const strategy = toggleTemplate(horror, STRATEGY, snapshot);
    const off = toggleTemplate(strategy, STRATEGY, snapshot);

    expect(off.gamePool.templateId).toBeNull();
    expect(off.gamePool.filters.genres).toEqual(["indie"]);
  });
});

describe("resetStage", () => {
  /** A config where every stage differs from the defaults. */
  function dirtyConfig(): SeasonConfig {
    const c = freshConfig();
    c.dice.sides = 20;
    c.points.startingBalance = 15;
    c.rerolls.limitPerGame = 4;
    c.moderation.completionRequireApproval = true;
    c.board.size = 66;
    c.board.perCellGenre = true;
    c.gamePool.source = "hybrid";
    c.gamePool.filters.metacriticMin = 75;
    c.rules.mode = "manual";
    return c;
  }

  it("resets dice, points, rerolls and moderation together", () => {
    const c = resetStage(dirtyConfig(), "dice");
    expect(c.dice).toEqual(DEFAULT_SEASON_CONFIG.dice);
    expect(c.points).toEqual(DEFAULT_SEASON_CONFIG.points);
    expect(c.rerolls).toEqual(DEFAULT_SEASON_CONFIG.rerolls);
    expect(c.moderation).toEqual(DEFAULT_SEASON_CONFIG.moderation);
    // untouched
    expect(c.board.size).toBe(66);
    expect(c.gamePool.source).toBe("hybrid");
    expect(c.rules.mode).toBe("manual");
  });

  it("resets the board without touching the pool", () => {
    const c = resetStage(dirtyConfig(), "board");
    expect(c.board).toEqual(DEFAULT_SEASON_CONFIG.board);
    expect(c.gamePool.source).toBe("hybrid");
    expect(c.dice.sides).toBe(20);
  });

  it("resets the pool without touching dice or board", () => {
    const c = resetStage(dirtyConfig(), "pool");
    expect(c.gamePool).toEqual(DEFAULT_SEASON_CONFIG.gamePool);
    expect(c.board.size).toBe(66);
    expect(c.dice.sides).toBe(20);
  });

  it("resets rules only", () => {
    const c = resetStage(dirtyConfig(), "rules");
    expect(c.rules).toEqual(DEFAULT_SEASON_CONFIG.rules);
    expect(c.board.size).toBe(66);
  });

  it("templates stage clears the template without wiping the whole pool", () => {
    const applied = applyTemplate(dirtyConfig(), HORROR);
    const c = resetStage(applied, "templates");
    expect(c.gamePool.templateId).toBeNull();
    expect(c.gamePool.filters.genres).toEqual([]);
    // a template never owned these, so they survive the reset
    expect(c.gamePool.source).toBe("hybrid");
    expect(c.gamePool.filters.metacriticMin).toBe(75);
    expect(c.board.size).toBe(66);
  });

  it("never mutates the config it is given", () => {
    const c = dirtyConfig();
    resetStage(c, "board");
    expect(c.board.size).toBe(66);
  });
});

describe("stageProgress", () => {
  it("is 0 with nothing confirmed and 1 with every stage confirmed", () => {
    expect(stageProgress([])).toBe(0);
    expect(stageProgress([...SEASON_STAGES])).toBe(1);
  });

  it("ignores duplicates", () => {
    // Derived from SEASON_STAGES so adding a stage does not break this test.
    expect(stageProgress(["dice", "dice", "dice"])).toBeCloseTo(1 / SEASON_STAGES.length);
  });
});

describe("nextPendingStage", () => {
  it("advances to the following unconfirmed stage", () => {
    expect(nextPendingStage("templates", [])).toBe("dice");
  });

  it("skips stages already confirmed", () => {
    expect(nextPendingStage("templates", ["dice", "board"])).toBe("pool");
  });

  it("reaches the iee stage after the pool is confirmed", () => {
    expect(nextPendingStage("pool", ["templates", "dice", "board"])).toBe("iee");
  });

  it("wraps around to an earlier unconfirmed stage", () => {
    expect(nextPendingStage("rules", ["dice", "board", "pool"])).toBe("templates");
  });

  it("returns null once confirming the current stage completes the set", () => {
    const allButLast = SEASON_STAGES.filter((s) => s !== "rules");
    expect(nextPendingStage("rules", allButLast)).toBeNull();
  });
});

describe("stageChanged", () => {
  const base = () => ({ config: freshConfig(), rulesMd: "" });

  it("is false for an untouched config", () => {
    const b = base();
    for (const s of SEASON_STAGES) expect(stageChanged(b, base(), s)).toBe(false);
  });

  it("marks only the stage that owns the edited field", () => {
    const next = base();
    next.config.dice.sides = 20;
    expect(changedStages(base(), next)).toEqual(["dice"]);
  });

  it("attributes board edits to the board stage", () => {
    const next = base();
    next.config.board.penaltyCount = 9;
    expect(changedStages(base(), next)).toEqual(["board"]);
  });

  it("attributes rules text to the rules stage", () => {
    const next = { config: freshConfig(), rulesMd: "# Правила" };
    expect(changedStages(base(), next)).toEqual(["rules"]);
  });

  it("reports templates, pool and board when a template is applied", () => {
    const next = { config: applyTemplate(freshConfig(), HORROR), rulesMd: "" };
    expect(changedStages(base(), next)).toEqual(["templates", "board", "pool"]);
  });

  it("ignores key order between the baseline and the current config", () => {
    const a = freshConfig();
    const b = freshConfig();
    // same values, opposite insertion order
    b.dice = Object.fromEntries(Object.entries(a.dice).reverse()) as SeasonConfig["dice"];
    expect(Object.keys(b.dice)).not.toEqual(Object.keys(a.dice));
    expect(stageChanged({ config: a, rulesMd: "" }, { config: b, rulesMd: "" }, "dice")).toBe(false);
  });

  it("goes quiet again once the baseline catches up with a save", () => {
    const edited = base();
    edited.config.board.size = 55;
    expect(stageChanged(base(), edited, "board")).toBe(true);
    // after saving, the saved config becomes the new baseline
    expect(stageChanged(edited, edited, "board")).toBe(false);
  });
});

describe("editedStages", () => {
  const base = () => ({ config: freshConfig(), rulesMd: "" });

  it("credits a template pick to the templates stage only", () => {
    const next = { config: applyTemplate(freshConfig(), HORROR), rulesMd: "" };
    // the raw slice diff sees three stages...
    expect(changedStages(base(), next)).toEqual(["templates", "board", "pool"]);
    // ...but the admin only worked on the templates tab
    expect(editedStages(base(), next, ["templates"])).toEqual(["templates"]);
  });

  it("stays empty when nothing was touched", () => {
    const next = { config: applyTemplate(freshConfig(), HORROR), rulesMd: "" };
    expect(editedStages(base(), next, [])).toEqual([]);
  });

  it("ignores a touched stage whose values are back to the baseline", () => {
    const next = base();
    next.config.board.size = 55;
    expect(editedStages(base(), next, ["board"])).toEqual(["board"]);
    next.config.board.size = DEFAULT_SEASON_CONFIG.board.size;
    expect(editedStages(base(), next, ["board"])).toEqual([]);
  });

  it("reports several stages when each was edited on its own tab", () => {
    const next = base();
    next.config.dice.sides = 20;
    next.config.board.size = 55;
    expect(editedStages(base(), next, ["dice", "board"])).toEqual(["dice", "board"]);
  });

  it("keeps wizard order regardless of the order stages were touched", () => {
    const next = base();
    next.config.dice.sides = 20;
    next.config.board.size = 55;
    expect(editedStages(base(), next, ["board", "dice"])).toEqual(["dice", "board"]);
  });
});

const ENTRY = {
  enabled: true,
  weight: 100,
  polarityOverride: null,
  maxPerSeason: null,
  maxPerPlayer: null,
  cooldownRolls: 0,
  minPosition: 0,
  unlockAfterMove: 0,
  paramOverrides: {},
  durationOverride: null,
  targetOverride: null,
};

describe("resetStage — iee", () => {
  it("clears the season pool and event list but keeps the other stages", () => {
    const cfg: SeasonConfig = {
      ...freshConfig(),
      iee: {
        enabled: true,
        inventorySize: 3,
        allowTargetingOthers: true,
        pvpProtectionMoves: 0,
        revealDropsInFeed: false,
        nothingWeight: 40,
        catchUp: { enabled: true, maxMultiplier: 2 },
        entries: { hex_scroll: { ...ENTRY, weight: 250 } },
        events: ["screenshot_of_the_day"],
      },
    };
    const out = resetStage(cfg, "iee");
    expect(out.iee.entries).toEqual({});
    expect(out.iee.events).toEqual([]);
    expect(out.iee.enabled).toBe(DEFAULT_SEASON_CONFIG.iee.enabled);
    expect(out.iee.catchUp).toEqual(DEFAULT_SEASON_CONFIG.iee.catchUp);
    // untouched neighbours
    expect(out.board).toEqual(cfg.board);
    expect(out.gamePool).toEqual(cfg.gamePool);
  });

  it("does not hand back references into DEFAULT_SEASON_CONFIG", () => {
    const out = resetStage(freshConfig(), "iee");
    out.iee.entries.x = { ...ENTRY };
    out.iee.catchUp.maxMultiplier = 4;
    out.iee.events.push("boom");
    expect(DEFAULT_SEASON_CONFIG.iee.entries).toEqual({});
    expect(DEFAULT_SEASON_CONFIG.iee.catchUp.maxMultiplier).not.toBe(4);
    expect(DEFAULT_SEASON_CONFIG.iee.events).toEqual([]);
  });

  it("iee sits between pool and rules in the wizard", () => {
    expect([...SEASON_STAGES]).toEqual([
      "templates",
      "dice",
      "board",
      "pool",
      "iee",
      "rules",
    ]);
  });

  it("resetting another stage leaves the iee pool alone", () => {
    const cfg: SeasonConfig = {
      ...freshConfig(),
      iee: { ...DEFAULT_SEASON_CONFIG.iee, enabled: true, entries: { slowed: { ...ENTRY } } },
    };
    expect(resetStage(cfg, "board").iee.entries).toEqual({ slowed: { ...ENTRY } });
    expect(resetStage(cfg, "pool").iee.enabled).toBe(true);
  });
});
