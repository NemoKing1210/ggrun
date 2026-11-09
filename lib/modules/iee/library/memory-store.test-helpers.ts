/**
 * An in-memory `LibraryStore` with the database's uniqueness rules (pack slug,
 * entry slug per pack, revision number and content hash per entry), so the
 * library's rules are tested without a database. Test-only.
 */
import type { IeeEntryRevisionRow, IeeEntryRow, IeePackRow } from "@/db/schema";

import type { LibraryStore } from "./store";

let seq = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function memoryLibrary() {
  const packs: IeePackRow[] = [];
  const entries: IeeEntryRow[] = [];
  const revisions: IeeEntryRevisionRow[] = [];
  const dependencies: { packId: string; dependsOnPackId: string }[] = [];
  let clock = 1_000;
  const now = () => new Date(clock++);

  const store: LibraryStore = {
    async pack(id) {
      return packs.find((p) => p.id === id) ?? null;
    },
    async packBySlug(slug) {
      return packs.find((p) => p.slug === slug) ?? null;
    },
    async packs() {
      return [...packs].sort((a, b) => a.slug.localeCompare(b.slug));
    },
    async insertPack(row) {
      if (packs.some((p) => p.slug === row.slug)) throw new Error("duplicate key: iee_packs_slug_unique");
      const full: IeePackRow = { ...row, id: row.id ?? nextId(), createdAt: now(), updatedAt: now(), archivedAt: null };
      packs.push(full);
      return { ...full };
    },
    async updatePack(id, patch) {
      const row = packs.find((p) => p.id === id);
      if (!row) return null;
      if (patch.slug && packs.some((p) => p.slug === patch.slug && p.id !== id)) {
        throw new Error("duplicate key: iee_packs_slug_unique");
      }
      Object.assign(row, patch, { updatedAt: now() });
      return { ...row };
    },

    async entry(id) {
      return entries.find((e) => e.id === id) ?? null;
    },
    async entryBySlug(packId, slug) {
      return entries.find((e) => e.packId === packId && e.slug === slug) ?? null;
    },
    async entriesOfPack(packId) {
      return entries.filter((e) => e.packId === packId).sort((a, b) => a.slug.localeCompare(b.slug));
    },
    async entriesByIds(ids) {
      return entries.filter((e) => ids.includes(e.id));
    },
    async insertEntry(row) {
      if (entries.some((e) => e.packId === row.packId && e.slug === row.slug)) {
        throw new Error("duplicate key: iee_entries_pack_slug_uq");
      }
      const full: IeeEntryRow = {
        ...row,
        id: row.id ?? nextId(),
        latestRevisionId: null,
        createdAt: now(),
        updatedAt: now(),
        archivedAt: null,
      };
      entries.push(full);
      return { ...full };
    },
    async updateEntry(id, patch) {
      const row = entries.find((e) => e.id === id);
      if (!row) return null;
      if (patch.slug && entries.some((e) => e.packId === row.packId && e.slug === patch.slug && e.id !== id)) {
        throw new Error("duplicate key: iee_entries_pack_slug_uq");
      }
      Object.assign(row, patch, { updatedAt: now() });
      return { ...row };
    },

    async revision(id) {
      return revisions.find((r) => r.id === id) ?? null;
    },
    async revisionsOf(entryId) {
      return revisions.filter((r) => r.entryId === entryId).sort((a, b) => a.number - b.number);
    },
    async revisionsByIds(ids) {
      return revisions.filter((r) => ids.includes(r.id));
    },
    async insertRevision(row) {
      const mine = revisions.filter((r) => r.entryId === row.entryId);
      if (mine.some((r) => r.number === row.number)) throw new Error("duplicate key: iee_entry_revisions_number_uq");
      if (mine.some((r) => r.contentHash === row.contentHash)) throw new Error("duplicate key: iee_entry_revisions_hash_uq");
      const full: IeeEntryRevisionRow = { ...row, id: row.id ?? nextId(), createdAt: now() };
      revisions.push(full);
      return { ...full };
    },

    async dependenciesOf(packId) {
      return dependencies.filter((d) => d.packId === packId).map((d) => d.dependsOnPackId).sort();
    },
    async setDependencies(packId, dependsOn) {
      for (let i = dependencies.length - 1; i >= 0; i--) if (dependencies[i]!.packId === packId) dependencies.splice(i, 1);
      for (const d of dependsOn) dependencies.push({ packId, dependsOnPackId: d });
    },

    async iconUsers(fileId) {
      return packs.filter((p) => p.iconFileId === fileId).length + entries.filter((e) => e.iconFileId === fileId).length;
    },
  };

  return { store, packs, entries, revisions, dependencies };
}
