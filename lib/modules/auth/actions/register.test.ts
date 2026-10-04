import { beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT = "NEXT_REDIRECT";

const dict = {
  core: {
    errors: {
      authUserExists: "User already exists",
      authInviteInvalid: "Invite link is invalid or expired",
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
    registerUser: vi.fn(),
    createSession: vi.fn(),
    getT: vi.fn(),
    logInfo: vi.fn(),
    AuthError,
  };
});

vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/lib/modules/auth/service", () => ({
  registerUser: state.registerUser,
  AuthError: state.AuthError,
}));
vi.mock("@/lib/infrastructure/auth/session", () => ({ createSession: state.createSession }));
vi.mock("@/lib/i18n/server", () => ({ getT: state.getT }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: state.logInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerAction } from "./register";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.getT.mockResolvedValue({ locale: "en", t: dict });
});

describe("registerAction", () => {
  it("returns the pending-approval notice without creating a session", async () => {
    state.registerUser.mockResolvedValue({ id: "u1", requiresApproval: true });

    const result = await registerAction({}, form({ email: "a@b.com", password: "longenough" }));

    expect(result).toEqual({ ok: "registrationPendingApproval" });
    expect(state.createSession).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("returns the check-email notice and logs the verification link", async () => {
    state.registerUser.mockResolvedValue({ id: "u1", requiresVerification: true, verificationToken: "tok en" });

    const result = await registerAction({}, form({ email: "a@b.com", password: "longenough" }));

    expect(result.ok).toBe("registrationCheckEmail");
    expect(state.createSession).not.toHaveBeenCalled();
    const linkCall = state.logInfo.mock.calls.find(([event]) => event === "auth.register.verification_link");
    expect(linkCall?.[1]).toEqual(expect.objectContaining({ userId: "u1" }));
    expect(linkCall?.[1]).toEqual(
      expect.objectContaining({ link: expect.stringContaining("/verify-email?token=tok%20en") }),
    );
  });

  it("signs the new user in and redirects when registration is immediate", async () => {
    state.registerUser.mockResolvedValue({ id: "u1" });

    await expect(
      registerAction({}, form({ email: "a@b.com", password: "longenough", displayName: "Alice" })),
    ).rejects.toThrow(REDIRECT);

    expect(state.registerUser).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "longenough",
      displayName: "Alice",
      inviteToken: null,
    });
    expect(state.createSession).toHaveBeenCalledWith("u1");
    expect(state.redirect).toHaveBeenLastCalledWith("/dashboard");
  });

  it("forwards an invite token", async () => {
    state.registerUser.mockResolvedValue({ id: "u1" });

    await expect(registerAction({}, form({ email: "a@b.com", password: "longenough", invite: "inv-1" }))).rejects.toThrow(
      REDIRECT,
    );

    expect(state.registerUser).toHaveBeenCalledWith(expect.objectContaining({ inviteToken: "inv-1" }));
  });

  it("translates a domain failure and never redirects", async () => {
    state.registerUser.mockRejectedValue(new state.AuthError("authUserExists"));

    const result = await registerAction({}, form({ email: "a@b.com", password: "longenough" }));

    expect(result.error).toBe("User already exists");
    expect(state.createSession).not.toHaveBeenCalled();
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
