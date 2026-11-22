/**
 * Screens for the constructor's component tests: `core` as references, a pack
 * of one's own, an entry screen around any document. Test-only.
 */
import { render } from "@testing-library/react";

import { ToastProvider } from "@/components/ui/toast";
import { CORE_DOCS, CORE_PACK_ID } from "@/lib/engine/iee/core-docs";
import { fillLocales, powerTable, type EntryDoc } from "@/lib/engine/iee/dsl";
import { I18nProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { BASE_TAGS } from "@/lib/modules/iee/library/draft";
import type { EntryScreen, EntrySummary, PackSummary, RefOption } from "@/lib/modules/iee/library/screens";

export const t = getDictionary("en");

export const PACK_ID = "22222222-2222-4222-8222-222222222222";
export const ENTRY_ID = "33333333-3333-4333-8333-333333333333";

export function renderWith(ui: React.ReactNode) {
  return render(
    <I18nProvider locale="en" t={t}>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );
}

const CORE_POWER = powerTable(new Map(CORE_DOCS.map(({ entryId, doc }) => [entryId, doc])));

/** Every `core` entry, published, as the editor resolves references. */
export function coreRefs(): RefOption[] {
  return CORE_DOCS.map(({ entryId, doc }) => ({
    entryId,
    slug: doc.slug,
    kind: doc.kind,
    character: doc.character,
    tags: doc.tags,
    name: doc.name,
    packId: CORE_PACK_ID,
    packSlug: "core",
    packName: { ru: "Ядро", en: "Core", uk: "Ядро" },
    published: true,
    available: true,
    glyph: doc.glyph ?? null,
    art: { iconUrl: null, packIconUrl: null, system: true },
    power: CORE_POWER.get(entryId) ?? null,
  }));
}

export function packSummary(over: Partial<PackSummary> = {}): PackSummary {
  return {
    id: PACK_ID,
    slug: "spooky",
    name: { ru: "Жуть", en: "Spooky", uk: "Жуть" },
    names: { ru: "Жуть", en: "Spooky" },
    description: null,
    descriptionText: null,
    iconUrl: null,
    visibility: "library",
    system: false,
    archived: false,
    editable: true,
    defaultLocale: "ru",
    dependencies: [{ id: CORE_PACK_ID, slug: "core", name: { ru: "Ядро", en: "Core", uk: "Ядро" } }],
    dependents: [],
    counts: { entries: 1, published: 0, changed: 0, unpublished: 1, archived: 0, withErrors: 1 },
    ...over,
  };
}

export function entrySummary(doc: EntryDoc, over: Partial<EntrySummary> = {}): EntrySummary {
  return {
    id: ENTRY_ID,
    packId: PACK_ID,
    slug: doc.slug,
    kind: doc.kind,
    name: fillLocales(doc.name),
    character: doc.character,
    rarity: doc.rarity,
    tags: [...doc.tags],
    glyph: doc.glyph ?? null,
    art: { iconUrl: null, packIconUrl: null, system: false },
    state: "new",
    archived: false,
    latestNumber: null,
    errors: 0,
    warnings: 0,
    ruleText: { ru: "", en: "", uk: "" },
    power: null,
    seasons: 0,
    ...over,
  };
}

export function entryScreenOf(
  doc: EntryDoc,
  over: { entry?: Partial<EntryScreen["entry"]>; pack?: Partial<PackSummary>; screen?: Partial<EntryScreen> } = {},
): EntryScreen {
  return {
    entry: { ...entrySummary(doc), kindLocked: false, editable: true, ...over.entry },
    pack: packSummary(over.pack),
    draft: doc,
    revisions: [],
    refs: coreRefs(),
    tags: [...BASE_TAGS].sort(),
    genres: ["action", "horror", "puzzle", "rpg"],
    referencedBy: [],
    seasons: [],
    targets: [{ id: PACK_ID, slug: "spooky", name: { ru: "Жуть", en: "Spooky", uk: "Жуть" } }],
    ...over.screen,
  };
}
