import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn() }));

import { db } from "@/lib/infrastructure/db";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { logAdminAction } from "@/lib/infrastructure/events";

import {
  adminCreateUser,
  adminDeleteUser,
  adminRevokeSessions,
  adminSetUserBlocked,
  adminUpdateUser,
  adminVerifyEmail,
  createUserSchema,
  getUserById,
  listUserAuditTrail,
  listUserRolls,
  listUserSeasons,
  listUserSeasonsBulk,
  listUserSessions,
  listUsers,
  requireAdmin,
  updateUserSchema,
} from "./admin";

const selectQueue: unknown[][] = [];
const updateSet = vi.fn();
const updateWhere = vi.fn(() => Promise.resolve(undefined));

function wireSelect(): void {
  vi.mocked(db.select).mockImplementation(() => {
    const rows = selectQueue.shift() ?? [];
    const whereResult = {
      limit: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
    };
    const chain = {
      from: () => ({
        where: () => whereResult,
        orderBy: () => Promise.resolve(rows),
      }),
    };
    return chain as never;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  selectQueue.length = 0;
  wireSelect();
  vi.mocked(db.update).mockReturnValue({
    set: (patch: unknown) => {
      updateSet(patch);
      return { where: updateWhere };
    },
  } as never);
  vi.mocked(db.delete).mockReturnValue({ where: updateWhere } as never);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("schemas", () => {
  it("accepts a well-formed new user", () => {
    const parsed = createUserSchema.parse({
      email: "a@b.com",
      username: "player_1",
      password: "longenough",
      role: "judge",
    });
    expect(parsed.role).toBe("judge");
  });

  it("rejects a username with disallowed characters", () => {
    expect(() =>
      createUserSchema.parse({ email: "a@b.com", username: "bad name", password: "longenough", role: "player" }),
    ).toThrow();
  });

  it("rejects a short password and an unknown role", () => {
    expect(() =>
      createUserSchema.parse({ email: "a@b.com", username: "ok", password: "short", role: "player" }),
    ).toThrow();
    expect(() =>
      createUserSchema.parse({ email: "a@b.com", username: "ok", password: "longenough", role: "superuser" }),
    ).toThrow();
  });

  it("requires a UUID in the update schema", () => {
    expect(() => updateUserSchema.parse({ userId: "not-a-uuid" })).toThrow();
    expect(updateUserSchema.parse({ userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }).userId).toBe(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
  });
});

describe("listUserSessions", () => {
  it("derives isActive from the expiry against the current clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    selectQueue.push([
      { id: "past", expiresAt: new Date("2025-12-31T00:00:00Z") },
      { id: "future", expiresAt: new Date("2026-01-02T00:00:00Z") },
    ]);

    const rows = await listUserSessions("u1");
    expect(rows.map((s) => [s.id, s.isActive])).toEqual([
      ["past", false],
      ["future", true],
    ]);
  });
});

describe("adminSetUserBlocked", () => {
  it("refuses to block yourself before touching the database", async () => {
    await expect(adminSetUserBlocked("admin-1", true)).rejects.toMatchObject({ code: "adminSelfBlock" });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("reports a missing target", async () => {
    selectQueue.push([]);
    await expect(adminSetUserBlocked("u1", true)).rejects.toMatchObject({ code: "adminPlayerNotFound" });
  });

  it("writes the flag for another user", async () => {
    selectQueue.push([{ id: "u1" }]);
    await adminSetUserBlocked("u1", true);
    expect(updateSet).toHaveBeenCalledWith({ isBlocked: true });
  });

  it("records an unblock with the matching audit action", async () => {
    selectQueue.push([{ id: "u1" }]);
    await adminSetUserBlocked("u1", false);
    expect(updateSet).toHaveBeenCalledWith({ isBlocked: false });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "user_unblocked", targetId: "u1" }),
    );
  });
});

