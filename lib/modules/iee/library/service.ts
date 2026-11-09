/**
 * The library (docs/IEE_CONSTRUCTOR_SPEC.md §10): packs, entries, drafts and
 * revisions. Admin-only (D1), every mutation audited, every use case one
 * transaction.
 *
 * - Drafts are edited freely and may be invalid while edited.
 * - Publishing validates (§14) and inserts revision `n + 1` only when the
 *   content differs from every earlier revision; the same content twice is a
 *   no-op. Publishing a pack publishes every changed entry.
 * - Packs and entries are archived, never deleted.
 * - Pack dependencies follow the references in drafts and revisions.
 * - The system pack (`core`) is read-only unless `IEE_CORE_EDITABLE=1`.
 */
import { z } from "zod";

import type { IeeEntryRevisionRow, IeeEntryRow, IeePackRow } from "@/db/schema";
import {
  DSL_VERSION,
  LIMITS,
  LOCALES,
  LocalizedSchema,
  SLUG_RE,
  checkEntry,
  upgradeDoc,
  EntryDocSchema,
  type CheckResult,
  type EntryFacts,
} from "@/lib/engine/iee/dsl";
import { logAdminAction } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { AdminError } from "@/lib/modules/season/service/errors";

import { coreEditable, libraryAdmin, withLibrary, type LibraryActor } from "./context";
import { revisionIdFor } from "./ggpack";
import { skeletonDraft } from "./draft";
import { discardUnused, dropCreated, storageIconFiles, type IconFiles } from "./icons";
import { factsOfDoc, type PlannedEntry, type PublishIssue } from "./publish";
import { mentionedEntries } from "./refs";
import { latestDocs, planWithScenarios } from "./scenarios";
import { isActive, type LibraryStore } from "./store";

/** A draft larger than this is refused — documents are small by construction. */
export const MAX_DRAFT_BYTES = 64 * 1024;

const SlugSchema = z.string().trim().regex(SLUG_RE, { message: "ieeSlugInvalid" });

export const PackInputSchema = z.strictObject({
  slug: SlugSchema,
  names: LocalizedSchema(LIMITS.nameLength),
  description: LocalizedSchema(LIMITS.flavorLength).nullable().optional(),
  defaultLocale: z.enum(LOCALES).optional(),
  visibility: z.enum(["draft", "library"]).optional(),
});
export type PackInput = z.infer<typeof PackInputSchema>;

export const PackPatchSchema = PackInputSchema.partial();
export type PackPatchInput = z.infer<typeof PackPatchSchema>;

export const EntryInputSchema = z.strictObject({
  packId: z.string().uuid(),
  slug: SlugSchema,
  kind: z.enum(["item", "effect"]),
});
export type EntryInput = z.infer<typeof EntryInputSchema>;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

async function writablePack(store: LibraryStore, packId: string): Promise<IeePackRow> {
  const pack = await store.pack(packId);
  if (!pack) throw new AdminError("ieePackNotFound");
  if (pack.isSystem && !coreEditable()) throw new AdminError("ieeCoreReadOnly");
  if (!isActive(pack)) throw new AdminError("ieeArchived");
  return pack;
}

async function writableEntry(store: LibraryStore, entryId: string): Promise<{ entry: IeeEntryRow; pack: IeePackRow }> {
  const entry = await store.entry(entryId);
  if (!entry) throw new AdminError("ieeEntryNotFound");
  const pack = await writablePack(store, entry.packId);
  if (!isActive(entry)) throw new AdminError("ieeArchived");
  return { entry, pack };
}

// ---------------------------------------------------------------------------
// Dependencies (§4.2, §10.3)
// ---------------------------------------------------------------------------

/**
 * Recomputes a pack's dependencies from what its active entries reference —
 * in their drafts and in their latest revisions, since a published revision
 * keeps needing what it names after the draft moves on.
 */
export async function syncDependencies(store: LibraryStore, packId: string): Promise<string[]> {
  const entries = (await store.entriesOfPack(packId)).filter(isActive);
  const latest = await store.revisionsByIds(entries.flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : [])));
  const refs = new Set<string>();
  for (const e of entries) mentionedEntries(e.draft).forEach((id) => refs.add(id));
  for (const r of latest) mentionedEntries(r.doc).forEach((id) => refs.add(id));
  const targets = await store.entriesByIds([...refs]);
  const packs = [...new Set(targets.map((t) => t.packId).filter((id) => id !== packId))].sort();
  const current = await store.dependenciesOf(packId);
  if (current.join(",") !== packs.join(",")) await store.setDependencies(packId, packs);
  return packs;
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

