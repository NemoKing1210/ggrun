import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/modules/season/service/errors";

const h = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getT: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));

vi.mock("@/lib/i18n/server", () => ({ getT: h.getT }));

vi.mock("@/lib/infrastructure/logger", () => ({
  log: {
    warn: h.warn,
    error: h.error,
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: () => ({ warn: h.warn, error: h.error, info: vi.fn(), debug: vi.fn() }),
  },
}));

import { revalidateAdmin, toError } from "./helpers";

beforeEach(() => {
  h.revalidatePath.mockReset();
  h.getT.mockReset();
  h.getT.mockResolvedValue({
    locale: "en",
    t: { core: { errors: { formUnknown: "Unknown error", adminSeasonNotFound: "Season {id} not found" } } },
  });
  h.warn.mockReset();
  h.error.mockReset();
});

describe("toError", () => {
  it("is bound to AdminError and resolves codes through the dictionary", async () => {
    const state = await toError(new AdminError("adminSeasonNotFound", { id: "abc" }), "someAction");
    expect(state.error).toBe("Season abc not found");
  });
});

describe("revalidateAdmin", () => {
  it("revalidates the admin list pages when no season is given", () => {
    revalidateAdmin();
    expect(h.revalidatePath.mock.calls.map((call) => call[0] as string)).toEqual([
      "/admin",
      "/admin/seasons",
    ]);
  });

  it("adds the season-scoped pages when a season id is given", () => {
    revalidateAdmin("season-1");
    expect(h.revalidatePath.mock.calls.map((call) => call[0] as string)).toEqual([
      "/admin",
      "/admin/seasons",
      "/admin/seasons/season-1",
      "/admin/seasons/season-1/board",
      "/admin/seasons/season-1/players",
      "/admin/seasons/season-1/bots",
    ]);
  });

  it("treats an empty season id as absent", () => {
    revalidateAdmin("");
    expect(h.revalidatePath.mock.calls.map((call) => call[0] as string)).toEqual([
      "/admin",
      "/admin/seasons",
    ]);
  });
});
