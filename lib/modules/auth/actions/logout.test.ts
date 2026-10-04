import { beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT = "NEXT_REDIRECT";

const state = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  destroySession: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ destroySession: state.destroySession }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: state.logInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logoutAction } from "./logout";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("logoutAction", () => {
  it("destroys the session, records the event and lands on /login", async () => {
    await expect(logoutAction()).rejects.toThrow(REDIRECT);

    expect(state.destroySession).toHaveBeenCalledTimes(1);
    expect(state.logInfo).toHaveBeenCalledWith("auth.logout");
    expect(state.redirect).toHaveBeenLastCalledWith("/login");
    // Session teardown must happen before the redirect is thrown.
    expect(state.destroySession.mock.invocationCallOrder[0]).toBeLessThan(
      state.redirect.mock.invocationCallOrder[0]!,
    );
  });
});
