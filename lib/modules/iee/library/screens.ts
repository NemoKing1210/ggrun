/**
 * What the constructor's three screens show (plan §6, task 3.1): the library,
 * a pack and an entry editor. Read models only — every change goes through
 * the use cases in `service.ts`.
 *
 * `buildLibraryModel` is pure and does the work: each entry's state against
 * its latest revision, its draft's checks and rule text, the facts other
 * drafts resolve it by. The loaders around it read the rows (admin-only) and
 * add what only the database knows — icons, the seasons that attach an entry.
 */
import type { IeeEntryRevisionRow, IeeEntryRow, IeePackRow } from "@/db/schema";
import type { EntryArt, Rarity } from "@/lib/engine";
import {
  powerTable,
  EntryDocSchema,
  fillLocales,
  upgradeDoc,
  type EntryDoc,
  type EntryFacts,
  type Locale,
  type Localized,
  type LocalizedText,
} from "@/lib/engine/iee/dsl";
import { db } from "@/lib/infrastructure/db";
import { catalogGenres } from "@/lib/modules/catalog/repository";
import { listSeasons } from "@/lib/modules/season/repository/seasons";
import { AdminError } from "@/lib/modules/season/service/errors";

import { artOf, iconUrls } from "../catalog/art";
import { catalogRowsOf } from "../catalog/repository";
import { coreEditable, libraryAdmin, withLibrary } from "./context";
import { analyzeDraft, BASE_TAGS, editableDraft } from "./draft";
import { contentHash, factsOfDoc, type PublishIssue } from "./publish";
import { referencedEntries } from "./refs";
import { planInStore } from "./service";
import { isActive, type LibraryStore } from "./store";

// ---------------------------------------------------------------------------
// Shapes (serializable — they cross into client components)
// ---------------------------------------------------------------------------

/** `new` — never published; `published` — the draft is the latest revision; `changed` — it differs. */
export type EntryState = "new" | "published" | "changed";

export interface PackRef {
  id: string;
  slug: string;
  name: LocalizedText;
}

export interface PackSummary extends PackRef {
  description: LocalizedText | null;
  /** The raw texts, for the edit form. */
  names: Localized;
  descriptionText: Localized | null;
  iconUrl: string | null;
  visibility: "draft" | "library";
  system: boolean;
  archived: boolean;
  /** Changes allowed: not archived, and not the system pack unless the install is a development one. */
  editable: boolean;
  defaultLocale: Locale;
  dependencies: PackRef[];
  dependents: PackRef[];
  counts: { entries: number; published: number; changed: number; unpublished: number; archived: number; withErrors: number };
}

export interface EntrySummary {
  id: string;
  packId: string;
  slug: string;
  kind: "item" | "effect";
  /** The draft's names, every locale filled. */
  name: LocalizedText;
  character: "bonus" | "penalty";
  rarity: Rarity;
  tags: string[];
  glyph: string | null;
  art: EntryArt;
  state: EntryState;
  archived: boolean;
  latestNumber: number | null;
  /** The draft's checks (§14). */
  errors: number;
  warnings: number;
  /** The draft's rule text — the part that checks clean. */
  ruleText: LocalizedText;
  power: number | null;
  /** Seasons that attach it. */
  seasons: number;
}

/** An entry a draft may reference — what checks, pickers and rule text resolve it by. */
export interface RefOption extends EntryFacts {
  packId: string;
  packSlug: string;
  packName: LocalizedText;
  /** Has a published revision: a reference resolves when published. Facts are the latest revision's then. */
  published: boolean;
  /** Offered in pickers — the entry and its pack are not archived. */
  available: boolean;
  glyph: string | null;
  art: EntryArt;
  /** Its power (§14) — the latest revision's, or the draft's before the first; null when it has none. */
  power: number | null;
}

export interface LibraryModel {
  packs: PackSummary[];
  entries: EntrySummary[];
  refs: RefOption[];
}

