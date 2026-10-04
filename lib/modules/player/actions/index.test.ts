import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const REDIRECT = "NEXT_REDIRECT";

const dict = {
  core: {
    errors: {
      adminPlayerNotFound: "Participant not found",
      authUserExists: "User already exists",
      authLoginRequired: "Please log in",
      formUnknown: "Unknown error",
    },
  },
  admin: { users: { userAdded: "User added", saved: "User saved" } },
  settings: { saved: "Settings saved" },
};

const state = vi.hoisted(() => {
  class AdminError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
      this.name = "AdminError";
    }
  }
  return {
    redirect: vi.fn((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url });
    }),
    revalidatePath: vi.fn(),
    cookies: vi.fn(),
    getCurrentUser: vi.fn(),
    tokenFingerprint: vi.fn((token: string) => `fp:${token}`),
    getT: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    setBlocked: vi.fn(),
    verifyEmail: vi.fn(),
    revokeSessions: vi.fn(),
    deleteUser: vi.fn(),
    updateSettings: vi.fn(),
    selectRows: [] as unknown[],
    select: vi.fn(),
    deleteWhere: vi.fn(() => Promise.resolve(undefined)),
    delete: vi.fn(),
    logError: vi.fn(),
    AdminError,
  };
});

vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));
vi.mock("next/headers", () => ({ cookies: state.cookies }));
vi.mock("@/lib/infrastructure/auth/session", () => ({
  getCurrentUser: state.getCurrentUser,
  SESSION_COOKIE: "ggrun_session",
  tokenFingerprint: state.tokenFingerprint,
}));
vi.mock("@/lib/i18n/server", () => ({ getT: state.getT }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: state.logError, debug: vi.fn() },
}));
vi.mock("@/lib/infrastructure/db", () => ({ db: { select: state.select, delete: state.delete } }));
vi.mock("@/lib/modules/player/service", () => ({
  adminCreateUser: state.createUser,
  adminUpdateUser: state.updateUser,
  adminSetUserBlocked: state.setBlocked,
  adminVerifyEmail: state.verifyEmail,
  adminRevokeSessions: state.revokeSessions,
  adminDeleteUser: state.deleteUser,
  updateUserSettings: state.updateSettings,
}));
vi.mock("@/lib/modules/season/service", () => ({ AdminError: state.AdminError }));

import { LOCALE_COOKIE } from "@/lib/i18n/config";

import {
  blockUserAction,
  createUserAction,
  deleteUserAction,
  revokeOtherSessionsAction,
  revokeOwnSessionAction,
  updateUserAction,
  updateUserSettingsAction,
  verifyEmailAction,
} from "./index";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

function wireSelect(): void {
  state.select.mockImplementation(() => {
    const rows = state.selectRows.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain;
  });
}

function jar(overrides: { token?: string; set?: Mock; del?: Mock } = {}) {
  return {
    get: vi.fn((name: string) =>
      name === "ggrun_session" && overrides.token !== undefined ? { value: overrides.token } : undefined,
    ),
    set: overrides.set ?? vi.fn(),
    delete: overrides.del ?? vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.selectRows.length = 0;
  wireSelect();
  state.delete.mockReturnValue({ where: state.deleteWhere });
  state.getT.mockResolvedValue({ locale: "en", t: dict });
  state.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" });
  state.cookies.mockResolvedValue(jar());
});

