import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/db/schema";

import {
  SESSION_COOKIE,
  ONLINE_THRESHOLD_MS,
  createSession,
  destroySession,
  getCurrentSession,
  getCurrentUser,
  isStaff,
  tokenFingerprint,
} from "./session";

const state = vi.hoisted(() => ({
  jar: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  selectRows: [] as unknown[],
  select: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  deleteWhere: vi.fn(),
  remove: vi.fn(),
  updateWhere: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => state.jar }));

vi.mock("@/lib/infrastructure/logger", () => ({
  log: {
    child: () => ({ warn: state.warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  },
}));

vi.mock("@/lib/infrastructure/db", () => ({
  db: {
    select: (...args: unknown[]) => state.select(...args),
    insert: (...args: unknown[]) => state.insert(...args),
    delete: (...args: unknown[]) => state.remove(...args),
    update: (...args: unknown[]) => state.update(...args),
  },
}));

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "limit"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.jar.get.mockReset();
  state.jar.set.mockReset();
  state.jar.delete.mockReset();
  state.jar.get.mockReturnValue(undefined);
  state.selectRows = [];
  state.select.mockReset();
  state.select.mockImplementation(() => selectChain(state.selectRows));
  state.insertValues.mockReset();
  state.insertValues.mockResolvedValue(undefined);
  state.insert.mockReset();
  state.insert.mockImplementation(() => ({ values: state.insertValues }));
  state.deleteWhere.mockReset();
  state.deleteWhere.mockResolvedValue(undefined);
  state.remove.mockReset();
  state.remove.mockImplementation(() => ({ where: state.deleteWhere }));
  state.updateWhere.mockReset();
  state.updateWhere.mockResolvedValue(undefined);
  state.updateSet.mockReset();
  state.updateSet.mockImplementation(() => ({ where: state.updateWhere }));
  state.update.mockReset();
  state.update.mockImplementation(() => ({ set: state.updateSet }));
  state.warn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function userWithRole(role: string): User {
  return { id: "u1", role } as unknown as User;
}

describe("tokenFingerprint", () => {
  it("is the sha256 hex digest of the token", () => {
    const token = "some-opaque-token";
    expect(tokenFingerprint(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(tokenFingerprint(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and token-specific", () => {
    expect(tokenFingerprint("a")).toBe(tokenFingerprint("a"));
    expect(tokenFingerprint("a")).not.toBe(tokenFingerprint("b"));
  });
});

describe("session constants", () => {
  it("uses the documented cookie name and online window", () => {
    expect(SESSION_COOKIE).toBe("ggrun_session");
    expect(ONLINE_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });
});

describe("isStaff", () => {
  it("treats only admin and judge as staff", () => {
    expect(isStaff(userWithRole("admin"))).toBe(true);
    expect(isStaff(userWithRole("judge"))).toBe(true);
    expect(isStaff(userWithRole("player"))).toBe(false);
    expect(isStaff(userWithRole("moderator"))).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

describe("createSession", () => {
  it("inserts the fingerprint of the issued token and sets a hardened cookie", async () => {
    await createSession("user-7");

    expect(state.insertValues).toHaveBeenCalledTimes(1);
    const [inserted] = state.insertValues.mock.calls[0] as [Record<string, unknown>];
    expect(inserted.userId).toBe("user-7");

    const [name, token, options] = state.jar.set.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe(SESSION_COOKIE);
    expect(typeof token).toBe("string");
    expect(inserted.tokenHash).toBe(tokenFingerprint(token));
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    const expires = options.expires as Date;
    expect(expires.getTime()).toBe(NOW + SESSION_TTL_MS);
  });

  it("marks the cookie secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createSession("user-7");
    const [, , options] = state.jar.set.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(options.secure).toBe(true);
  });
});

describe("getCurrentSession", () => {
  it("returns null without querying the DB when there is no cookie", async () => {
    await expect(getCurrentSession()).resolves.toBeNull();
    expect(state.select).not.toHaveBeenCalled();
  });

  it("returns the stored session when it has not expired", async () => {
    const session = { id: "s1", expiresAt: new Date(NOW + 1000) };
    state.selectRows = [{ session }];
    state.jar.get.mockReturnValue({ value: "token-1" });

    await expect(getCurrentSession()).resolves.toBe(session);
    const [where] = state.select.mock.calls[0] as [unknown];
    expect(where).toBeDefined();
  });

  it("returns null for an expired session", async () => {
    state.selectRows = [{ session: { id: "s1", expiresAt: new Date(NOW) } }];
    state.jar.get.mockReturnValue({ value: "token-1" });
    await expect(getCurrentSession()).resolves.toBeNull();
  });

  it("returns null and warns when the DB is unreachable", async () => {
    state.jar.get.mockReturnValue({ value: "token-1" });
    state.select.mockImplementation(() => {
      throw Object.assign(new Error("down"), { code: "ECONNREFUSED" });
    });

    await expect(getCurrentSession()).resolves.toBeNull();
    expect(state.warn).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-connection errors", async () => {
    state.jar.get.mockReturnValue({ value: "token-1" });
    state.select.mockImplementation(() => {
      throw new Error("syntax error");
    });

    await expect(getCurrentSession()).rejects.toThrow("syntax error");
    expect(state.warn).not.toHaveBeenCalled();
  });
});

describe("getCurrentUser", () => {
  it("returns null without a cookie", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(state.select).not.toHaveBeenCalled();
  });

  it("returns the joined user and writes last_seen when it is stale", async () => {
    const user = {
      id: "u1",
      role: "player",
      lastSeenAt: new Date(NOW - 10 * 60 * 1000),
    } as unknown as User;
    state.selectRows = [{ user }];
    state.jar.get.mockReturnValue({ value: "token-1" });

    await expect(getCurrentUser()).resolves.toBe(user);
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it("skips the last_seen write when the user was seen within the throttle", async () => {
    const user = {
      id: "u1",
      role: "player",
      lastSeenAt: new Date(NOW - 1000),
    } as unknown as User;
    state.selectRows = [{ user }];
    state.jar.get.mockReturnValue({ value: "token-1" });

    await expect(getCurrentUser()).resolves.toBe(user);
    expect(state.update).not.toHaveBeenCalled();
  });

  it("treats a missing join row as anonymous", async () => {
    state.selectRows = [];
    state.jar.get.mockReturnValue({ value: "token-1" });

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("returns null and warns when the DB is unreachable", async () => {
    state.jar.get.mockReturnValue({ value: "token-1" });
    state.select.mockImplementation(() => {
      throw Object.assign(new Error("down"), { code: "ECONNRESET" });
    });

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(state.warn).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-connection errors", async () => {
    state.jar.get.mockReturnValue({ value: "token-1" });
    state.select.mockImplementation(() => {
      throw new Error("bad sql");
    });

    await expect(getCurrentUser()).rejects.toThrow("bad sql");
  });
});

describe("destroySession", () => {
  it("deletes the session row for the cookie token and clears the cookie", async () => {
    state.jar.get.mockReturnValue({ value: "token-9" });
    await destroySession();

    expect(state.deleteWhere).toHaveBeenCalledTimes(1);
    expect(state.jar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });

  it("only clears the cookie when no token is present", async () => {
    await destroySession();
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.jar.delete).toHaveBeenCalledWith(SESSION_COOKIE);
  });
});
