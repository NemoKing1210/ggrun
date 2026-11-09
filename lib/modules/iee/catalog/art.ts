/**
 * How library entries are drawn (docs/IEE_CONSTRUCTOR_SPEC.md §12) — what the
 * library knows beyond the document: the entry's icon, its pack's icon and
 * whether the pack is the system one. Joined into every view as `art`; the
 * fallback chain itself is the components' (`components/iee/IeeIcon.tsx`).
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/infrastructure/db";
import { files, ieeEntries, ieePacks } from "@/db/schema";
import { NO_ART, type EntryArt } from "@/lib/engine";
import { fileUrl } from "@/lib/modules/files/service/access";

import type { Tx } from "./store";

/** What an entry's art is made of, before file ids become URLs. */
export interface ArtSource {
  entryIconFileId: string | null;
  packIconFileId: string | null;
  system: boolean;
}

export function artOf(source: ArtSource, urls: ReadonlyMap<string, string>): EntryArt {
  return {
    iconUrl: source.entryIconFileId ? (urls.get(source.entryIconFileId) ?? null) : null,
    packIconUrl: source.packIconFileId ? (urls.get(source.packIconFileId) ?? null) : null,
    system: source.system,
  };
}

/** URLs of live icon files, by file id; a deleted file has none. */
export async function iconUrls(fileIds: Iterable<string>, tx: Tx = db): Promise<Map<string, string>> {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: files.id, key: files.key, visibility: files.visibility })
    .from(files)
    .where(and(inArray(files.id, ids), isNull(files.deletedAt)));
  return new Map(rows.map((r) => [r.id, fileUrl(r)]));
}

/** The art of the given entries, by entry id. Two reads. */
export async function loadEntryArt(entryIds: Iterable<string>, tx: Tx = db): Promise<Record<string, EntryArt>> {
  const ids = [...new Set(entryIds)];
  if (ids.length === 0) return {};
  const rows = await tx
    .select({
      entryId: ieeEntries.id,
      entryIconFileId: ieeEntries.iconFileId,
      packIconFileId: ieePacks.iconFileId,
      system: ieePacks.isSystem,
    })
    .from(ieeEntries)
    .innerJoin(ieePacks, eq(ieePacks.id, ieeEntries.packId))
    .where(inArray(ieeEntries.id, ids));
  const urls = await iconUrls(rows.flatMap((r) => [r.entryIconFileId, r.packIconFileId].filter((id): id is string => id !== null)), tx);
  const out: Record<string, EntryArt> = {};
  for (const id of ids) out[id] = NO_ART;
  for (const row of rows) out[row.entryId] = artOf(row, urls);
  return out;
}
