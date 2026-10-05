import { describe, expect, it } from "vitest";

import {
  FILE_CATEGORIES,
  FILE_CATEGORY_IDS,
  extensionForMime,
  getFileCategory,
  isFileCategoryId,
} from "./categories";

describe("file category registry", () => {
  it("declares every id in the union and nothing else", () => {
    expect(Object.keys(FILE_CATEGORIES).sort()).toEqual([...FILE_CATEGORY_IDS].sort());
    for (const id of FILE_CATEGORY_IDS) {
      expect(FILE_CATEGORIES[id].id).toBe(id);
    }
  });

  it("gives every category a sane budget and at least one MIME type", () => {
    for (const id of FILE_CATEGORY_IDS) {
      const category = FILE_CATEGORIES[id];
      expect(category.mimeTypes.length).toBeGreaterThan(0);
      expect(category.maxBytes).toBeGreaterThan(0);
      expect(["public", "private"]).toContain(category.visibility);
      expect(["user", "staff", "admin"]).toContain(category.upload);
      expect(["owner", "none"]).toContain(category.delete);
    }
  });

  it("keeps user-visible categories public and staff-managed enough", () => {
    expect(FILE_CATEGORIES.avatar.visibility).toBe("public");
    expect(FILE_CATEGORIES.banner.visibility).toBe("public");
    expect(FILE_CATEGORIES["game_cover"].upload).toBe("staff");
    // The one private category exists so signed links have a real consumer.
    expect(FILE_CATEGORIES.attachment.visibility).toBe("private");
  });

  it("resolves known ids and rejects unknown ones", () => {
    expect(getFileCategory("avatar")?.id).toBe("avatar");
    expect(getFileCategory("nope")).toBeNull();
    expect(getFileCategory(undefined)).toBeNull();
    expect(isFileCategoryId("banner")).toBe(true);
    expect(isFileCategoryId("AVATAR")).toBe(false);
  });

  it("maps MIME types to canonical extensions", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("application/zip")).toBe("bin");
  });
});