export async function createPack(input: PackInput): Promise<IeePackRow> {
  const actor = await libraryAdmin();
  const data = PackInputSchema.parse(input);
  const pack = await withLibrary(async (store) => {
    if (await store.packBySlug(data.slug)) throw new AdminError("ieeSlugTaken", { slug: data.slug });
    return store.insertPack({
      slug: data.slug,
      names: data.names,
      description: data.description ?? null,
      iconFileId: null,
      visibility: data.visibility ?? "draft",
      defaultLocale: data.defaultLocale ?? "ru",
      isSystem: false,
      capabilities: [],
      minDslVersion: DSL_VERSION,
      createdBy: actor.id,
    });
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_pack_created",
    targetType: "iee_pack",
    targetId: pack.id,
    payload: { slug: pack.slug },
  });
  log.info("iee.library.pack_created", { actorId: actor.id, packId: pack.id, slug: pack.slug });
  return pack;
}

export async function updatePack(packId: string, input: PackPatchInput): Promise<IeePackRow> {
  const actor = await libraryAdmin();
  const data = PackPatchSchema.parse(input);
  const pack = await withLibrary(async (store) => {
    const current = await writablePack(store, packId);
    if (data.slug && data.slug !== current.slug) {
      const taken = await store.packBySlug(data.slug);
      if (taken) throw new AdminError("ieeSlugTaken", { slug: data.slug });
    }
    const updated = await store.updatePack(packId, {
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.names !== undefined ? { names: data.names } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.defaultLocale !== undefined ? { defaultLocale: data.defaultLocale } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    });
    return updated!;
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_pack_updated",
    targetType: "iee_pack",
    targetId: pack.id,
    payload: { slug: pack.slug, fields: Object.keys(data) },
  });
  return pack;
}

/** Archives or restores a pack. The system pack is never archived — seasons fall back on it. */
export async function setPackArchived(packId: string, archived: boolean): Promise<IeePackRow> {
  const actor = await libraryAdmin();
  const pack = await withLibrary(async (store) => {
    const current = await store.pack(packId);
    if (!current) throw new AdminError("ieePackNotFound");
    if (current.isSystem) throw new AdminError("ieeCoreReadOnly");
    if (isActive(current) !== archived) return current;
    return (await store.updatePack(packId, { archivedAt: archived ? new Date() : null }))!;
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: archived ? "iee_pack_archived" : "iee_pack_restored",
    targetType: "iee_pack",
    targetId: pack.id,
    payload: { slug: pack.slug },
  });
  return pack;
}

// ---------------------------------------------------------------------------
// Icons (§12)
// ---------------------------------------------------------------------------

/**
 * Stores the picture, then points the row at it. The files module writes
 * outside the transaction, so a refused change removes the picture it stored,
 * and the picture a change replaces goes once nothing else uses it.
 */
async function changeIcon<T extends { iconFileId: string | null }>(
  files: IconFiles,
  actor: LibraryActor,
  data: Uint8Array | null,
  apply: (store: LibraryStore, iconFileId: string | null) => Promise<{ row: T; previous: string | null }>,
): Promise<T> {
  const stored = data ? await files.put(data, actor) : null;
  let result: { row: T; previous: string | null };
  try {
    result = await withLibrary((store) => apply(store, stored?.id ?? null));
  } catch (e) {
    if (stored) await dropCreated(files, [stored]);
    throw e;
  }
  const { previous } = result;
  if (previous) await withLibrary((store) => discardUnused(store, files, [previous]));
  return result.row;
}

/** Sets an entry's icon — PNG or WebP, square, 64–512 px — or clears it with `null`. */
export async function setEntryIcon(
  entryId: string,
  data: Uint8Array | null,
  files: IconFiles = storageIconFiles(),
): Promise<IeeEntryRow> {
  const actor = await libraryAdmin();
  const entry = await changeIcon(files, actor, data, async (store, iconFileId) => {
    const { entry: current } = await writableEntry(store, entryId);
    const previous = current.iconFileId;
    if (previous === iconFileId) return { row: current, previous: null };
    return { row: (await store.updateEntry(entryId, { iconFileId }))!, previous };
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_entry_icon_set",
    targetType: "iee_entry",
    targetId: entry.id,
    payload: { slug: entry.slug, icon: data ? "set" : "cleared" },
  });
  return entry;
}

