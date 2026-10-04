import { beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT = "NEXT_REDIRECT";

const dict = {
  core: {
    errors: {
      formLoginRequired: "Login is required",
      formPasswordRequired: "Password is required",
      authInvalidCredentials: "Wrong login or password",
      formUnknown: "Unknown error",
    },
  },
};

const state = vi.hoisted(() => {
  class AuthError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
      this.name = "AuthError";
    }
  }
  return {
    redirect: vi.fn((url: string) => {
      throw Object.assign(new Error("NEXT_REDIRECT"), { url });
    }),
    authenticate: vi.fn(),
    createSession: vi.fn(),
    getT: vi.fn(),
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    AuthError,
  };
});

vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/lib/modules/auth/service", () => ({
  authenticate: state.authenticate,
  AuthError: state.AuthError,
}));
vi.mock("@/lib/infrastructure/auth/session", () => ({ createSession: state.createSession }));
vi.mock("@/lib/i18n/server", () => ({ getT: state.getT }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: state.logInfo, warn: vi.fn(), error: vi.fn(), debug: state.logDebug },
}));

import { loginAction } from "./login";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.getT.mockResolvedValue({ locale: "en", t: dict });
});

describe("loginAction", () => {
  it("asks for the login when the field is missing", async () => {
    const result = await loginAction({}, form({ password: "secret" }));

    expect(result).toEqual({ error: "Login is required" });
    expect(state.logDebug).toHaveBeenCalledWith("auth.login.invalid_input", { field: "login" });
    expect(state.authenticate).not.toHaveBeenCalled();
  });

  it("asks for the password when only the login is present", async () => {
    const result = await loginAction({}, form({ login: "alice" }));

    expect(result.error).toBe("Password is required");
    expect(state.logDebug).toHaveBeenCalledWith("auth.login.invalid_input", { field: "password" });
  });

  it("translates bad credentials and does not create a session", async () => {
    state.authenticate.mockRejectedValue(new state.AuthError("authInvalidCredentials"));

    const result = await loginAction({}, form({ login: "alice", password: "wrong" }));

    expect(result.error).toBe("Wrong login or password");
    expect(state.createSession).not.toHaveBeenCalled();
  });

  it("authenticates, persists the session and redirects to the dashboard", async () => {
    state.authenticate.mockResolvedValue({ id: "user-1" });

    await expect(loginAction({}, form({ login: "alice", password: "secret" }))).rejects.toThrow(REDIRECT);

    expect(state.authenticate).toHaveBeenCalledWith("alice", "secret");
    expect(state.createSession).toHaveBeenCalledWith("user-1");
    expect(state.redirect).toHaveBeenLastCalledWith("/dashboard");
  });
});
