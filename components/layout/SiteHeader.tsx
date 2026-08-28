"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon, Cog6ToothIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { logoutAction } from "@/lib/modules/auth/actions/logout";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { LocaleSwitcher } from "@/components/i18n/LocaleSwitcher";
import { AvatarBadge } from "@/components/ui/AvatarBadge";
export interface SiteHeaderUser {
  displayName: string | null;
  username: string;
  avatarUrl?: string | null;
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
    ...(user ? [{ href: "/dashboard", label: t.core.nav.dashboard }] : []),
    { href: "/board", label: t.core.nav.board },
    { href: "/leaderboard", label: t.core.nav.leaderboard },
    { href: "/feed", label: t.core.nav.feed },
    { href: "/rules", label: t.core.nav.rules },
    { href: "/seasons", label: t.core.nav.seasons },
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
                  href={"/players/" + user.username}
                  onClick={guard()}
                  className="hidden no-underline items-center gap-2 hover:text-amber sm:inline-flex"
                  title={user.displayName ?? user.username}
                >
                  <AvatarBadge size="sm" name={user.displayName ?? user.username} src={user.avatarUrl ?? null} />
                  <span className="max-w-[10rem] truncate text-current">{user.displayName ?? user.username}</span>
                </Link>
                <Link
                  href="/settings"
                  onClick={guard()}
                  className="hidden sm:inline-flex items-center justify-center text-dim hover:text-amber"
                  title={t.core.nav.settings}
                  aria-label={t.core.nav.settings}
                >
                  <Cog6ToothIcon className="h-5 w-5" />
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
              {open ? <XMarkIcon className="h-[18px] w-[18px]" /> : <Bars3Icon className="h-[18px] w-[18px]" />}
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
                  <li className="sm:hidden">
                    <Link
                      href={"/players/" + user.username}
                      onClick={guard()}
                      className="flex no-underline items-center gap-2 border-l-2 border-transparent px-3 py-2.5 uppercase tracking-widest hover:text-amber"
                    >
                      <AvatarBadge size="sm" name={user.displayName ?? user.username} src={user.avatarUrl ?? null} />
                      {user.displayName ?? user.username}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/settings"
                      onClick={guard()}
                      className="block border-l-2 border-transparent px-3 py-2.5 uppercase tracking-widest text-dim hover:text-foreground"
                    >
                      {t.core.nav.settings}
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
