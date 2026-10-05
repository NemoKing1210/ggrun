import { and, desc, eq, isNull, type SQL } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { files, users, type FileRecord, type NewFile } from "@/db/schema";

/**
 * Persistence for the `files` table. Live rows only — a soft-deleted row keeps
 * its key (the unique index is forever) but disappears from every read here.
 */

export async function insertFile(values: NewFile): Promise<FileRecord> {
  const [row] = await db.insert(files).values(values).returning();
  return row!;
}

export async function findFileByKey(key: string): Promise<FileRecord | null> {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.key, key), isNull(files.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function findFileById(id: string): Promise<FileRecord | null> {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), isNull(files.deletedAt)))
    .limit(1);
  return row ?? null;
}

export type ListFilesFilter = {
  category?: string;
  ownerId?: string;
  limit?: number;
};

export const DEFAULT_FILE_PAGE_SIZE = 50;
export const MAX_FILE_PAGE_SIZE = 200;

/** Newest-first live files, optionally narrowed by category and/or owner. */
export async function listFiles(filter: ListFilesFilter = {}): Promise<FileRecord[]> {
  const conditions: SQL[] = [isNull(files.deletedAt)];
  if (filter.category) conditions.push(eq(files.category, filter.category));
  if (filter.ownerId) conditions.push(eq(files.ownerId, filter.ownerId));

  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_FILE_PAGE_SIZE, 1), MAX_FILE_PAGE_SIZE);
  return db
    .select()
    .from(files)
    .where(and(...conditions))
    .orderBy(desc(files.createdAt))
    .limit(limit);
}

/** Soft-deletes a live row. Returns true when this call was the one that removed it. */
export async function softDeleteFile(id: string): Promise<boolean> {
  const removed = await db
    .update(files)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(files.id, id), isNull(files.deletedAt)))
    .returning({ id: files.id });
  return removed.length > 0;
}

export type FileWithOwner = FileRecord & { ownerUsername: string | null };

/**
 * Same listing as {@link listFiles}, with the uploader's username attached —
 * the admin browser shows who uploaded what, and a `null` username means a
 * system-created file (or a deleted account).
 */
export async function listFilesWithOwner(filter: ListFilesFilter = {}): Promise<FileWithOwner[]> {
  const conditions: SQL[] = [isNull(files.deletedAt)];
  if (filter.category) conditions.push(eq(files.category, filter.category));
  if (filter.ownerId) conditions.push(eq(files.ownerId, filter.ownerId));

  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_FILE_PAGE_SIZE, 1), MAX_FILE_PAGE_SIZE);
  const rows = await db
    .select({ file: files, ownerUsername: users.username })
    .from(files)
    .leftJoin(users, eq(files.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(files.createdAt))
    .limit(limit);

  return rows.map((row) => ({ ...row.file, ownerUsername: row.ownerUsername ?? null }));
}