/** Sets a pack's icon, or clears it with `null`. */
export async function setPackIcon(
  packId: string,
  data: Uint8Array | null,
  files: IconFiles = storageIconFiles(),
): Promise<IeePackRow> {
  const actor = await libraryAdmin();
  const pack = await changeIcon(files, actor, data, async (store, iconFileId) => {
    const current = await writablePack(store, packId);
    const previous = current.iconFileId;
    if (previous === iconFileId) return { row: current, previous: null };
    return { row: (await store.updatePack(packId, { iconFileId }))!, previous };
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_pack_icon_set",
    targetType: "iee_pack",
    targetId: pack.id,
    payload: { slug: pack.slug, icon: data ? "set" : "cleared" },
  });
  return pack;
}

// ---------------------------------------------------------------------------
// Entries and drafts
// ---------------------------------------------------------------------------

/** The draft a new entry starts with — the editor's model owns it (`./draft`). */
export { skeletonDraft };

export async function createEntry(input: EntryInput): Promise<IeeEntryRow> {
  const actor = await libraryAdmin();
  const data = EntryInputSchema.parse(input);
  const entry = await withLibrary(async (store) => {
    await writablePack(store, data.packId);
    if (await store.entryBySlug(data.packId, data.slug)) throw new AdminError("ieeSlugTaken", { slug: data.slug });
    return store.insertEntry({
      packId: data.packId,
      slug: data.slug,
      kind: data.kind,
      draft: skeletonDraft(data.slug, data.kind),
      iconFileId: null,
      createdBy: actor.id,
    });
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_entry_created",
    targetType: "iee_entry",
    targetId: entry.id,
    payload: { packId: entry.packId, slug: entry.slug, kind: entry.kind },
  });
  return entry;
}

export const CopyEntrySchema = z.strictObject({
  packId: z.string().uuid(),
  slug: SlugSchema,
});
export type CopyEntryInput = z.infer<typeof CopyEntrySchema>;

/**
 * Copies an entry into a pack as a new entry (§10.2: "any core entry can be
 * copied into another pack and changed there"). The copy starts from the
 * source's latest revision — its draft when it has none — under the new slug;
 * its references keep pointing where they did, so a copied «Свиток порчи»
 * still hands out `core`'s «Болото». The icon is shared, not duplicated.
 */
export async function copyEntry(entryId: string, input: CopyEntryInput): Promise<IeeEntryRow> {
  const actor = await libraryAdmin();
  const data = CopyEntrySchema.parse(input);
  const { copy, source } = await withLibrary(async (store) => {
    const source = await store.entry(entryId);
    if (!source) throw new AdminError("ieeEntryNotFound");
    await writablePack(store, data.packId);
    if (await store.entryBySlug(data.packId, data.slug)) throw new AdminError("ieeSlugTaken", { slug: data.slug });
    const latest = source.latestRevisionId ? await store.revision(source.latestRevisionId) : null;
    const base = latest?.doc ?? source.draft;
    const draft =
      base !== null && typeof base === "object" && !Array.isArray(base)
        ? { ...(base as Record<string, unknown>), slug: data.slug }
        : skeletonDraft(data.slug, source.kind);
    const copy = await store.insertEntry({
      packId: data.packId,
      slug: data.slug,
      kind: source.kind,
      draft,
      iconFileId: source.iconFileId,
      createdBy: actor.id,
    });
    await syncDependencies(store, data.packId);
    return { copy, source };
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_entry_copied",
    targetType: "iee_entry",
    targetId: copy.id,
    payload: { from: source.id, fromSlug: source.slug, packId: copy.packId, slug: copy.slug },
  });
  return copy;
}

/** What resolves references while editing: the latest revision of the referenced entry. */
async function publishedFacts(store: LibraryStore, ids: readonly string[]): Promise<Map<string, EntryFacts>> {
  const entries = await store.entriesByIds(ids);
  const revisions = await store.revisionsByIds(entries.flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : [])));
  const facts = new Map<string, EntryFacts>();
  for (const r of revisions) {
    const parsed = EntryDocSchema.safeParse(r.doc);
    if (parsed.success) facts.set(r.entryId, factsOfDoc(r.entryId, parsed.data));
  }
  return facts;
}

