import Link from "next/link";
import { Cog8ToothIcon, MapIcon, UserGroupIcon } from "@heroicons/react/24/outline";

import { getT } from "@/lib/i18n/server";

const TABS = [
  { key: "settings", icon: Cog8ToothIcon },
  { key: "board", icon: MapIcon },
  { key: "players", icon: UserGroupIcon },
] as const;

export type SeasonTabKey = (typeof TABS)[number]["key"];

const paths: Record<SeasonTabKey, (id: string) => string> = {
  settings: (id) => `/admin/seasons/${id}`,
  board: (id) => `/admin/seasons/${id}/board`,
  players: (id) => `/admin/seasons/${id}/players`,
};

/** Season editor tab strip: Settings / Board / Players. */
export async function SeasonTabs({
  seasonId,
  active,
  playerCount = 0,
}: {
  seasonId: string;
  active: SeasonTabKey;
  playerCount?: number;
}) {
  const { t } = await getT();
  const labels: Record<SeasonTabKey, string> = {
    settings: t.admin.seasonTabs.settings,
    board: t.admin.seasonTabs.board,
    players: t.admin.seasonTabs.players,
  };

  return (
    <nav className="mb-6 flex flex-wrap items-stretch gap-1 border-b border-[#3d3d34]">
      {TABS.map(({ key, icon: Icon }) => {
        const isActive = active === key;
        return (
          <Link
            key={key}
            href={paths[key](seasonId)}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 font-display text-xs uppercase tracking-widest transition-colors ${
              isActive
                ? "border-amber bg-amber/10 text-amber"
                : "border-transparent text-zinc-400 hover:border-amber/40 hover:text-amber"
            }`}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {labels[key]}
            {key === "players" && playerCount > 0 && (
              <span
                className={`ml-0.5 inline-flex min-w-[20px] items-center justify-center border px-1 py-px font-mono text-[10px] leading-none [clip-path:polygon(2px_0,100%_0,100%_calc(100%-2px),calc(100%-2px)_100%,0_100%,0_2px)] ${
                  isActive
                    ? "border-amber bg-amber text-black"
                    : "border-[#3d3d34] bg-[#1a1a1a] text-amber"
                }`}
              >
                {playerCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}