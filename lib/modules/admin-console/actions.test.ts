/**
 * `actions.ts` — the presenter over `executeAdminCommand`: it resolves result
 * codes against the console dictionary, translates domain errors, and serves
 * live argument completions. The executor and the dictionaries' *content* are
 * out of scope here; the wiring and error precedence are not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/server", () => ({ getT: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/modules/bots/repository", () => ({ listAllBotRuns: vi.fn() }));
vi.mock("@/lib/modules/catalog/repository", () => ({ listCatalogGames: vi.fn() }));
vi.mock("@/lib/modules/player/service/admin", () => ({ listUsers: vi.fn() }));
vi.mock("@/lib/modules/season/repository/seasons", () => ({ listSeasons: vi.fn() }));
vi.mock("./execute", () => ({ executeAdminCommand: vi.fn() }));

import { getT } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { listAllBotRuns } from "@/lib/modules/bots/repository";
import { listCatalogGames } from "@/lib/modules/catalog/repository";
import { listUsers } from "@/lib/modules/player/service/admin";
import { listSeasons } from "@/lib/modules/season/repository/seasons";
import { AppError } from "@/lib/errors/app-error";
import { executeAdminCommand } from "./execute";
import { runAdminCommandAction, suggestAdminArgsAction } from "./actions";

const mocks = {
  getT: vi.mocked(getT),
  getCurrentUser: vi.mocked(getCurrentUser),
  listAllBotRuns: vi.mocked(listAllBotRuns),
  listCatalogGames: vi.mocked(listCatalogGames),
  listUsers: vi.mocked(listUsers),
  listSeasons: vi.mocked(listSeasons),
  executeAdminCommand: vi.mocked(executeAdminCommand),
};

const dictionary = {
  adminConsole: {
    result: {
      whoami: "Signed in as {user}",
      playerAdded: "{user} joined {season}",
    },
  },
  core: {
    errors: {
      adminStaffRequired: "Staff only",
      adminSeasonNotFound: "No season {ref}",
      formUnknown: "Something went wrong",
    },
  },
} as never;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getT.mockResolvedValue({ locale: "en", t: dictionary } as never);
  mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" } as never);
  mocks.executeAdminCommand.mockResolvedValue({ ok: true, code: "whoami", params: { user: "root" } });
  mocks.listSeasons.mockResolvedValue([]);
  mocks.listUsers.mockResolvedValue([]);
  mocks.listAllBotRuns.mockResolvedValue([]);
  mocks.listCatalogGames.mockResolvedValue([]);
});

describe("runAdminCommandAction", () => {
  it("interpolates the outcome params into the localized template and forwards the payload", async () => {
    mocks.executeAdminCommand.mockResolvedValue({
      ok: true,
      code: "whoami",
      params: { user: "root" },
      rows: [{ text: "root" }],
      navigate: "/admin/users/admin-1",
      refresh: true,
    });
    const result = await runAdminCommandAction("whoami");
    expect(result).toEqual({
      ok: true,
      message: "Signed in as root",
      rows: [{ text: "root" }],
      navigate: "/admin/users/admin-1",
      refresh: true,
    });
  });

  it("falls back to the raw code when the dictionary has no template", async () => {
    mocks.executeAdminCommand.mockResolvedValue({ ok: false, code: "seasonNotFound" });
    const result = await runAdminCommandAction("season nope");
    expect(result).toMatchObject({ ok: false, message: "seasonNotFound" });
  });

  it("leaves unresolved placeholders when the outcome carries no params", async () => {
    mocks.executeAdminCommand.mockResolvedValue({ ok: true, code: "playerAdded" });
    const result = await runAdminCommandAction("player add");
    expect(result.message).toBe("{user} joined {season}");
  });

  it("translates an AppError with its code params", async () => {
    mocks.executeAdminCommand.mockRejectedValue(new AppError("adminSeasonNotFound", { ref: "run-9" }));
    const result = await runAdminCommandAction("season run-9");
    expect(result).toEqual({ ok: false, message: "No season run-9" });
  });

  it("logs and reports formUnknown for any other throw", async () => {
    const boom = new Error("kaboom");
    mocks.executeAdminCommand.mockRejectedValue(boom);
    const result = await runAdminCommandAction("system");
    expect(result).toEqual({ ok: false, message: "Something went wrong" });
    expect(vi.mocked(log.error)).toHaveBeenCalledWith("console.command_failed", { input: "system", err: boom });
  });
});

function seasonRow(i: number) {
  return { id: `s${i}`, slug: `run-${i}`, title: `Run ${i}`, status: "active" };
}

function userRow(i: number) {
  return {
    id: `u${i}`,
    username: `user${i}`,
    displayName: i === 1 ? null : `User ${i}`,
    isBlocked: i === 2,
  };
}

function gameRow(i: number) {
  return { id: `g${i}`, title: `Game ${i}`, platform: i === 1 ? null : "PC" };
}

function botRow(i: number) {
  const id = `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`;
  return { run: { id, status: "running" }, seasonTitle: `Run ${i}`, seasonSlug: `run-${i}` };
}

describe("suggestAdminArgsAction", () => {
  it("returns nothing for an anonymous or non-admin caller without touching any repository", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(suggestAdminArgsAction("season", "run")).resolves.toEqual([]);
    mocks.getCurrentUser.mockResolvedValue({ id: "u", role: "judge" } as never);
    await expect(suggestAdminArgsAction("season", "run")).resolves.toEqual([]);
    expect(mocks.listSeasons).not.toHaveBeenCalled();
  });

  it("filters seasons by slug or title and caps the list at eight", async () => {
    mocks.listSeasons.mockResolvedValue(Array.from({ length: 10 }, (_, i) => seasonRow(i + 1)) as never);
    const all = await suggestAdminArgsAction("season", "");
    expect(all).toHaveLength(8);
    expect(all[0]).toEqual({ value: "run-1", label: "Run 1", hint: "run-1 · active" });

    const filtered = await suggestAdminArgsAction("season", "RUN-3");
    expect(filtered.map((o) => o.value)).toEqual(["run-3"]);
  });

  it("passes the trimmed partial to the user lookup and flags blocked accounts", async () => {
    mocks.listUsers.mockResolvedValue([userRow(1), userRow(2)] as never);
    const options = await suggestAdminArgsAction("user", "  us  ");
    expect(mocks.listUsers).toHaveBeenCalledWith("us");
    expect(options[0]).toEqual({ value: "user1", label: "user1", hint: "@user1" });
    expect(options[1]?.hint).toBe("@user2 · blocked");
  });

  it("omits the user query when the partial is blank", async () => {
    await suggestAdminArgsAction("user", "   ");
    expect(mocks.listUsers).toHaveBeenCalledWith(undefined);
  });

  it("matches bot runs by id prefix or season identity and shows the short id", async () => {
    mocks.listAllBotRuns.mockResolvedValue([botRow(1), botRow(2)] as never);
    const options = await suggestAdminArgsAction("bot", "run-2");
    expect(options).toEqual([{ value: "00000002", label: "#00000002 · Run 2", hint: "running" }]);

    const byId = await suggestAdminArgsAction("bot", "00000001");
    expect(byId[0]?.value).toBe("00000001");
  });

  it("filters games by title and falls back to the default branch for any other kind", async () => {
    mocks.listCatalogGames.mockResolvedValue([gameRow(1), gameRow(2)] as never);
    const options = await suggestAdminArgsAction("game", "game 1");
    expect(options).toEqual([{ value: "Game 1", label: "Game 1", hint: undefined }]);
    expect(mocks.listAllBotRuns).not.toHaveBeenCalled();
  });
});
