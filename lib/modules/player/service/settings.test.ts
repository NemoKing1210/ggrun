import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/infrastructure/db", () => ({ db: { update: vi.fn() } }));
vi.mock("@/lib/infrastructure/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/modules/files/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/modules/files/service")>();
  return {
    ...actual,
    storeFile: vi.fn(),
    deleteFileByUrl: vi.fn(),
    fileUrl: vi.fn((row: { key: string }) => `/api/files?key=${encodeURIComponent(row.key)}`),
  };
});

import { db } from "@/lib/infrastructure/db";
import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { deleteFileByUrl, fileUrl, storeFile } from "@/lib/modules/files/service";

import { setUserLocale, updateUserSettings, updateUserSettingsSchema, userLinksSchema } from "./settings";

const updateWhere = vi.fn();
const updateSet = vi.fn(() => ({ where: updateWhere }));

beforeEach(() => {
  vi.resetAllMocks();
  updateWhere.mockResolvedValue(undefined);
  vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);
  vi.mocked(fileUrl).mockImplementation((row) => `/api/files?key=${encodeURIComponent(row.key)}`);
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

  it("accepts our own relative file link — the value the editor submits back", () => {
    const key = "avatar/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg";
    const parsed = updateUserSettingsSchema.parse({
      ...base,
      avatarUrl: `/api/files?key=${encodeURIComponent(key)}`,
      bannerUrl: "https://cdn.example/banner.png",
    });
    expect(parsed.avatarUrl).toBe(`/api/files?key=${encodeURIComponent(key)}`);
    expect(parsed.bannerUrl).toBe("https://cdn.example/banner.png");
  });

  it("rejects a link that is not one of ours, a javascript: URL and an oversized inline image", () => {
    for (const bad of [
      "/api/files?key=../../etc/passwd",
      "/uploads/avatar.jpg",
      "javascript:alert(1)",
      `data:image/png;base64,${"A".repeat(700_001)}`,
    ]) {
      expect(() => updateUserSettingsSchema.parse({ ...base, avatarUrl: bad })).toThrow();
    }
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

  it("turns an inline avatar into a stored file and keeps only its URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      role: "player",
      avatarUrl: "data:image/png;base64,OLD",
    } as never);
    vi.mocked(storeFile).mockResolvedValue({ id: "f1", key: "avatar/2026/10/new.png" } as never);
    vi.mocked(deleteFileByUrl).mockResolvedValue(false);

    await updateUserSettings({ ...valid, avatarUrl: "data:image/png;base64,AAAA" });

    expect(storeFile).toHaveBeenCalledWith(
      expect.objectContaining({ category: "avatar", actor: { id: "u1", role: "player" } }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: `/api/files?key=${encodeURIComponent("avatar/2026/10/new.png")}` }),
    );
    // The previous value is offered for cleanup; for inline data that is a no-op.
    expect(deleteFileByUrl).toHaveBeenCalledWith("data:image/png;base64,OLD", {
      id: "u1",
      role: "player",
    });
  });

  it("drops the stored file when the picture is cleared", async () => {
    const previous = `/api/files?key=${encodeURIComponent("avatar/2026/10/old.png")}`;
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", role: "player", avatarUrl: previous } as never);
    vi.mocked(deleteFileByUrl).mockResolvedValue(true);

    await updateUserSettings({ ...valid, avatarUrl: "" });

    expect(deleteFileByUrl).toHaveBeenCalledWith(previous, { id: "u1", role: "player" });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
    expect(storeFile).not.toHaveBeenCalled();
  });

  it("keeps an unchanged external URL without touching storage", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "u1",
      role: "player",
      avatarUrl: "https://cdn.example/me.png",
    } as never);

    await updateUserSettings({ ...valid, avatarUrl: "https://cdn.example/me.png" });

    expect(storeFile).not.toHaveBeenCalled();
    expect(deleteFileByUrl).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: "https://cdn.example/me.png" }),
    );
  });

  it("drops our stored file when the user switches to an external URL", async () => {
    const previous = `/api/files?key=${encodeURIComponent("banner/2026/10/old.png")}`;
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", role: "player", bannerUrl: previous } as never);
    vi.mocked(deleteFileByUrl).mockResolvedValue(true);

    await updateUserSettings({ ...valid, bannerUrl: "https://cdn.example/banner.png" });

    expect(deleteFileByUrl).toHaveBeenCalledWith(previous, { id: "u1", role: "player" });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ bannerUrl: "https://cdn.example/banner.png" }),
    );
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
