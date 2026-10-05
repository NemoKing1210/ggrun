import {
  DEFAULT_LINK_TTL_SECONDS,
  MAX_LINK_TTL_SECONDS,
  fileLinkQuery,
  getStorage,
  getStorageConfig,
  isStorageKey,
  signFileKey,
  verifyFileKey,
} from "@/lib/infrastructure/storage";
import type { FileRecord } from "@/db/schema";

import { FILE_CATEGORIES } from "./categories";

/**
 * Who may read and delete a file, and what a file's URL looks like.
 *
 * Kept separate from `storage.ts` because it is pure policy over a row — it
 * never touches the backend except through the driver's URL helpers, and it
 * takes a lightweight actor instead of a full `User` so it stays testable.
 */

/** The minimum identity every permission check needs. */
export type FileActor = { id: string; role: string } | null;

/** staff = admin or judge, mirroring `isStaff` in the session module. */
export function isStaffRole(role: string): boolean {
  return role === "admin" || role === "judge";
}

/** The application-served URL for a key — deployment-agnostic, safe to store in the DB. */
export function fileAppUrl(key: string): string {
  return `/api/files?key=${encodeURIComponent(key)}`;
}

export function canReadFile(file: Pick<FileRecord, "visibility" | "ownerId">, actor: FileActor): boolean {
  if (file.visibility === "public") return true;
  if (!actor) return false;
  return actor.id === file.ownerId || isStaffRole(actor.role);
}

export function canDeleteFile(file: FileRecord, actor: FileActor): boolean {
  if (!actor) return false;
  if (isStaffRole(actor.role)) return true;
  const category = FILE_CATEGORIES[file.category as keyof typeof FILE_CATEGORIES];
  if (category?.delete !== "owner") return false;
  return actor.id === file.ownerId;
}

/**
 * The URL to render for a file.
 *
 * Prefers a direct public URL (public bucket / CDN) when the driver offers one
 * *and* the file is public — a private file must never leave through a public
 * base URL. Otherwise the app route serves the bytes, which keeps the stored
 * URL portable across storage backends and deployments.
 */
export function fileUrl(file: Pick<FileRecord, "key" | "visibility">): string {
  if (file.visibility === "public") {
    const direct = getStorage().publicUrl(file.key);
    if (direct) return direct;
  }
  return fileAppUrl(file.key);
}

export type AccessUrlOptions = {
  /** Seconds the link stays valid (private files only). Clamped to 7 days. */
  expiresIn?: number;
  /** Absolute URL for API responses and e-mails; relative by default. */
  absolute?: boolean;
};

/**
 * A link that actually works right now: the permanent URL for a public file,
 * a pre-signed URL or an HMAC link for a private one.
 */
export async function fileAccessUrl(file: FileRecord, opts: AccessUrlOptions = {}): Promise<string> {
  const expiresIn = Math.min(Math.max(opts.expiresIn ?? DEFAULT_LINK_TTL_SECONDS, 1), MAX_LINK_TTL_SECONDS);

  if (file.visibility === "public") {
    const url = fileUrl(file);
    return opts.absolute ? absoluteIfRelative(url) : url;
  }

  const presigned = await getStorage().signedUrl(file.key, {
    expiresIn,
    contentType: file.mimeType,
  });
  if (presigned) return presigned;

  const token = signFileKey(file.key, expiresIn, getStorageConfig().signingSecret);
  return `${fileAppUrl(file.key)}&${fileLinkQuery(token)}`;
}

/** Validates the `exp`/`sig` pair a private-file request carries. */
export function verifyFileLink(key: string, exp: number, sig: string): boolean {
  return verifyFileKey(key, exp, sig, getStorageConfig().signingSecret);
}

/** Extracts the storage key from a URL this module produced, or `null`. */
export function fileKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const key = new URL(url, "http://internal").searchParams.get("key");
    return isStorageKey(key) ? key : null;
  } catch {
    return null;
  }
}

function absoluteIfRelative(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}${url}` : url;
}