describe("adminDeleteUser", () => {
  it("refuses to delete yourself", async () => {
    await expect(adminDeleteUser("admin-1")).rejects.toMatchObject({ code: "adminSelfDelete" });
  });

  it("deletes an existing other user", async () => {
    selectQueue.push([{ id: "u1", username: "alice" }]);
    await adminDeleteUser("u1");
    expect(db.delete).toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("reports a missing target", async () => {
    selectQueue.push([]);
    await expect(adminDeleteUser("u1")).rejects.toMatchObject({ code: "adminPlayerNotFound" });
    expect(db.delete).not.toHaveBeenCalled();
  });
});

describe("adminVerifyEmail", () => {
  it("is idempotent for an already-verified user", async () => {
    selectQueue.push([{ id: "u1", emailVerified: true }]);
    await adminVerifyEmail("u1");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("reports a missing target", async () => {
    selectQueue.push([]);
    await expect(adminVerifyEmail("u1")).rejects.toMatchObject({ code: "adminPlayerNotFound" });
  });

  it("verifies and clears the pending token otherwise", async () => {
    selectQueue.push([{ id: "u1", emailVerified: false, email: "a@b.com" }]);
    await adminVerifyEmail("u1");
    expect(updateSet).toHaveBeenCalledWith({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    });
  });
});

describe("adminUpdateUser", () => {
  it("refuses to demote the acting admin", async () => {
    selectQueue.push([{ id: "admin-1" }]);
    await expect(
      adminUpdateUser({ userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", role: "player" }),
    ).rejects.toMatchObject({ code: "adminSelfDemote" });
  });

  it("updates another user's role", async () => {
    selectQueue.push([{ id: "u2" }]);
    await adminUpdateUser({ userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", role: "judge" });
    expect(updateSet).toHaveBeenCalledWith({ role: "judge" });
  });

  it("reports a missing target", async () => {
    selectQueue.push([]);
    await expect(
      adminUpdateUser({ userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", role: "judge" }),
    ).rejects.toMatchObject({ code: "adminPlayerNotFound" });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("applies every optional field and redacts the password in the audit payload", async () => {
    selectQueue.push([{ id: "u2" }]);

    await adminUpdateUser({
      userId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      email: "New@Example.COM",
      username: "NEWNAME",
      displayName: "New Name",
      role: "viewer",
      password: "longenough",
    });

    const patch = updateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      email: "new@example.com",
      username: "newname",
      displayName: "New Name",
      role: "viewer",
    });
    expect(String(patch.passwordHash)).toMatch(/^scrypt\$/);
    const audit = vi.mocked(logAdminAction).mock.calls[0]?.[0];
    expect(audit?.payload).toMatchObject({ email: "New@Example.COM", username: "NEWNAME", password: "***" });
  });
});

/** Select chain that supports the join/where/orderBy/limit shapes used below. */
function wireRichSelect(): void {
  vi.mocked(db.select).mockImplementation(() => {
    const rows = selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return chain as never;
  });
}

describe("requireAdmin", () => {
  it("rejects when there is no session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({ code: "adminStaffRequired" });
  });

  it("rejects a judge — only admin passes", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "j1", role: "judge" } as never);
    await expect(requireAdmin()).rejects.toMatchObject({ code: "adminStaffRequired" });
  });

  it("returns the acting admin", async () => {
    const admin = { id: "admin-1", role: "admin" };
    vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
    await expect(requireAdmin()).resolves.toBe(admin);
  });
});

describe("listUsers", () => {
  beforeEach(() => {
    wireRichSelect();
  });

  it("skips the WHERE clause for a blank query", async () => {
    const whereCalls: unknown[] = [];
    vi.mocked(db.select).mockImplementation(() => {
      const rows = selectQueue.shift() ?? [];
      return {
        from: () => ({
          where: (cond: unknown) => {
            whereCalls.push(cond);
            return { orderBy: () => Promise.resolve(rows) };
          },
          orderBy: () => Promise.resolve(rows),
        }),
      } as never;
    });
    selectQueue.push([{ id: "u1" }]);

    const rows = await listUsers("   ");

    expect(rows).toEqual([{ id: "u1" }]);
    expect(whereCalls).toHaveLength(0);
  });

  it("applies an ilike filter for a non-blank query", async () => {
    const whereCalls: unknown[] = [];
    vi.mocked(db.select).mockImplementation(() => {
      const rows = selectQueue.shift() ?? [];
      return {
        from: () => ({
          where: (cond: unknown) => {
            whereCalls.push(cond);
            return { orderBy: () => Promise.resolve(rows) };
          },
          orderBy: () => Promise.resolve(rows),
        }),
      } as never;
    });
    selectQueue.push([{ id: "u2" }]);

    const rows = await listUsers("  alice  ");

    expect(rows).toEqual([{ id: "u2" }]);
    expect(whereCalls).toHaveLength(1);
    expect(whereCalls[0]).toBeDefined();
  });
});

describe("getUserById", () => {
  beforeEach(() => {
    wireRichSelect();
  });

  it("returns null when nothing matches", async () => {
    selectQueue.push([]);
    expect(await getUserById("missing")).toBeNull();
  });

  it("returns the first matching row", async () => {
    selectQueue.push([{ id: "u1", username: "alice" }]);
    expect(await getUserById("u1")).toMatchObject({ id: "u1" });
  });
});

describe("listUserAuditTrail", () => {
  beforeEach(() => {
    wireRichSelect();
  });

  it("merges entries by the user and on the user, newest first", async () => {
    selectQueue.push([{ entry: { id: "a1", createdAt: new Date("2026-01-01") }, actorName: "self" }]);
    selectQueue.push([
      { entry: { id: "t1", createdAt: new Date("2026-01-03") }, actorName: "mod" },
      { entry: { id: "t2", createdAt: new Date("2025-12-31") }, actorName: "mod2" },
    ]);

    const rows = await listUserAuditTrail("u1");

    expect(rows.map((r) => [r.entry.id, r.isByUser, r.actorName])).toEqual([
      ["t1", false, "mod"],
      ["a1", true, "self"],
      ["t2", false, "mod2"],
    ]);
  });

  it("caps the merged list at the requested limit", async () => {
    selectQueue.push([{ entry: { id: "a1", createdAt: new Date("2026-01-02") }, actorName: "self" }]);
    selectQueue.push([{ entry: { id: "t1", createdAt: new Date("2026-01-01") }, actorName: "mod" }]);

    const rows = await listUserAuditTrail("u1", 1);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.entry.id).toBe("a1");
  });
});

describe("listUserSeasons", () => {
  beforeEach(() => {
    wireRichSelect();
  });

  it("returns the joined season rows as-is", async () => {
    const season = { seasonId: "s1", seasonTitle: "S1", seasonSlug: "s1", position: 3 };
    selectQueue.push([season]);

    expect(await listUserSeasons("u1")).toEqual([season]);
  });
});

describe("listUserSeasonsBulk", () => {
  beforeEach(() => {
    wireRichSelect();
  });

  it("returns an empty map without querying for an empty id list", async () => {
    expect(await listUserSeasonsBulk([])).toEqual({});
    expect(db.select).not.toHaveBeenCalled();
  });

  it("groups rows by player id and drops the grouping key", async () => {
    selectQueue.push([
      { playerId: "u1", seasonId: "s1", position: 1 },
      { playerId: "u1", seasonId: "s2", position: 2 },
      { playerId: "u2", seasonId: "s3", position: 3 },
    ]);

    const map = await listUserSeasonsBulk(["u1", "u2"]);

    expect(Object.keys(map)).toEqual(["u1", "u2"]);
    expect(map.u1?.map((r) => r.seasonId)).toEqual(["s1", "s2"]);
    expect(map.u1?.[0]).not.toHaveProperty("playerId");
  });
});

describe("listUserRolls", () => {
  beforeEach(() => {
    wireRichSelect();
  });

  it("returns the joined roll rows", async () => {
    const roll = { rollId: "r1", status: "passed" };
    selectQueue.push([roll]);
    expect(await listUserRolls("u1")).toEqual([roll]);
  });
});

describe("adminRevokeSessions", () => {
  it("requires an admin session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(adminRevokeSessions("u1")).rejects.toMatchObject({ code: "adminStaffRequired" });
  });

  it("reports a missing target", async () => {
    selectQueue.push([]);
    await expect(adminRevokeSessions("u1")).rejects.toMatchObject({ code: "adminPlayerNotFound" });
  });

  it("revokes one session when a session id is given", async () => {
    selectQueue.push([{ id: "u1" }]);
    vi.mocked(db.delete).mockReturnValue({ where: () => Promise.resolve({ rowCount: 1 }) } as never);

    await adminRevokeSessions("u1", "sess-1");

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "user_session_revoked",
        targetId: "u1",
        payload: { sessionId: "sess-1" },
      }),
    );
  });

  it("revokes every session and reports the row count", async () => {
    selectQueue.push([{ id: "u1" }]);
    vi.mocked(db.delete).mockReturnValue({ where: () => Promise.resolve({ rowCount: 4 }) } as never);

    await adminRevokeSessions("u1");

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "user_sessions_revoked",
        payload: { count: 4 },
      }),
    );
  });
});

