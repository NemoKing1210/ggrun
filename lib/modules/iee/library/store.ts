/**
 * The library's data access — the only code that writes packs, entries,
 * revisions and pack dependencies (docs/IEE_CONSTRUCTOR_SPEC.md §10; an
 * architecture test holds it to that, and holds revisions to insert-only).
 *
 * Kept behind an interface so the library's rules — who may change what,
 * publish, dependencies — are tested against an in-memory store, and this
 * file stays a list of statements.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import {
  ieeEntries,
  ieeEntryRevisions,
  ieePackDependencies,
  ieePacks,
  type IeeEntryRevisionRow,
  type IeeEntryRow,
  type IeePackRow,
} from "@/db/schema";

export type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewPack = Omit<IeePackRow, "id" | "createdAt" | "updatedAt" | "archivedAt"> & { id?: string };
export type PackPatch = Partial<
  Pick<IeePackRow, "slug" | "names" | "description" | "visibility" | "defaultLocale" | "capabilities" | "minDslVersion" | "iconFileId" | "archivedAt">
>;
export type NewEntry = Omit<IeeEntryRow, "id" | "createdAt" | "updatedAt" | "archivedAt" | "latestRevisionId"> & {
  id?: string;
};
export type EntryPatch = Partial<Pick<IeeEntryRow, "slug" | "kind" | "draft" | "iconFileId" | "latestRevisionId" | "archivedAt">>;
export type NewRevision = Omit<IeeEntryRevisionRow, "id" | "createdAt"> & { id?: string };

export interface LibraryStore {
  pack(id: string): Promise<IeePackRow | null>;
  packBySlug(slug: string): Promise<IeePackRow | null>;
  /** Every pack, archived ones included, by slug. */
  packs(): Promise<IeePackRow[]>;
  insertPack(row: NewPack): Promise<IeePackRow>;
  updatePack(id: string, patch: PackPatch): Promise<IeePackRow | null>;

  entry(id: string): Promise<IeeEntryRow | null>;
  entryBySlug(packId: string, slug: string): Promise<IeeEntryRow | null>;
  /** A pack's entries, archived ones included, by slug. */
  entriesOfPack(packId: string): Promise<IeeEntryRow[]>;
  entriesByIds(ids: readonly string[]): Promise<IeeEntryRow[]>;
  insertEntry(row: NewEntry): Promise<IeeEntryRow>;
  updateEntry(id: string, patch: EntryPatch): Promise<IeeEntryRow | null>;

  revision(id: string): Promise<IeeEntryRevisionRow | null>;
  /** An entry's revisions, oldest first. */
  revisionsOf(entryId: string): Promise<IeeEntryRevisionRow[]>;
  revisionsByIds(ids: readonly string[]): Promise<IeeEntryRevisionRow[]>;
  /** Insert-only: there is no update or delete of a revision anywhere. */
  insertRevision(row: NewRevision): Promise<IeeEntryRevisionRow>;

  dependenciesOf(packId: string): Promise<string[]>;
  /** Replaces the pack's dependency rows with exactly these. */
  setDependencies(packId: string, dependsOn: readonly string[]): Promise<void>;

  /** How many packs and entries use a file as their icon. */
  iconUsers(fileId: string): Promise<number>;
}

export function pgLibraryStore(tx: Tx = db): LibraryStore {
  return {
    async pack(id) {
      const [row] = await tx.select().from(ieePacks).where(eq(ieePacks.id, id)).limit(1);
      return row ?? null;
    },
    async packBySlug(slug) {
      const [row] = await tx.select().from(ieePacks).where(eq(ieePacks.slug, slug)).limit(1);
      return row ?? null;
    },
    packs() {
      return tx.select().from(ieePacks).orderBy(asc(ieePacks.slug));
    },
    async insertPack(row) {
      const [inserted] = await tx.insert(ieePacks).values(row).returning();
      return inserted!;
    },
    async updatePack(id, patch) {
      const [row] = await tx
        .update(ieePacks)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(ieePacks.id, id))
        .returning();
      return row ?? null;
    },

    async entry(id) {
      const [row] = await tx.select().from(ieeEntries).where(eq(ieeEntries.id, id)).limit(1);
      return row ?? null;
    },
    async entryBySlug(packId, slug) {
      const [row] = await tx
        .select()
        .from(ieeEntries)
        .where(and(eq(ieeEntries.packId, packId), eq(ieeEntries.slug, slug)))
        .limit(1);
      return row ?? null;
    },
    entriesOfPack(packId) {
      return tx.select().from(ieeEntries).where(eq(ieeEntries.packId, packId)).orderBy(asc(ieeEntries.slug));
    },
    async entriesByIds(ids) {
      if (ids.length === 0) return [];
      return tx.select().from(ieeEntries).where(inArray(ieeEntries.id, [...ids]));
    },
    async insertEntry(row) {
      const [inserted] = await tx.insert(ieeEntries).values(row).returning();
      return inserted!;
    },
    async updateEntry(id, patch) {
      const [row] = await tx
        .update(ieeEntries)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(ieeEntries.id, id))
        .returning();
      return row ?? null;
    },

    async revision(id) {
      const [row] = await tx.select().from(ieeEntryRevisions).where(eq(ieeEntryRevisions.id, id)).limit(1);
      return row ?? null;
    },
    revisionsOf(entryId) {
      return tx
        .select()
        .from(ieeEntryRevisions)
        .where(eq(ieeEntryRevisions.entryId, entryId))
        .orderBy(asc(ieeEntryRevisions.number));
    },
    async revisionsByIds(ids) {
      if (ids.length === 0) return [];
      return tx.select().from(ieeEntryRevisions).where(inArray(ieeEntryRevisions.id, [...ids]));
    },
    async insertRevision(row) {
      const [inserted] = await tx.insert(ieeEntryRevisions).values(row).returning();
      return inserted!;
    },

    async dependenciesOf(packId) {
      const rows = await tx
        .select({ id: ieePackDependencies.dependsOnPackId })
        .from(ieePackDependencies)
        .where(eq(ieePackDependencies.packId, packId));
      return rows.map((r) => r.id).sort();
    },
    async setDependencies(packId, dependsOn) {
      await tx.delete(ieePackDependencies).where(eq(ieePackDependencies.packId, packId));
      if (dependsOn.length === 0) return;
      await tx
        .insert(ieePackDependencies)
        .values(dependsOn.map((dependsOnPackId) => ({ packId, dependsOnPackId })));
    },

    async iconUsers(fileId) {
      const count = sql<number>`count(*)::int`;
      const [packs] = await tx.select({ n: count }).from(ieePacks).where(eq(ieePacks.iconFileId, fileId));
      const [entries] = await tx.select({ n: count }).from(ieeEntries).where(eq(ieeEntries.iconFileId, fileId));
      return Number(packs?.n ?? 0) + Number(entries?.n ?? 0);
    },
  };
}

/** Not archived — what still counts for dependencies and publishing. */
export function isActive(row: { archivedAt: Date | null }): boolean {
  return row.archivedAt === null;
}