export interface LibraryInput {
  packs: readonly IeePackRow[];
  /** Every entry of every pack. */
  entries: readonly IeeEntryRow[];
  /** The latest revision of each entry that has one. */
  latest: readonly IeeEntryRevisionRow[];
  /** Pack id → the packs it depends on. */
  dependencies: Readonly<Record<string, readonly string[]>>;
  /** Live icon files, by file id. */
  iconUrls: ReadonlyMap<string, string>;
  /** Seasons attaching each entry, by entry id. */
  usage: Readonly<Record<string, number>>;
  coreEditable: boolean;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

function readDoc(raw: unknown): EntryDoc | null {
  const upgraded = upgradeDoc(raw);
  if (!upgraded.ok) return null;
  const parsed = EntryDocSchema.safeParse(upgraded.doc);
  return parsed.success ? parsed.data : null;
}

const localizedOrNull = (value: unknown): Localized | null =>
  value !== null && typeof value === "object" && typeof (value as { ru?: unknown }).ru === "string" ? (value as Localized) : null;

function packRef(pack: IeePackRow): PackRef {
  return { id: pack.id, slug: pack.slug, name: fillLocales(localizedOrNull(pack.names) ?? { ru: pack.slug }) };
}

export function buildLibraryModel(input: LibraryInput): LibraryModel {
  const packById = new Map(input.packs.map((p) => [p.id, p]));
  const latestById = new Map(input.latest.map((r) => [r.id, r]));

  // Facts first: every draft resolves every other entry by them.
  const refs: RefOption[] = [];
  const drafts = new Map<string, EntryDoc>();
  const sources = new Map<string, EntryDoc>();
  for (const e of input.entries) {
    const pack = packById.get(e.packId);
    if (!pack) continue;
    const draft = editableDraft(e.draft, e);
    drafts.set(e.id, draft);
    const latest = e.latestRevisionId ? latestById.get(e.latestRevisionId) : undefined;
    const doc = latest ? readDoc(latest.doc) : null;
    const source = doc ?? draft;
    sources.set(e.id, source);
    refs.push({
      ...factsOfDoc(e.id, source),
      // The entry's own slug and kind — the draft may be mid-edit.
      slug: e.slug,
      kind: e.kind,
      name: source.name.ru ? source.name : { ...source.name, ru: e.slug },
      packId: pack.id,
      packSlug: pack.slug,
      packName: packRef(pack).name,
      published: doc !== null,
      available: isActive(e) && isActive(pack),
      glyph: source.glyph ?? null,
      art: artOf({ entryIconFileId: e.iconFileId, packIconFileId: pack.iconFileId, system: pack.isSystem }, input.iconUrls),
      power: null,
    });
  }
  const refById = new Map(refs.map((r) => [r.entryId, r]));
  // Powers next: a grant is worth what it hands out.
  const powers = powerTable(
    new Map([...sources].filter(([, doc]) => doc.rules.length > 0)),
    (ref) => refById.get(ref.entry) ?? null,
  );
  for (const ref of refs) ref.power = powers.get(ref.entryId) ?? null;
  const powerOf = (id: string) => powers.get(id) ?? null;
  const published = (id: string): EntryFacts | null => {
    const ref = refById.get(id);
    return ref && ref.published ? ref : null;
  };
  const named = (id: string): EntryFacts | null => refById.get(id) ?? null;

  const entries: EntrySummary[] = [];
  for (const e of input.entries) {
    const draft = drafts.get(e.id);
    const ref = refById.get(e.id);
    if (!draft || !ref) continue;
    const latest = e.latestRevisionId ? latestById.get(e.latestRevisionId) : undefined;
    const parsed = readDoc(e.draft);
    const state: EntryState = !latest ? "new" : parsed && contentHash(parsed) === latest.contentHash ? "published" : "changed";
    const analysis = analyzeDraft(draft, { entryId: e.id, published, named, powerOf });
    entries.push({
      id: e.id,
      packId: e.packId,
      slug: e.slug,
      kind: e.kind,
      name: analysis.preview.name,
      character: draft.character,
      rarity: draft.rarity,
      tags: [...draft.tags],
      glyph: draft.glyph ?? null,
      art: ref.art,
      state,
      archived: !isActive(e),
      latestNumber: latest?.number ?? null,
      errors: analysis.errors.length,
      warnings: analysis.warnings.length,
      ruleText: analysis.preview.ruleText,
      power: analysis.power,
      seasons: input.usage[e.id] ?? 0,
    });
  }

  const dependents = new Map<string, string[]>();
  for (const [packId, deps] of Object.entries(input.dependencies)) {
    for (const dep of deps) dependents.set(dep, [...(dependents.get(dep) ?? []), packId]);
  }
  const refsOf = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const p = packById.get(id);
      return p ? [packRef(p)] : [];
    });

  const packs: PackSummary[] = input.packs.map((p) => {
    const mine = entries.filter((e) => e.packId === p.id);
    const active = mine.filter((e) => !e.archived);
    const names = localizedOrNull(p.names) ?? { ru: p.slug };
    const description = localizedOrNull(p.description);
    return {
      ...packRef(p),
      names,
      description: description ? fillLocales(description) : null,
      descriptionText: description,
      iconUrl: p.iconFileId ? (input.iconUrls.get(p.iconFileId) ?? null) : null,
      visibility: p.visibility,
      system: p.isSystem,
      archived: !isActive(p),
      editable: isActive(p) && (!p.isSystem || input.coreEditable),
      defaultLocale: (["ru", "en", "uk"].includes(p.defaultLocale) ? p.defaultLocale : "ru") as Locale,
      dependencies: refsOf(input.dependencies[p.id] ?? []),
      dependents: refsOf(dependents.get(p.id) ?? []),
      counts: {
        entries: active.length,
        published: active.filter((e) => e.state === "published").length,
        changed: active.filter((e) => e.state === "changed").length,
        unpublished: active.filter((e) => e.state === "new").length,
        archived: mine.length - active.length,
        withErrors: active.filter((e) => e.errors > 0).length,
      },
    };
  });

  return { packs, entries, refs };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadInput(store: LibraryStore): Promise<{ input: LibraryInput; entries: IeeEntryRow[] }> {
  const packs = await store.packs();
  const entries = (await Promise.all(packs.map((p) => store.entriesOfPack(p.id)))).flat();
  const latest = await store.revisionsByIds(entries.flatMap((e) => (e.latestRevisionId ? [e.latestRevisionId] : [])));
  const dependencies: Record<string, string[]> = {};
  for (const p of packs) dependencies[p.id] = await store.dependenciesOf(p.id);
  const fileIds = [...packs.map((p) => p.iconFileId), ...entries.map((e) => e.iconFileId)].filter(
    (id): id is string => id !== null,
  );
  const urls = await iconUrls(fileIds, db);
  const rows = await catalogRowsOf(entries.map((e) => e.id));
  const usage: Record<string, number> = {};
  for (const row of rows) usage[row.entryId] = (usage[row.entryId] ?? 0) + 1;
  return {
    input: { packs, entries, latest, dependencies, iconUrls: urls, usage, coreEditable: coreEditable() },
    entries,
  };
}

