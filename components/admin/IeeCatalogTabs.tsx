import Link from "next/link";
import {
  BoltIcon,
  CubeIcon,
  FlagIcon,
  PencilSquareIcon,
  RectangleStackIcon,
  Square3Stack3DIcon,
} from "@heroicons/react/24/outline";

import { getT } from "@/lib/i18n/server";

/** The constructor's screens (admin only) — the library, a pack, an entry. */
const LIBRARY_TABS = ["library", "pack", "entry"] as const;
/** The browse tabs every staff member sees. */
const BROWSE_TABS = [
  { key: "items", icon: CubeIcon },
  { key: "effects", icon: BoltIcon },
  { key: "events", icon: FlagIcon },
] as const;

export type IeeLibraryTabKey = (typeof LIBRARY_TABS)[number];
export type IeeCatalogTabKey = IeeLibraryTabKey | (typeof BROWSE_TABS)[number]["key"];

export function isIeeCatalogTab(value: unknown): value is IeeCatalogTabKey {
  return (LIBRARY_TABS as readonly unknown[]).includes(value) || BROWSE_TABS.some((t) => t.key === value);
}

export function isLibraryTab(value: unknown): value is IeeLibraryTabKey {
  return (LIBRARY_TABS as readonly unknown[]).includes(value);
}

/** What the pack and entry tabs point at, when one is open. */
export interface IeeTabContext {
  pack?: { id: string; label: string };
  entry?: { id: string; label: string };
}

function TabLink({
  href,
  active,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`-mb-px inline-flex max-w-[16rem] items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-display text-xs uppercase tracking-widest transition-colors ${
        active
          ? "border-amber bg-amber/10 text-amber"
          : "border-transparent text-zinc-400 hover:border-amber/40 hover:text-amber"
      }`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`ml-0.5 inline-flex min-w-[20px] items-center justify-center border px-1 py-px font-mono text-[10px] leading-none [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${
            active ? "border-amber bg-amber text-black" : "border-[#3d3d34] bg-[#1a1a1a] text-amber"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/**
 * Catalog tab strip. Admins get the constructor first — Library, then the
 * pack and the entry they have open — and everyone gets the browse tabs:
 * Items / Effects / Events. Mirrors SeasonTabs.
 */
export async function IeeCatalogTabs({
  active,
  counts,
  admin = false,
  context = {},
}: {
  active: IeeCatalogTabKey;
  counts?: Partial<Record<IeeCatalogTabKey, number>>;
  admin?: boolean;
  context?: IeeTabContext;
}) {
  const { t } = await getT();
  const labels = {
    items: t.iee.admin.tabs.items,
    effects: t.iee.admin.tabs.effects,
    events: t.iee.admin.tabs.events,
  };
  const e = t.ieeEditor.tabs;

  return (
    <nav className="mb-6 flex flex-wrap items-stretch gap-1 border-b border-[#3d3d34]">
      {admin && (
        <>
          <TabLink
            href="/admin/catalog?tab=library"
            active={active === "library"}
            icon={RectangleStackIcon}
            label={e.library}
            count={counts?.library}
          />
          {context.pack && (
            <TabLink
              href={`/admin/catalog?tab=pack&pack=${context.pack.id}`}
              active={active === "pack"}
              icon={Square3Stack3DIcon}
              label={`${e.pack}: ${context.pack.label}`}
            />
          )}
          {context.entry && (
            <TabLink
              href={`/admin/catalog?tab=entry&entry=${context.entry.id}`}
              active={active === "entry"}
              icon={PencilSquareIcon}
              label={`${e.entry}: ${context.entry.label}`}
            />
          )}
          <span className="mx-1 my-2 w-px bg-[#3d3d34]" aria-hidden />
        </>
      )}
      {BROWSE_TABS.map(({ key, icon }) => (
        <TabLink
          key={key}
          href={`/admin/catalog?tab=${key}`}
          active={active === key}
          icon={icon}
          label={labels[key]}
          count={counts?.[key]}
        />
      ))}
    </nav>
  );
}
