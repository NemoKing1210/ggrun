import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/modules/season/service/errors";

import { revokeEffectAction, revokeItemAction } from "./intervene";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: {
    core: { errors: { ieeItemNotFound: "Item not found", ieeEffectNotFound: "Status not found", formUnknown: "Unknown error" } },
  },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const useCases = vi.hoisted(() => ({ adminRevokeItem: vi.fn(), adminRevokeEffect: vi.fn() }));
vi.mock("../service/intervene", () => useCases);

const EMPTY_STATE = { ok: undefined, error: undefined };

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  cache.revalidatePath.mockClear();
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue(null);
  for (const fn of Object.values(useCases)) fn.mockReset();
});

describe("revokeItemAction", () => {
  it("revokes the item and forgets every surface that showed it", async () => {
    useCases.adminRevokeItem.mockResolvedValue({ itemKey: "hex_scroll" });
    const result = await revokeItemAction(
      EMPTY_STATE,
      formData({ inventoryId: "inv-1", seasonId: "season-1", reason: "handed out in error" }),
    );

    expect(useCases.adminRevokeItem).toHaveBeenCalledWith({
      inventoryId: "inv-1",
      reason: "handed out in error",
    });
    expect(result).toEqual({ ok: "hex_scroll" });
    expect(cache.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      "/admin/seasons/season-1/players",
      "/dashboard",
      "/board",
      "/leaderboard",
      "/feed",
    ]);
  });

  it("translates a domain failure instead of throwing", async () => {
    useCases.adminRevokeItem.mockRejectedValue(new AdminError("ieeItemNotFound"));
    const result = await revokeItemAction(
      EMPTY_STATE,
      formData({ inventoryId: "inv-1", seasonId: "season-1", reason: "handed out in error" }),
    );
    expect(result).toEqual({ ok: undefined, error: "Item not found" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revokeEffectAction", () => {
  it("lifts the status and forgets every surface that showed it", async () => {
    useCases.adminRevokeEffect.mockResolvedValue({ effectKey: "shield" });
    const result = await revokeEffectAction(
      EMPTY_STATE,
      formData({ effectId: "eff-1", seasonId: "season-2", reason: "never should have landed" }),
    );

    expect(useCases.adminRevokeEffect).toHaveBeenCalledWith({
      effectId: "eff-1",
      reason: "never should have landed",
    });
    expect(result).toEqual({ ok: "shield" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/seasons/season-2/players");
    expect(cache.revalidatePath).toHaveBeenCalledTimes(5);
  });

  it("translates a domain failure instead of throwing", async () => {
    useCases.adminRevokeEffect.mockRejectedValue(new AdminError("ieeEffectNotFound"));
    const result = await revokeEffectAction(
      EMPTY_STATE,
      formData({ effectId: "eff-1", seasonId: "season-2", reason: "never should have landed" }),
    );
    expect(result.error).toBe("Status not found");
  });
});
