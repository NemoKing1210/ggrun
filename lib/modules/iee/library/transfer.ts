/**
 * Moving packs between installations (docs/IEE_CONSTRUCTOR_SPEC.md §11).
 *
 * Export writes a pack's published entries — the latest revision of each, or
 * the whole history on request. Import matches packs and entries by **UUID**
 * and revisions by **content hash**: importing what is already there adds
 * nothing, and the same file imported into an empty database exports back as
 * the same manifest. Every imported document passes the publish checks, every
 * reference must stay inside the pack or its declared dependencies, and an
 * import is all or nothing — one transaction.
 *
 * `core` (§10.2) is imported the same way, by the seed and at boot, as the
 * system; an admin's import may not overwrite it unless the install is a
 * development one (`IEE_CORE_EDITABLE=1`).
 *
 * Icons travel as files under `icons/` (§12). An import stores them before
 * its transaction — the files module writes outside it — and removes what it
 * stored if the import is refused; a file that names no icon for a pack or an
 * entry leaves the installed one alone.
 */
import type { IeeEntryRow, IeePackRow } from "@/db/schema";
import {
  canonicalJson,
  checkEntry,
  checkEntrySet,
  DSL_VERSION,
  EntryDocSchema,
  upgradeDoc,
  type EntryDoc,
  type EntryFacts,
} from "@/lib/engine/iee/dsl";
import { logAdminAction } from "@/lib/infrastructure/events";
import { log } from "@/lib/infrastructure/logger";
import { isFileError } from "@/lib/modules/files/service/errors";
import { AdminError } from "@/lib/modules/season/service/errors";

import { coreEditable, libraryAdmin, withLibrary, type LibraryActor } from "./context";
import {
  decodeGgpack,
  encodeGgpack,
  GGPACK_FORMAT_VERSION,
  GgpackError,
  revisionIdFor,
  type GgpackManifest,
} from "./ggpack";
import { discardUnused, dropCreated, iconPath, storageIconFiles, type IconFiles, type StoredIcon } from "./icons";
import { contentHash, factsOfDoc } from "./publish";
import { runEntryScenarios, scenarioIssues } from "../sim/scenarios";
import { mentionedEntries } from "./refs";
import { latestDocs } from "./scenarios";
import { syncDependencies } from "./service";
import { isActive, type LibraryStore } from "./store";

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Code-point order: the same on every machine, unlike `localeCompare`. */
const bySlug = (a: { slug: string }, b: { slug: string }) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

export interface ExportOptions {
  /** Every revision instead of the latest one of each entry. */
  history?: boolean;
  now?: Date;
}

export async function buildManifest(store: LibraryStore, packId: string, options: ExportOptions = {}): Promise<GgpackManifest> {
  const pack = await store.pack(packId);
  if (!pack) throw new AdminError("ieePackNotFound");

  const entries = (await store.entriesOfPack(packId)).filter((e) => isActive(e) && e.latestRevisionId !== null);
  const manifestEntries: GgpackManifest["entries"] = [];
  for (const entry of entries) {
    const all = await store.revisionsOf(entry.id);
    const latest = all.find((r) => r.id === entry.latestRevisionId) ?? all.at(-1)!;
    const chosen = options.history ? all : [latest];
    manifestEntries.push({
      id: entry.id,
      slug: entry.slug,
      kind: entry.kind,
      revisions: chosen.map((r) => ({ number: r.number, contentHash: r.contentHash, doc: r.doc })),
    });
  }

  // The packs the exported documents reach — not the ones a draft does, which
  // would make an importer fetch a pack the file never uses.
  const own = new Set(manifestEntries.map((e) => e.id));
  const reached = new Set<string>();
  for (const e of manifestEntries) {
    for (const r of e.revisions) for (const id of mentionedEntries(r.doc)) if (!own.has(id)) reached.add(id);
  }
  const depIds = [...new Set((await store.entriesByIds([...reached])).map((e) => e.packId))].filter((id) => id !== packId);
  const deps = (await Promise.all(depIds.map((id) => store.pack(id)))).flatMap((p) => (p ? [{ id: p.id, slug: p.slug }] : []));

  return {
    format: "ggpack",
    formatVersion: GGPACK_FORMAT_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    dslVersion: DSL_VERSION,
    pack: {
      id: pack.id,
      slug: pack.slug,
      names: pack.names as GgpackManifest["pack"]["names"],
      ...(pack.description ? { description: pack.description as GgpackManifest["pack"]["names"] } : {}),
      defaultLocale: pack.defaultLocale as GgpackManifest["pack"]["defaultLocale"],
      capabilities: [...pack.capabilities].sort(),
      minDslVersion: pack.minDslVersion,
      dependencies: deps.sort(bySlug),
    },
    entries: manifestEntries.sort(bySlug),
  };
}

