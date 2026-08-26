"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Dictionary } from "@/lib/i18n/dictionaries";

export function SeasonTabs({ slug, t }: { slug: string; t: Dictionary }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/seasons/${slug}`, label: t.seasons.tabs.overview, exact: true },
    { href: `/seasons/${slug}/board`, label: t.seasons.tabs.board },
    { href: `/seasons/${slug}/leaderboard`, label: t.seasons.tabs.leaderboard },
    { href: `/seasons/${slug}/feed`, label: t.seasons.tabs.feed },
    { href: `/seasons/${slug}/rules`, label: t.seasons.tabs.rules },
  ];

  return (
    <nav className="flex flex-wrap gap-2 border-b border-[#3d3d34] pb-3">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-widest border ${
              isActive
                ? "border-amber bg-amber text-background"
                : "border-dim/40 bg-raised text-dim hover:brightness-125"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
