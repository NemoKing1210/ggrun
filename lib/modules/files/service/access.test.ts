import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StorageConfig } from "@/lib/infrastructure/storage";
import { setStorage } from "@/lib/infrastructure/storage";
import type { FileRecord } from "@/db/schema";

import {
  canDeleteFile,
  canReadFile,
  fileAccessUrl,
  fileAppUrl,
  fileKeyFromUrl,
  fileUrl,
  isStaffRole,
  verifyFileLink,
} from "./access";
import type { StorageDriver } from "@/lib/infrastructure/storage";

const KEY = "avatar/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg";

const config: StorageConfig = {
  driver: "local",
  root: ".storage",
  signingSecret: "link-secret",
  maxUploadBytes: 1_000_000,
};

function makeDriver(overrides: Partial<StorageDriver> = {}): StorageDriver {
  return {
    kind: "local",
    put: async () => {},
    get: async () => null,
    stat: async () => null,
    exists: async () => false,
    delete: async () => {},
    publicUrl: () => null,
    signedUrl: async () => null,
    ...overrides,
  };
}

function file(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: "f1",
    key: KEY,
    category: "avatar",
    ownerId: "u1",
    mimeType: "image/jpeg",
    sizeBytes: 10,
    checksum: "c",
    width: 256,
    height: 256,
    visibility: "public",
    metadata: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => setStorage(makeDriver(), config));
afterEach(() => {
  setStorage(null);
  vi.unstubAllEnvs();
});

describe("isStaffRole", () => {
  it("counts admins and judges as staff", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("judge")).toBe(true);
    expect(isStaffRole("player")).toBe(false);
    expect(isStaffRole("viewer")).toBe(false);
  });
});

describe("canReadFile", () => {
  it("lets anyone read a public file", () => {
    expect(canReadFile(file(), null)).toBe(true);
  });

  it("gates a private file to its owner and staff", () => {
    const privateFile = file({ visibility: "private" });
    expect(canReadFile(privateFile, null)).toBe(false);
    expect(canReadFile(privateFile, { id: "u2", role: "player" })).toBe(false);
    expect(canReadFile(privateFile, { id: "u1", role: "player" })).toBe(true);
    expect(canReadFile(privateFile, { id: "u9", role: "judge" })).toBe(true);
    expect(canReadFile(privateFile, { id: "u9", role: "admin" })).toBe(true);
  });
});

describe("canDeleteFile", () => {
  it("lets staff delete anything", () => {
    expect(canDeleteFile(file(), { id: "u9", role: "judge" })).toBe(true);
  });

  it("lets an owner delete their own file when the category allows it", () => {
    expect(canDeleteFile(file({ category: "avatar" }), { id: "u1", role: "player" })).toBe(true);
    expect(canDeleteFile(file({ category: "avatar" }), { id: "u2", role: "player" })).toBe(false);
  });

  it("keeps staff-only categories out of an owner's reach", () => {
    expect(canDeleteFile(file({ category: "game_cover" }), { id: "u1", role: "player" })).toBe(false);
  });

  it("refuses an anonymous actor", () => {
    expect(canDeleteFile(file(), null)).toBe(false);
  });
});

describe("fileUrl", () => {
  it("serves public files through the app when no direct base URL exists", () => {
    expect(fileUrl(file())).toBe(fileAppUrl(KEY));
    expect(fileUrl(file())).toBe(`/api/files?key=${encodeURIComponent(KEY)}`);
  });

  it("prefers a direct public URL when the driver has one", () => {
    setStorage(makeDriver({ publicUrl: (key) => `https://cdn.test/${key}` }), config);
    expect(fileUrl(file())).toBe(`https://cdn.test/${KEY}`);
  });

  it("never exposes a private file through a public base URL", () => {
    setStorage(makeDriver({ publicUrl: (key) => `https://cdn.test/${key}` }), config);
    expect(fileUrl(file({ visibility: "private" }))).toBe(fileAppUrl(KEY));
  });
});

describe("fileAccessUrl", () => {
  it("returns the renderable URL for a public file", async () => {
    expect(await fileAccessUrl(file())).toBe(fileAppUrl(KEY));
  });

  it("absolutises the URL when asked", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ggrun.test/");
    expect(await fileAccessUrl(file(), { absolute: true })).toBe(`https://ggrun.test${fileAppUrl(KEY)}`);
  });

  it("leaves an already-absolute direct URL alone", async () => {
    setStorage(makeDriver({ publicUrl: (key) => `https://cdn.test/${key}` }), config);
    expect(await fileAccessUrl(file(), { absolute: true })).toBe(`https://cdn.test/${KEY}`);
  });

  it("uses a pre-signed URL for a private file when the driver can make one", async () => {
    const signed = vi.fn(async () => "https://signed.test/get");
    setStorage(makeDriver({ signedUrl: signed }), config);
    expect(await fileAccessUrl(file({ visibility: "private" }), { expiresIn: 120 })).toBe(
      "https://signed.test/get",
    );
    expect(signed).toHaveBeenCalledWith(KEY, { expiresIn: 120, contentType: "image/jpeg" });
  });

  it("signs its own query for a private file on a driver that cannot pre-sign", async () => {
    const url = await fileAccessUrl(file({ visibility: "private" }), { expiresIn: 60 });
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(params.get("key")).toBe(KEY);
    expect(verifyFileLink(KEY, Number(params.get("exp")), params.get("sig")!)).toBe(true);
    // The same token is rejected for a different key.
    expect(verifyFileLink("banner/2026/10/123e4567-e89b-42d3-a456-426614174000.jpg", Number(params.get("exp")), params.get("sig")!)).toBe(false);
  });

  it("clamps a requested lifetime to the maximum", async () => {
    const url = await fileAccessUrl(file({ visibility: "private" }), { expiresIn: 99_999_999 });
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const exp = Number(params.get("exp"));
    expect(exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(7 * 24 * 60 * 60 + 1);
  });
});

describe("fileKeyFromUrl", () => {
  it("round-trips the URLs this module produces", () => {
    expect(fileKeyFromUrl(fileAppUrl(KEY))).toBe(KEY);
    expect(fileKeyFromUrl(`https://ggrun.test${fileAppUrl(KEY)}&exp=1&sig=ab`)).toBe(KEY);
  });

  it("returns null for foreign URLs, data URLs and non-keys", () => {
    expect(fileKeyFromUrl(null)).toBeNull();
    expect(fileKeyFromUrl("")).toBeNull();
    expect(fileKeyFromUrl("https://example.com/avatar.jpg")).toBeNull();
    expect(fileKeyFromUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(fileKeyFromUrl("https://ggrun.test/api/files?key=../../etc/passwd")).toBeNull();
  });
});