describe("createUserAction", () => {
  it("passes the form fields through and returns the localized confirmation", async () => {
    const result = await createUserAction(
      {},
      form({ email: "a@b.com", username: "alice", password: "longenough", displayName: "Al", role: "player" }),
    );

    expect(state.createUser).toHaveBeenCalledWith({
      email: "a@b.com",
      username: "alice",
      password: "longenough",
      displayName: "Al",
      role: "player",
    });
    expect(result).toEqual({ ok: "User added" });
    expect(state.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("maps a domain error to its translated message", async () => {
    state.createUser.mockRejectedValue(new state.AdminError("authUserExists"));

    const result = await createUserAction({}, form({ email: "a@b.com", username: "alice", role: "player" }));

    expect(result.error).toBe("User already exists");
  });
});

describe("updateUserAction", () => {
  it("omits blank optional fields and an empty password", async () => {
    await updateUserAction({}, form({ userId: "u1", password: "", displayName: "", role: "" }));

    const arg = state.updateUser.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.userId).toBe("u1");
    expect(arg.email).toBeUndefined();
    expect(arg.displayName).toBeUndefined();
    expect(arg).not.toHaveProperty("password");
    expect(state.revalidatePath).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("includes a password when one was typed", async () => {
    const result = await updateUserAction({}, form({ userId: "u1", password: "newsecret" }));

    expect(state.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", password: "newsecret" }),
    );
    expect(result).toEqual({ ok: "User saved" });
  });
});

describe("blockUserAction", () => {
  it("blocks when the hidden field says true and revalidates both views", async () => {
    await blockUserAction(form({ userId: "u1", blocked: "true" }));

    expect(state.setBlocked).toHaveBeenCalledWith("u1", true);
    expect(state.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(state.revalidatePath).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("unblocks for any other value", async () => {
    await blockUserAction(form({ userId: "u1", blocked: "false" }));
    expect(state.setBlocked).toHaveBeenCalledWith("u1", false);
  });

  it("rethrows a failure after logging it", async () => {
    state.setBlocked.mockRejectedValue(new state.AdminError("adminPlayerNotFound"));

    await expect(blockUserAction(form({ userId: "u1", blocked: "true" }))).rejects.toMatchObject({
      code: "adminPlayerNotFound",
    });
    expect(state.logError).toHaveBeenCalled();
  });
});

describe("verifyEmailAction", () => {
  it("verifies and revalidates", async () => {
    await verifyEmailAction(form({ userId: "u1" }));
    expect(state.verifyEmail).toHaveBeenCalledWith("u1");
    expect(state.revalidatePath).toHaveBeenCalledWith("/admin/users/u1");
  });
});

describe("deleteUserAction", () => {
  it("deletes then sends the console back to the users list", async () => {
    await expect(deleteUserAction(form({ userId: "u1" }))).rejects.toThrow(REDIRECT);
    expect(state.deleteUser).toHaveBeenCalledWith("u1");
    expect(state.redirect).toHaveBeenLastCalledWith("/admin/users");
  });
});

describe("updateUserSettingsAction", () => {
  it("keeps only complete links, drops malformed JSON and writes the locale cookie", async () => {
    const set = vi.fn();
    state.cookies.mockResolvedValue(jar({ set }));
    const links = JSON.stringify([
      { network: "steam", url: "https://steam.example/me" },
      { network: "", url: "https://ignored" },
      { network: "discord", url: "" },
    ]);

    const result = await updateUserSettingsAction(
      {},
      form({ displayName: "Al", bio: "", accent: "amber", locale: "ru", links }),
    );

    expect(state.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Al",
        locale: "ru",
        links: [{ network: "steam", url: "https://steam.example/me" }],
      }),
    );
    expect(set).toHaveBeenCalledWith(LOCALE_COOKIE, "ru", expect.objectContaining({ path: "/", sameSite: "lax" }));
    expect(state.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(result).toEqual({ ok: "Settings saved" });
  });

  it("treats non-JSON links as an empty list", async () => {
    await updateUserSettingsAction({}, form({ displayName: "Al", links: "not json" }));
    expect(state.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ links: [] }));
  });
});

describe("revokeOwnSessionAction", () => {
  it("sends an anonymous caller to the login page", async () => {
    state.getCurrentUser.mockResolvedValue(null);
    await expect(revokeOwnSessionAction(form({ sessionId: "s1" }))).rejects.toThrow(REDIRECT);
    expect(state.redirect).toHaveBeenLastCalledWith("/login");
    expect(state.select).not.toHaveBeenCalled();
  });

  it("is a no-op without a session id", async () => {
    await expect(revokeOwnSessionAction(form({}))).resolves.toBeUndefined();
    expect(state.delete).not.toHaveBeenCalled();
  });

  it("refuses to revoke a session that belongs to someone else", async () => {
    state.selectRows.push([{ id: "s1", userId: "other", tokenHash: "x" }]);
    await expect(revokeOwnSessionAction(form({ sessionId: "s1" }))).rejects.toMatchObject({
      code: "authLoginRequired",
    });
    expect(state.delete).not.toHaveBeenCalled();
  });

  it("clears the cookie and leaves for /login when the current session is revoked", async () => {
    const del = vi.fn();
    state.cookies.mockResolvedValue(jar({ token: "tok", del }));
    state.selectRows.push([{ id: "s1", userId: "admin-1", tokenHash: "fp:tok" }]);

    await expect(revokeOwnSessionAction(form({ sessionId: "s1" }))).rejects.toThrow(REDIRECT);

    expect(del).toHaveBeenCalledWith("ggrun_session");
    expect(state.redirect).toHaveBeenLastCalledWith("/login");
  });

  it("stays on the page when another device's session is revoked", async () => {
    state.cookies.mockResolvedValue(jar({ token: "tok" }));
    state.selectRows.push([{ id: "s1", userId: "admin-1", tokenHash: "fp:other" }]);

    await expect(revokeOwnSessionAction(form({ sessionId: "s1" }))).resolves.toBeUndefined();

    expect(state.deleteWhere).toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });
});

describe("revokeOtherSessionsAction", () => {
  it("revokes everything and logs out when the caller has no token", async () => {
    const del = vi.fn();
    state.cookies.mockResolvedValue(jar({ del }));

    await expect(revokeOtherSessionsAction(form({}))).rejects.toThrow(REDIRECT);

    expect(state.deleteWhere).toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith("ggrun_session");
    expect(state.redirect).toHaveBeenLastCalledWith("/login");
  });

  it("keeps the current session when a token is present", async () => {
    state.cookies.mockResolvedValue(jar({ token: "tok" }));

    await expect(revokeOtherSessionsAction(form({}))).resolves.toBeUndefined();

    expect(state.deleteWhere).toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
