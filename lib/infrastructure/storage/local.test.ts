import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StorageError } from "./errors";
import { buildStorageKey } from "./keys";
import { createLocalDriver } from "./local";

let root: string;
let driver: ReturnType<typeof createLocalDriver>;
const AT = new Date(Date.UTC(2026, 9, 5));

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "ggrun-storage-"));
  driver = createLocalDriver({ root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const bytes = (s: string) => new TextEncoder().encode(s);

describe("local driver", () => {
  it("writes, reads back and removes an object", async () => {
    const key = buildStorageKey("avatar", "jpg", AT);
    await driver.put(key, bytes("hello"), { contentType: "image/jpeg" });

    expect(await driver.exists(key)).toBe(true);
    expect(await driver.stat(key)).toMatchObject({ size: 5 });
    expect(new TextDecoder().decode((await driver.get(key))!)).toBe("hello");

    await driver.delete(key);
    expect(await driver.exists(key)).toBe(false);
  });

  it("mirrors the key onto disk, creating the date directories", async () => {
    const key = buildStorageKey("banner", "webp", AT);
    await driver.put(key, bytes("x"));
    const onDisk = await readFile(path.join(root, ...key.split("/")));
    expect(onDisk.byteLength).toBe(1);
  });

  it("reports a missing object as null instead of throwing", async () => {
    const key = buildStorageKey("avatar", "png", AT);
    expect(await driver.get(key)).toBeNull();
    expect(await driver.stat(key)).toBeNull();
    expect(await driver.exists(key)).toBe(false);
    await expect(driver.delete(key)).resolves.toBeUndefined();
  });

  it("replaces an existing object in place", async () => {
    const key = buildStorageKey("avatar", "png", AT);
    await driver.put(key, bytes("first"));
    await driver.put(key, bytes("second"));
    expect(new TextDecoder().decode((await driver.get(key))!)).toBe("second");
  });

  it("refuses to touch anything outside the root", async () => {
    for (const key of ["../escape.jpg", "avatar/2026/10/../../escape.jpg", "/etc/passwd"]) {
      await expect(driver.put(key, bytes("x"))).rejects.toBeInstanceOf(StorageError);
      await expect(driver.get(key)).rejects.toMatchObject({ code: "storageInvalidKey" });
      await expect(driver.stat(key)).rejects.toBeInstanceOf(StorageError);
      await expect(driver.delete(key)).rejects.toBeInstanceOf(StorageError);
    }
    await expect(readFile(path.join(root, "..", "escape.jpg"))).rejects.toThrow();
  });

  it("never advertises a direct URL — bytes always go through the app", async () => {
    const key = buildStorageKey("avatar", "png", AT);
    expect(driver.publicUrl(key)).toBeNull();
    expect(await driver.signedUrl(key, { expiresIn: 60 })).toBeNull();
  });

  it("treats a directory at the key path as not-an-object", async () => {
    const key = buildStorageKey("avatar", "png", AT);
    await mkdir(path.join(root, ...key.split("/")), { recursive: true });

    expect(await driver.stat(key)).toBeNull();
    await expect(driver.get(key)).rejects.toMatchObject({ code: "storageReadFailed" });
  });
});
