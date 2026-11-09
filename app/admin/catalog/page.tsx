import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { IeeCatalogGrid } from "@/components/admin/IeeCatalogBrowser";
import {
  IeeCatalogTabs,
  isIeeCatalogTab,
  isLibraryTab,
  type IeeCatalogTabKey,
  type IeeTabContext,
} from "@/components/admin/IeeCatalogTabs";
import {
  EventTemplatesManager,
  type CatalogOption,
  type EventTemplateRow,
} from "@/components/admin/EventTemplatesManager";
import { LibraryBrowser } from "@/components/admin/constructor/LibraryBrowser";
import { PackEditor } from "@/components/admin/constructor/PackEditor";
import { EntryEditor } from "@/components/admin/constructor/EntryEditor";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { getT } from "@/lib/i18n/server";
import { catalogUsageByEntry, libraryViews } from "@/lib/modules/iee/catalog";
import { entryScreen, libraryScreen, packScreen } from "@/lib/modules/iee/library";
import { getEventUsageByKey, listEventTemplates } from "@/lib/modules/iee/repository";
import { AdminError } from "@/lib/modules/season/service/errors";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.iee.admin.metaTitle };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A library read that names a pack or an entry that is not there is a 404. */
async function orNotFound<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (e) {
    if (e instanceof AdminError && (e.code === "ieePackNotFound" || e.code === "ieeEntryNotFound")) notFound();
    throw e;
  }
}

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; pack?: string; entry?: string }>;
}) {
  // The layout guard is not enough on its own: layout and page render in
  // parallel, so without this the page's queries still run and their result is
  // streamed into the RSC payload of the redirect response. Every admin page
  // that reads data guards itself (see app/admin/users/page.tsx).
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (!isStaff(actor)) redirect("/");
  // The constructor is the admin's (D1); judges browse and keep the events.
  const admin = actor.role === "admin";

  const { t, locale } = await getT();
  const params = await searchParams;
  const requested = isIeeCatalogTab(params.tab) ? params.tab : null;
  const active: IeeCatalogTabKey =
    requested && (admin || !isLibraryTab(requested)) ? requested : admin ? "library" : "items";

  const header = <PageHeader kicker={t.iee.admin.kicker} title={t.iee.admin.pageTitle} />;

  if (active === "library") {
    const screen = await libraryScreen();
    return (
      <>
        {header}
        <IeeCatalogTabs active="library" admin counts={{ library: screen.entries.filter((e) => !e.archived).length }} />
        <LibraryBrowser packs={screen.packs} entries={screen.entries} />
      </>
    );
  }

  if (active === "pack") {
    if (!params.pack || !UUID_RE.test(params.pack)) redirect("/admin/catalog?tab=library");
    const screen = await orNotFound(() => packScreen(params.pack!));
    const context: IeeTabContext = { pack: { id: screen.pack.id, label: screen.pack.name[locale] } };
    return (
      <>
        {header}
        <IeeCatalogTabs active="pack" admin context={context} />
        <PackEditor screen={screen} />
      </>
    );
  }

  if (active === "entry") {
    if (!params.entry || !UUID_RE.test(params.entry)) redirect("/admin/catalog?tab=library");
    const screen = await orNotFound(() => entryScreen(params.entry!));
    const context: IeeTabContext = {
      pack: { id: screen.pack.id, label: screen.pack.name[locale] },
      entry: { id: screen.entry.id, label: screen.entry.name[locale] },
    };
    return (
      <>
        {header}
        <IeeCatalogTabs active="entry" admin context={context} />
        {/* Keyed by entry: opening another entry starts a fresh editor. */}
        <EntryEditor key={screen.entry.id} screen={screen} />
      </>
    );
  }

  // The library's entries as the client sees them, untuned — the catalog shows
  // what an entry is (its latest revision), a season decides how strong.
  const [templates, entryUsage, eventUsage, views] = await Promise.all([
    listEventTemplates(),
    catalogUsageByEntry(),
    getEventUsageByKey(),
    libraryViews(),
  ]);
  const items = views.filter((v) => v.kind === "item");
  const effects = views.filter((v) => v.kind === "effect");

  // A reward names a key; where packs share one, it is offered once.
  const optionsOf = (list: typeof views): CatalogOption[] => [
    ...new Map(list.map((v) => [v.key, { key: v.key, label: v.name[locale] }])).values(),
  ];
  const itemOptions = optionsOf(items);
  const effectOptions = optionsOf(effects);

  const rows: EventTemplateRow[] = templates.map((tpl) => ({
    id: tpl.id,
    key: tpl.key,
    title: tpl.title,
    descriptionMd: tpl.descriptionMd,
    reward: (tpl.reward ?? {}) as EventTemplateRow["reward"],
    requiresProof: tpl.requiresProof,
    defaultDeadlineHours: tpl.defaultDeadlineHours,
    isActive: tpl.isActive,
  }));

  return (
    <>
      {header}
      <IeeCatalogTabs
        active={active}
        admin={admin}
        counts={{
          items: items.length,
          effects: effects.length,
          events: rows.length,
        }}
      />

      {active !== "events" && (
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-zinc-400">{t.iee.admin.libraryNotice}</p>
      )}

      {active === "items" && <IeeCatalogGrid entries={items} usage={entryUsage} />}
      {active === "effects" && <IeeCatalogGrid entries={effects} usage={entryUsage} />}
      {active === "events" && (
        <EventTemplatesManager
          templates={rows}
          items={itemOptions}
          effects={effectOptions}
          usage={eventUsage}
        />
      )}
    </>
  );
}
