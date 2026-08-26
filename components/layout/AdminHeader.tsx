"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { logoutAction } from "@/lib/auth/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Шапка админ-консоли: sticky, на мобильных — бургер с разделами. */
export function AdminHeader({
  navLinks,
  userName,
  t,
}: {
  navLinks: Array<{ href: string; label: string }>;
  userName: string;
  t: Dictionary;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#55554a] bg-[#0f0f0e]/95 backdrop-blur-sm">
      <nav className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center gap-3">
          <span className="max-w-[11rem] truncate font-display text-lg tracking-widest text-military uppercase sm:max-w-none sm:text-xl">
            &gt;_ {t.admin.nav.console}
          </span>

          {/* Десктопная навигация */}
          <span className="ml-4 hidden items-center gap-x-4 lg:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`font-mono text-xs uppercase tracking-widest transition-colors ${
                  pathname === l.href
                    ? "text-amber"
                    : "text-dim hover:text-amber"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </span>

          <span className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden font-mono text-xs text-military sm:inline">
              {userName}
            </span>
            <Link href="/" className="hud-btn !px-3 !py-1 text-xs">
              {t.admin.nav.backToSite}
            </Link>
            <form action={logoutAction} className="hidden sm:block">
              <button
                type="submit"
                className="hud-btn hud-btn-danger !px-3 !py-1 text-xs"
              >
                {t.core.nav.logout}
              </button>
            </form>
            <button
              type="button"
              aria-label={t.core.nav.menu}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="hud-btn !px-2 !py-1 lg:hidden"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </span>
        </div>

        {/* Мобильный дропдаун */}
        {open && (
          <div className="border-t border-[#55554a] py-2 lg:hidden">
            <span className="block px-3 py-1 font-mono text-xs text-military sm:hidden">
              {userName}
            </span>
            <ul className="flex flex-col">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={close}
                    className={`block border-l-2 px-3 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                      pathname === l.href
                        ? "border-amber text-amber"
                        : "border-transparent text-dim hover:text-amber"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
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
      </nav>
    </header>
  );
}