/** The pack icon's name in the file; an entry may be called `_pack` too. */
const PACK_ICON = "_pack";

/** A pack as a file's contents: the manifest and the icons it names (§11, §12). */
export async function buildPackFile(
  store: LibraryStore,
  packId: string,
  files: IconFiles,
  options: ExportOptions = {},
): Promise<{ manifest: GgpackManifest; icons: Map<string, Uint8Array> }> {
  const manifest = await buildManifest(store, packId, options);
  const icons = new Map<string, Uint8Array>();
  const add = async (fileId: string | null, name: string): Promise<string | undefined> => {
    const file = fileId ? await files.read(fileId) : null;
    if (!file) return undefined;
    const path = iconPath(name, file.mimeType);
    icons.set(path, file.data);
    return path;
  };
  const rows = new Map((await store.entriesOfPack(packId)).map((e) => [e.id, e]));
  const packName = manifest.entries.some((e) => e.slug === PACK_ICON) ? `${PACK_ICON}_icon` : PACK_ICON;
  const packIcon = await add((await store.pack(packId))?.iconFileId ?? null, packName);
  if (packIcon) manifest.pack.icon = packIcon;
  for (const entry of manifest.entries) {
    const icon = await add(rows.get(entry.id)?.iconFileId ?? null, entry.slug);
    if (icon) entry.icon = icon;
  }
  return { manifest, icons };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportState = "added" | "updated" | "unchanged";

export interface ImportReport {
  pack: { id: string; slug: string; state: ImportState };
  entries: { id: string; slug: string; state: ImportState; revisionsAdded: number; revisionsKept: number }[];
  /** Entries whose local, unpublished draft was kept rather than replaced. */
  draftsKept: string[];
  /** Icon files the import replaced — removed afterwards when nothing else uses them. */
  iconsReplaced: string[];
}

export interface ImportOptions {
  actorId: string | null;
  /** The seed and boot import `core` as the system pack. */
  system: boolean;
  /** The file's icons, stored beforehand: file id by path. */
  icons?: ReadonlyMap<string, string>;
}

const invalid = (reason: string) => new AdminError("ieePackInvalid", { reason });

interface ParsedEntry {
  manifest: GgpackManifest["entries"][number];
  /** Parsed revision documents, in manifest order. */
  docs: EntryDoc[];
}

/** Frame checks that need no database: versions, hashes, numbering, kinds and slugs. */
function parseManifest(manifest: GgpackManifest): ParsedEntry[] {
  if (manifest.dslVersion > DSL_VERSION || manifest.pack.minDslVersion > DSL_VERSION) {
    throw new AdminError("ieePackTooNew", { version: String(Math.max(manifest.dslVersion, manifest.pack.minDslVersion)) });
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  return manifest.entries.map((entry) => {
    if (ids.has(entry.id) || slugs.has(entry.slug)) throw invalid(`${entry.slug}: appears twice`);
    ids.add(entry.id);
    slugs.add(entry.slug);
    const hashes = new Set<string>();
    let previous = 0;
    const docs = entry.revisions.map((revision) => {
      if (revision.number <= previous) throw invalid(`${entry.slug}: revisions are not in order`);
      previous = revision.number;
      if (contentHash(revision.doc) !== revision.contentHash) throw invalid(`${entry.slug}: revision ${revision.number} does not match its hash`);
      if (hashes.has(revision.contentHash)) throw invalid(`${entry.slug}: revision ${revision.number} repeats an earlier one`);
      hashes.add(revision.contentHash);
      const upgraded = upgradeDoc(revision.doc);
      if (!upgraded.ok) throw invalid(`${entry.slug}: revision ${revision.number} — ${upgraded.reason}`);
      const parsed = EntryDocSchema.safeParse(upgraded.doc);
      if (!parsed.success) {
        const first = parsed.error.issues[0]!;
        throw invalid(`${entry.slug}: revision ${revision.number} — ${first.path.join(".")}: ${first.message}`);
      }
      if (parsed.data.kind !== entry.kind) throw invalid(`${entry.slug}: revision ${revision.number} is not an ${entry.kind}`);
      return parsed.data;
    });
    if (docs.at(-1)!.slug !== entry.slug) throw invalid(`${entry.slug}: the latest revision is called ${docs.at(-1)!.slug}`);
    return { manifest: entry, docs };
  });
}

/**
 * Publish checks (§14) on every imported document; references kept inside the
 * pack and its declared dependencies; the set checks over the pack as it will
 * be — the incoming entries and the ones the installation already has.
 */
async function checkImported(
  store: LibraryStore,
  manifest: GgpackManifest,
  entries: readonly ParsedEntry[],
  existing: IeePackRow | null,
): Promise<void> {
  const own = new Map(entries.map((e) => [e.manifest.id, e.docs.at(-1)!]));
  const outside = new Set<string>();
  for (const e of entries) for (const doc of e.docs) for (const id of mentionedEntries(doc)) if (!own.has(id)) outside.add(id);
  const outsideEntries = await store.entriesByIds([...outside]);
  const allowed = new Set([manifest.pack.id, ...manifest.pack.dependencies.map((d) => d.id)]);
  for (const target of outsideEntries) {
    if (!allowed.has(target.packId)) {
      const slug = (await store.pack(target.packId))?.slug ?? target.packId;
      throw invalid(`references an entry of ${slug}, which is not a dependency`);
    }
  }
  const packmates = existing
    ? (await store.entriesOfPack(existing.id)).filter((e) => isActive(e) && e.latestRevisionId !== null && !own.has(e.id))
    : [];
  const latestIds = [...outsideEntries, ...packmates].flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : []));
  const facts = new Map<string, EntryFacts>();
  const packmateDocs: { entryId: string; doc: EntryDoc }[] = [];
  const packmateIds = new Set(packmates.map((e) => e.id));
  for (const r of await store.revisionsByIds(latestIds)) {
    const upgraded = upgradeDoc(r.doc);
    const parsed = upgraded.ok ? EntryDocSchema.safeParse(upgraded.doc) : null;
    if (!parsed?.success) continue;
    facts.set(r.entryId, factsOfDoc(r.entryId, parsed.data));
    if (packmateIds.has(r.entryId)) packmateDocs.push({ entryId: r.entryId, doc: parsed.data });
  }
  for (const [id, doc] of own) facts.set(id, factsOfDoc(id, doc));
  const resolve = (id: string) => facts.get(id) ?? null;

  for (const e of entries) {
    for (const [i, doc] of e.docs.entries()) {
      const result = checkEntry(doc, { entryId: e.manifest.id, resolve });
      if (result.errors.length > 0) {
        const first = result.errors[0]!;
        throw invalid(`${e.manifest.slug}: revision ${e.manifest.revisions[i]!.number} — ${first.message}`);
      }
    }
  }
  const set = checkEntrySet([...entries.map((e) => ({ entryId: e.manifest.id, doc: e.docs.at(-1)! })), ...packmateDocs]);
  if (set.errors.length > 0) throw invalid(set.errors[0]!.message);

  // Scenarios (§5.5): the revision each entry will play proves what it
  // promises. Older revisions are history — they passed when they were made.
  const named = await latestDocs(store, [...outside, ...packmates.map((e) => e.id)]);
  const docOf = (id: string) => own.get(id) ?? named.get(id) ?? null;
  for (const e of entries) {
    const doc = e.docs.at(-1)!;
    if (!doc.scenarios || doc.scenarios.length === 0) continue;
    const issues = scenarioIssues(await runEntryScenarios({ entryId: e.manifest.id, doc, docOf }));
    if (issues.length > 0) throw invalid(`${e.manifest.slug}: ${issues[0]!.message}`);
  }
}

