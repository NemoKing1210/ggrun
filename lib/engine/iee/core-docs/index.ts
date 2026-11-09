/**
 * The system pack `core` as a fixture for code that runs without a database:
 * pure engine tests, the scenario document and the stage-1 registry fallback.
 *
 * The source is `seed/iee/core.ggpack` (spec §10.2); `core.generated.ts` is
 * rendered from it by `pnpm iee:core`, and a test fails when the two drift
 * apart. Ids are the pack's: the entry id is what other entries, instances and
 * exports refer to (D11), and each revision id is derived from the entry id
 * and the content hash, so every installation that imports the pack gets the
 * same ids.
 */
import type { EntryDoc } from "../dsl/doc";
import { CORE_DOCUMENTS, CORE_ENTRY_IDS, CORE_PACK_ID, CORE_REVISIONS } from "./core.generated";

export { CORE_ENTRY_IDS, CORE_PACK_ID, CORE_REVISIONS };

export type CoreKey = keyof typeof CORE_ENTRY_IDS;

export interface CoreDocRecord {
  entryId: string;
  revisionId: string;
  doc: EntryDoc;
}

/** The fixture, in catalog order (items, then effects, each by slug). */
export const CORE_DOCS: readonly CoreDocRecord[] = (Object.keys(CORE_ENTRY_IDS) as CoreKey[]).map((key) => ({
  entryId: CORE_ENTRY_IDS[key],
  revisionId: CORE_REVISIONS[key].revisionId,
  doc: CORE_DOCUMENTS[key],
}));
