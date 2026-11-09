import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const files = vi.hoisted(() => ({
  findFileByChecksum: vi.fn(),
  findFileById: vi.fn(),
  storeFile: vi.fn(),
  deleteFile: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/lib/modules/files/repository", () => ({ findFileByChecksum: files.findFileByChecksum, findFileById: files.findFileById }));
vi.mock("@/lib/modules/files/service/storage", () => ({ storeFile: files.storeFile, deleteFile: files.deleteFile }));
vi.mock("@/lib/infrastructure/storage", () => ({ getStorage: () => ({ get: files.get }) }));
const logger = vi.hoisted(() => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/infrastructure/logger", () => logger);

const { discardUnused, dropCreated, iconPath, storageIconFiles } = await import("./icons");
const { memoryLibrary } = await import("./memory-store.test-helpers");

const BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1]);

beforeEach(() => {
  for (const fn of Object.values(files)) fn.mockReset();
  logger.log.warn.mockReset();
});

describe("storageIconFiles — icons as files of the iee_icon category", () => {
  it("shares one file per content", async () => {
    files.findFileByChecksum.mockResolvedValue({ id: "f-old" });
    await expect(storageIconFiles().put(BYTES, { id: "admin-1" })).resolves.toEqual({ id: "f-old", created: false });
    expect(files.findFileByChecksum).toHaveBeenCalledWith("iee_icon", createHash("sha256").update(BYTES).digest("hex"));
    expect(files.storeFile).not.toHaveBeenCalled();
  });

  it("stores new bytes as the admin, or as the system when an import has no actor", async () => {
    files.findFileByChecksum.mockResolvedValue(null);
    files.storeFile.mockResolvedValue({ id: "f-new" });
    await expect(storageIconFiles().put(BYTES, { id: "admin-1" })).resolves.toEqual({ id: "f-new", created: true });
    expect(files.storeFile).toHaveBeenLastCalledWith({
      category: "iee_icon",
      data: BYTES,
      actor: { id: "admin-1", role: "admin" },
      system: false,
    });
    await storageIconFiles().put(BYTES, null);
    expect(files.storeFile).toHaveBeenLastCalledWith({ category: "iee_icon", data: BYTES, actor: null, system: true });
  });

  it("reads an icon's bytes and type, and has nothing for a file or object that is gone", async () => {
    files.findFileById.mockResolvedValueOnce({ id: "f1", key: "iee_icon/k.webp", mimeType: "image/webp" });
    files.get.mockResolvedValueOnce(BYTES);
    await expect(storageIconFiles().read("f1")).resolves.toEqual({ data: BYTES, mimeType: "image/webp" });
    files.findFileById.mockResolvedValueOnce(null);
    await expect(storageIconFiles().read("f2")).resolves.toBeNull();
    files.findFileById.mockResolvedValueOnce({ id: "f3", key: "iee_icon/gone.webp", mimeType: "image/webp" });
    files.get.mockResolvedValueOnce(null);
    await expect(storageIconFiles().read("f3")).resolves.toBeNull();
  });

  it("removes a file as the code that owns it", async () => {
    await storageIconFiles().discard("f1");
    expect(files.deleteFile).toHaveBeenCalledWith({ id: "f1", actor: null, system: true });
  });
});

describe("settling icon files", () => {
  const discard = vi.fn();
  const iconFiles = { put: vi.fn(), read: vi.fn(), discard };
  beforeEach(() => discard.mockReset().mockResolvedValue(undefined));

  it("removes only the files no pack or entry uses any more, each once", async () => {
    const mem = memoryLibrary();
    await mem.store.insertPack({
      slug: "spooky",
      names: { ru: "Жуть" },
      description: null,
      iconFileId: "f-used",
      visibility: "library",
      defaultLocale: "ru",
      isSystem: false,
      capabilities: [],
      minDslVersion: 1,
      createdBy: null,
    });
    await discardUnused(mem.store, iconFiles, ["f-used", "f-free", "f-free"]);
    expect(discard.mock.calls).toEqual([["f-free"]]);
  });

  it("logs a file it could not remove and goes on", async () => {
    const mem = memoryLibrary();
    discard.mockRejectedValueOnce(new Error("disk")).mockResolvedValueOnce(undefined);
    await discardUnused(mem.store, iconFiles, ["a", "b"]);
    expect(discard).toHaveBeenCalledTimes(2);
    expect(logger.log.warn).toHaveBeenCalledWith("iee.library.icon_discard_failed", expect.objectContaining({ fileId: "a" }));
  });

  it("undoes only the files a put created", async () => {
    discard.mockRejectedValueOnce(new Error("disk"));
    await dropCreated(iconFiles, [
      { id: "new-1", created: true },
      { id: "shared", created: false },
      { id: "new-2", created: true },
    ]);
    expect(discard.mock.calls).toEqual([["new-1"], ["new-2"]]);
    expect(logger.log.warn).toHaveBeenCalledTimes(1);
  });
});

describe("iconPath", () => {
  it("names an icon under icons/ with the extension of its type", () => {
    expect(iconPath("curse", "image/png")).toBe("icons/curse.png");
    expect(iconPath("_pack", "image/webp")).toBe("icons/_pack.webp");
  });
});
