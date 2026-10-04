import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));
vi.mock("@/lib/infrastructure/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/modules/site-settings/repository/site-settings", () => ({
  getSiteSettings: vi.fn(),
  findInviteToken: vi.fn(),
  consumeInviteToken: vi.fn(),
}));

import { db } from "@/lib/infrastructure/db";
import { hashPassword, verifyPassword } from "@/lib/infrastructure/auth/password";
import {
  consumeInviteToken,
  findInviteToken,
  getSiteSettings,
} from "@/lib/modules/site-settings/repository/site-settings";
import type { SiteSettings } from "@/lib/modules/site-settings/repository/site-settings";

import { authenticate, AuthError, registerUser } from "./index";

const selectQueue: unknown[][] = [];
const returningQueue: unknown[][] = [];
const insertValues = vi.fn();

function settings(overrides: Partial<SiteSettings> = {}): SiteSettings {
  return {
    id: "s1",
    registrationEnabled: true,
    registrationMode: "open",
    maintenanceMode: false,
    rawgApiKey: null,
    igdbClientId: null,
    igdbClientSecret: null,
    steamApiKey: null,
    gamespotApiKey: null,
    proxyEnabled: false,
    proxyUrl: null,
    updatedAt: new Date(),
    updatedBy: null,
    ...overrides,
  } as SiteSettings;
}

beforeEach(() => {
  vi.resetAllMocks();
  selectQueue.length = 0;
  returningQueue.length = 0;
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(selectQueue.shift() ?? []) }) }),
  } as never);
  vi.mocked(db.insert).mockReturnValue({
    values: (value: unknown) => {
      insertValues(value);
      return { returning: () => Promise.resolve(returningQueue.shift() ?? []) };
    },
  } as never);
  vi.mocked(getSiteSettings).mockResolvedValue(settings());
  vi.mocked(hashPassword).mockResolvedValue("hashed");
  vi.mocked(verifyPassword).mockResolvedValue(true);
  vi.mocked(consumeInviteToken).mockResolvedValue(true);
});

describe("registerUser validation order", () => {
  it("rejects a malformed email before reading settings or the database", async () => {
    await expect(registerUser({ email: "nope", password: "longenough" })).rejects.toMatchObject({
      code: "authInvalidEmail",
    });
    expect(getSiteSettings).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a short password before reading settings", async () => {
    await expect(registerUser({ email: "a@b.com", password: "short" })).rejects.toMatchObject({
      code: "authPasswordTooShort",
    });
    expect(getSiteSettings).not.toHaveBeenCalled();
  });

  it("rejects registration while it is disabled and no invite is present", async () => {
    vi.mocked(getSiteSettings).mockResolvedValue(settings({ registrationEnabled: false }));
    await expect(registerUser({ email: "a@b.com", password: "longenough" })).rejects.toMatchObject({
      code: "authRegistrationDisabled",
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email after the settings check", async () => {
    selectQueue.push([{ id: "existing" }]);
    await expect(registerUser({ email: " A@B.com ", password: "longenough" })).rejects.toMatchObject({
      code: "authUserExists",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("registerUser modes", () => {
  it("creates an approved, verified player in open mode", async () => {
    selectQueue.push([], []);
    returningQueue.push([{ id: "new-id" }]);

    const result = await registerUser({ email: "Alice@Example.com", password: "longenough" });

    expect(result).toEqual({
      id: "new-id",
      requiresApproval: false,
      requiresVerification: false,
      verificationToken: null,
    });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@example.com",
        username: "alice",
        passwordHash: "hashed",
        displayName: "alice",
        role: "player",
        isApproved: true,
        emailVerified: true,
      }),
    );
  });

  it("marks manual_approval signups as pending approval", async () => {
    vi.mocked(getSiteSettings).mockResolvedValue(settings({ registrationMode: "manual_approval" }));
    selectQueue.push([], []);
    returningQueue.push([{ id: "new-id" }]);

    const result = await registerUser({ email: "bob@example.com", password: "longenough" });
    expect(result.requiresApproval).toBe(true);
    expect(result.requiresVerification).toBe(false);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ isApproved: false, emailVerified: true }));
  });

  it("issues a verification token in email_link mode", async () => {
    vi.mocked(getSiteSettings).mockResolvedValue(settings({ registrationMode: "email_link" }));
    selectQueue.push([], []);
    returningQueue.push([{ id: "new-id" }]);

    const result = await registerUser({ email: "bob@example.com", password: "longenough" });
    expect(result.requiresVerification).toBe(true);
    expect(result.verificationToken).toEqual(expect.any(String));
    expect(result.verificationToken?.length).toBeGreaterThan(0);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ isApproved: false, emailVerified: false, emailVerificationToken: expect.any(String) }),
    );
  });

  it("sanitizes the email local part into a username", async () => {
    selectQueue.push([], []);
    returningQueue.push([{ id: "new-id" }]);
    await registerUser({ email: "a.b+c@example.com", password: "longenough" });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ username: "abc" }));
  });

  it("appends a random suffix when the derived username is taken", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1234);
    selectQueue.push([], [{ id: "taken" }], []);
    returningQueue.push([{ id: "new-id" }]);
    await registerUser({ email: "alice@example.com", password: "longenough" });
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ username: "alice1234" }));
    vi.restoreAllMocks();
  });
});

