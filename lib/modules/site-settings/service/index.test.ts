import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/infrastructure/events", () => ({ logAdminAction: vi.fn() }));
vi.mock("@/lib/infrastructure/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/infrastructure/http/external-fetch", () => ({
  resetProxyAgent: vi.fn(),
  getEffectiveProxy: vi.fn(),
}));
vi.mock("@/lib/modules/site-settings/repository/site-settings", () => ({
  getSiteSettings: vi.fn(),
  updateSiteSettings: vi.fn(),
  createInviteToken: vi.fn(),
  deleteInviteToken: vi.fn(),
  listInviteTokens: vi.fn(),
  listPendingApprovals: vi.fn(),
}));

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { logAdminAction } from "@/lib/infrastructure/events";
import { resetProxyAgent } from "@/lib/infrastructure/http/external-fetch";
import { updateSiteSettings } from "@/lib/modules/site-settings/repository/site-settings";

import {
  buildInviteLink,
  buildVerificationLink,
  providerKeysSchema,
  siteSettingsSchema,
  updateProviderKeysUseCase,
  updateSiteSettingsUseCase,
} from "./index";

const mocks = {
  getCurrentUser: vi.mocked(getCurrentUser),
  updateSiteSettings: vi.mocked(updateSiteSettings),
  resetProxyAgent: vi.mocked(resetProxyAgent),
  logAdminAction: vi.mocked(logAdminAction),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateSiteSettings.mockResolvedValue({ id: "s1" } as never);
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("siteSettingsSchema", () => {
  it("accepts the three supported registration modes", () => {
    for (const registrationMode of ["open", "manual_approval", "email_link"] as const) {
      expect(
        siteSettingsSchema.parse({ registrationEnabled: true, registrationMode, maintenanceMode: false }),
      ).toEqual({ registrationEnabled: true, registrationMode, maintenanceMode: false });
    }
  });

  it("rejects an unknown registration mode", () => {
    expect(() =>
      siteSettingsSchema.parse({ registrationEnabled: true, registrationMode: "everyone", maintenanceMode: false }),
    ).toThrow(ZodError);
  });
});

describe("providerKeysSchema", () => {
  it("trims keys and turns blank strings into null", () => {
    const parsed = providerKeysSchema.parse({ rawgApiKey: "  key  ", igdbClientId: "   " });
    expect(parsed.rawgApiKey).toBe("key");
    expect(parsed.igdbClientId).toBeNull();
  });

  it("leaves omitted string keys undefined instead of clearing them", () => {
    const parsed = providerKeysSchema.parse({});
    expect(parsed.steamApiKey).toBeUndefined();
    expect(parsed.proxyUrl).toBeUndefined();
    expect(parsed.proxyEnabled).toBeUndefined();
  });
});

describe("updateProviderKeysUseCase", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" } as never);
  });

  it("refuses a non-admin caller", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1", role: "player" } as never);
    await expect(updateProviderKeysUseCase({})).rejects.toMatchObject({ code: "adminStaffRequired" });
    expect(mocks.updateSiteSettings).not.toHaveBeenCalled();
  });

  it("clears one key and sets another without touching the omitted keys", async () => {
    await updateProviderKeysUseCase({ rawgApiKey: null, steamApiKey: "steam-key" });

    const patch = mocks.updateSiteSettings.mock.calls[0]![0];
    expect(patch).toMatchObject({ rawgApiKey: null, steamApiKey: "steam-key", updatedBy: "admin-1" });
    expect(patch).not.toHaveProperty("igdbClientId");
    expect(patch).not.toHaveProperty("proxyUrl");
    expect(patch).not.toHaveProperty("proxyEnabled");
  });

  it("resets the cached proxy agent only when a proxy setting changes", async () => {
    await updateProviderKeysUseCase({ rawgApiKey: "key" });
    expect(mocks.resetProxyAgent).not.toHaveBeenCalled();

    await updateProviderKeysUseCase({ proxyUrl: "http://proxy.local:8080" });
    expect(mocks.resetProxyAgent).toHaveBeenCalledTimes(1);
  });
});

describe("updateSiteSettingsUseCase", () => {
  const valid = { registrationEnabled: true, registrationMode: "open", maintenanceMode: false };

  it("requires an admin actor", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(updateSiteSettingsUseCase(valid)).rejects.toMatchObject({ code: "adminStaffRequired" });
  });

  it("rejects an invalid registration mode before writing", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" } as never);
    await expect(
      updateSiteSettingsUseCase({ ...valid, registrationMode: "everyone" }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(mocks.updateSiteSettings).not.toHaveBeenCalled();
  });

  it("stamps the acting admin onto the update and audits it", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" } as never);
    const result = await updateSiteSettingsUseCase(valid);

    expect(result).toEqual({ id: "s1" });
    expect(mocks.updateSiteSettings).toHaveBeenCalledWith({ ...valid, updatedBy: "admin-1" });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", actionType: "site_settings_updated" }),
    );
  });
});

describe("link builders", () => {
  it("uses an explicit base and strips its trailing slash", () => {
    expect(buildInviteLink("tok", "https://gg.run/")).toBe("https://gg.run/register?invite=tok");
    expect(buildVerificationLink("tok", "https://gg.run/")).toBe("https://gg.run/verify-email?token=tok");
  });

  it("falls back to the local site default when no base is given", () => {
    expect(buildInviteLink("tok")).toBe("http://localhost:3000/register?invite=tok");
  });

  it("prefers NEXT_PUBLIC_SITE_URL over the default", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://env.example";
    expect(buildVerificationLink("tok")).toBe("https://env.example/verify-email?token=tok");
  });

  it("URL-encodes tokens with reserved characters", () => {
    expect(buildInviteLink("a b/c", "https://x")).toBe("https://x/register?invite=a%20b%2Fc");
  });
});
