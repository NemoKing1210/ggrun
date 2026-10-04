import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerEffectRow, PlayerInventoryRow } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG, type IeeConfig, type IeeEntryConfig } from "@/lib/engine";

import { grantEffect, grantInventoryItem, hasActiveEffect, type GrantEffectInput } from "./grant";

const dbFake = vi.hoisted(() => ({ db: { marker: "db" }, tx: { marker: "tx" } }));
vi.mock("@/lib/infrastructure/db", () => ({ db: dbFake.db }));

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const repo = vi.hoisted(() => ({
  getActiveEffectRows: vi.fn(),
  grantItem: vi.fn(),
  insertEffect: vi.fn(),
  refreshEffect: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", () => repo);

const TX = dbFake.tx as never;

function entry(overrides: Partial<IeeEntryConfig> = {}): IeeEntryConfig {
  return {
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
    ...overrides,
  };
}

function config(entries: Record<string, IeeEntryConfig> = {}): IeeConfig {
  return { ...structuredClone(DEFAULT_SEASON_CONFIG.iee), enabled: true, entries };
}

function effectRow(overrides: Partial<PlayerEffectRow> = {}): PlayerEffectRow {
  return {
    id: "eff-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    effectKey: "unlucky",
    params: {},
    polarity: "negative",
    chargesLeft: null,
    expiresAfterRollSeq: 10,
    state: "active",
    appliedBySeasonPlayerId: null,
    source: "cell_penalty",
    seasonRollSeq: 0,
    sourceMoveId: null,
    appliedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
}

function inventoryRow(overrides: Partial<PlayerInventoryRow> = {}): PlayerInventoryRow {
  return {
    id: "inv-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    itemKey: "hex_scroll",
    params: {},
    chargesLeft: 1,
    state: "held",
    source: "cell_bonus",
    seasonRollSeq: 0,
    sourceMoveId: null,
    acquiredAt: new Date(0),
    usedAt: null,
    ...overrides,
  } as PlayerInventoryRow;
}

function effectInput(overrides: Partial<GrantEffectInput> = {}): GrantEffectInput {
  return {
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    effectKey: "heavy_boots",
    config: config(),
    anchorRollSeq: 4,
    seasonRollSeq: 12,
    source: "cell_penalty",
    sourceMoveId: "move-1",
    appliedBySeasonPlayerId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getActiveEffectRows.mockResolvedValue([]);
  repo.insertEffect.mockResolvedValue(effectRow());
  repo.refreshEffect.mockResolvedValue(null);
  repo.grantItem.mockResolvedValue(inventoryRow());
});

describe("grantEffect", () => {
  it("returns null and reports a catalog drift for an unknown key", async () => {
    await expect(grantEffect(TX, effectInput({ effectKey: "ghost" }))).resolves.toBeNull();
    expect(logger.log.error).toHaveBeenCalledWith("iee.grant.unknown_effect", { key: "ghost" });
    expect(repo.insertEffect).not.toHaveBeenCalled();
  });

  it("blocks a unique status the player already carries", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ effectKey: "unlucky" })]);
    const result = await grantEffect(TX, effectInput({ effectKey: "unlucky" }));
    expect(result).toMatchObject({ state: "blocked_unique", row: null });
    expect(repo.getActiveEffectRows).toHaveBeenCalledWith("sp-1", TX);
    expect(repo.insertEffect).not.toHaveBeenCalled();
  });

  it("grants a unique status when the player does not carry it", async () => {
    const result = await grantEffect(TX, effectInput({ effectKey: "unlucky" }));
    expect(result).toMatchObject({ state: "granted" });
    expect(repo.insertEffect).toHaveBeenCalledOnce();
  });

  it("refreshes an existing refresh-stacking status instead of inserting", async () => {
    repo.refreshEffect.mockResolvedValue(effectRow({ effectKey: "heavy_boots" }));
    const result = await grantEffect(TX, effectInput({ effectKey: "heavy_boots" }));
    expect(result).toMatchObject({ state: "refreshed" });
    // heavy_boots is a 1-roll duration anchored to roll 4 -> 5.
    expect(repo.refreshEffect).toHaveBeenCalledWith(
      "sp-1",
      "heavy_boots",
      { chargesLeft: null, expiresAfterRollSeq: 5 },
      TX,
    );
    expect(repo.insertEffect).not.toHaveBeenCalled();
  });

  it("inserts when a refresh has nothing to refresh", async () => {
    repo.refreshEffect.mockResolvedValue(null);
    const result = await grantEffect(TX, effectInput({ effectKey: "heavy_boots" }));
    expect(result).toMatchObject({ state: "granted" });
    expect(repo.insertEffect).toHaveBeenCalledOnce();
  });

  it("always inserts a stack-stacking status and never checks for duplicates", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ effectKey: "shield" })]);
    const result = await grantEffect(TX, effectInput({ effectKey: "shield" }));
    expect(result).toMatchObject({ state: "granted" });
    expect(repo.getActiveEffectRows).not.toHaveBeenCalled();
    expect(repo.insertEffect).toHaveBeenCalledOnce();
  });

  it("applies the season's duration and params tuning", async () => {
    const input = effectInput({
      effectKey: "heavy_boots",
      anchorRollSeq: 4,
      config: config({ heavy_boots: entry({ durationOverride: 5, paramOverrides: { steps: 4 } }) }),
    });
    await grantEffect(TX, input);

    expect(repo.insertEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        effectKey: "heavy_boots",
        params: { steps: 4 },
        polarity: "negative",
        chargesLeft: null,
        expiresAfterRollSeq: 9,
        source: "cell_penalty",
        sourceMoveId: "move-1",
        seasonRollSeq: 12,
      }),
      TX,
    );
  });

  it("never lets a zero duration override grant fewer than one roll", async () => {
    await grantEffect(
      TX,
      effectInput({
        effectKey: "slowed",
        anchorRollSeq: 7,
        config: config({ slowed: entry({ durationOverride: 0 }) }),
      }),
    );
    expect(repo.insertEffect).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAfterRollSeq: 8, chargesLeft: null }),
      TX,
    );
  });

  it("counts a charges-duration status from the season's override", async () => {
    await grantEffect(
      TX,
      effectInput({ effectKey: "shield", config: config({ shield: entry({ durationOverride: 3 }) }) }),
    );
    expect(repo.insertEffect).toHaveBeenCalledWith(
      expect.objectContaining({ chargesLeft: 3, expiresAfterRollSeq: null, polarity: "positive" }),
      TX,
    );
  });

  it("falls back to catalog params when the season tunes nothing", async () => {
    await grantEffect(TX, effectInput({ effectKey: "slowed", config: config({ slowed: entry() }) }));
    expect(repo.insertEffect).toHaveBeenCalledWith(
      expect.objectContaining({ params: { steps: 1 } }),
      TX,
    );
  });

  it("carries the caster and season clock onto the row", async () => {
    await grantEffect(
      TX,
      effectInput({ source: "item", appliedBySeasonPlayerId: "sp-caster", seasonRollSeq: 21 }),
    );
    expect(repo.insertEffect).toHaveBeenCalledWith(
      expect.objectContaining({ appliedBySeasonPlayerId: "sp-caster", seasonRollSeq: 21, source: "item" }),
      TX,
    );
  });
});