describe("adminCreateUser", () => {
  it("rejects an invalid payload before any query", async () => {
    await expect(
      adminCreateUser({ email: "a@b.com", username: "ok", password: "longenough", role: "superuser" }),
    ).rejects.toThrow();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("refuses a duplicate email before inserting", async () => {
    selectQueue.push([{ id: "existing" }]);
    await expect(
      adminCreateUser({ email: "a@b.com", username: "alice", password: "longenough", role: "player" }),
    ).rejects.toMatchObject({ code: "authUserExists" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("lower-cases the identity, hashes the password and defaults the display name", async () => {
    selectQueue.push([]);
    const inserted: Array<Record<string, unknown>> = [];
    vi.mocked(db.insert).mockReturnValue({
      values: (value: Record<string, unknown>) => {
        inserted.push(value);
        return { returning: () => Promise.resolve([{ id: "new-id" }]) };
      },
    } as never);

    const id = await adminCreateUser({
      email: "Alice@Example.COM",
      username: "ALICE",
      password: "longenough",
      role: "judge",
    });

    expect(id).toBe("new-id");
    expect(inserted[0]).toMatchObject({
      email: "alice@example.com",
      username: "alice",
      displayName: "ALICE",
      role: "judge",
    });
    expect(String(inserted[0]?.passwordHash)).toMatch(/^scrypt\$/);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "user_created", targetId: "new-id" }),
    );
  });
});
