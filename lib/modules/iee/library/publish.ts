/**
 * Publish checks (docs/IEE_CONSTRUCTOR_SPEC.md §10.1, §14): which drafts may
 * become revisions, and the content hash that decides whether a revision is
 * new.
 *
 * Drafts published together are checked together, so they may reference each
 * other. A draft that fails cannot be referenced by the others — they would
 * point at an entry with no revision — and the loop runs until nothing else
 * drops out, the way a season's set compiles. Entries outside the set resolve
 * through their latest revision.
 */
import { createHash } from "node:crypto";

import {
  canonicalJson,
  checkEntry,
  checkEntrySet,
  EntryDocSchema,
  upgradeDoc,
  type EntryDoc,
  type EntryFacts,
  type Issue,
} from "@/lib/engine/iee/dsl";

/** sha-256 of the canonical JSON of a document — equal content, equal hash (§4.2). */
export function contentHash(doc: unknown): string {
  return createHash("sha256").update(canonicalJson(doc)).digest("hex");
}

export function factsOfDoc(entryId: string, doc: EntryDoc): EntryFacts {
  return { entryId, slug: doc.slug, kind: doc.kind, character: doc.character, tags: doc.tags, name: doc.name };
}

/** The engine's issue codes plus the library's own. */
export type PublishIssue = Omit<Issue, "code"> & { code: Issue["code"] | "kind_locked" | "slug_mismatch" };

export interface PublishCandidate {
  entryId: string;
  /** The entry's slug and kind as stored. */
  slug: string;
  kind: "item" | "effect";
  /** Published before — the kind is then locked (§4.2). */
  published: boolean;
  draft: unknown;
}

export interface PlannedEntry {
  entryId: string;
  /** The validated document; null when the draft did not parse. */
  doc: EntryDoc | null;
  /** Set when the entry may be published. */
  hash: string | null;
  errors: PublishIssue[];
  warnings: PublishIssue[];
}

export interface PlanInput {
  candidates: readonly PublishCandidate[];
  /** Latest revisions of entries outside the set, by entry id. */
  published: (entryId: string) => EntryFacts | null;
  /** The rest of the pack — latest revisions of entries not being published — for the set checks. */
  packmates: readonly { entryId: string; doc: EntryDoc }[];
  /**
   * Drafts already known to be refused for a reason the checks cannot see —
   * a red scenario (§5.5) — with the findings to show. They fail from the
   * start, so whatever references them drops out with them.
   */
  refused?: ReadonlyMap<string, readonly PublishIssue[]>;
}

function schemaIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): PublishIssue[] {
  return error.issues.map((i) => ({
    code: "schema" as const,
    path: i.path.map((p) => (typeof p === "symbol" ? String(p) : (p as string | number))),
    message: i.message,
  }));
}

export function planPublish(input: PlanInput): PlannedEntry[] {
  const plans = new Map<string, PlannedEntry>();
  const parsed = new Map<string, EntryDoc>();

  // 1. Upgrade and parse every draft.
  for (const c of input.candidates) {
    const plan: PlannedEntry = { entryId: c.entryId, doc: null, hash: null, errors: [], warnings: [] };
    plans.set(c.entryId, plan);
    const upgraded = upgradeDoc(c.draft);
    if (!upgraded.ok) {
      plan.errors.push({ code: "schema", path: [], message: upgraded.reason });
      continue;
    }
    const frame = EntryDocSchema.safeParse(upgraded.doc);
    if (!frame.success) {
      plan.errors.push(...schemaIssues(frame.error));
      continue;
    }
    plan.doc = frame.data;
    if (c.published && frame.data.kind !== c.kind) {
      plan.errors.push({ code: "kind_locked", path: ["kind"], message: `a published ${c.kind} cannot become an ${frame.data.kind}` });
      continue;
    }
    if (frame.data.slug !== c.slug) {
      plan.errors.push({ code: "slug_mismatch", path: ["slug"], message: `the draft says ${frame.data.slug}, the entry is ${c.slug}` });
      continue;
    }
    parsed.set(c.entryId, frame.data);
  }

  // 2. Check against each other until no further draft drops out.
  let alive = new Map(parsed);
  for (;;) {
    const resolve = (entryId: string) => {
      const doc = alive.get(entryId);
      if (doc) return factsOfDoc(entryId, doc);
      return parsed.has(entryId) ? null : input.published(entryId);
    };
    const failed = new Set<string>();
    for (const [entryId, doc] of alive) {
      const plan = plans.get(entryId)!;
      const result = checkEntry(doc, { entryId, resolve });
      plan.errors = [...result.errors, ...(input.refused?.get(entryId) ?? [])];
      plan.warnings = result.warnings;
      if (plan.errors.length > 0) failed.add(entryId);
    }
    const members = [
      ...[...alive].filter(([id]) => !failed.has(id)).map(([entryId, doc]) => ({ entryId, doc })),
      ...input.packmates.filter((m) => !parsed.has(m.entryId)),
    ];
    const set = checkEntrySet(members);
    const bySlug = new Map([...alive].map(([id, doc]) => [doc.slug, id]));
    for (const issue of set.errors) {
      const id = bySlug.get(String(issue.path[0]));
      if (id && !failed.has(id)) {
        plans.get(id)!.errors.push(issue);
        failed.add(id);
      }
    }
    for (const issue of set.warnings) {
      const id = bySlug.get(String(issue.path[0]));
      if (id && !failed.has(id)) plans.get(id)!.warnings.push(issue);
    }
    if (failed.size === 0) break;
    alive = new Map([...alive].filter(([id]) => !failed.has(id)));
  }

  for (const [entryId, doc] of alive) plans.get(entryId)!.hash = contentHash(doc);
  return input.candidates.map((c) => plans.get(c.entryId)!);
}
