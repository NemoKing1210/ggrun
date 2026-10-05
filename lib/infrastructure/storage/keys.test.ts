import { describe, expect, it } from "vitest";

import { StorageError } from "./errors";
import { assertStorageKey, buildStorageKey, isStorageKey, storageKeyCategory } from "./keys";

const NOW = new Date(Date.UTC(2026, 9, 5, 12, 0, 0));

describe("buildStorageKey", () => {
  it("lays keys out as <category>/<year>/<month>/<uuid>.<ext>", () => {
    const key = buildStorageKey("avatar", "jpg", NOW);
    expect(key).toMatch(/^avatar\/2026\/10\/[0-9a-f-]{36}\.jpg$/);
    expect(storageKeyCategory(key)).toBe("avatar");
  });

  it("normalises a leading dot and case in the extension", () => {
    expect(buildStorageKey("banner", ".WEBP", NOW)).toMatch(/\.webp$/);
  });

  it("produces a distinct key on every call", () => {
    expect(buildStorageKey("avatar", "jpg", NOW)).not.toBe(buildStorageKey("avatar", "jpg", NOW));
  });

  it("rejects a category that is not lowercase snake_case", () => {
    expect(() => buildStorageKey("Avatars", "jpg", NOW)).toThrow(StorageError);
    expect(() => buildStorageKey("../escape", "jpg", NOW)).toThrow(StorageError);
  });

  it("rejects an extension with path characters", () => {
    expect(() => buildStorageKey("avatar", "jp/g", NOW)).toThrow(StorageError);
    expect(() => buildStorageKey("avatar", "", NOW)).toThrow(StorageError);
  });
});

describe("isStorageKey", () => {
  it("accepts what the builder produces", () => {
    expect(isStorageKey(buildStorageKey("game_cover", "png", NOW))).toBe(true);
  });

  it("rejects traversal, absolute paths and foreign shapes", () => {
    for (const bad of [
      "../../etc/passwd",
      "/etc/passwd",
      "avatar/2026/10/../../x.jpg",
      "avatar/2026/10/not-a-uuid.jpg",
      "avatar/2026/10/..%2fescape.jpg",
      "avatar\\2026\\10\\x.jpg",
      "avatar/2026/10/" + "a".repeat(36) + ".jpg",
      "",
      42,
      null,
    ]) {
      expect(isStorageKey(bad as never)).toBe(false);
    }
  });

  it("rejects a month that is not two digits", () => {
    expect(isStorageKey("avatar/2026/1/123e4567-e89b-42d3-a456-426614174000.jpg")).toBe(false);
  });

  it("assertStorageKey throws with the invalid-key code", () => {
    try {
      assertStorageKey("nope");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as StorageError).code).toBe("storageInvalidKey");
    }
  });
});
