import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT = "NEXT_REDIRECT";

const state = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  selectRows: [] as unknown[],
  select: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  createSession: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: state.redirect }));

vi.mock("@/lib/infrastructure/auth/session", () => ({ createSession: state.createSession }));

vi.mock("@/lib/infrastructure/auth/password", () => ({ hashPassword: state.hashPassword }));

vi.mock("@/lib/infrastructure/db", () => ({
  db: {
    select: (...args: unknown[]) => state.select(...args),
    insert: (...args: unknown[]) => state.insert(...args),
  },
}));

import { devQuickLoginAction } from "./dev-login";

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

function formFor(devUser: string): FormData {
  const form = new FormData();
  form.set("devUser", devUser);
  return form;
}

async function expectRedirectTo(run: () => Promise<void>, path: string): Promise<void> {
  await expect(run()).rejects.toThrow(REDIRECT);
  expect(state.redirect).toHaveBeenLastCalledWith(path);
}

beforeEach(() => {
  state.redirect.mockClear();
  state.selectRows = [];
  state.select.mockReset();
  state.select.mockImplementation(() => selectChain(state.selectRows));
  state.returning.mockReset();
  state.returning.mockResolvedValue([{ id: "created-user" }]);
  state.values.mockReset();
  state.values.mockImplementation(() => ({ returning: state.returning }));
  state.insert.mockReset();
  state.insert.mockImplementation(() => ({ values: state.values }));
  state.createSession.mockReset();
  state.createSession.mockResolvedValue(undefined);
  state.hashPassword.mockReset();
  state.hashPassword.mockResolvedValue("hashed");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devQuickLoginAction guard", () => {
  it("redirects to /login in production without touching the DB or session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expectRedirectTo(() => devQuickLoginAction(formFor("admin")), "/login");
    expect(state.select).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.createSession).not.toHaveBeenCalled();
  });

  it("redirects to /login for an unknown dev user and does not create a session", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await expectRedirectTo(() => devQuickLoginAction(formFor("ghost")), "/login");
    expect(state.select).not.toHaveBeenCalled();
    expect(state.createSession).not.toHaveBeenCalled();
  });

  it("redirects to /login when the form field is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await expectRedirectTo(() => devQuickLoginAction(new FormData()), "/login");
  });
});

describe("devQuickLoginAction happy path", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  it("creates the admin user when it is missing and opens a session", async () => {
    await expectRedirectTo(() => devQuickLoginAction(formFor("admin")), "/dashboard");

    expect(state.hashPassword).toHaveBeenCalledWith("admin12345");
    expect(state.insert).toHaveBeenCalledTimes(1);
    const [inserted] = state.values.mock.calls[0] as [Record<string, unknown>];
    expect(inserted).toMatchObject({
      email: "admin@ggrun.local",
      username: "admin",
      displayName: "Admin",
      role: "admin",
      passwordHash: "hashed",
    });
    expect(state.createSession).toHaveBeenCalledWith("created-user");
  });

  it("reuses an existing user instead of inserting, and still opens a session", async () => {
    state.selectRows = [{ id: "existing-user" }];

    await expectRedirectTo(() => devQuickLoginAction(formFor("player")), "/dashboard");

    expect(state.insert).not.toHaveBeenCalled();
    expect(state.hashPassword).not.toHaveBeenCalled();
    expect(state.createSession).toHaveBeenCalledWith("existing-user");
  });
});
