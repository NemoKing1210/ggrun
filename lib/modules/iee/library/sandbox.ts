/**
 * The sandbox from the library's side (docs/IEE_CONSTRUCTOR_SPEC.md §10.5):
 * a draft as it is in the editor, played by bots in a season kept in memory
 * against the latest revisions of what it names — and, when asked, with
 * `core` on the wheels. Nothing is written but the audit row
 * `iee_sandbox_run`. The runner is `../sim/sandbox`.
 */
import { HANDOUT_TAG } from "@/lib/engine";
import { CORE_PACK_ID } from "@/lib/engine/iee/core-docs";
import type { EntryDoc } from "@/lib/engine/iee/dsl";
import { logAdminAction } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { AdminError } from "@/lib/modules/season/service/errors";

import { runSandbox, SANDBOX_LIMITS, type SandboxOutcome, type SandboxRun } from "../sim/sandbox";
import { libraryAdmin, withLibrary } from "./context";
import { contentHash } from "./publish";
import { referencedEntries } from "./refs";
import { latestDocs, readDoc } from "./scenarios";
import { isActive, type LibraryStore } from "./store";

export interface SandboxRequest {
  bots: number;
  rounds: number;
  /** Repeats a run; a fresh one when absent. */
  seed?: number | null;
  /** `core`'s other entries on the wheels too. */
  withCore: boolean;
  /** Each bot starts with the entry. */
  startWith: boolean;
}

/**
 * The latest revision of every active entry of `core` that drops — a handout
 * plays only when its item hands it out (spec §6.6), and comes in with it.
 */
async function coreDocs(store: LibraryStore): Promise<{ entryId: string; doc: EntryDoc }[]> {
  const entries = (await store.entriesOfPack(CORE_PACK_ID)).filter(isActive);
  const revisions = await store.revisionsByIds(entries.flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : [])));
  return revisions.flatMap((r) => {
    const doc = readDoc(r.doc);
    return doc && !doc.tags.includes(HANDOUT_TAG) ? [{ entryId: r.entryId, doc }] : [];
  });
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));

/** What the audit keeps of a run: enough to see what it showed and to repeat it. */
function auditSummary(run: SandboxRun) {
  return {
    played: run.played,
    bots: run.summary.bots.map((b) => ({ id: b.id, position: b.position, balance: b.balance, status: b.status })),
    entries: run.summary.entries.map(({ key, dropped, granted, used, fired, expired, moved }) => ({ key, dropped, granted, used, fired, expired, moved })),
  };
}

/**
 * Plays a draft in the sandbox. Null when the draft does not parse — its
 * checks say why; a draft that does not play with what it names comes back
 * as `{ ok: false }`, and is recorded too.
 */
export async function runDraftSandbox(entryId: string, draft: unknown, request: SandboxRequest): Promise<SandboxOutcome | null> {
  const actor = await libraryAdmin();
  const bots = clamp(request.bots, SANDBOX_LIMITS.minBots, SANDBOX_LIMITS.maxBots);
  const rounds = clamp(request.rounds, SANDBOX_LIMITS.minRounds, SANDBOX_LIMITS.maxRounds);
  const seed =
    typeof request.seed === "number" && Number.isFinite(request.seed) ? Math.trunc(request.seed) >>> 0 : Math.floor(Math.random() * 2 ** 31);

  const played = await withLibrary(async (store) => {
    const entry = await store.entry(entryId);
    if (!entry) throw new AdminError("ieeEntryNotFound");
    const doc = readDoc(draft);
    if (!doc) return null;
    const core = request.withCore ? (await coreDocs(store)).filter((c) => c.entryId !== entryId) : [];
    const docs = await latestDocs(store, [...referencedEntries(doc), ...core.flatMap((c) => referencedEntries(c.doc))]);
    const outcome = await runSandbox(
      { entryId, doc, docOf: (id) => docs.get(id) ?? null, extras: core },
      { bots, rounds, seed, startWith: request.startWith },
    );
    return { outcome, hash: contentHash(doc), slug: doc.slug };
  });
  if (!played) return null;

  const { outcome, hash, slug } = played;
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_sandbox_run",
    targetType: "iee_entry",
    targetId: entryId,
    payload: {
      slug,
      hash,
      bots,
      rounds,
      seed,
      withCore: request.withCore,
      startWith: request.startWith,
      ...(outcome.ok ? { summary: auditSummary(outcome.run) } : { broken: outcome.message }),
    },
  });
  log.info("iee.library.sandbox_run", { actorId: actor.id, entryId, seed, bots, rounds, ok: outcome.ok });
  return outcome;
}