describe("registerUser with an invite", () => {
  it("rejects an unusable invite", async () => {
    vi.mocked(findInviteToken).mockResolvedValue(null);
    await expect(
      registerUser({ email: "a@b.com", password: "longenough", inviteToken: "bad" }),
    ).rejects.toMatchObject({ code: "authInviteInvalid" });
  });

  it("lets a valid invite bypass a disabled registration without approval", async () => {
    vi.mocked(getSiteSettings).mockResolvedValue(
      settings({ registrationEnabled: false, registrationMode: "manual_approval" }),
    );
    vi.mocked(findInviteToken).mockResolvedValue({ expiresAt: null, usesCount: 0, maxUses: 1 } as never);
    selectQueue.push([], []);
    returningQueue.push([{ id: "new-id" }]);

    const result = await registerUser({ email: "a@b.com", password: "longenough", inviteToken: "good" });

    expect(result.requiresApproval).toBe(false);
    expect(consumeInviteToken).toHaveBeenCalledWith("good");
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ isApproved: true, emailVerified: true }));
  });
});

describe("authenticate", () => {
  function userRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "u1",
      email: "alice@example.com",
      username: "alice",
      passwordHash: "hashed",
      isBlocked: false,
      isApproved: true,
      emailVerified: true,
      role: "player",
      ...overrides,
    };
  }

  it("rejects an unknown login", async () => {
    selectQueue.push([]);
    await expect(authenticate("ghost", "pw")).rejects.toMatchObject({ code: "authInvalidCredentials" });
  });

  it("rejects a blocked user before checking the password", async () => {
    selectQueue.push([userRow({ isBlocked: true })]);
    await expect(authenticate("alice", "pw")).rejects.toMatchObject({ code: "authBlocked" });
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("rejects a wrong password", async () => {
    selectQueue.push([userRow()]);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(authenticate("alice", "pw")).rejects.toMatchObject({ code: "authInvalidCredentials" });
    expect(getSiteSettings).not.toHaveBeenCalled();
  });

  it("blocks a non-admin during maintenance mode", async () => {
    selectQueue.push([userRow()]);
    vi.mocked(getSiteSettings).mockResolvedValue(settings({ maintenanceMode: true }));
    await expect(authenticate("alice", "pw")).rejects.toMatchObject({ code: "authMaintenance" });
  });

  it("allows an admin through maintenance mode", async () => {
    selectQueue.push([userRow({ role: "admin" })]);
    vi.mocked(getSiteSettings).mockResolvedValue(settings({ maintenanceMode: true }));
    await expect(authenticate("alice", "pw")).resolves.toEqual({ id: "u1" });
  });

  it("rejects a user pending approval", async () => {
    selectQueue.push([userRow({ isApproved: false })]);
    await expect(authenticate("alice", "pw")).rejects.toMatchObject({ code: "authPendingApproval" });
  });

  it("rejects a user whose email is not verified", async () => {
    selectQueue.push([userRow({ emailVerified: false })]);
    await expect(authenticate("alice", "pw")).rejects.toMatchObject({ code: "authEmailNotVerified" });
  });

  it("returns the user id on success", async () => {
    selectQueue.push([userRow()]);
    await expect(authenticate(" Alice ", "pw")).resolves.toEqual({ id: "u1" });
  });
});

describe("AuthError", () => {
  it("is a 401 with the code it is given", () => {
    const error = new AuthError("authBlocked");
    expect(error.status).toBe(401);
    expect(error.code).toBe("authBlocked");
    expect(error.name).toBe("AuthError");
  });
});
