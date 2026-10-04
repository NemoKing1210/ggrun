import { beforeEach, describe, expect, it, vi } from "vitest";

import { activateInventoryItem, GameLoopError } from "@/lib/modules/game";

import { useItemAction } from "./inventory";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: { core: { errors: { gameNotAllowed: "Not allowed", formUnknown: "Unknown error" } } },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

vi.mock("@/lib/modules/game", async () => {
  const { GameLoopError: LoopError } = await vi.importActual<{ GameLoopError: typeof GameLoopError }>(
    "@/lib/modules/game/service/errors",
  );
  return { GameLoopError: LoopError, activateInventoryItem: vi.fn() };
});

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
  logger.log.info.mockClear();
  vi.mocked(activateInventoryItem).mockReset();
});

describe("useItemAction", () => {
  it("uses the item on the chosen target and revalidates the player's views", async () => {
    vi.mocked(activateInventoryItem).mockResolvedValue({ itemKey: "hex_scroll" } as never);
    const result = await useItemAction(
      EMPTY_STATE,
      formData({ inventoryId: "inv-1", targetSeasonPlayerId: "sp-2" }),
    );

    expect(vi.mocked(activateInventoryItem)).toHaveBeenCalledWith({
      inventoryId: "inv-1",
      targetSeasonPlayerId: "sp-2",
    });
    expect(result).toEqual({ ok: "hex_scroll" });
    expect(cache.revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/dashboard", "/feed", "/board"]);
  });

  it("treats a blank or whitespace target as no target", async () => {
    vi.mocked(activateInventoryItem).mockResolvedValue({ itemKey: "hex_scroll" } as never);
    await useItemAction(EMPTY_STATE, formData({ inventoryId: "inv-1", targetSeasonPlayerId: "   " }));
    expect(vi.mocked(activateInventoryItem)).toHaveBeenCalledWith({
      inventoryId: "inv-1",
      targetSeasonPlayerId: null,
    });
  });

  it("treats a missing target field as no target", async () => {
    vi.mocked(activateInventoryItem).mockResolvedValue({ itemKey: "shield_charm" } as never);
    await useItemAction(EMPTY_STATE, formData({ inventoryId: "inv-2" }));
    expect(vi.mocked(activateInventoryItem)).toHaveBeenCalledWith({
      inventoryId: "inv-2",
      targetSeasonPlayerId: null,
    });
  });

  it("translates a refused use into an error state", async () => {
    vi.mocked(activateInventoryItem).mockRejectedValue(new GameLoopError("gameNotAllowed"));
    const result = await useItemAction(EMPTY_STATE, formData({ inventoryId: "inv-1" }));
    expect(result).toEqual({ ok: undefined, error: "Not allowed" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
