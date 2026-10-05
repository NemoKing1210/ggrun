import { createHash } from "node:crypto";

import {
  StorageError,
  buildStorageKey,
  getStorage,
  isStorageKey,
  maxUploadBytes,
} from "@/lib/infrastructure/storage";
import { log } from "@/lib/infrastructure/logger";
import type { FileRecord } from "@/db/schema";

import { findFileById, findFileByKey, insertFile, softDeleteFile } from "../repository";
import { canDeleteFile, fileKeyFromUrl, isStaffRole, type FileActor } from "./access";
import { extensionForMime, getFileCategory, type FileCategory } from "./categories";
import { FileError, isFileError } from "./errors";
import { readImageDimensions, sniffMimeType } from "./images";

/**
 * The module's write path: validate → sniff → store bytes → record metadata.
 *
 * Validation is intentionally paranoid because the input is an upload: the
 * client's MIME claim is ignored in favour of magic bytes, the size is checked
 * against both the category and the global ceiling, and image dimensions are
 * read from the header so a decompression bomb is refused before any decoder
 * sees it.
 */

export type StoreFileInput = {
  /** Category id from the registry. A string, because it arrives from a form. */
  category: string;
  /** Raw bytes. */
  data: Uint8Array;
  /** Uploader; `null` for system-created files (seed data, backfills). */
  actor: FileActor;
  /** Original client file name — metadata only, never used to build the key. */
  filename?: string;
  /** Set for system writes that bypass the uploader role check (backfills, seeds). */
  system?: boolean;
};

function humanBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Role gate for a category: `user` needs a session, `staff`/`admin` need a staff role. */
export function assertCanUpload(category: FileCategory, actor: FileActor): void {
  if (category.upload === "user") {
    if (!actor) throw new FileError("authLoginRequired", {}, 401);
    return;
  }
  if (!actor || !isStaffRole(actor.role)) throw new FileError("adminStaffRequired", {}, 403);
  if (category.upload === "admin" && actor.role !== "admin") {
    throw new FileError("adminStaffRequired", {}, 403);
  }
}

function assertDimensions(category: FileCategory, dimensions: { width: number; height: number } | null): void {
  const rules = category.dimensions;
  if (!rules) return;
  if (!dimensions) throw new FileError("fileInvalidImage", { category: category.id });

  const { width, height } = dimensions;
  const tooSmall =
    (rules.minWidth !== undefined && width < rules.minWidth) ||
    (rules.minHeight !== undefined && height < rules.minHeight);
  const tooBig =
    (rules.maxWidth !== undefined && width > rules.maxWidth) ||
    (rules.maxHeight !== undefined && height > rules.maxHeight);
  if (tooSmall || tooBig) {
    throw new FileError("fileImageDimensions", {
      width: String(width),
      height: String(height),
    });
  }
}

/** Stores one upload and returns its metadata row. */
export async function storeFile(input: StoreFileInput): Promise<FileRecord> {
  const category = getFileCategory(input.category);
  if (!category) throw new FileError("fileCategoryUnknown", { category: String(input.category) });
  if (!input.system) assertCanUpload(category, input.actor);

  const data = input.data;
  if (data.byteLength === 0) throw new FileError("fileEmpty");

  const limit = Math.min(category.maxBytes, maxUploadBytes());
  if (data.byteLength > limit) {
    throw new FileError("fileTooLarge", { max: humanBytes(limit), category: category.id });
  }

  const mime = sniffMimeType(data);
  if (!mime || !category.mimeTypes.includes(mime)) {
    throw new FileError("fileTypeNotAllowed", {
      types: category.mimeTypes.map((m) => m.replace("image/", "").toUpperCase()).join(", "),
    });
  }

  const dimensions = mime.startsWith("image/") ? readImageDimensions(data, mime) : null;
  if (mime.startsWith("image/") && category.dimensions) assertDimensions(category, dimensions);

  const checksum = createHash("sha256").update(data).digest("hex");
  const key = buildStorageKey(category.id, extensionForMime(mime));

  const driver = getStorage();
  try {
    await driver.put(key, data, {
      contentType: mime,
      // Keys are immutable and never reused, so public objects can be cached forever.
      cacheControl:
        category.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
    });
  } catch (e) {
    if (e instanceof StorageError) {
      log.error("file.store.backend_failed", { key, category: category.id, err: e });
      throw new FileError("fileStorageUnavailable", {}, 503);
    }
    throw e;
  }

  try {
    const row = await insertFile({
      key,
      category: category.id,
      ownerId: input.actor?.id ?? null,
      mimeType: mime,
      sizeBytes: data.byteLength,
      checksum,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      visibility: category.visibility,
      metadata: input.filename ? { filename: input.filename } : {},
    });
    log.info("file.stored", {
      fileId: row.id,
      key,
      category: category.id,
      sizeBytes: data.byteLength,
      ownerId: row.ownerId,
    });
    return row;
  } catch (e) {
    // The row is the only handle to the object — without it the bytes are
    // unreachable garbage, so remove them rather than leak an orphan.
    await driver.delete(key).catch(() => {});
    throw e;
  }
}

export async function getFileByKey(key: string): Promise<FileRecord | null> {
  if (!isStorageKey(key)) return null;
  return findFileByKey(key);
}

export type DeleteFileInput = { id?: string; key?: string; actor: FileActor };

/**
 * Soft-deletes a row and removes the object.
 *
 * The row goes first from the caller's point of view, but the object removal
 * happens even if it fails — an unreachable row would be worse than a stray
 * object, and a failed removal is logged for the operator.
 */
export async function deleteFile(input: DeleteFileInput): Promise<boolean> {
  const file = input.id
    ? await findFileById(input.id)
    : input.key
      ? await getFileByKey(input.key)
      : null;
  if (!file) throw new FileError("fileNotFound", {}, 404);
  if (!canDeleteFile(file, input.actor)) {
    throw new FileError("fileForbidden", {}, 403);
  }

  const removed = await softDeleteFile(file.id);
  if (!removed) return false;

  try {
    await getStorage().delete(file.key);
  } catch (e) {
    log.error("file.delete.backend_failed", { fileId: file.id, key: file.key, err: e });
  }
  log.info("file.deleted", { fileId: file.id, key: file.key, actorId: input.actor?.id ?? null });
  return true;
}

/**
 * Deletes the file behind one of this module's URLs.
 *
 * Returns `false` when there is nothing to delete — a foreign URL, or a file
 * that is already gone. A permission failure still throws: the caller is
 * expected to be the owner, and a silent `false` there would hide a bug.
 */
export async function deleteFileByUrl(url: string | null | undefined, actor: FileActor): Promise<boolean> {
  const key = fileKeyFromUrl(url);
  if (!key) return false;
  try {
    return await deleteFile({ key, actor });
  } catch (e) {
    if (isFileError(e) && e.code === "fileNotFound") return false;
    throw e;
  }
}
