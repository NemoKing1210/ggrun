"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { logoutAction } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { AvatarBadge } from "@/components/ui/AvatarBadge";

const isActive = (pathname: string, href: string): boolean =>
  pathname === href ||
  (href !== "/admin" && pathname.startsWith(`${href}/`));

/**
 * Admin console header: two rows — brand + actions on top, a horizontally
 * scrollable nav strip below. Every nav item stays on one line at any width
 * (no wrapping); on small screens the burger dropdown takes over.
 */
export function AdminHeader({
  navLinks,
  userName,
  userAvatar,
  username,
  t,
}: {
  navLinks: Array<{ href: string; label: string }>;
  userName: string;
  userAvatar?: string | null;
  username: string;
  t: Dictionary;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#55554a] bg-[#0f0f0e]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4">
        {/* Row 1: brand + actions */}
        <div className="flex h-14 items-center gap-3">
          <span className="max-w-[11rem] truncate font-display text-lg tracking-widest text-military uppercase sm:max-w-none sm:text-xl">
            &gt;_ {t.admin.nav.console}
          </span>

          <span className="ml-auto flex items-center gap-2 sm:gap-3">

            <Link
              href={"/players/" + username}
              className="hidden no-underline items-center gap-2 font-mono text-xs text-military hover:text-amber sm:inline-flex"
              title={userName}
            >
              <AvatarBadge size="sm" name={userName} src={userAvatar ?? null} square />
              <span className="text-current">{userName}</span>
            </Link>
            <Link
              href="/"
              className="hud-btn whitespace-nowrap !px-3 !py-1 text-xs"
            >
              {t.admin.nav.backToSite}
            </Link>
            <form action={logoutAction} className="hidden sm:block">
              <button
                type="submit"
                className="hud-btn hud-btn-danger whitespace-nowrap !px-3 !py-1 text-xs"
              >
                {t.core.nav.logout}
              </button>
            </form>
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

        {/* Row 2: scrollable nav strip — never wraps */}
        <nav aria-label={t.admin.nav.console} className="hidden border-t border-[#55554a] md:block">
          <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navLinks.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-mono text-xs uppercase tracking-widest transition-colors ${
                    active
                      ? "border-amber text-amber"
                      : "border-transparent text-dim hover:border-amber/40 hover:text-amber"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Mobile dropdown */}
        {open && (
          <div className="border-t border-[#55554a] py-2 md:hidden">
            <Link
              href={"/players/" + username}
              className="flex no-underline items-center gap-2 px-3 py-1 font-mono text-xs text-military hover:text-amber sm:hidden"
              title={userName}
            >
              <AvatarBadge size="sm" name={userName} src={userAvatar ?? null} square />
              <span className="text-current">{userName}</span>
            </Link>
            <ul className="flex flex-col">
              {navLinks.map((l) => {
                const active = isActive(pathname, l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`block border-l-2 px-3 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                        active
                          ? "border-amber text-amber"
                          : "border-transparent text-dim hover:text-amber"
                      }`}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}

              <li className="sm:hidden">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="block w-full border-l-2 border-transparent px-3 py-2.5 text-left font-mono text-xs uppercase tracking-widest text-danger hover:text-danger"
                  >
                    {t.core.nav.logout}
                  </button>
                </form>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