/**
 * Everything that can refuse an import, checked before anything is written —
 * the transaction would undo a half-written import anyway, but an import that
 * cannot succeed should not start.
 */
async function preflight(
  store: LibraryStore,
  manifest: GgpackManifest,
  entries: readonly ParsedEntry[],
  options: ImportOptions,
): Promise<IeePackRow | null> {
  for (const dep of manifest.pack.dependencies) {
    if (!(await store.pack(dep.id))) throw new AdminError("ieePackDependencyMissing", { slug: dep.slug });
  }
  const existing = await store.pack(manifest.pack.id);
  if (existing?.isSystem && !options.system && !coreEditable()) throw new AdminError("ieeCoreReadOnly");
  const slugOwner = await store.packBySlug(manifest.pack.slug);
  if (slugOwner && slugOwner.id !== manifest.pack.id) throw new AdminError("ieeSlugTaken", { slug: manifest.pack.slug });

  for (const { manifest: me } of entries) {
    const local = await store.entry(me.id);
    if (local && local.packId !== manifest.pack.id) throw new AdminError("ieeEntryInOtherPack", { slug: me.slug });
    if (local && local.kind !== me.kind) throw new AdminError("ieeKindLocked");
    // A slug held by another entry of the pack refuses the import, even when
    // that entry is renamed by the same file: renames are applied one by one.
    const holder = existing ? await store.entryBySlug(existing.id, me.slug) : null;
    if (holder && holder.id !== me.id) throw new AdminError("ieeSlugTaken", { slug: me.slug });
  }

  await checkImported(store, manifest, entries, existing);
  return existing;
}

