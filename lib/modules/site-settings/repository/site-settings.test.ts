import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

import { db } from "@/lib/infrastructure/db";

import {
  consumeInviteToken,
  createInviteToken,
  deleteInviteToken,
  findInviteToken,
  getSiteSettings,
  listInviteTokens,
  listPendingApprovals,
  listPendingVerifications,
  updateSiteSettings,
} from "./site-settings";

const selectQueue: unknown[][] = [];
const returningQueue: unknown[][] = [];
const setSpy = vi.fn();
const whereResult = {
  returning: () => Promise.resolve(returningQueue.shift() ?? []),
  then: (resolve: (value: undefined) => unknown) => Promise.resolve(undefined).then(resolve),
};

function selectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  selectQueue.length = 0;
  returningQueue.length = 0;
  vi.mocked(db.select).mockImplementation(() => selectChain(selectQueue.shift() ?? []) as never);
  vi.mocked(db.insert).mockImplementation(
    () =>
      ({
        values: () => ({
          returning: () => Promise.resolve(returningQueue.shift() ?? []),
        }),
      }) as never,
  );
  vi.mocked(db.update).mockImplementation(
    () =>
      ({
        set: (patch: unknown) => {
          setSpy(patch);
          return { where: () => whereResult };
        },
      }) as never,
  );
  vi.mocked(db.delete).mockImplementation(
    () => ({ where: () => Promise.resolve(undefined) }) as never,
  );
});

describe("getSiteSettings", () => {
  it("returns the existing singleton without inserting", async () => {
    const row = { id: "s1", registrationEnabled: true };
    selectQueue.push([row]);
    await expect(getSiteSettings()).resolves.toBe(row);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("auto-creates the singleton when the table is empty", async () => {
    const created = { id: "new" };
    selectQueue.push([]);
    returningQueue.push([created]);
    await expect(getSiteSettings()).resolves.toBe(created);
  });
});

describe("updateSiteSettings", () => {
  it("returns the updated row", async () => {
    const current = { id: "s1", registrationEnabled: false };
    const updated = { id: "s1", registrationEnabled: true };
    selectQueue.push([current]);
    returningQueue.push([updated]);

    await expect(updateSiteSettings({ registrationEnabled: true })).resolves.toBe(updated);
    expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ registrationEnabled: true }));
  });

  it("falls back to the current row when the update returns nothing", async () => {
    const current = { id: "s1" };
    selectQueue.push([current]);
    returningQueue.push([]);
    await expect(updateSiteSettings({ maintenanceMode: true })).resolves.toBe(current);
  });
});

describe("invite tokens", () => {
  function tokenRow(overrides: Record<string, unknown> = {}) {
    return { id: "t1", token: "abc", expiresAt: null, usesCount: 0, maxUses: 1, ...overrides };
  }

  it("findInviteToken returns the row or null", async () => {
    selectQueue.push([tokenRow()]);
    await expect(findInviteToken("abc")).resolves.toMatchObject({ id: "t1" });
    selectQueue.push([]);
    await expect(findInviteToken("missing")).resolves.toBeNull();
  });

  it("consumes a valid token and bumps its use count", async () => {
    selectQueue.push([tokenRow({ usesCount: 0, maxUses: 2 })]);
    await expect(consumeInviteToken("abc")).resolves.toBe(true);
    expect(setSpy).toHaveBeenCalledWith({ usesCount: 1 });
  });

  it("refuses an unknown token", async () => {
    selectQueue.push([]);
    await expect(consumeInviteToken("missing")).resolves.toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses an expired token", async () => {
    selectQueue.push([tokenRow({ expiresAt: new Date(Date.now() - 1000) })]);
    await expect(consumeInviteToken("abc")).resolves.toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("refuses a token that reached its use limit", async () => {
    selectQueue.push([tokenRow({ usesCount: 1, maxUses: 1 })]);
    await expect(consumeInviteToken("abc")).resolves.toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("creates a token passing the params through", async () => {
    returningQueue.push([{ id: "new" }]);
    await expect(createInviteToken({ token: "t", createdBy: null, expiresAt: null, maxUses: 5 })).resolves.toMatchObject({
      id: "new",
    });
  });

  it("deletes a token without returning a value", async () => {
    await expect(deleteInviteToken("t1")).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("lists tokens ordered by creation", async () => {
    selectQueue.push([tokenRow(), tokenRow({ id: "t2" })]);
    await expect(listInviteTokens()).resolves.toHaveLength(2);
  });
});

describe("pending helpers", () => {
  it("lists unapproved users", async () => {
    selectQueue.push([{ id: "u1", isApproved: false }]);
    await expect(listPendingApprovals()).resolves.toEqual([{ id: "u1", isApproved: false }]);
  });

  it("keeps only unverified users that still carry a token", async () => {
    selectQueue.push([
      { id: "a", emailVerified: false, emailVerificationToken: "tok" },
      { id: "b", emailVerified: true, emailVerificationToken: "tok" },
      { id: "c", emailVerified: false, emailVerificationToken: null },
    ]);
    const result = await listPendingVerifications();
    expect(result.map((u) => u.id)).toEqual(["a"]);
  });
});
