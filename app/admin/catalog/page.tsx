import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { IeeCatalogGrid } from "@/components/admin/IeeCatalogBrowser";
import {
  IeeCatalogTabs,
  isIeeCatalogTab,
  type IeeCatalogTabKey,
} from "@/components/admin/IeeCatalogTabs";
import {
  EventTemplatesManager,
  type CatalogOption,
  type EventTemplateRow,
} from "@/components/admin/EventTemplatesManager";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser, isStaff } from "@/lib/infrastructure/auth/session";
import { listEffects, listItems } from "@/lib/engine";
import { getT } from "@/lib/i18n/server";
import { dictText } from "@/lib/i18n/dict-text";
import {
  getEventUsageByKey,
  getIeeUsageByKey,
  listEventTemplates,
} from "@/lib/modules/iee/repository";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.iee.admin.metaTitle };
}

/** Resolves a dictionary path such as "iee.items.hexScroll.name". */
export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // The layout guard is not enough on its own: layout and page render in
  // parallel, so without this the page's queries still run and their result is
  // streamed into the RSC payload of the redirect response. Every admin page
  // that reads data guards itself (see app/admin/users/page.tsx).
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (!isStaff(actor)) redirect("/");

  const { t } = await getT();
  const { tab } = await searchParams;
  const active: IeeCatalogTabKey = isIeeCatalogTab(tab) ? tab : "items";

  const [templates, entryUsage, eventUsage] = await Promise.all([
    listEventTemplates(),
    getIeeUsageByKey(),
    getEventUsageByKey(),
  ]);

  const items = listItems();
  const effects = listEffects();

  const itemOptions: CatalogOption[] = items.map((d) => ({
    key: d.key,
    label: dictText(t, d.i18n.name),
  }));
  const effectOptions: CatalogOption[] = effects.map((d) => ({
    key: d.key,
    label: dictText(t, d.i18n.name),
  }));

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
      <PageHeader kicker={t.iee.admin.kicker} title={t.iee.admin.pageTitle} />
      <IeeCatalogTabs
        active={active}
        counts={{
          items: items.length,
          effects: effects.length,
          events: rows.length,
        }}
      />

      {active !== "events" && (
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-zinc-400">{t.iee.admin.hardcodedNotice}</p>
      )}

      {active === "items" && <IeeCatalogGrid kind="items" usage={entryUsage} />}
      {active === "effects" && <IeeCatalogGrid kind="effects" usage={entryUsage} />}
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