/** The library screen: every pack and every entry. */
export async function libraryScreen(): Promise<LibraryModel & { coreEditable: boolean }> {
  await libraryAdmin();
  return withLibrary(async (store) => {
    const { input } = await loadInput(store);
    return { ...buildLibraryModel(input), coreEditable: input.coreEditable };
  });
}

export interface RevisionSummary {
  id: string;
  number: number;
  createdAt: string;
  /** The content hash's first 12 characters — enough to tell revisions apart. */
  hash: string;
}

export interface PublishPreview {
  entryId: string;
  slug: string;
  /** `ready` — publishing makes a new revision; `blocked` — the checks refuse it. */
  state: "ready" | "blocked";
  errors: PublishIssue[];
  warnings: PublishIssue[];
}

export interface SeasonOption {
  id: string;
  title: string;
  status: "draft" | "active" | "paused" | "finished" | "archived";
  /** Entries of this pack (or this entry) the season attaches. */
  attached: number;
}

export interface PackScreen {
  pack: PackSummary;
  entries: (EntrySummary & { revisions: RevisionSummary[] })[];
  /** Entries whose draft differs from every revision, as publishing would see them. */
  publish: PublishPreview[];
  /** Seasons to attach the pack to, newest first. */
  seasons: SeasonOption[];
  /** Packs an entry may be copied into — those that may be changed. */
  targets: PackRef[];
}

/** Packs an admin may copy an entry into: not archived, not read-only. */
function copyTargets(model: LibraryModel): PackRef[] {
  return model.packs.filter((p) => p.editable).map(({ id, slug, name }) => ({ id, slug, name }));
}

function revisionSummary(r: IeeEntryRevisionRow): RevisionSummary {
  return { id: r.id, number: r.number, createdAt: r.createdAt.toISOString(), hash: r.contentHash.slice(0, 12) };
}

async function seasonsWith(
  entryIds: readonly string[],
): Promise<{ options: SeasonOption[]; rows: Awaited<ReturnType<typeof catalogRowsOf>> }> {
  const [seasons, rows] = await Promise.all([listSeasons(), catalogRowsOf(entryIds)]);
  const options = seasons
    .filter((s) => s.status !== "archived")
    .map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      attached: rows.filter((r) => r.seasonId === s.id).length,
    }));
  return { options, rows };
}

