import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({ db: { update: vi.fn() } }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));

import { db } from "@/lib/infrastructure/db";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";

import { setUserLocale, updateUserSettings, updateUserSettingsSchema, userLinksSchema } from "./settings";

const updateWhere = vi.fn();
const updateSet = vi.fn(() => ({ where: updateWhere }));

beforeEach(() => {
  vi.resetAllMocks();
  updateWhere.mockResolvedValue(undefined);
  vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);
});

describe("updateUserSettingsSchema", () => {
  const base = {
    displayName: "Alice",
    bio: "hi",
    accent: "amber",
    locale: "en",
    links: [],
  };

  it("accepts a minimal valid payload", () => {
    expect(updateUserSettingsSchema.parse(base)).toEqual(base);
  });

  it("rejects an empty display name", () => {
    expect(() => updateUserSettingsSchema.parse({ ...base, displayName: "   " })).toThrow();
  });

  it("rejects a bio beyond the shared maximum", () => {
    expect(() => updateUserSettingsSchema.parse({ ...base, bio: "x".repeat(2001) })).toThrow();
  });

  it("accepts an inline image avatar but rejects an arbitrary scheme", () => {
    const png = updateUserSettingsSchema.parse({
      ...base,
      avatarUrl: "data:image/png;base64,AAAA",
    });
    expect(png.avatarUrl).toBe("data:image/png;base64,AAAA");

    expect(() =>
      updateUserSettingsSchema.parse({ ...base, avatarUrl: "not a valid url" }),
    ).toThrow();
  });

  it("rejects an unknown accent or locale", () => {
    expect(() => updateUserSettingsSchema.parse({ ...base, accent: "magenta" })).toThrow();
    expect(() => updateUserSettingsSchema.parse({ ...base, locale: "de" })).toThrow();
  });
});

describe("userLinksSchema", () => {
  it("accepts a link whose host matches the network", () => {
    const links = [{ network: "github", url: "https://github.com/alice" }];
    expect(userLinksSchema.parse(links)).toEqual(links);
  });

  it("rejects a link whose host does not match the declared network", () => {
    expect(() =>
      userLinksSchema.parse([{ network: "github", url: "https://twitch.tv/alice" }]),
    ).toThrow(/github/);
  });

  it("accepts any host for the custom network", () => {
    const links = [{ network: "custom", url: "https://example.com/me" }];
    expect(userLinksSchema.parse(links)).toEqual(links);
  });

  it("rejects more than six links", () => {
    const links = Array.from({ length: 7 }, () => ({ network: "custom", url: "https://example.com" }));
    expect(() => userLinksSchema.parse(links)).toThrow();
  });
});

describe("updateUserSettings", () => {
  const valid = {
    displayName: "Alice",
    bio: "",
    accent: "amber",
    locale: "en",
    links: [],
  };

  it("refuses to write without a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(updateUserSettings(valid)).rejects.toMatchObject({ code: "authLoginRequired" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("normalizes an empty bio and an omitted avatar to null / undefined", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    await updateUserSettings(valid);

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Alice", bio: null, avatarUrl: undefined, bannerUrl: undefined }),
    );
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("persists an explicit empty avatar as null", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    await updateUserSettings({ ...valid, avatarUrl: "" });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
  });
});

describe("setUserLocale", () => {
  it("ignores a locale outside the supported set", async () => {
    await setUserLocale("de");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does nothing when nobody is logged in", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await setUserLocale("ru");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("writes a supported locale for the logged-in user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    await setUserLocale("uk");
    expect(updateSet).toHaveBeenCalledWith({ locale: "uk" });
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
