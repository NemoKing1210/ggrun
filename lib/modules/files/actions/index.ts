"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/infrastructure/auth/session";
import { log } from "@/lib/infrastructure/logger";
import { getT } from "@/lib/i18n/server";
import type { ActionState } from "@/lib/shared/types";
import { makeToError } from "@/lib/use-cases/shared/action-error";

import { fileUrl } from "../service/access";
import { FileError } from "../service/errors";
import { deleteFile, storeFile } from "../service/storage";

const toError = makeToError(FileError);

export type FileUploadState = ActionState & {
  /** Renderable URL of the stored file (public URL or `/api/files?key=…`). */
  url?: string;
  fileId?: string;
  key?: string;
};

/**
 * Uploads one file for a category and returns its URL. Used by the admin file
 * browser; the profile editor stores through the same service inside its own
 * settings action so an abandoned form leaves nothing behind.
 */
export async function uploadFileAction(
  _prev: FileUploadState,
  formData: FormData,
): Promise<FileUploadState> {
  const actor = await getCurrentUser();
  const fileActor = actor ? { id: actor.id, role: actor.role } : null;
  const category = String(formData.get("category") || "");
  const raw = formData.get("file");

  try {
    if (!(raw instanceof File) || raw.size === 0) throw new FileError("fileEmpty");
    const row = await storeFile({
      category,
      data: new Uint8Array(await raw.arrayBuffer()),
      actor: fileActor,
      filename: raw.name,
    });
    revalidatePath("/admin/files");
    return {
      ok: (await getT()).t.admin.files.uploaded,
      url: fileUrl(row),
      fileId: row.id,
      key: row.key,
    };
  } catch (e) {
    return await toError(e, "file.upload", { actorId: actor?.id ?? null, category });
  }
}

/** Void-shape action for the per-row delete button of the admin browser. */
export async function deleteFileAction(formData: FormData): Promise<void> {
  const actor = await getCurrentUser();
  const fileActor = actor ? { id: actor.id, role: actor.role } : null;
  const fileId = String(formData.get("fileId") || "");
  try {
    await deleteFile({ id: fileId, actor: fileActor });
  } catch (e) {
    log.error("file.delete_failed", { actorId: actor?.id ?? null, fileId, err: e });
    throw e;
  }
  revalidatePath("/admin/files");
}