export interface SavedDraft {
  entry: IeeEntryRow;
  /** The checks as of this draft — what the editor shows next to the fields. */
  check: CheckResult;
}

/**
 * Saves a draft as it is. Its `slug` and, before the first publish, its
 * `kind` carry over to the entry; references update the pack's dependencies.
 */
export async function saveDraft(entryId: string, draft: unknown): Promise<SavedDraft> {
  const actor = await libraryAdmin();
  if (draft === null || typeof draft !== "object" || Array.isArray(draft)) throw new AdminError("ieeDraftInvalid");
  if (JSON.stringify(draft).length > MAX_DRAFT_BYTES) throw new AdminError("ieeDraftTooLarge");
  const saved = await withLibrary(async (store) => {
    const { entry } = await writableEntry(store, entryId);
    const raw = draft as { slug?: unknown; kind?: unknown };
    const patch: { draft: unknown; slug?: string; kind?: "item" | "effect" } = { draft };
    if (typeof raw.slug === "string" && SLUG_RE.test(raw.slug) && raw.slug !== entry.slug) {
      const taken = await store.entryBySlug(entry.packId, raw.slug);
      if (taken && taken.id !== entry.id) throw new AdminError("ieeSlugTaken", { slug: raw.slug });
      patch.slug = raw.slug;
    }
    if ((raw.kind === "item" || raw.kind === "effect") && raw.kind !== entry.kind) {
      if (entry.latestRevisionId) throw new AdminError("ieeKindLocked");
      patch.kind = raw.kind;
    }
    const updated = (await store.updateEntry(entryId, patch))!;
    await syncDependencies(store, entry.packId);

    const facts = await publishedFacts(store, mentionedEntries(draft));
    const upgraded = upgradeDoc(draft);
    const check: CheckResult = upgraded.ok
      ? checkEntry(upgraded.doc, { entryId, resolve: (id) => facts.get(id) ?? null })
      : { doc: null, errors: [{ code: "schema", path: [], message: upgraded.reason }], warnings: [] };
    return { entry: updated, check };
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_entry_draft_saved",
    targetType: "iee_entry",
    targetId: saved.entry.id,
    payload: { slug: saved.entry.slug, errors: saved.check.errors.length },
  });
  return saved;
}

export async function setEntryArchived(entryId: string, archived: boolean): Promise<IeeEntryRow> {
  const actor = await libraryAdmin();
  const entry = await withLibrary(async (store) => {
    const current = await store.entry(entryId);
    if (!current) throw new AdminError("ieeEntryNotFound");
    await writablePack(store, current.packId);
    if (isActive(current) !== archived) return current;
    const updated = (await store.updateEntry(entryId, { archivedAt: archived ? new Date() : null }))!;
    await syncDependencies(store, current.packId);
    return updated;
  });
  await logAdminAction({
    actorId: actor.id,
    actionType: archived ? "iee_entry_archived" : "iee_entry_restored",
    targetType: "iee_entry",
    targetId: entry.id,
    payload: { slug: entry.slug },
  });
  return entry;
}

// ---------------------------------------------------------------------------
// Publish (§10.1, §14)
// ---------------------------------------------------------------------------

export type PublishState = "published" | "unchanged" | "blocked";

export interface PublishOutcome {
  entryId: string;
  slug: string;
  state: PublishState;
  /** The new revision, or the existing one with the same content. */
  revision: IeeEntryRevisionRow | null;
  errors: PublishIssue[];
  warnings: PublishIssue[];
}

/**
 * Publishes drafts of one pack inside the caller's transaction. Used by the
 * use cases below and by the pack import, which publishes as the system.
 */
/**
 * The publish checks of drafts of one pack, without writing anything: what
 * `publishInStore` would do, and what the pack screen shows before it does.
 */
