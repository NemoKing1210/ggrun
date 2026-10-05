/**
 * Local-directory storage driver.
 *
 * Writes under `root` (resolved against the process cwd), mirroring the key as
 * a path. Writes go to a temp file in the destination directory and are then
 * renamed, so a reader never observes a half-written object — rename is atomic
 * on both POSIX and Windows (over an existing file).
 *
 * The driver serves nothing directly (`publicUrl`/`signedUrl` are `null`);
 * `/api/files` streams from disk, and the module signs its own links via
 * `lib/infrastructure/storage/sign.ts`.
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { StorageError } from "./errors";
import { assertStorageKey } from "./keys";
import type { ObjectStat, StorageDriver } from "./types";

function isEnoent(e: unknown): boolean {
  return (e as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

export type LocalDriverOptions = {
  /** Directory objects are written into; created on demand. */
  root: string;
};

export function createLocalDriver({ root }: LocalDriverOptions): StorageDriver {
  const absoluteRoot = path.resolve(root);

  /** Resolves a validated key to a path and re-checks containment. */
  function pathFor(key: string): string {
    assertStorageKey(key);
    const full = path.resolve(absoluteRoot, ...key.split("/"));
    const prefix = absoluteRoot.endsWith(path.sep) ? absoluteRoot : absoluteRoot + path.sep;
    if (!full.startsWith(prefix)) {
      // Unreachable while `assertStorageKey` holds — kept as a second lock.
      throw new StorageError("storageInvalidKey", `Key escapes the storage root: ${key}`);
    }
    return full;
  }

  /** Stats a validated key. Shared by `stat`/`exists` so neither relies on `this`. */
  async function statObject(key: string): Promise<ObjectStat | null> {
    const full = pathFor(key);
    try {
      const info = await stat(full);
      if (!info.isFile()) return null;
      return { size: info.size, modifiedAt: info.mtime };
    } catch (e) {
      if (isEnoent(e)) return null;
      throw new StorageError("storageReadFailed", `Failed to stat ${key}`, e);
    }
  }

  return {
    kind: "local",

    async put(key, body) {
      const full = pathFor(key);
      const tmp = `${full}.${randomUUID()}.tmp`;
      try {
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(tmp, body);
        await rename(tmp, full);
      } catch (e) {
        await rm(tmp, { force: true }).catch(() => {});
        throw new StorageError("storageWriteFailed", `Failed to write ${key}`, e);
      }
    },

    async get(key) {
      const full = pathFor(key);
      try {
        return new Uint8Array(await readFile(full));
      } catch (e) {
        if (isEnoent(e)) return null;
        throw new StorageError("storageReadFailed", `Failed to read ${key}`, e);
      }
    },

    async stat(key) {
      return statObject(key);
    },

    async exists(key) {
      return (await statObject(key)) !== null;
    },

    async delete(key) {
      const full = pathFor(key);
      try {
        await rm(full, { force: true });
      } catch (e) {
        if (isEnoent(e)) return;
        throw new StorageError("storageDeleteFailed", `Failed to delete ${key}`, e);
      }
    },

    publicUrl() {
      return null;
    },

    async signedUrl() {
      return null;
    },
  };
}
