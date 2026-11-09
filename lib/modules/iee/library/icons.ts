/**
 * Icons of packs and entries (docs/IEE_CONSTRUCTOR_SPEC.md §12): files of the
 * `iee_icon` category — PNG or WebP, square, 64–512 px, ≤ 256 KB, public.
 *
 * One copy per content: storing bytes an icon file already holds returns that
 * file, so re-importing a pack or setting the same picture twice stores
 * nothing. A file is removed once no pack or entry points at it.
 *
 * Behind an interface so the library's rules run against memory in tests; the
 * files module does the validation and the storage.
 */
import { createHash } from "node:crypto";

import { getStorage } from "@/lib/infrastructure/storage";
import { log } from "@/lib/infrastructure/logger";
import { findFileByChecksum, findFileById } from "@/lib/modules/files/repository";
import { deleteFile, storeFile } from "@/lib/modules/files/service/storage";

import type { LibraryActor } from "./context";
import type { LibraryStore } from "./store";

export const ICON_CATEGORY = "iee_icon";

export interface StoredIcon {
  id: string;
  /** False when the same bytes were already stored. */
  created: boolean;
}

export interface IconFile {
  data: Uint8Array;
  mimeType: string;
}

export interface IconFiles {
  /** Stores bytes as an icon, or finds the same bytes stored already. Refuses what the category does not allow. */
  put(data: Uint8Array, actor: LibraryActor | null): Promise<StoredIcon>;
  /** A stored icon's bytes; null when the file is gone. */
  read(fileId: string): Promise<IconFile | null>;
  /** Removes an icon file — the caller has checked nothing points at it. */
  discard(fileId: string): Promise<void>;
}

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Icons in the configured storage, through the files module. */
export function storageIconFiles(): IconFiles {
  return {
    async put(data, actor) {
      const existing = await findFileByChecksum(ICON_CATEGORY, sha256(data));
      if (existing) return { id: existing.id, created: false };
      // The library is admin-only (D1); a system import has no actor.
      const row = await storeFile({
        category: ICON_CATEGORY,
        data,
        actor: actor ? { id: actor.id, role: "admin" } : null,
        system: actor === null,
      });
      return { id: row.id, created: true };
    },
    async read(fileId) {
      const row = await findFileById(fileId);
      if (!row) return null;
      const data = await getStorage().get(row.key);
      return data ? { data, mimeType: row.mimeType } : null;
    },
    async discard(fileId) {
      await deleteFile({ id: fileId, actor: null, system: true });
    },
  };
}

/**
 * Removes the given icon files that no pack or entry uses any more. Best
 * effort: a file that cannot be removed costs bytes, not correctness, so the
 * failure is logged rather than thrown after the change it follows committed.
 */
export async function discardUnused(store: LibraryStore, files: IconFiles, fileIds: Iterable<string>): Promise<void> {
  for (const id of new Set(fileIds)) {
    try {
      if ((await store.iconUsers(id)) === 0) await files.discard(id);
    } catch (e) {
      log.warn("iee.library.icon_discard_failed", { fileId: id, err: e });
    }
  }
}

/** Undoes `put`s that created files, when what they were for did not happen. */
export async function dropCreated(files: IconFiles, stored: Iterable<StoredIcon>): Promise<void> {
  for (const icon of stored) {
    if (!icon.created) continue;
    await files.discard(icon.id).catch((e: unknown) => log.warn("iee.library.icon_discard_failed", { fileId: icon.id, err: e }));
  }
}

/** The file name of an icon inside a `.ggpack` (§11). */
export function iconPath(name: string, mimeType: string): string {
  return `icons/${name}.${mimeType === "image/png" ? "png" : "webp"}`;
}