export async function planInStore(
  store: LibraryStore,
  packId: string,
  entries: readonly IeeEntryRow[],
): Promise<{ candidates: IeeEntryRow[]; plans: PlannedEntry[] }> {
  const candidates = entries.filter(isActive);
  const all = (await store.entriesOfPack(packId)).filter(isActive);
  const others = all.filter((e) => !candidates.some((c) => c.id === e.id));
  const otherLatest = await store.revisionsByIds(others.flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : [])));
  const packmates = otherLatest.flatMap((r) => {
    const parsed = EntryDocSchema.safeParse(r.doc);
    return parsed.success ? [{ entryId: r.entryId, doc: parsed.data }] : [];
  });
  const refs = new Set(candidates.flatMap((c) => mentionedEntries(c.draft)));
  const facts = await publishedFacts(store, [...refs]);
  // What the scenarios play besides the drafts: the latest revisions of what they name.
  const docs = await latestDocs(store, [...refs]);

  const plans = await planWithScenarios({
    candidates: candidates.map((c) => ({
      entryId: c.id,
      slug: c.slug,
      kind: c.kind,
      published: c.latestRevisionId !== null,
      draft: c.draft,
    })),
    published: (id) => facts.get(id) ?? null,
    packmates,
    docs: (id) => docs.get(id) ?? null,
  });
  return { candidates, plans };
}

export async function publishInStore(
  store: LibraryStore,
  packId: string,
  entries: readonly IeeEntryRow[],
  actorId: string | null,
): Promise<PublishOutcome[]> {
  const { candidates, plans } = await planInStore(store, packId, entries);

  const outcomes: PublishOutcome[] = [];
  for (const [i, plan] of plans.entries()) {
    const entry = candidates[i]!;
    const base = { entryId: entry.id, slug: entry.slug, errors: plan.errors, warnings: plan.warnings };
    if (!plan.hash || !plan.doc) {
      outcomes.push({ ...base, state: "blocked", revision: null });
      continue;
    }
    const revisions = await store.revisionsOf(entry.id);
    const same = revisions.find((r) => r.contentHash === plan.hash);
    if (same) {
      outcomes.push({ ...base, state: "unchanged", revision: same });
      continue;
    }
    const revision = await store.insertRevision({
      id: revisionIdFor(entry.id, plan.hash),
      entryId: entry.id,
      number: (revisions.at(-1)?.number ?? 0) + 1,
      doc: plan.doc,
      dslVersion: plan.doc.dslVersion,
      contentHash: plan.hash,
      createdBy: actorId,
    });
    await store.updateEntry(entry.id, { latestRevisionId: revision.id });
    outcomes.push({ ...base, state: "published", revision });
  }
  await syncDependencies(store, packId);
  return outcomes;
}

async function auditPublished(actorId: string, outcomes: readonly PublishOutcome[]) {
  for (const o of outcomes) {
    if (o.state !== "published" || !o.revision) continue;
    await logAdminAction({
      actorId,
      actionType: "iee_entry_published",
      targetType: "iee_entry",
      targetId: o.entryId,
      payload: { slug: o.slug, number: o.revision.number, contentHash: o.revision.contentHash },
    });
  }
}

export async function publishEntry(entryId: string): Promise<PublishOutcome> {
  const actor = await libraryAdmin();
  const [outcome] = await withLibrary(async (store) => {
    const { entry } = await writableEntry(store, entryId);
    return publishInStore(store, entry.packId, [entry], actor.id);
  });
  await auditPublished(actor.id, [outcome!]);
  return outcome!;
}

/** Publishes every active entry of a pack whose draft differs from its revisions. */
export async function publishPack(packId: string): Promise<PublishOutcome[]> {
  const actor = await libraryAdmin();
  const outcomes = await withLibrary(async (store) => {
    await writablePack(store, packId);
    const entries = (await store.entriesOfPack(packId)).filter(isActive);
    return publishInStore(store, packId, entries, actor.id);
  });
  await auditPublished(actor.id, outcomes);
  return outcomes;
}

/** Every pack with its entries, archived ones included — a plain read for tools and tests; the screens use `./screens`. */
export async function libraryOverview(): Promise<{ packs: IeePackRow[]; entries: Record<string, IeeEntryRow[]> }> {
  await libraryAdmin();
  return withLibrary(async (store) => {
    const packs = await store.packs();
    const entries: Record<string, IeeEntryRow[]> = {};
    for (const p of packs) entries[p.id] = await store.entriesOfPack(p.id);
    return { packs, entries };
  });
}

export type { LibraryActor };
