import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/auth/session", () => session);

const dbFake = vi.hoisted(() => ({
  db: { transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({ marker: "tx" })) },
}));
vi.mock("@/lib/infrastructure/db", () => dbFake);

const { coreEditable, libraryAdmin, withLibrary } = await import("./context");

beforeEach(() => {
  session.getCurrentUser.mockReset();
});

afterEach(() => {
  delete process.env.IEE_CORE_EDITABLE;
});

describe("libraryAdmin", () => {
  it("lets an admin in", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u1", role: "admin" });
    await expect(libraryAdmin()).resolves.toEqual({ id: "u1" });
  });

  it.each([null, { id: "u2", role: "judge" }, { id: "u3", role: "player" }])(
    "refuses %o — judges keep the wizard, not the library (D1)",
    async (user) => {
      session.getCurrentUser.mockResolvedValue(user);
      await expect(libraryAdmin()).rejects.toMatchObject({ code: "ieeAdminRequired" });
    },
  );
});

describe("withLibrary", () => {
  it("runs the use case inside one transaction, on a store bound to it", async () => {
    const result = await withLibrary(async (store) => typeof store.insertRevision);
    expect(result).toBe("function");
    expect(dbFake.db.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("coreEditable", () => {
  it("is off unless the install sets IEE_CORE_EDITABLE=1", () => {
    expect(coreEditable()).toBe(false);
    process.env.IEE_CORE_EDITABLE = "true";
    expect(coreEditable()).toBe(false);
    process.env.IEE_CORE_EDITABLE = "1";
    expect(coreEditable()).toBe(true);
  });
});
