import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IeeInstanceRow } from "@/db/schema";
import { DEFAULT_SEASON_CONFIG } from "@/lib/engine";

import type { ExecContext } from "../executor";
import type { ContextInput } from "../executor/context";
import { memoryStore } from "../executor/memory-store.test-helpers";
import { coreRegistry } from "../registry";
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

vi.mock("@/lib/infrastructure/db", () => ({
  db: { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ marker: "tx" }) },
}));

const seasons = vi.hoisted(() => ({ getSeasonById: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => seasons);

const instances = vi.hoisted(() => ({ getInstanceRow: vi.fn() }));
vi.mock("@/lib/modules/iee/repository/instances", () => instances);

const context = vi.hoisted(() => ({ executionContext: vi.fn() }));
vi.mock("@/lib/modules/iee/executor/context", () => context);

// A season plays its catalog, read from the database; these tests play the
// system pack's fixture instead.
vi.mock("@/lib/modules/iee/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/iee/registry")>();
  return { ...actual, getSeasonRegistry: async () => actual.coreRegistry() };
});

const ACTOR = { id: "admin-1", role: "admin" };
const REGISTRY = coreRegistry();

let mem = memoryStore();

function instance(key: string, overrides: Partial<IeeInstanceRow> = {}): IeeInstanceRow {
  const def = REGISTRY.get(key)!;
  return {
    id: def.kind === "item" ? "inv-1" : "eff-1",
    seasonId: "season-1",
    entryId: def.entryId,
    revisionId: def.revisionId,
    kind: def.kind,
    holderKind: "player",
    holderPlayerId: "sp-1",
    holderCellIndex: null,
    holderRollId: null,
    ownerPlayerId: null,
    aimedPlayerId: null,
    chosen: null,
    params: {},
    chargesLeft: def.kind === "item" ? 1 : null,
    remaining: def.kind === "effect" ? 1 : null,
    remainingUnit: def.kind === "effect" ? "triggers" : null,
    anchorRollSeq: null,
    countFromRollSeq: null,
    status: "active",
    endReason: null,
    source: "cell_bonus",
    sourceMoveId: null,
    causeJournalId: null,
    grantedRollSeq: 4,
    grantedAt: new Date(0),
    endedAt: null,
    ...overrides,
  };
}

/** The row the service reads, and the same row in the store the executor writes. */
function exists(row: IeeInstanceRow): void {
  mem.instances.push({ ...row });
  instances.getInstanceRow.mockResolvedValue(row);
}

beforeEach(() => {
  vi.clearAllMocks();
  mem = memoryStore();
  eventsInfra.logAdminAction.mockResolvedValue(undefined);
  eventsInfra.logEvent.mockResolvedValue(undefined);
  instances.getInstanceRow.mockResolvedValue(null);
  seasons.getSeasonById.mockResolvedValue({ id: "season-1", config: DEFAULT_SEASON_CONFIG });
  context.executionContext.mockImplementation(
    async (input: ContextInput): Promise<ExecContext> => ({
      store: mem.store,
      seasonId: input.seasonId,
      registry: REGISTRY,
      config: input.config,
      seasonRollSeq: 9,
      actorUserId: input.actorUserId ?? null,
      rng: () => 0.5,
      snapshot: async () => {
        throw new Error("a revoke reads no snapshot");
      },
      anchorFor: async () => ({ anchorRollSeq: 0 }),
    }),
  );
});

