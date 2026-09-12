import Link from "next/link";
import { BoltIcon, CubeIcon, FlagIcon } from "@heroicons/react/24/outline";

import { getT } from "@/lib/i18n/server";

const TABS = [
  { key: "items", icon: CubeIcon },
  { key: "effects", icon: BoltIcon },
  { key: "events", icon: FlagIcon },
] as const;

export type IeeCatalogTabKey = (typeof TABS)[number]["key"];

export function isIeeCatalogTab(value: unknown): value is IeeCatalogTabKey {
  return TABS.some((t) => t.key === value);
}

/** Catalog tab strip: Items / Effects / Events. Mirrors SeasonTabs. */
export async function IeeCatalogTabs({
  active,
  counts,
}: {
  active: IeeCatalogTabKey;
  counts?: Partial<Record<IeeCatalogTabKey, number>>;
}) {
  const { t } = await getT();
  const labels: Record<IeeCatalogTabKey, string> = {
    items: t.iee.admin.tabs.items,
    effects: t.iee.admin.tabs.effects,
    events: t.iee.admin.tabs.events,
  };

  return (
    <nav className="mb-6 flex flex-wrap items-stretch gap-1 border-b border-[#3d3d34]">
      {TABS.map(({ key, icon: Icon }) => {
        const isActive = active === key;
        const count = counts?.[key];
        return (
          <Link
            key={key}
            href={`/admin/catalog?tab=${key}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-display text-xs uppercase tracking-widest transition-colors ${
              isActive
                ? "border-amber bg-amber/10 text-amber"
                : "border-transparent text-zinc-400 hover:border-amber/40 hover:text-amber"
            }`}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {labels[key]}
            {count !== undefined && count > 0 && (
              <span
                className={`ml-0.5 inline-flex min-w-[20px] items-center justify-center border px-1 py-px font-mono text-[10px] leading-none [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${
                  isActive
                    ? "border-amber bg-amber text-black"
                    : "border-[#3d3d34] bg-[#1a1a1a] text-amber"
                }`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