export async function importInStore(store: LibraryStore, manifest: GgpackManifest, options: ImportOptions): Promise<ImportReport> {
  const entries = parseManifest(manifest);
  const existing = await preflight(store, manifest, entries, options);

  // A path the file names is an icon to set; no path leaves the installed one.
  const iconOf = (path: string | undefined): string | undefined => (path ? options.icons?.get(path) : undefined);
  const iconsReplaced: string[] = [];

  // --- the pack ---------------------------------------------------------------
  const meta = {
    names: manifest.pack.names,
    description: manifest.pack.description ?? null,
    defaultLocale: manifest.pack.defaultLocale,
    capabilities: [...manifest.pack.capabilities].sort(),
    minDslVersion: manifest.pack.minDslVersion,
  };
  let pack: IeePackRow;
  let packState: ImportState;
  if (!existing) {
    pack = await store.insertPack({
      id: manifest.pack.id,
      slug: manifest.pack.slug,
      ...meta,
      iconFileId: iconOf(manifest.pack.icon) ?? null,
      visibility: "library",
      isSystem: options.system,
      createdBy: options.actorId,
    });
    packState = "added";
  } else {
    const changed: Record<string, unknown> = {};
    if (existing.slug !== manifest.pack.slug) changed.slug = manifest.pack.slug;
    // Compared canonically: jsonb hands keys back in its own order.
    for (const [key, value] of Object.entries(meta)) {
      if (canonicalJson((existing as Record<string, unknown>)[key] ?? null) !== canonicalJson(value)) changed[key] = value;
    }
    const icon = iconOf(manifest.pack.icon);
    if (icon !== undefined && icon !== existing.iconFileId) {
      changed.iconFileId = icon;
      if (existing.iconFileId) iconsReplaced.push(existing.iconFileId);
    }
    pack = Object.keys(changed).length > 0 ? (await store.updatePack(existing.id, changed))! : existing;
    packState = Object.keys(changed).length > 0 ? "updated" : "unchanged";
  }

  // --- entries and revisions ----------------------------------------------------
  const report: ImportReport = {
    pack: { id: pack.id, slug: pack.slug, state: packState },
    entries: [],
    draftsKept: [],
    iconsReplaced,
  };
  for (const { manifest: me, docs } of entries) {
    let entry: IeeEntryRow | null = await store.entry(me.id);
    let state: ImportState = "unchanged";
    if (!entry) {
      entry = await store.insertEntry({
        id: me.id,
        packId: pack.id,
        slug: me.slug,
        kind: me.kind,
        draft: docs.at(-1)!,
        iconFileId: iconOf(me.icon) ?? null,
        createdBy: options.actorId,
      });
      state = "added";
    } else {
      const patch: { slug?: string; iconFileId?: string } = {};
      if (entry.slug !== me.slug) patch.slug = me.slug;
      const icon = iconOf(me.icon);
      if (icon !== undefined && icon !== entry.iconFileId) {
        patch.iconFileId = icon;
        if (entry.iconFileId) iconsReplaced.push(entry.iconFileId);
      }
      if (Object.keys(patch).length > 0) {
        entry = (await store.updateEntry(entry.id, patch))!;
        state = "updated";
      }
    }

    const local = await store.revisionsOf(entry.id);
    const previousLatest = local.find((r) => r.id === entry!.latestRevisionId) ?? null;
    let number = local.at(-1)?.number ?? 0;
    let added = 0;
    for (const revision of me.revisions) {
      if (local.some((r) => r.contentHash === revision.contentHash)) continue;
      number += 1;
      const inserted = await store.insertRevision({
        id: revisionIdFor(entry.id, revision.contentHash),
        entryId: entry.id,
        number,
        // Stored as written, so the hash keeps describing it; the version is
        // the document's own — the registry upgrades it when it compiles.
        doc: revision.doc,
        dslVersion: (revision.doc as { dslVersion: number }).dslVersion,
        contentHash: revision.contentHash,
        createdBy: options.actorId,
      });
      local.push(inserted);
      added += 1;
    }
    const newest = local.at(-1)!;
    if (entry.latestRevisionId !== newest.id) entry = (await store.updateEntry(entry.id, { latestRevisionId: newest.id }))!;
    if (added > 0 && state !== "added") {
      // Replace the draft with what came in — unless it holds unpublished work.
      const pristine = previousLatest === null || contentHash(entry.draft) === previousLatest.contentHash;
      if (pristine) await store.updateEntry(entry.id, { draft: docs.at(-1)! });
      else report.draftsKept.push(entry.slug);
      state = "updated";
    }
    report.entries.push({ id: entry.id, slug: entry.slug, state, revisionsAdded: added, revisionsKept: me.revisions.length - added });
  }

  await syncDependencies(store, pack.id);
  return report;
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

function decodeOrRefuse(bytes: Uint8Array) {
  try {
    return decodeGgpack(bytes);
  } catch (e) {
    if (e instanceof GgpackError) throw invalid(e.message);
    throw e;
  }
}

/**
 * Stores a file's icons, imports it, and settles the icon files: the ones it
 * stored are removed again if the import is refused, the ones it replaced once
 * nothing uses them.
 */
async function runImport(
  bytes: Uint8Array,
  options: Omit<ImportOptions, "icons">,
  actor: LibraryActor | null,
  files: IconFiles,
): Promise<ImportReport> {
  const { manifest, icons } = decodeOrRefuse(bytes);
  const stored = new Map<string, StoredIcon>();
  try {
    for (const [path, data] of icons) {
      try {
        stored.set(path, await files.put(data, actor));
      } catch (e) {
        // Not an icon the category allows (type, size, dimensions, square).
        if (isFileError(e)) throw invalid(`${path}: ${e.code}`);
        throw e;
      }
    }
    const ids = new Map([...stored].map(([path, icon]) => [path, icon.id]));
    const report = await withLibrary((store) => importInStore(store, manifest, { ...options, icons: ids }));
    if (report.iconsReplaced.length > 0) await withLibrary((store) => discardUnused(store, files, report.iconsReplaced));
    return report;
  } catch (e) {
    await dropCreated(files, stored.values());
    throw e;
  }
}

/** An admin's import of a `.ggpack` file. */
export async function importPack(bytes: Uint8Array, files: IconFiles = storageIconFiles()): Promise<ImportReport> {
  const actor = await libraryAdmin();
  const report = await runImport(bytes, { actorId: actor.id, system: false }, actor, files);
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_pack_imported",
    targetType: "iee_pack",
    targetId: report.pack.id,
    payload: {
      slug: report.pack.slug,
      pack: report.pack.state,
      entriesAdded: report.entries.filter((e) => e.state === "added").length,
      revisionsAdded: report.entries.reduce((n, e) => n + e.revisionsAdded, 0),
    },
  });
  return report;
}