export async function packScreen(packId: string): Promise<PackScreen> {
  await libraryAdmin();
  const screen = await withLibrary(async (store) => {
    const { input, entries } = await loadInput(store);
    const model = buildLibraryModel(input);
    const pack = model.packs.find((p) => p.id === packId);
    if (!pack) throw new AdminError("ieePackNotFound");
    const mine = model.entries.filter((e) => e.packId === packId);
    const revisions = new Map<string, IeeEntryRevisionRow[]>();
    for (const e of mine) revisions.set(e.id, await store.revisionsOf(e.id));

    // Only drafts that would make a new revision: a draft equal to an older
    // revision publishes nothing, exactly as publishing decides.
    const rows = entries.filter((e) => e.packId === packId && isActive(e));
    const { candidates, plans } = await planInStore(store, packId, rows);
    const publish: PublishPreview[] = [];
    plans.forEach((plan, i) => {
      const entry = candidates[i]!;
      const known = (revisions.get(entry.id) ?? []).some((r) => r.contentHash === plan.hash);
      if (known) return;
      publish.push({
        entryId: entry.id,
        slug: entry.slug,
        state: plan.hash ? "ready" : "blocked",
        errors: plan.errors,
        warnings: plan.warnings,
      });
    });
    return {
      pack,
      entries: mine.map((e) => ({ ...e, revisions: (revisions.get(e.id) ?? []).map(revisionSummary) })),
      publish,
      targets: copyTargets(model),
    };
  });
  const { options } = await seasonsWith(screen.entries.map((e) => e.id));
  return { ...screen, seasons: options };
}

export interface EntryScreen {
  entry: EntrySummary & { kindLocked: boolean; editable: boolean };
  pack: PackSummary;
  /** The stored draft as the editor holds it. */
  draft: EntryDoc;
  revisions: RevisionSummary[];
  /** Every other entry, with what references resolve to. */
  refs: RefOption[];
  /** The base taxonomy and every tag the library uses, sorted. */
  tags: string[];
  /** The games catalog's genres, lowercase and sorted — what a rule of the next game names (wave C). */
  genres: string[];
  /** Entries whose draft or latest revision reference this one. */
  referencedBy: { entryId: string; slug: string; name: LocalizedText; packSlug: string }[];
  /** Seasons attaching this entry, and at which revision. */
  seasons: { id: string; title: string; status: SeasonOption["status"]; revisionNumber: number | null; enabled: boolean }[];
  /** Packs the entry may be copied into. */
  targets: PackRef[];
}

export async function entryScreen(entryId: string): Promise<EntryScreen> {
  await libraryAdmin();
  const screen = await withLibrary(async (store) => {
    const { input, entries } = await loadInput(store);
    const model = buildLibraryModel(input);
    const entry = model.entries.find((e) => e.id === entryId);
    const row = entries.find((e) => e.id === entryId);
    if (!entry || !row) throw new AdminError("ieeEntryNotFound");
    const pack = model.packs.find((p) => p.id === entry.packId)!;
    const revisions = await store.revisionsOf(entryId);

    const latestById = new Map(input.latest.map((r) => [r.id, r]));
    const referencedBy = entries
      .filter((e) => e.id !== entryId && isActive(e))
      .filter((e) => {
        const latest = e.latestRevisionId ? latestById.get(e.latestRevisionId) : undefined;
        return referencedEntries(e.draft).includes(entryId) || (latest !== undefined && referencedEntries(latest.doc).includes(entryId));
      })
      .map((e) => {
        const summary = model.entries.find((s) => s.id === e.id)!;
        return { entryId: e.id, slug: e.slug, name: summary.name, packSlug: model.packs.find((p) => p.id === e.packId)?.slug ?? "" };
      });

    const tags = new Set<string>(BASE_TAGS);
    for (const e of model.entries) e.tags.forEach((t) => tags.add(t));

    return {
      entry: { ...entry, kindLocked: row.latestRevisionId !== null, editable: pack.editable && !entry.archived },
      pack,
      draft: editableDraft(row.draft, row),
      revisions: revisions.map(revisionSummary),
      refs: model.refs.filter((r) => r.entryId !== entryId),
      tags: [...tags].sort(),
      referencedBy,
      targets: copyTargets(model),
      revisionNumbers: new Map(revisions.map((r) => [r.id, r.number])),
    };
  });
  const { options, rows } = await seasonsWith([entryId]);
  const genres = await catalogGenres();
  const seasons = options.flatMap((s) => {
    const row = rows.find((r) => r.seasonId === s.id);
    if (!row) return [];
    return [{ id: s.id, title: s.title, status: s.status, revisionNumber: screen.revisionNumbers.get(row.revisionId) ?? null, enabled: row.enabled }];
  });
  const { revisionNumbers: _numbers, ...rest } = screen;
  return { ...rest, genres, seasons };
}
