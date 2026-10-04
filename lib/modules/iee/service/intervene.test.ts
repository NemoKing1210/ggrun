import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerEffectRow, PlayerInventoryRow } from "@/db/schema";

import { adminRevokeEffect, adminRevokeItem } from "./intervene";

const session = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isStaff: vi.fn((user: { role?: string } | null) => user?.role === "admin" || user?.role === "judge"),
}));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const eventsInfra = vi.hoisted(() => ({ logAdminAction: vi.fn(), logEvent: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => eventsInfra);

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const repo = vi.hoisted(() => ({
  getInventoryItem: vi.fn(),
  revokeItem: vi.fn(),
  getEffectRow: vi.fn(),
  markEffectsEnded: vi.fn(),
}));
vi.mock("@/lib/modules/iee/repository", () => repo);

const ACTOR = { id: "admin-1", role: "admin" };

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
    seasonRollSeq: 4,
    sourceMoveId: null,
    acquiredAt: new Date(0),
    usedAt: null,
    ...overrides,
  };
}

function effectRow(overrides: Partial<PlayerEffectRow> = {}): PlayerEffectRow {
  return {
    id: "eff-1",
    seasonId: "season-1",
    seasonPlayerId: "sp-1",
    effectKey: "shield",
    params: {},
    polarity: "positive",
    chargesLeft: null,
    expiresAfterRollSeq: 6,
    state: "active",
    appliedBySeasonPlayerId: null,
    source: "cell_bonus",
    seasonRollSeq: 4,
    sourceMoveId: null,
    appliedAt: new Date(0),
    endedAt: null,
    ...overrides,
  } as PlayerEffectRow;
}

beforeEach(() => {
  session.getCurrentUser.mockReset();
  eventsInfra.logAdminAction.mockReset();
  eventsInfra.logEvent.mockReset();
  eventsInfra.logAdminAction.mockResolvedValue(undefined);
  eventsInfra.logEvent.mockResolvedValue(undefined);
  for (const fn of Object.values(repo)) fn.mockReset();
});

describe("adminRevokeItem", () => {
  it("refuses a non-staff actor before reading the row", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(repo.getInventoryItem).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "  no " })).rejects.toMatchObject({
      code: "formReasonRequired",
    });
    expect(repo.getInventoryItem).not.toHaveBeenCalled();
  });

  it("refuses an unknown inventory row", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getInventoryItem.mockResolvedValue(null);
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });

  it("refuses an item that is already spent", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getInventoryItem.mockResolvedValue(inventoryRow());
    repo.revokeItem.mockResolvedValue(false);
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
    expect(eventsInfra.logAdminAction).not.toHaveBeenCalled();
  });

  it("revokes the row, audits it and tells the season feed", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getInventoryItem.mockResolvedValue(inventoryRow());
    repo.revokeItem.mockResolvedValue(true);

    await expect(
      adminRevokeItem({ inventoryId: "inv-1", reason: "  handed out in error  " }),
    ).resolves.toEqual({ itemKey: "hex_scroll" });

    expect(repo.revokeItem).toHaveBeenCalledWith("inv-1");
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "iee_item_revoked",
      targetType: "player_inventory",
      targetId: "inv-1",
      payload: { itemKey: "hex_scroll", seasonPlayerId: "sp-1", reason: "handed out in error" },
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: "season-1",
        seasonPlayerId: "sp-1",
        eventType: "item_revoked",
        payload: { itemKey: "hex_scroll", by: "admin" },
      }),
    );
  });
});

describe("adminRevokeEffect", () => {
  it("refuses a non-staff actor before reading the row", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(repo.getEffectRow).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "no" })).rejects.toMatchObject({
      code: "formReasonRequired",
    });
  });

  it("refuses an unknown status row", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getEffectRow.mockResolvedValue(null);
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeEffectNotFound",
    });
  });

  it("refuses a status that is not active", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getEffectRow.mockResolvedValue(effectRow({ state: "expired" }));
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeEffectNotActive",
    });
    expect(repo.markEffectsEnded).not.toHaveBeenCalled();
  });

  it("ends the status as revoked, audits it and tells the season feed", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    repo.getEffectRow.mockResolvedValue(effectRow());
    repo.markEffectsEnded.mockResolvedValue(undefined);

    await expect(
      adminRevokeEffect({ effectId: "eff-1", reason: "  never should have landed  " }),
    ).resolves.toEqual({ effectKey: "shield" });

    expect(repo.markEffectsEnded).toHaveBeenCalledWith(["eff-1"], "revoked");
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "iee_effect_revoked",
      targetType: "player_effects",
      targetId: "eff-1",
      payload: { effectKey: "shield", seasonPlayerId: "sp-1", reason: "never should have landed" },
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "effect_revoked",
        payload: { effectKey: "shield", by: "admin" },
      }),
    );
  });
});