describe("adminRevokeItem", () => {
  it("refuses a non-staff actor before reading the row", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "user-1", role: "player" });
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(instances.getInstanceRow).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "  no " })).rejects.toMatchObject({
      code: "formReasonRequired",
    });
    expect(instances.getInstanceRow).not.toHaveBeenCalled();
  });

  it("refuses an unknown instance", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });

  it("refuses a status passed off as an item", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    exists(instance("ward", { id: "inv-1" }));
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeItemNotFound",
    });
  });

  it("refuses an item that is already spent, and audits nothing", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    exists(instance("hex_scroll", { status: "ended", endReason: "used", chargesLeft: 0 }));
    await expect(adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeItemAlreadyUsed",
    });
    expect(mem.journal).toEqual([]);
    expect(eventsInfra.logAdminAction).not.toHaveBeenCalled();
  });

  it("ends the item as revoked through the executor, audits it and tells the season feed", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    exists(instance("hex_scroll"));

    await expect(
      adminRevokeItem({ inventoryId: "inv-1", reason: "  handed out in error  " }),
    ).resolves.toEqual({ itemKey: "hex_scroll" });

    expect(context.executionContext).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: "season-1", config: DEFAULT_SEASON_CONFIG.iee, actorUserId: "admin-1" }),
    );
    expect(mem.instances[0]).toMatchObject({ status: "ended", endReason: "revoked" });
    expect(mem.journal).toEqual([
      expect.objectContaining({
        op: "end",
        instanceId: "inv-1",
        targetPlayerId: "sp-1",
        outcome: { reason: "revoked", note: "handed out in error" },
        visibility: "public",
      }),
    ]);
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "iee_item_revoked",
      targetType: "iee_instance",
      targetId: "inv-1",
      payload: { itemKey: "hex_scroll", seasonPlayerId: "sp-1", reason: "handed out in error" },
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith({
      seasonId: "season-1",
      seasonPlayerId: "sp-1",
      eventType: "item_revoked",
      payload: { itemKey: "hex_scroll", name: REGISTRY.get("hex_scroll")!.names, by: "admin" },
    });
  });

  it("falls back to the default tuning when the stored config is unreadable", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    seasons.getSeasonById.mockResolvedValue({ id: "season-1", config: { iee: "broken" } });
    exists(instance("hex_scroll"));
    await adminRevokeItem({ inventoryId: "inv-1", reason: "a valid reason" });
    expect(context.executionContext).toHaveBeenCalledWith(
      expect.objectContaining({ config: DEFAULT_SEASON_CONFIG.iee }),
    );
  });
});

describe("adminRevokeEffect", () => {
  it("refuses a non-staff actor before reading the row", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "adminStaffRequired",
    });
    expect(instances.getInstanceRow).not.toHaveBeenCalled();
  });

  it("requires a meaningful reason", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "no" })).rejects.toMatchObject({
      code: "formReasonRequired",
    });
  });

  it("refuses an unknown instance, and an item passed off as a status", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeEffectNotFound",
    });
    exists(instance("hex_scroll", { id: "eff-1" }));
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeEffectNotFound",
    });
  });

  it("refuses a status that has already ended, without opening a transaction", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    exists(instance("ward", { status: "ended", endReason: "expired" }));
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeEffectNotActive",
    });
    expect(context.executionContext).not.toHaveBeenCalled();
  });

  it("refuses when the status ended between the read and the revoke", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    exists(instance("ward"));
    mem.instances[0]!.status = "ended";
    await expect(adminRevokeEffect({ effectId: "eff-1", reason: "a valid reason" })).rejects.toMatchObject({
      code: "ieeEffectNotActive",
    });
    expect(eventsInfra.logAdminAction).not.toHaveBeenCalled();
  });

  it("ends the status as revoked, audits it and tells the season feed", async () => {
    session.getCurrentUser.mockResolvedValue(ACTOR);
    exists(instance("ward"));

    await expect(
      adminRevokeEffect({ effectId: "eff-1", reason: "  never should have landed  " }),
    ).resolves.toEqual({ effectKey: "ward" });

    expect(mem.instances[0]).toMatchObject({ status: "ended", endReason: "revoked" });
    expect(mem.journal[0]).toMatchObject({ op: "end", outcome: { reason: "revoked", note: "never should have landed" } });
    expect(eventsInfra.logAdminAction).toHaveBeenCalledWith({
      actorId: "admin-1",
      actionType: "iee_effect_revoked",
      targetType: "iee_instance",
      targetId: "eff-1",
      payload: { effectKey: "ward", seasonPlayerId: "sp-1", reason: "never should have landed" },
    });
    expect(eventsInfra.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "effect_revoked",
        payload: { effectKey: "ward", name: REGISTRY.get("ward")!.names, by: "admin" },
      }),
    );
  });
});
