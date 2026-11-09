/**
 * Compiling a set of entries together — what a season loads (spec §8).
 *
 * References between entries resolve inside the set only, so the set is
 * checked as a whole: an entry that fails disables itself, and an entry that
 * references a failed one fails too (its grant would point at nothing). The
 * loop runs until nothing else drops out. Nothing here throws on bad data: a
 * season with one broken entry plays the rest (§5.2). Scenarios are not
 * checked here — a season plays rules, and a scenario may name an entry the
 * season does not attach; publishing checks and runs them (§5.5).
 */
import { checkEntry, checkEntrySet, type Issue } from "./check";
import { compileEntry } from "./compile";
import { EntryDocSchema, type EntryDoc } from "./doc";
import type { CompiledEntry, EntryFacts } from "./runtime";
import { upgradeDoc } from "./upgrade";

export interface SetMemberInput {
  entryId: string;
  revisionId: string;
  /** The stored document, any DSL version — it is upgraded first. */
  doc: unknown;
}

export interface SetFailure {
  entryId: string;
  revisionId: string;
  /** Null when the document did not parse far enough to have one. */
  slug: string | null;
  errors: Issue[];
}

export interface SetWarning {
  entryId: string;
  slug: string;
  issue: Issue;
}

export interface CompiledSet {
  entries: readonly CompiledEntry[];
  byKey: ReadonlyMap<string, CompiledEntry>;
  byEntryId: ReadonlyMap<string, CompiledEntry>;
  byRevisionId: ReadonlyMap<string, CompiledEntry>;
  failures: readonly SetFailure[];
  warnings: readonly SetWarning[];
}

function factsFromDoc(entryId: string, doc: EntryDoc): EntryFacts {
  return { entryId, slug: doc.slug, kind: doc.kind, character: doc.character, tags: doc.tags, name: doc.name };
}

/**
 * `members` is the season's catalog: one revision per entry, the revisions
 * references resolve to. `older` are revisions only live instances still hold
 * (granted before the season switched to a newer one): they are compiled
 * against the same catalog and reachable by revision id only (spec §8).
 */
export function compileSet(
  members: readonly SetMemberInput[],
  older: readonly SetMemberInput[] = [],
): CompiledSet {
  const failures = new Map<string, SetFailure>();
  const fail = (m: SetMemberInput, slug: string | null, errors: Issue[]) => {
    if (!failures.has(m.revisionId)) {
      failures.set(m.revisionId, { entryId: m.entryId, revisionId: m.revisionId, slug, errors });
    }
  };

  // 1. Upgrade and parse the frame of every document.
  const parsed: { member: SetMemberInput; doc: EntryDoc }[] = [];
  for (const member of members) {
    const upgraded = upgradeDoc(member.doc);
    if (!upgraded.ok) {
      fail(member, null, [{ code: "schema", path: [], message: upgraded.reason }]);
      continue;
    }
    const frame = EntryDocSchema.safeParse(upgraded.doc);
    if (!frame.success) {
      // Every problem, each where it is — the editor and the journal point at it.
      fail(
        member,
        null,
        frame.error.issues.map((i) => ({
          code: "schema" as const,
          path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
          message: i.message,
        })),
      );
      continue;
    }
    parsed.push({ member, doc: frame.data });
  }

  // 2. Check entries against the set until no further entry drops out.
  let warnings: SetWarning[] = [];
  let alive = parsed;
  for (;;) {
    const facts = new Map(alive.map(({ member, doc }) => [member.entryId, factsFromDoc(member.entryId, doc)]));
    const resolve = (entryId: string) => facts.get(entryId) ?? null;
    warnings = [];
    const next: typeof alive = [];
    for (const item of alive) {
      const result = checkEntry(item.doc, { entryId: item.member.entryId, resolve, scenarios: false });
      if (result.errors.length > 0) {
        fail(item.member, item.doc.slug, result.errors);
        continue;
      }
      for (const issue of result.warnings) {
        warnings.push({ entryId: item.member.entryId, slug: item.doc.slug, issue });
      }
      next.push(item);
    }

    const set = checkEntrySet(next.map(({ member, doc }) => ({ entryId: member.entryId, doc })));
    const inLoop = new Map<string, Issue>();
    for (const e of set.errors) if (e.code === "grant_cycle") inLoop.set(String(e.path[0]), e);
    // A duplicate keeps its first occurrence; a loop takes every member.
    const seenSlugs = new Set<string>();
    const seenIds = new Set<string>();
    const survivors: typeof alive = [];
    for (const item of next) {
      const loop = inLoop.get(item.doc.slug);
      if (loop) {
        fail(item.member, item.doc.slug, [loop]);
        continue;
      }
      if (seenIds.has(item.member.entryId) || seenSlugs.has(item.doc.slug)) {
        const code = seenIds.has(item.member.entryId) ? "duplicate_id" : "duplicate_slug";
        fail(item.member, item.doc.slug, [
          { code, path: [item.doc.slug], message: `${item.doc.slug} appears twice in the set` },
        ]);
        continue;
      }
      seenSlugs.add(item.doc.slug);
      seenIds.add(item.member.entryId);
      survivors.push(item);
    }
    for (const issue of set.warnings) {
      const slug = String(issue.path[0]);
      const owner = survivors.find((s) => s.doc.slug === slug);
      if (owner) warnings.push({ entryId: owner.member.entryId, slug, issue });
    }
    const stable = survivors.length === alive.length;
    alive = survivors;
    if (stable) break;
  }

  // 3. Compile what survived, resolving references within the survivors.
  const facts = new Map(alive.map(({ member, doc }) => [member.entryId, factsFromDoc(member.entryId, doc)]));
  const resolve = (entryId: string) => facts.get(entryId) ?? null;
  const entries = alive.map(({ member, doc }) =>
    compileEntry({ entryId: member.entryId, revisionId: member.revisionId, doc, resolve }),
  );

  // 4. Older revisions held by live instances: same catalog, own checks.
  const held: CompiledEntry[] = [];
  for (const member of older) {
    if (entries.some((e) => e.revisionId === member.revisionId)) continue;
    const upgraded = upgradeDoc(member.doc);
    if (!upgraded.ok) {
      fail(member, null, [{ code: "schema", path: [], message: upgraded.reason }]);
      continue;
    }
    const result = checkEntry(upgraded.doc, { entryId: member.entryId, resolve, scenarios: false });
    if (!result.doc || result.errors.length > 0) {
      fail(member, result.doc?.slug ?? null, result.errors);
      continue;
    }
    held.push(compileEntry({ entryId: member.entryId, revisionId: member.revisionId, doc: result.doc, resolve }));
  }

  return {
    entries,
    byKey: new Map(entries.map((e) => [e.key, e])),
    byEntryId: new Map(entries.map((e) => [e.entryId, e])),
    byRevisionId: new Map([...entries, ...held].map((e) => [e.revisionId, e])),
    failures: [...failures.values()],
    warnings,
  };
}