describe("grantInventoryItem", () => {
  it("returns null and reports a catalog drift for an unknown item", async () => {
    const result = await grantInventoryItem(TX, {
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      itemKey: "ghost",
      config: config(),
      seasonRollSeq: 3,
      source: "cell_bonus",
    });
    expect(result).toBeNull();
    expect(logger.log.error).toHaveBeenCalledWith("iee.grant.unknown_item", { key: "ghost" });
    expect(repo.grantItem).not.toHaveBeenCalled();
  });

  it("grants an item with its catalog params and charge count", async () => {
    await grantInventoryItem(TX, {
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      itemKey: "hex_scroll",
      config: config(),
      seasonRollSeq: 3,
      source: "cell_bonus",
      sourceMoveId: "move-9",
    });

    expect(repo.grantItem).toHaveBeenCalledWith(
      {
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        itemKey: "hex_scroll",
        params: { effectKey: "slowed" },
        charges: 1,
        source: "cell_bonus",
        sourceMoveId: "move-9",
        seasonRollSeq: 3,
      },
      TX,
    );
  });

  it("uses the season's param overrides and duration-as-charges", async () => {
    await grantInventoryItem(TX, {
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      itemKey: "hex_scroll",
      config: config({ hex_scroll: entry({ durationOverride: 3, paramOverrides: { effectKey: "unlucky" } }) }),
      seasonRollSeq: 3,
      source: "item",
    });

    expect(repo.grantItem).toHaveBeenCalledWith(
      expect.objectContaining({ params: { effectKey: "unlucky" }, charges: 3, sourceMoveId: null }),
      TX,
    );
  });

  it("prefers explicit params over catalog defaults", async () => {
    await grantInventoryItem(TX, {
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      itemKey: "hex_scroll",
      config: config(),
      seasonRollSeq: 3,
      source: "item",
      params: { effectKey: "taxed" },
    });
    expect(repo.grantItem).toHaveBeenCalledWith(
      expect.objectContaining({ params: { effectKey: "taxed" } }),
      TX,
    );
  });
});

describe("hasActiveEffect", () => {
  it("is true when the key is among the active rows", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ effectKey: "unlucky" })]);
    await expect(hasActiveEffect("sp-1", "unlucky", TX)).resolves.toBe(true);
  });

  it("is false when the key is absent, and defaults to the pool", async () => {
    repo.getActiveEffectRows.mockResolvedValue([effectRow({ effectKey: "slowed" })]);
    await expect(hasActiveEffect("sp-1", "unlucky")).resolves.toBe(false);
    expect(repo.getActiveEffectRows).toHaveBeenCalledWith("sp-1", dbFake.db);
  });
});
