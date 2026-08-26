"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { logoutAction } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";

export interface SiteHeaderUser {
  displayName: string | null;
  username: string;
  isStaff: boolean;
}

/** Public header: sticky, burger menu with navigation on mobile. */
export function SiteHeader({
  user,
  locale,
  t,
}: {
  user: SiteHeaderUser | null;
  locale: Locale;
  t: Dictionary;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navLinks = [
    { href: "/", label: t.core.nav.home },
    { href: "/board", label: t.core.nav.board },
    { href: "/leaderboard", label: t.core.nav.leaderboard },
    { href: "/feed", label: t.core.nav.feed },
    { href: "/rules", label: t.core.nav.rules },
  ];

  const close = () => setOpen(false);
  const guard = (handler?: () => void) => () => {
    handler?.();
    close();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#3d3d34] bg-[#151514]/95 backdrop-blur-sm">
      <nav className="mx-auto max-w-6xl px-4">
        {/* Row 1: logo, language, account, burger */}
        <div className="flex h-14 items-center gap-3">
          <Link
            href="/"
            onClick={guard()}
            className="font-display text-2xl tracking-widest text-amber uppercase"
          >
            {t.core.common.appName}
          </Link>

          {/* Desktop navigation */}
          <span className="ml-4 hidden items-center gap-x-5 md:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`transition-colors ${
                  pathname === l.href
                    ? "text-amber"
                    : "text-dim hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </span>

          <span className="ml-auto flex items-center gap-2 sm:gap-3">
            <LocaleSwitcher current={locale} />
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={guard()}
                  className="hidden max-w-[10rem] truncate hover:text-amber sm:inline"
                >
                  {user.displayName ?? user.username}
                </Link>
                {user.isStaff && (
                  <Link
                    href="/admin"
                    onClick={guard()}
                    className="hud-btn hud-btn-primary !px-3 !py-1 text-xs"
                  >
                    {t.core.nav.admin}
                  </Link>
                )}
                <form action={logoutAction} className="hidden sm:block">
                  <button type="submit" className="hud-btn !px-3 !py-1 text-xs">
                    {t.core.nav.logout}
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/login"
                className="hud-btn hud-btn-primary !px-3 !py-1 text-xs"
              >
                {t.core.nav.login}
              </Link>
            )}
            <button
              type="button"
              aria-label={t.core.nav.menu}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="hud-btn !px-2 !py-1 md:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </span>
        </div>

        {/* Mobile dropdown */}
        {open && (
          <div className="border-t border-[#3d3d34] py-2 md:hidden">
            <ul className="flex flex-col">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={guard()}
                    className={`block border-l-2 px-3 py-2.5 uppercase tracking-widest transition-colors ${
                      pathname === l.href
                        ? "border-amber text-amber"
                        : "border-transparent text-dim hover:text-foreground"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              {user && (
                <>
                  <li>
                    <Link
                      href="/dashboard"
                      onClick={guard()}
                      className="block border-l-2 border-transparent px-3 py-2.5 uppercase tracking-widest text-dim hover:text-foreground sm:hidden"
                    >
                      {user.displayName ?? user.username}
                    </Link>
                  </li>
                  <li className="sm:hidden">
                    <form action={logoutAction}>
                      <button
                        type="submit"
                        className="block w-full border-l-2 border-transparent px-3 py-2.5 text-left uppercase tracking-widest text-dim hover:text-foreground"
                      >
                        {t.core.nav.logout}
                      </button>
                    </form>
                  </li>
                </>
              )}
            </ul>
          </div>
        )}
      </nav>
    </header>
  );
}
