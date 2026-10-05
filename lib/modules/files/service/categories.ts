/**
 * The file category registry — the one place a new kind of upload is declared.
 *
 * A category binds an upload purpose (`avatar`) to the rules that purpose
 * needs: which MIME types are legal, how large a file may be, whether the
 * stored object is world-readable, and who may upload or delete it. The
 * database stores only the category id, so changing a rule here changes it for
 * every existing file of that category without a migration.
 *
 * Rules are deliberately code, not admin-editable data: a category is a
 * security boundary (public URL or not, who may write), and a boundary that
 * can be widened from a form is a boundary that will be widened by mistake.
 */

export const FILE_CATEGORY_IDS = ["avatar", "banner", "game_cover", "attachment"] as const;

export type FileCategoryId = (typeof FILE_CATEGORY_IDS)[number];

export type FileVisibility = "public" | "private";

/** Who may perform an operation on a file of this category. */
export type FileUploader = "user" | "staff" | "admin";

export type FileCategory = {
  id: FileCategoryId;
  /** MIME types accepted from the sniffed bytes (never from the client's claim). */
  mimeTypes: readonly string[];
  /** Largest object accepted, in bytes. The global STORAGE_MAX_UPLOAD_BYTES still applies. */
  maxBytes: number;
  /** Visibility the stored row gets. */
  visibility: FileVisibility;
  /** Minimum role required to store a file. */
  upload: FileUploader;
  /**
   * `owner` — the uploader (or staff) may delete it; `none` — staff only.
   * Staff and admins may always delete.
   */
  delete: "owner" | "none";
  /** Image sanity bounds; omitted → any image size is accepted. */
  dimensions?: {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  };
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const FILE_CATEGORIES: Record<FileCategoryId, FileCategory> = {
  avatar: {
    id: "avatar",
    mimeTypes: IMAGE_TYPES,
    maxBytes: 2 * 1024 * 1024,
    visibility: "public",
    upload: "user",
    delete: "owner",
    dimensions: { minWidth: 16, minHeight: 16, maxWidth: 1024, maxHeight: 1024 },
  },
  banner: {
    id: "banner",
    mimeTypes: IMAGE_TYPES,
    maxBytes: 3 * 1024 * 1024,
    visibility: "public",
    upload: "user",
    delete: "owner",
    dimensions: { minWidth: 240, minHeight: 80, maxWidth: 4096, maxHeight: 4096 },
  },
  game_cover: {
    id: "game_cover",
    mimeTypes: IMAGE_TYPES,
    maxBytes: 4 * 1024 * 1024,
    visibility: "public",
    upload: "staff",
    delete: "none",
    dimensions: { minWidth: 64, minHeight: 64, maxWidth: 4096, maxHeight: 4096 },
  },
  attachment: {
    id: "attachment",
    mimeTypes: [...IMAGE_TYPES, "application/pdf"],
    maxBytes: 8 * 1024 * 1024,
    visibility: "private",
    upload: "user",
    delete: "owner",
  },
};

export function isFileCategoryId(value: unknown): value is FileCategoryId {
  return (
    typeof value === "string" && (FILE_CATEGORY_IDS as readonly string[]).includes(value)
  );
}

/** Resolves a category id to its rules, or `null` when it is not registered. */
export function getFileCategory(value: unknown): FileCategory | null {
  return isFileCategoryId(value) ? FILE_CATEGORIES[value] : null;
}

/** MIME type → canonical file extension used in the storage key. */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function extensionForMime(mime: string): string {
  return EXTENSIONS[mime] ?? "bin";
}
