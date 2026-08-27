"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

import { useI18n } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function getLabel(
  segment: string,
  index: number,
  segments: string[],
  t: Dictionary,
): string {
  const key = segment.toLowerCase();
  const prev = segments[index - 1]?.toLowerCase();

  switch (key) {
    case "admin": {
      // /admin alone is the dashboard page
      if (segments.length === 1) return t.admin.nav.dashboard;
      return t.core.nav.admin;
    }
    case "board":
      return t.core.nav.board;
    case "leaderboard":
      return t.core.nav.leaderboard;
    case "feed":
      return t.core.nav.feed;
    case "rules":
      return t.core.nav.rules;
    case "seasons":
      return t.core.nav.seasons;
    case "dashboard":
      return (t.core.breadcrumbs as unknown as Record<string, string>).dashboard ?? t.core.dashboard.heading;
    case "players": {
      // generic "Players" listing; inside admin or public
      const b = (t.core.breadcrumbs as unknown as Record<string, string> | undefined)?.players;
      if (b) return b;
      // fallback to admin players heading word
      return "Players";
    }
    case "login":
      return t.core.auth.loginTitle;
    case "register":
      return t.core.auth.registerTitle;
    case "users":
      return t.admin.nav.users;
    case "games-catalog":
      return t.admin.nav.catalog;
    case "audit":
      return t.admin.nav.audit;
    case "rerolls":
      return t.admin.nav.rerolls;
    case "settings":
      return t.settings.heading;
    default: {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // keep raw
      }

      // UUID-like season id — shorten to keep breadcrumbs compact
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded)) {
        return `${decoded.slice(0, 8)}…`;
      }

      // username segment after /players/
      if (prev === "players") return `@${decoded}`;

      // keep slug as-is (run-1, my-season etc.); avoid replacing hyphens
      return decoded;
    }
  }
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { t } = useI18n();

  if (!pathname) return null;

  const segments = pathname.split("/").filter(Boolean);

  const homeLabel = t.core.nav.home;

  // Build crumbs: always start with Home
  const crumbs: Array<{ href: string; label: string; isLast: boolean }> = [];

  if (segments.length === 0) {
    crumbs.push({ href: "/", label: homeLabel, isLast: true });
  } else {
    crumbs.push({ href: "/", label: homeLabel, isLast: false });
    let acc = "";
    segments.forEach((seg, idx) => {
      acc += `/${seg}`;
      const label = getLabel(seg, idx, segments, t);
      const isLast = idx === segments.length - 1;
      crumbs.push({ href: acc, label, isLast });
    });
  }

  const ariaLabel =
    (t.core.breadcrumbs as unknown as Record<string, string> | undefined)?.ariaLabel ?? "Breadcrumb";

  return (
    <nav aria-label={ariaLabel} className="w-full">
      <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest sm:text-xs">
        {crumbs.map((crumb, idx) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {idx > 0 && (
              <span aria-hidden className="text-dim/60">
                <ChevronRightIcon className="inline-block h-3 w-3" />
              </span>
            )}
            {crumb.isLast ? (
              <span
                aria-current="page"
                className="max-w-[14rem] truncate text-amber sm:max-w-none"
                title={crumb.label}
              >
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="max-w-[10rem] truncate text-dim transition-colors hover:text-amber sm:max-w-none"
                title={crumb.label}
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
