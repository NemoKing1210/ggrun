import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repository", () => ({
  insertFile: vi.fn(),
  findFileById: vi.fn(),
  findFileByKey: vi.fn(),
  softDeleteFile: vi.fn(),
}));

import type { FileRecord } from "@/db/schema";
import { StorageError, setStorage, type StorageConfig, type StorageDriver } from "@/lib/infrastructure/storage";

import { findFileById, findFileByKey, insertFile, softDeleteFile } from "../repository";
import { FileError } from "./errors";
import { deleteFile, deleteFileByUrl, storeFile } from "./storage";

const KEY = "avatar/2026/10/123e4567-e89b-42d3-a456-426614174000.png";

function png(width: number, height: number, extra = 4): Uint8Array {
  const bytes = new Uint8Array(24 + extra);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

const pdf = () => new TextEncoder().encode("%PDF-1.7\n");

type Put = { key: string; body: Uint8Array; contentType?: string; cacheControl?: string };

const puts: Put[] = [];
const deletes: string[] = [];
let putFailure: Error | null = null;

function driver(): StorageDriver {
  return {
    kind: "local",
    put: async (key, body, opts) => {
      if (putFailure) throw putFailure;
      puts.push({ key, body, contentType: opts?.contentType, cacheControl: opts?.cacheControl });
    },
    get: async () => null,
    stat: async () => null,
    exists: async () => false,
    delete: async (key) => {
      deletes.push(key);
    },
    publicUrl: () => null,
    signedUrl: async () => null,
  };
}

const config: StorageConfig = {
  driver: "local",
  root: ".storage",
  signingSecret: "link-secret",
  maxUploadBytes: 8 * 1024 * 1024,
};

function storedRow(values: Record<string, unknown>): FileRecord {
  return {
    id: "f1",
    key: String(values.key),
    category: String(values.category),
    ownerId: (values.ownerId as string | null) ?? null,
    mimeType: String(values.mimeType),
    sizeBytes: Number(values.sizeBytes),
    checksum: String(values.checksum),
    width: (values.width as number | null) ?? null,
    height: (values.height as number | null) ?? null,
    visibility: (values.visibility as FileRecord["visibility"]) ?? "public",
    metadata: (values.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  puts.length = 0;
  deletes.length = 0;
  putFailure = null;
  setStorage(driver(), config);
  vi.mocked(insertFile).mockImplementation(async (values) => storedRow(values as Record<string, unknown>));
});

const owner = { id: "u1", role: "player" };

describe("storeFile", () => {
  it("stores an avatar and records sniffed metadata", async () => {
    const row = await storeFile({ category: "avatar", data: png(256, 256), actor: owner });

    expect(puts).toHaveLength(1);
    expect(puts[0]!.key).toMatch(/^avatar\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(puts[0]!.contentType).toBe("image/png");
    expect(puts[0]!.cacheControl).toContain("immutable");

    expect(row.mimeType).toBe("image/png");
    expect(row.width).toBe(256);
    expect(row.height).toBe(256);
    expect(row.visibility).toBe("public");
    expect(row.ownerId).toBe("u1");
    expect(row.checksum).toBe(createHash("sha256").update(png(256, 256)).digest("hex"));
  });

  it("ignores the client's claimed type and trusts the bytes", async () => {
    // A PNG uploaded as "avatar.png" is stored as image/png regardless.
    const row = await storeFile({ category: "avatar", data: png(64, 64), actor: owner, filename: "evil.jpg" });
    expect(row.mimeType).toBe("image/png");
    expect(row.metadata).toEqual({ filename: "evil.jpg" });
  });

  it("stores a private attachment with no-store caching and no dimensions", async () => {
    const row = await storeFile({ category: "attachment", data: pdf(), actor: owner });
    expect(row.visibility).toBe("private");
    expect(row.mimeType).toBe("application/pdf");
    expect(row.width).toBeNull();
    expect(puts[0]!.cacheControl).toBe("private, no-store");
    expect(puts[0]!.key).toMatch(/^attachment\/.*\.pdf$/);
  });

  it("rejects an empty payload", async () => {
    await expect(storeFile({ category: "avatar", data: new Uint8Array(), actor: owner })).rejects.toMatchObject({
      code: "fileEmpty",
    });
    expect(puts).toHaveLength(0);
  });

  it("rejects an unregistered category", async () => {
    await expect(storeFile({ category: "nope", data: png(32, 32), actor: owner })).rejects.toMatchObject({
      code: "fileCategoryUnknown",
    });
  });

  it("rejects a type the category does not allow", async () => {
    await expect(storeFile({ category: "avatar", data: pdf(), actor: owner })).rejects.toMatchObject({
      code: "fileTypeNotAllowed",
    });
    await expect(storeFile({ category: "avatar", data: new Uint8Array([1, 2, 3, 4]), actor: owner })).rejects.toMatchObject({
      code: "fileTypeNotAllowed",
    });
  });

  it("rejects a file larger than the category limit", async () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    await expect(storeFile({ category: "avatar", data: big, actor: owner })).rejects.toMatchObject({
      code: "fileTooLarge",
    });
  });

  it("applies the global ceiling on top of the category limit", async () => {
    setStorage(driver(), { ...config, maxUploadBytes: 100 });
    await expect(
      storeFile({ category: "avatar", data: png(32, 32, 200), actor: owner }),
    ).rejects.toMatchObject({
      code: "fileTooLarge",
      params: { max: "100 B" },
    });
  });

  it("rejects dimensions outside the category bounds", async () => {
    await expect(storeFile({ category: "avatar", data: png(2000, 2000), actor: owner })).rejects.toMatchObject({
      code: "fileImageDimensions",
      params: { width: "2000", height: "2000" },
    });
  });

  it("rejects an image whose header cannot be read", async () => {
    const truncated = png(32, 32).slice(0, 12);
    await expect(storeFile({ category: "avatar", data: truncated, actor: owner })).rejects.toMatchObject({
      code: "fileInvalidImage",
    });
  });

  it("requires a session for a user category and staff for a staff category", async () => {
    await expect(storeFile({ category: "avatar", data: png(32, 32), actor: null })).rejects.toMatchObject({
      code: "authLoginRequired",
      status: 401,
    });
    await expect(storeFile({ category: "game_cover", data: png(64, 64), actor: owner })).rejects.toMatchObject({
      code: "adminStaffRequired",
      status: 403,
    });
    await expect(
      storeFile({ category: "game_cover", data: png(64, 64), actor: { id: "j", role: "judge" } }),
    ).resolves.toMatchObject({ category: "game_cover" });
  });

  it("lets a system write skip the uploader check", async () => {
    const row = await storeFile({ category: "game_cover", data: png(64, 64), actor: null, system: true });
    expect(row.ownerId).toBeNull();
  });

  it("translates a backend failure into an unavailable error", async () => {
    putFailure = new StorageError("storageWriteFailed", "disk full");
    await expect(storeFile({ category: "avatar", data: png(32, 32), actor: owner })).rejects.toBeInstanceOf(FileError);
    await expect(storeFile({ category: "avatar", data: png(32, 32), actor: owner })).rejects.toMatchObject({
      code: "fileStorageUnavailable",
      status: 503,
    });
  });

  it("removes the object when the metadata row cannot be written", async () => {
    vi.mocked(insertFile).mockRejectedValueOnce(new Error("db down"));
    await expect(storeFile({ category: "avatar", data: png(32, 32), actor: owner })).rejects.toThrow("db down");
    expect(deletes).toEqual([puts[0]!.key]);
  });
});

describe("deleteFile", () => {
  const liveFile = (overrides: Partial<FileRecord> = {}): FileRecord => storedRow({
    key: KEY,
    category: "avatar",
    ownerId: "u1",
    mimeType: "image/png",
    sizeBytes: 1,
    checksum: "c",
    ...overrides,
  });

  it("404s on an unknown id", async () => {
    vi.mocked(findFileById).mockResolvedValue(null);
    await expect(deleteFile({ id: "x", actor: owner })).rejects.toMatchObject({ code: "fileNotFound", status: 404 });
  });

  it("403s when the actor may not delete the file", async () => {
    vi.mocked(findFileById).mockResolvedValue(liveFile({ ownerId: "u2" }));
    await expect(deleteFile({ id: "f1", actor: owner })).rejects.toMatchObject({ code: "fileForbidden", status: 403 });
    expect(deletes).toHaveLength(0);
  });

  it("soft-deletes and removes the object for the owner", async () => {
    vi.mocked(findFileById).mockResolvedValue(liveFile());
    vi.mocked(softDeleteFile).mockResolvedValue(true);

    await expect(deleteFile({ id: "f1", actor: owner })).resolves.toBe(true);
    expect(softDeleteFile).toHaveBeenCalledWith("f1");
    expect(deletes).toEqual([KEY]);
  });

  it("keeps the object when the row was already deleted", async () => {
    vi.mocked(findFileById).mockResolvedValue(liveFile());
    vi.mocked(softDeleteFile).mockResolvedValue(false);
    await expect(deleteFile({ id: "f1", actor: owner })).resolves.toBe(false);
    expect(deletes).toHaveLength(0);
  });

  it("completes when the backend removal fails after the row is gone", async () => {
    vi.mocked(findFileById).mockResolvedValue(liveFile());
    vi.mocked(softDeleteFile).mockResolvedValue(true);
    setStorage(
      { ...driver(), delete: async () => { throw new StorageError("storageDeleteFailed", "nope"); } },
      config,
    );
    await expect(deleteFile({ id: "f1", actor: owner })).resolves.toBe(true);
  });

  it("resolves the row by key when only a key is given", async () => {
    vi.mocked(findFileByKey).mockResolvedValue(liveFile());
    vi.mocked(softDeleteFile).mockResolvedValue(true);
    await expect(deleteFile({ key: KEY, actor: { id: "a", role: "admin" } })).resolves.toBe(true);
  });
});

describe("deleteFileByUrl", () => {
  it("returns false for a foreign URL without touching the database", async () => {
    await expect(deleteFileByUrl("https://example.com/x.png", owner)).resolves.toBe(false);
    await expect(deleteFileByUrl(null, owner)).resolves.toBe(false);
    expect(findFileByKey).not.toHaveBeenCalled();
  });

  it("returns false when the row is already gone", async () => {
    vi.mocked(findFileByKey).mockResolvedValue(null);
    await expect(deleteFileByUrl(`/api/files?key=${KEY}`, owner)).resolves.toBe(false);
  });

  it("deletes through the URL's key", async () => {
    vi.mocked(findFileByKey).mockResolvedValue(
      storedRow({ key: KEY, category: "avatar", ownerId: "u1", mimeType: "image/png", sizeBytes: 1, checksum: "c" }),
    );
    vi.mocked(softDeleteFile).mockResolvedValue(true);
    await expect(deleteFileByUrl(`/api/files?key=${KEY}`, owner)).resolves.toBe(true);
    expect(softDeleteFile).toHaveBeenCalledWith("f1");
  });
});
