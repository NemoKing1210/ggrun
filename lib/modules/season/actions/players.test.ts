import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/modules/season/service/errors";

import {
  addPlayerToSeasonAction,
  adjustPlayerAction,
  removePlayerFromSeasonAction,
  submitAdjustPlayerAction,
} from "./players";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: {
    core: {
      errors: {
        adminPlayerNotFound: "Player not found",
        adminStaffRequired: "Staff only",
        formUnknown: "Unknown error",
      },
    },
    admin: { feedback: { playerAdded: "Player added", adjustmentApplied: "Adjustment applied" } },
  },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const service = vi.hoisted(() => ({
  adminAddPlayer: vi.fn(),
  adminAdjustPlayer: vi.fn(),
  adminRemovePlayer: vi.fn(),
}));
vi.mock("@/lib/modules/season/service", () => service);

const EMPTY = {};

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  cache.revalidatePath.mockClear();
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" });
  for (const fn of Object.values(service)) fn.mockReset();
  service.adminAddPlayer.mockResolvedValue(undefined);
  service.adminRemovePlayer.mockResolvedValue(undefined);
  service.adminAdjustPlayer.mockResolvedValue(undefined);
  logger.log.info.mockClear();
  logger.log.error.mockClear();
});

describe("addPlayerToSeasonAction", () => {
  it("adds the player and forgets every surface that showed the roster", async () => {
    const result = await addPlayerToSeasonAction(EMPTY, formData({ seasonId: "season-1", userId: "user-1" }));

    expect(service.adminAddPlayer).toHaveBeenCalledWith("season-1", "user-1");
    expect(result).toEqual({ ok: "Player added" });
    expect(cache.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/admin",
      "/admin/seasons",
      "/admin/seasons/season-1",
      "/admin/seasons/season-1/board",
      "/admin/seasons/season-1/players",
      "/admin/seasons/season-1/bots",
    ]);
  });

  it("translates a domain failure without revalidating", async () => {
    service.adminAddPlayer.mockRejectedValue(new AdminError("adminPlayerNotFound"));
    const result = await addPlayerToSeasonAction(EMPTY, formData({ seasonId: "season-1", userId: "user-1" }));

    expect(result).toEqual({ error: "Player not found" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("adjustPlayerAction", () => {
  it("coerces present numerics and drops blank fields", async () => {
    const result = await adjustPlayerAction(
      EMPTY,
      formData({
        seasonPlayerId: "sp-1",
        seasonId: "season-1",
        position: "7",
        balancePoints: "",
        status: "eliminated",
        reason: "judge fix",
      }),
    );

    expect(service.adminAdjustPlayer).toHaveBeenCalledWith({
      seasonPlayerId: "sp-1",
      reason: "judge fix",
      position: 7,
      status: "eliminated",
    });
    expect(result).toEqual({ ok: "Adjustment applied" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/seasons/season-1/players");
  });

  it("sends only the identity and reason when everything else is blank", async () => {
    await adjustPlayerAction(
      EMPTY,
      formData({ seasonPlayerId: "sp-1", seasonId: "season-1", position: "", balancePoints: "", status: "", reason: "note" }),
    );
    expect(service.adminAdjustPlayer).toHaveBeenCalledWith({ seasonPlayerId: "sp-1", reason: "note" });
  });

  it("translates a domain failure instead of throwing", async () => {
    service.adminAdjustPlayer.mockRejectedValue(new AdminError("adminPlayerNotFound"));
    const result = await adjustPlayerAction(
      EMPTY,
      formData({ seasonPlayerId: "sp-1", seasonId: "season-1", position: "1", reason: "x" }),
    );
    expect(result).toEqual({ error: "Player not found" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("submitAdjustPlayerAction", () => {
  it("revalidates the season on success", async () => {
    await expect(
      submitAdjustPlayerAction(formData({ seasonPlayerId: "sp-1", seasonId: "season-1", balancePoints: "5", reason: "x" })),
    ).resolves.toBeUndefined();

    expect(service.adminAdjustPlayer).toHaveBeenCalledWith({ seasonPlayerId: "sp-1", reason: "x", balancePoints: 5 });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/seasons/season-1");
  });

  it("logs and rethrows on failure without revalidating", async () => {
    service.adminAdjustPlayer.mockRejectedValue(new AdminError("adminPlayerNotFound"));
    await expect(
      submitAdjustPlayerAction(formData({ seasonPlayerId: "sp-1", seasonId: "season-1", reason: "x" })),
    ).rejects.toMatchObject({ code: "adminPlayerNotFound" });
    expect(logger.log.error).toHaveBeenCalledWith("season.adjust_player", expect.objectContaining({ seasonId: "season-1" }));
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removePlayerFromSeasonAction", () => {
  it("removes the player and revalidates", async () => {
    await removePlayerFromSeasonAction(formData({ seasonId: "season-1", playerId: "user-1" }));
    expect(service.adminRemovePlayer).toHaveBeenCalledWith("season-1", "user-1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/seasons/season-1");
  });

  it("logs and rethrows on failure without revalidating", async () => {
    service.adminRemovePlayer.mockRejectedValue(new AdminError("adminPlayerNotFound"));
    await expect(removePlayerFromSeasonAction(formData({ seasonId: "season-1", playerId: "user-1" }))).rejects.toMatchObject({
      code: "adminPlayerNotFound",
    });
    expect(logger.log.error).toHaveBeenCalledWith("season.remove_player", expect.objectContaining({ seasonId: "season-1" }));
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
