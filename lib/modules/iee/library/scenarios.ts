/**
 * Entry scenarios from the library's side (docs/IEE_CONSTRUCTOR_SPEC.md §5.5):
 * the publish gate (`planWithScenarios`), the documents a run needs, and
 * running a draft's scenarios for the editor without saving it. Import runs
 * them in `checkImported`; the runner itself is `../sim/scenarios`. Kept out of
 * `./publish`, which stays pure: the runner plays through the executor.
 */
import { EntryDocSchema, upgradeDoc, type EntryDoc } from "@/lib/engine/iee/dsl";
import { AdminError } from "@/lib/modules/season/service/errors";

import { runEntryScenarios, scenarioIssues, type ScenarioRun } from "../sim/scenarios";
import { libraryAdmin, withLibrary } from "./context";
import { planPublish, type PlanInput, type PlannedEntry, type PublishIssue } from "./publish";
import { mentionedEntries, referencedEntries } from "./refs";
import type { LibraryStore } from "./store";

/** A stored or posted document, upgraded and parsed; null when it is not one. */
export function readDoc(raw: unknown): EntryDoc | null {
  const upgraded = upgradeDoc(raw);
  if (!upgraded.ok) return null;
  const parsed = EntryDocSchema.safeParse(upgraded.doc);
  return parsed.success ? parsed.data : null;
}

/**
 * The latest revision of every entry `seeds` names, and of everything those
 * reference in turn — what a scenario plays besides the entry under test.
 * Entries with no revision are left out: a scenario cannot play them.
 */
export async function latestDocs(store: LibraryStore, seeds: readonly string[]): Promise<Map<string, EntryDoc>> {
  const docs = new Map<string, EntryDoc>();
  const seen = new Set<string>();
  let wave = [...new Set(seeds)];
  while (wave.length > 0) {
    wave.forEach((id) => seen.add(id));
    const entries = await store.entriesByIds(wave);
    const revisions = await store.revisionsByIds(entries.flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : [])));
    const next: string[] = [];
    for (const r of revisions) {
      const doc = readDoc(r.doc);
      if (!doc) continue;
      docs.set(r.entryId, doc);
      for (const id of referencedEntries(doc)) if (!seen.has(id)) next.push(id);
    }
    wave = [...new Set(next)];
  }
  return docs;
}

/**
 * Runs the scenarios of a draft as it is in the editor — unsaved — against
 * the latest revisions of what it names. Nothing is written. A draft that
 * does not parse has nothing to run: its checks say why.
 */
export async function runDraftScenarios(entryId: string, draft: unknown): Promise<ScenarioRun | null> {
  await libraryAdmin();
  return withLibrary(async (store) => {
    const entry = await store.entry(entryId);
    if (!entry) throw new AdminError("ieeEntryNotFound");
    const doc = readDoc(draft);
    if (!doc) return null;
    const docs = await latestDocs(store, mentionedEntries(doc));
    return runEntryScenarios({ entryId, doc, docOf: (id) => docs.get(id) ?? null });
  });
}

/**
 * The publish checks, then the scenarios (§5.5, §14): every draft that passes
 * the checks runs its scenarios, and a red one refuses it — and with it
 * whatever references it — until nothing else drops out. A scenario plays the
 * drafts published together with it and, for every other entry it names, the
 * document `docs` returns: the latest revision.
 */
export async function planWithScenarios(
  input: PlanInput & { docs: (entryId: string) => EntryDoc | null },
): Promise<PlannedEntry[]> {
  const refused = new Map<string, PublishIssue[]>(
    [...(input.refused ?? new Map<string, readonly PublishIssue[]>())].map(([id, issues]) => [id, [...issues]]),
  );
  const candidateIds = new Set(input.candidates.map((c) => c.entryId));
  for (;;) {
    const plans = planPublish({ ...input, refused });
    const passing = new Map(plans.filter((p) => p.hash !== null && p.doc !== null).map((p) => [p.entryId, p.doc!]));
    // A draft of the set that does not pass has no revision to play.
    const docOf = (id: string) => passing.get(id) ?? (candidateIds.has(id) ? null : input.docs(id));
    let changed = false;
    for (const [entryId, doc] of passing) {
      if (!doc.scenarios || doc.scenarios.length === 0) continue;
      const issues = scenarioIssues(await runEntryScenarios({ entryId, doc, docOf }));
      if (issues.length > 0) {
        refused.set(entryId, issues);
        changed = true;
      }
    }
    if (!changed) return plans;
  }
}
