/**
 * Storage key format: `<category>/<yyyy>/<mm>/<uuid>.<ext>`.
 *
 * Keys are generated, never user-supplied, and are unguessable by construction
 * (UUID v4). The date prefix keeps directory listings sane; the UUID is what
 * makes a "public" file non-enumerable, so a public URL cannot be walked to a
 * neighbour's upload.
 *
 * The shape is enforced in both directions: the generator only produces keys
 * that `isStorageKey` accepts, and every driver call validates the key before
 * touching a path or an object store — the key can arrive from a URL query
 * string, so it is untrusted input.
 */
import { randomUUID } from "node:crypto";

import { StorageError } from "./errors";

const CATEGORY_RE = /^[a-z][a-z0-9_]*$/;
const EXT_RE = /^[a-z0-9]+$/;
const KEY_RE =
  /^[a-z][a-z0-9_]*\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Builds a fresh key for `category` with the given extension (no leading dot). */
export function buildStorageKey(category: string, ext: string, now: Date = new Date()): string {
  if (!CATEGORY_RE.test(category)) {
    throw new StorageError("storageInvalidKey", `Invalid category segment: ${JSON.stringify(category)}`);
  }
  const cleanExt = ext.replace(/^\./, "").toLowerCase();
  if (!EXT_RE.test(cleanExt)) {
    throw new StorageError("storageInvalidKey", `Invalid extension: ${JSON.stringify(ext)}`);
  }
  const year = now.getUTCFullYear();
  const month = pad2(now.getUTCMonth() + 1);
  return `${category}/${year}/${month}/${randomUUID()}.${cleanExt}`;
}

/** True when `key` is exactly the shape `buildStorageKey` produces. */
export function isStorageKey(key: unknown): key is string {
  return typeof key === "string" && KEY_RE.test(key);
}

/** Throws `StorageError("storageInvalidKey")` for anything that is not a storage key. */
export function assertStorageKey(key: unknown): asserts key is string {
  if (!isStorageKey(key)) {
    throw new StorageError("storageInvalidKey", `Not a storage key: ${JSON.stringify(key)}`);
  }
}

/** The category segment of a valid key — the first path component. */
export function storageKeyCategory(key: string): string {
  return key.slice(0, key.indexOf("/"));
}