/** The seed's and the boot's import of a system pack (`core`). No actor, so no audit row — a log line. */
export async function importSystemPack(bytes: Uint8Array, files: IconFiles = storageIconFiles()): Promise<ImportReport> {
  const report = await runImport(bytes, { actorId: null, system: true }, null, files);
  log.info("iee.library.system_pack_imported", {
    slug: report.pack.slug,
    pack: report.pack.state,
    revisionsAdded: report.entries.reduce((n, e) => n + e.revisionsAdded, 0),
  });
  return report;
}

/**
 * An import from the command line (`pnpm iee:import <file>`). Shell access
 * stands in for the admin: no audit row, the terminal is the record — and the
 * system pack stays read-only unless the install is a development one.
 */
export async function importPackFromShell(bytes: Uint8Array, files: IconFiles = storageIconFiles()): Promise<ImportReport> {
  const report = await runImport(bytes, { actorId: null, system: false }, null, files);
  log.info("iee.library.pack_imported_from_shell", { slug: report.pack.slug, pack: report.pack.state });
  return report;
}

/** An admin's export: the file name and bytes of a `.ggpack`, icons included. */
export async function exportPack(
  packId: string,
  options: ExportOptions = {},
  files: IconFiles = storageIconFiles(),
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const actor = await libraryAdmin();
  const { manifest, icons } = await withLibrary((store) => buildPackFile(store, packId, files, options));
  const bytes = encodeGgpack(manifest, icons);
  await logAdminAction({
    actorId: actor.id,
    actionType: "iee_pack_exported",
    targetType: "iee_pack",
    targetId: packId,
    payload: { slug: manifest.pack.slug, entries: manifest.entries.length, history: options.history === true },
  });
  return { fileName: `${manifest.pack.slug}.ggpack`, bytes };
}
