import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminError } from "@/lib/modules/season/service/errors";

import {
  changeStatusAction,
  createSeasonAction,
  resetSeasonAction,
  resetSeasonDirectAction,
  updateSeasonSettingsAction,
} from "./index";

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => navigation);

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const i18n = vi.hoisted(() => ({ getT: vi.fn() }));
vi.mock("@/lib/i18n/server", () => i18n);
i18n.getT.mockResolvedValue({
  locale: "en",
  t: {
    core: {
      errors: {
        formUnknown: "Unknown error",
        formConfigInvalidJson: "Bad JSON",
        adminStaffRequired: "Staff only",
        adminInvalidTransition: "Invalid {from}->{to}",
        adminSeasonNotFound: "No season",
      },
    },
    admin: {
      feedback: {
        seasonCreated: "Season {id} created",
        statusChanged: "Status {status}",
        seasonReset: "Season reset",
        settingsSaved: "Settings saved",
      },
    },
  },
});

const logger = vi.hoisted(() => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/infrastructure/logger", () => logger);

const service = vi.hoisted(() => ({
  changeSeasonStatus: vi.fn(),
  createSeason: vi.fn(),
  resetSeason: vi.fn(),
  updateSeasonSettings: vi.fn(),
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
  navigation.redirect.mockClear();
  session.getCurrentUser.mockReset();
  session.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" });
  for (const fn of Object.values(service)) fn.mockReset();
  service.createSeason.mockResolvedValue("season-9");
  service.changeSeasonStatus.mockResolvedValue(undefined);
  service.resetSeason.mockResolvedValue(undefined);
  service.updateSeasonSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSeasonAction", () => {
  it("passes title, slug and clone source through and redirects to the new season", async () => {
    const result = await createSeasonAction(
      EMPTY,
      formData({ title: "Run 1", slug: "run-1", cloneFrom: "22222222-2222-2222-2222-222222222222" }),
    );

    expect(service.createSeason).toHaveBeenCalledWith({
      title: "Run 1",
      slug: "run-1",
      cloneBoardFromSeasonId: "22222222-2222-2222-2222-222222222222",
    });
    expect(navigation.redirect).toHaveBeenCalledWith("/admin/seasons/season-9");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(result).toEqual({ ok: "Season season-9 created" });
  });

  it("omits an empty clone source", async () => {
    await createSeasonAction(EMPTY, formData({ title: "Run 1", slug: "run-1" }));
    expect(service.createSeason).toHaveBeenCalledWith({
      title: "Run 1",
      slug: "run-1",
      cloneBoardFromSeasonId: undefined,
    });
  });

  it("translates a domain failure and never redirects", async () => {
    service.createSeason.mockRejectedValue(new AdminError("adminStaffRequired"));
    const result = await createSeasonAction(EMPTY, formData({ title: "Run", slug: "run" }));
    expect(result).toEqual({ error: "Staff only" });
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("changeStatusAction", () => {
  it("changes the status and revalidates the season surfaces", async () => {
    const result = await changeStatusAction(EMPTY, formData({ seasonId: "season-1", status: "active" }));

    expect(service.changeSeasonStatus).toHaveBeenCalledWith("season-1", "active");
    expect(result).toEqual({ ok: "Status active" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/seasons/season-1/players");
  });

  it("translates an illegal transition with its params", async () => {
    service.changeSeasonStatus.mockRejectedValue(
      new AdminError("adminInvalidTransition", { from: "draft", to: "finished" }),
    );
    const result = await changeStatusAction(EMPTY, formData({ seasonId: "season-1", status: "finished" }));
    expect(result).toEqual({ error: "Invalid draft->finished" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("resetSeasonAction", () => {
  it("resets the season and clears every public surface", async () => {
    const result = await resetSeasonAction(EMPTY, formData({ seasonId: "season-1" }));

    expect(service.resetSeason).toHaveBeenCalledWith("season-1");
    expect(result).toEqual({ ok: "Season reset" });
    const paths = cache.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/admin",
        "/admin/seasons/season-1",
        "/board",
        "/dashboard",
        "/leaderboard",
        "/feed",
      ]),
    );
  });

  it("translates a domain failure", async () => {
    service.resetSeason.mockRejectedValue(new AdminError("adminSeasonNotFound"));
    const result = await resetSeasonAction(EMPTY, formData({ seasonId: "season-1" }));
    expect(result).toEqual({ error: "No season" });
  });
});

describe("resetSeasonDirectAction", () => {
  it("resets and revalidates but returns nothing", async () => {
    await expect(resetSeasonDirectAction(formData({ seasonId: "season-1" }))).resolves.toBeUndefined();
    expect(service.resetSeason).toHaveBeenCalledWith("season-1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/board");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/feed");
  });
});

describe("updateSeasonSettingsAction", () => {
  it("parses the structured payload and saves the config", async () => {
    const result = await updateSeasonSettingsAction(
      EMPTY,
      formData({ seasonId: "season-1", structured: "1", dice_sides: "8", rulesMode: "manual", rulesMd: "# Rules" }),
    );

    expect(service.updateSeasonSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: "season-1",
        rulesMd: "# Rules",
        config: expect.objectContaining({ dice: expect.objectContaining({ sides: 8 }) }),
      }),
    );
    expect(result).toEqual({ ok: "Settings saved" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/rules");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/board");
  });

  it("reports malformed legacy JSON without calling the service", async () => {
    const result = await updateSeasonSettingsAction(
      EMPTY,
      formData({ seasonId: "season-1", config: "{oops", rulesMode: "manual", rulesMd: "# R" }),
    );

    expect(result).toEqual({ error: "Bad JSON", debug: undefined });
    expect(service.updateSeasonSettings).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("exposes the raw payload in the dev-only debug field", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await updateSeasonSettingsAction(EMPTY, formData({ seasonId: "season-1", config: "{oops" }));
    expect(result.error).toBe("Bad JSON");
    expect(result.debug).toContain("JSON.parse failed: {oops");
  });

  it("reports a form that carries neither structured nor legacy config", async () => {
    const result = await updateSeasonSettingsAction(EMPTY, formData({ seasonId: "season-1" }));
    expect(result).toEqual({ error: "Unknown error" });
    expect(service.updateSeasonSettings).not.toHaveBeenCalled();
  });

  it("translates a domain failure from the service", async () => {
    service.updateSeasonSettings.mockRejectedValue(new AdminError("adminSeasonNotFound"));
    const result = await updateSeasonSettingsAction(
      EMPTY,
      formData({ seasonId: "season-1", structured: "1" }),
    );
    expect(result).toEqual({ error: "No season" });
  });
});
