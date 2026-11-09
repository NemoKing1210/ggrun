/**
 * The system pack as the catalog module reads the library — one revision per
 * entry, from the engine's fixture — for tests that run without a database.
 */
import { CORE_DOCS, CORE_PACK_ID } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";

import { contentHash } from "../library/publish";
import { referencedEntries } from "../library/refs";
import { revisionIdFor } from "../library/ggpack";
import type { CatalogEntryOption } from "./library";

export const CORE_PACK = { id: CORE_PACK_ID, slug: "core", names: { ru: "Ядро", en: "Core", uk: "Ядро" }, isSystem: true };

export function coreLibrary(): CatalogEntryOption[] {
  return CORE_DOCS.map((d) => ({
    entryId: d.entryId,
    slug: d.doc.slug,
    kind: d.doc.kind,
    pack: CORE_PACK,
    available: true,
    latestRevisionId: d.revisionId,
    revisions: [{ revisionId: d.revisionId, entryId: d.entryId, number: 1, doc: d.doc, references: referencedEntries(d.doc) }],
    art: { iconUrl: null, packIconUrl: null, system: true },
  }));
}

/** The library with a newer revision of one entry — `change` edits a copy of its document. */
export function withNewRevision(
  library: readonly CatalogEntryOption[],
  slug: string,
  change: (doc: EntryDoc) => void,
): CatalogEntryOption[] {
  return library.map((e) => {
    if (e.slug !== slug) return e;
    const doc = structuredClone(e.revisions.at(-1)!.doc!);
    change(doc);
    const revisionId = revisionIdFor(e.entryId, contentHash(doc));
    return {
      ...e,
      latestRevisionId: revisionId,
      revisions: [
        ...e.revisions,
        { revisionId, entryId: e.entryId, number: e.revisions.length + 1, doc, references: referencedEntries(doc) },
      ],
    };
  });
}
