import Link from "next/link";

import pkg from "@/package.json";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { format } from "@/lib/i18n/format";

const linkClass =
  "text-dim underline-offset-2 transition-colors hover:text-amber hover:underline";

/** External resources linked from the footer. */
const EXTERNAL_LINKS = [
  { href: "https://github.com/NemoKing1210/ggrun", label: "GitHub" },
  { href: "https://github.com/NemoKing1210", label: "NemoKing1210" },
] as const;

/**
 * Public site footer: brand block, section links and a legal bar.
 * Server component — all text comes from the session dictionary.
 */
export function SiteFooter({
  t,
  showAdmin,
  wide = false,
}: {
  t: Dictionary;
  showAdmin: boolean;
  /** Match the admin shell content width (max-w-7xl). */
  wide?: boolean;
}) {
  const navLinks = [
    { href: "/board", label: t.core.nav.board },
    { href: "/leaderboard", label: t.core.nav.leaderboard },
    { href: "/feed", label: t.core.nav.feed },
    { href: "/rules", label: t.core.nav.rules },
    { href: "/seasons", label: t.core.nav.seasons },
  ];

  return (
    <footer className="mt-16 border-t border-[#3d3d34] bg-[#151514]/60">
      <div
        className={`mx-auto w-full px-4 py-10 sm:py-12 ${
          wide ? "max-w-7xl" : "max-w-6xl"
        }`}
      >
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="font-display text-2xl uppercase tracking-widest text-amber">
              {t.core.common.appName}
            </p>
            <p className="mt-1 text-xs uppercase tracking-widest text-dim">
              {t.core.footer.tagline}
            </p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-dim">
              {t.core.footer.aboutText}
            </p>
          </div>

          <div>
            <p className="font-display text-xs uppercase tracking-widest text-dim">
              {t.core.footer.navTitle}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-display text-xs uppercase tracking-widest text-dim">
              {t.core.footer.linksTitle}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {EXTERNAL_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {showAdmin && (
                <li>
                  <Link href="/admin" className={linkClass}>
                    {t.core.footer.admin}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-[#2a2a22] pt-6 text-xs text-dim sm:flex-row">
          <span>
            {format(t.core.footer.rights, { year: new Date().getFullYear() })}
          </span>
          <span className="font-mono">
            {format(t.core.footer.version, { version: pkg.version })}
          </span>
        </div>
      </div>
    </footer>
  );
}
